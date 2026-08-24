"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type ReactionType = "like" | "celebrate" | "helpful";

type Engagement = {
  like_count: number;
  celebrate_count: number;
  helpful_count: number;
  comment_count: number;
  viewer_reaction: ReactionType | null;
};

type Comment = {
  id: string;
  post_id: string;
  author_id: string;
  author_name: string;
  author_role: string;
  author_avatar_url: string | null;
  body: string;
  created_at: string;
};

const EMPTY_ENGAGEMENT: Engagement = {
  like_count: 0,
  celebrate_count: 0,
  helpful_count: 0,
  comment_count: 0,
  viewer_reaction: null,
};

export default function PostEngagement({
  postId,
  postAuthorId,
}: {
  postId: string;
  postAuthorId: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [viewerId, setViewerId] = useState("");
  const [viewerRole, setViewerRole] = useState("");
  const [engagement, setEngagement] = useState<Engagement>(EMPTY_ENGAGEMENT);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [saved, setSaved] = useState(false);
  const [savingPost, setSavingPost] = useState(false);
  const [updatingComments, setUpdatingComments] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  async function loadEngagement() {
    const { data, error } = await supabase.rpc("get_post_engagement", {
      p_post_id: postId,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    const row = data?.[0];
    setEngagement({
      like_count: Number(row?.like_count ?? 0),
      celebrate_count: Number(row?.celebrate_count ?? 0),
      helpful_count: Number(row?.helpful_count ?? 0),
      comment_count: Number(row?.comment_count ?? 0),
      viewer_reaction: (row?.viewer_reaction ?? null) as ReactionType | null,
    });
  }

  async function loadComments() {
    const { data, error } = await supabase.rpc("get_post_comments", {
      p_post_id: postId,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setComments((data ?? []) as Comment[]);
  }

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setViewerId(user?.id ?? "");

      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();

        setViewerRole(profile?.role ?? "");

        const { data: savedPost } = await supabase
          .from("feed_saved_posts")
          .select("post_id")
          .eq("user_id", user.id)
          .eq("post_id", postId)
          .maybeSingle();

        setSaved(Boolean(savedPost));
      }

      const { data: postSettings, error: settingsError } = await supabase
        .from("feed_posts")
        .select("comments_enabled")
        .eq("id", postId)
        .maybeSingle();

      if (settingsError) {
        setMessage(settingsError.message);
      } else {
        setCommentsEnabled(postSettings?.comments_enabled ?? true);
      }

      await loadEngagement();
    }

    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, supabase]);

  async function react(reaction: ReactionType) {
    if (!viewerId) {
      window.location.href = "/login";
      return;
    }

    setMessage("");

    if (engagement.viewer_reaction === reaction) {
      const { error } = await supabase
        .from("feed_post_reactions")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", viewerId);

      if (error) {
        setMessage(error.message);
        return;
      }
    } else {
      const { error } = await supabase
        .from("feed_post_reactions")
        .upsert(
          {
            post_id: postId,
            user_id: viewerId,
            reaction_type: reaction,
          },
          { onConflict: "post_id,user_id" }
        );

      if (error) {
        setMessage(error.message);
        return;
      }
    }

    await loadEngagement();
  }

  async function toggleSaved() {
    if (!viewerId) {
      window.location.href = "/login";
      return;
    }

    if (savingPost) return;

    setSavingPost(true);
    setMessage("");

    if (saved) {
      const { error } = await supabase
        .from("feed_saved_posts")
        .delete()
        .eq("user_id", viewerId)
        .eq("post_id", postId);

      if (error) {
        setMessage(error.message);
        setSavingPost(false);
        return;
      }

      setSaved(false);
      setSavingPost(false);
      return;
    }

    const { error } = await supabase
      .from("feed_saved_posts")
      .insert({
        user_id: viewerId,
        post_id: postId,
      });

    if (error) {
      setMessage(error.message);
      setSavingPost(false);
      return;
    }

    setSaved(true);
    setSavingPost(false);
  }

  async function sharePost() {
    const url = `${window.location.origin}/feed#post-${postId}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: "Examify post",
          url,
        });
        return;
      }

      await navigator.clipboard.writeText(url);
      setMessage("Post link copied.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      setMessage("Unable to share this post right now.");
    }
  }

  async function toggleComments() {
    const next = !commentsOpen;
    setCommentsOpen(next);
    if (next) await loadComments();
  }

  async function addComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const body = commentBody.trim();
    if (!body || !commentsEnabled) return;

    if (!viewerId) {
      window.location.href = "/login";
      return;
    }

    setSubmitting(true);
    setMessage("");

    const { error } = await supabase.from("feed_post_comments").insert({
      post_id: postId,
      author_id: viewerId,
      body,
    });

    if (error) {
      setMessage(error.message);
      setSubmitting(false);
      return;
    }

    setCommentBody("");
    await Promise.all([loadComments(), loadEngagement()]);
    setSubmitting(false);
  }

  async function deleteComment(comment: Comment) {
    const canDelete =
      comment.author_id === viewerId ||
      postAuthorId === viewerId ||
      viewerRole === "admin";

    if (!canDelete) return;
    if (!window.confirm("Delete this comment?")) return;

    const { error } = await supabase
      .from("feed_post_comments")
      .delete()
      .eq("id", comment.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    await Promise.all([loadComments(), loadEngagement()]);
  }

  async function toggleCommentsEnabled() {
    const canModerate =
      postAuthorId === viewerId || viewerRole === "admin";

    if (!canModerate || updatingComments) return;

    const next = !commentsEnabled;
    const action = next ? "enable" : "disable";

    if (
      !window.confirm(
        `${action === "disable" ? "Disable" : "Enable"} comments on this post?`
      )
    ) {
      return;
    }

    setUpdatingComments(true);
    setMessage("");

    const { data, error } = await supabase.rpc(
      "set_feed_post_comments_enabled",
      {
        p_post_id: postId,
        p_enabled: next,
      }
    );

    if (error) {
      setMessage(error.message);
      setUpdatingComments(false);
      return;
    }

    setCommentsEnabled(Boolean(data));
    setUpdatingComments(false);
  }

  const reactionButtons: Array<{
    type: ReactionType;
    label: string;
    icon: string;
    count: number;
  }> = [
    { type: "like", label: "Like", icon: "👍", count: engagement.like_count },
    { type: "celebrate", label: "Celebrate", icon: "🎉", count: engagement.celebrate_count },
    { type: "helpful", label: "Helpful", icon: "💡", count: engagement.helpful_count },
  ];

  return (
    <div className="border-t border-slate-100 px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        {reactionButtons.map((item) => {
          const selected = engagement.viewer_reaction === item.type;
          return (
            <button
              key={item.type}
              type="button"
              onClick={() => react(item.type)}
              className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                selected
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
              }`}
            >
              {item.icon} {item.label}
              {item.count > 0 ? ` ${item.count}` : ""}
            </button>
          );
        })}

        <button
          type="button"
          onClick={toggleComments}
          className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:border-slate-400"
        >
          💬 {engagement.comment_count > 0 ? `${engagement.comment_count} ` : ""}
          {engagement.comment_count === 1 ? "Comment" : "Comments"}
        </button>

        <button
          type="button"
          onClick={toggleSaved}
          disabled={savingPost}
          className={`rounded-full border px-3 py-2 text-xs font-semibold transition disabled:opacity-50 ${
            saved
              ? "border-slate-900 bg-slate-900 text-white"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
          }`}
        >
          🔖 {savingPost ? "Saving..." : saved ? "Saved" : "Save"}
        </button>

        <button
          type="button"
          onClick={sharePost}
          className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:border-slate-400"
        >
          ↗ Share
        </button>

        {(postAuthorId === viewerId || viewerRole === "admin") && (
          <button
            type="button"
            onClick={toggleCommentsEnabled}
            disabled={updatingComments}
            className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:border-slate-400 disabled:opacity-50"
          >
            {updatingComments
              ? "Updating..."
              : commentsEnabled
                ? "Disable comments"
                : "Enable comments"}
          </button>
        )}
      </div>

      {commentsOpen && (
        <div className="mt-4 space-y-3">
          {comments.map((comment) => {
            const canDelete =
              comment.author_id === viewerId ||
              postAuthorId === viewerId ||
              viewerRole === "admin";
            const authorHref =
              comment.author_role === "teacher"
                ? `/teachers/${comment.author_id}`
                : comment.author_role === "institution"
                  ? `/institutions/${comment.author_id}`
                  : null;

            return (
              <div key={comment.id} className="rounded-xl bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    {comment.author_avatar_url ? (
                      <img
                        src={comment.author_avatar_url}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600">
                        {comment.author_name.trim().charAt(0).toUpperCase()}
                      </div>
                    )}

                    <div className="min-w-0">
                      {authorHref ? (
                        <Link href={authorHref} className="text-sm font-semibold hover:underline">
                          {comment.author_name}
                        </Link>
                      ) : (
                        <p className="text-sm font-semibold">{comment.author_name}</p>
                      )}
                      <p className="text-[11px] text-slate-500">
                        {new Date(comment.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => deleteComment(comment)}
                      className="text-xs font-semibold text-red-600"
                    >
                      Delete
                    </button>
                  )}
                </div>

                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {comment.body}
                </p>
              </div>
            );
          })}

          {comments.length === 0 && (
            <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">
              No comments yet. Start the conversation.
            </p>
          )}

          {!commentsEnabled ? (
            <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
              Comments are disabled for this post. Existing comments remain visible.
            </p>
          ) : viewerId ? (
            <form onSubmit={addComment} className="flex flex-col gap-2 sm:flex-row">
              <input
                value={commentBody}
                onChange={(event) => setCommentBody(event.target.value)}
                maxLength={1500}
                placeholder="Write a comment..."
                className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm"
              />
              <button
                disabled={submitting || !commentBody.trim()}
                className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {submitting ? "Posting..." : "Comment"}
              </button>
            </form>
          ) : (
            <Link href="/login" className="inline-block text-sm font-semibold">
              Log in to comment →
            </Link>
          )}
        </div>
      )}

      {message && <p className="mt-3 text-xs text-red-600">{message}</p>}
    </div>
  );
}
