"use client";

import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useMemo, useState } from "react";
import PostEngagement from "@/components/feed/post-engagement";
import PostMediaAttachments from "@/components/feed/post-media-attachments";
import FeedSharedResource from "@/components/feed/feed-shared-resource";

export type ProfileFeedPost = {
  id: string;
  author_id: string;
  post_type: string;
  body: string | null;
  created_at: string;
  feed_exam_id: string | null;
  feed_exam_title: string | null;
  feed_exam_category: string | null;
  feed_exam_cover_image_url: string | null;
  feed_exam_short_description: string | null;
  image_url: string | null;
  link_url: string | null;
  document_url: string | null;
  document_name: string | null;
  document_size: number | null;
  document_mime_type: string | null;
};

type Props = {
  posts: ProfileFeedPost[];
  viewerId?: string;
  viewerRole?: string | null;
  onDeleted?: (postId: string) => void;
};

function youtubeEmbedUrl(url: string | null) {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    let videoId = "";

    if (parsed.hostname === "youtu.be") {
      videoId = parsed.pathname.replace(/^\//, "").split("/")[0];
    } else if (
      parsed.hostname === "youtube.com" ||
      parsed.hostname === "www.youtube.com" ||
      parsed.hostname === "m.youtube.com"
    ) {
      if (parsed.pathname === "/watch") {
        videoId = parsed.searchParams.get("v") ?? "";
      } else if (parsed.pathname.startsWith("/shorts/")) {
        videoId = parsed.pathname.split("/")[2] ?? "";
      } else if (parsed.pathname.startsWith("/embed/")) {
        videoId = parsed.pathname.split("/")[2] ?? "";
      }
    }

    return /^[A-Za-z0-9_-]{6,}$/.test(videoId)
      ? `https://www.youtube.com/embed/${videoId}`
      : null;
  } catch {
    return null;
  }
}

function formatFileSize(bytes: number | null) {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function ProfilePosts({
  posts,
  viewerId = "",
  viewerRole = null,
  onDeleted,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [expanded, setExpanded] = useState(false);

  async function deletePost(post: ProfileFeedPost) {
    const canDelete = post.author_id === viewerId || viewerRole === "admin";
    if (!canDelete) return;

    const confirmed = window.confirm(
      viewerRole === "admin" && post.author_id !== viewerId
        ? "Permanently delete this post?"
        : "Delete this post?"
    );

    if (!confirmed) return;

    setDeletingId(post.id);
    setMessage("");

    const { error } = await supabase
      .from("feed_posts")
      .delete()
      .eq("id", post.id);

    if (error) {
      setMessage(error.message);
      setDeletingId(null);
      return;
    }

    onDeleted?.(post.id);
    setDeletingId(null);
  }

  if (posts.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center">
        <p className="font-semibold">No posts yet.</p>
        <p className="mt-2 text-sm text-slate-500">
          New posts shared by this profile will appear here.
        </p>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-700 transition hover:border-slate-400"
        aria-expanded={expanded}
      >
        <span>
          {expanded ? "Hide posts" : "Show posts"} ({posts.length})
        </span>
        <span aria-hidden="true" className="text-base">
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && (
        <div className="mt-4 space-y-4">
          {posts.map((post) => {
        const canDelete = post.author_id === viewerId || viewerRole === "admin";
        const embedUrl = youtubeEmbedUrl(post.link_url);

        return (
          <article
            key={post.id}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
          >
            <div className="p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs text-slate-500">
                  {new Date(post.created_at).toLocaleString()}
                </p>

                {canDelete && (
                  <button
                    type="button"
                    disabled={deletingId === post.id}
                    onClick={() => deletePost(post)}
                    className="shrink-0 text-xs font-semibold text-red-600 disabled:opacity-50"
                  >
                    {deletingId === post.id ? "Deleting..." : "Delete"}
                  </button>
                )}
              </div>

              {post.body && (
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {post.body}
                </p>
              )}

              <PostMediaAttachments
                postId={post.id}
                fallbackImageUrl={post.image_url}
              />

              {post.link_url &&
                (embedUrl ? (
                  <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-black">
                    <div className="aspect-video w-full">
                      <iframe
                        src={embedUrl}
                        title="YouTube video"
                        className="h-full w-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                      />
                    </div>
                  </div>
                ) : (
                  <a
                    href={post.link_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 block break-all rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-700 hover:border-slate-400"
                  >
                    {post.link_url} ↗
                  </a>
                ))}

              {post.document_url && (
                <a
                  href={post.document_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 flex flex-col gap-1 rounded-xl border border-slate-200 bg-slate-50 p-4 hover:border-slate-400"
                >
                  <span className="text-sm font-semibold">
                    {post.document_name || "Download document"}
                  </span>
                  <span className="text-xs text-slate-500">
                    {[post.document_mime_type, formatFileSize(post.document_size)]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <span className="mt-1 text-sm font-semibold">Download ↗</span>
                </a>
              )}

              {post.post_type === "exam" && post.feed_exam_id && (
                <Link
                  href={`/exams/${post.feed_exam_id}`}
                  className="mt-4 block overflow-hidden rounded-xl border border-slate-200 transition hover:border-slate-400"
                >
                  {post.feed_exam_cover_image_url && (
                    <img
                      src={post.feed_exam_cover_image_url}
                      alt=""
                      className="aspect-video w-full object-cover"
                    />
                  )}

                  <div className="p-4">
                    {post.feed_exam_category && (
                      <span className="inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                        {post.feed_exam_category}
                      </span>
                    )}
                    <h3 className="mt-2 font-semibold">
                      {post.feed_exam_title || "Exam"}
                    </h3>
                    {post.feed_exam_short_description && (
                      <p className="mt-2 text-sm text-slate-600">
                        {post.feed_exam_short_description}
                      </p>
                    )}
                    <p className="mt-3 text-sm font-semibold">View exam →</p>
                  </div>
                </Link>
              )}
            </div>
            <FeedSharedResource postId={post.id} />

            <PostEngagement postId={post.id} postAuthorId={post.author_id} />
          </article>
        );
          })}

          {message && <p className="text-sm text-red-600">{message}</p>}
        </div>
      )}
    </div>
  );
}
