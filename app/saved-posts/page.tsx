"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type SavedPost = {
  post_id: string;
  saved_at: string;
  author_id: string;
  author_name: string;
  author_role: string;
  author_avatar_url: string | null;
  post_type: string;
  body: string | null;
  created_at: string;
  image_url: string | null;
  link_url: string | null;
  document_name: string | null;
  feed_exam_title: string | null;
  achievement_exam_title: string | null;
};

export default function SavedPostsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [posts, setPosts] = useState<SavedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function loadSavedPosts() {
    const { data, error } = await supabase.rpc("get_my_saved_feed_posts", {
      p_limit: 100,
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setPosts((data ?? []) as SavedPost[]);
    setLoading(false);
  }

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      await loadSavedPosts();
    }

    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  async function removeSaved(postId: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { error } = await supabase
      .from("feed_saved_posts")
      .delete()
      .eq("user_id", user.id)
      .eq("post_id", postId);

    if (error) {
      setMessage(error.message);
      return;
    }

    setPosts((current) => current.filter((post) => post.post_id !== postId));
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:py-10">
        <div className="mx-auto max-w-3xl">Loading saved posts...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <div>
          <p className="text-sm font-medium text-slate-500">Examify</p>
          <h1 className="mt-1 text-3xl font-bold">Saved posts</h1>
          <p className="mt-2 text-sm text-slate-600">
            Keep useful posts, resources, exam announcements, and achievements for later.
          </p>
        </div>

        <div className="mt-8 space-y-4">
          {posts.map((post) => {
            const authorHref =
              post.author_role === "teacher"
                ? `/teachers/${post.author_id}`
                : post.author_role === "institution"
                  ? `/institutions/${post.author_id}`
                  : null;

            const attachmentLabel =
              post.feed_exam_title
                ? `Exam: ${post.feed_exam_title}`
                : post.achievement_exam_title
                  ? `Achievement: ${post.achievement_exam_title}`
                  : post.document_name
                    ? `Document: ${post.document_name}`
                    : post.image_url
                      ? "Image attached"
                      : post.link_url
                        ? "Link attached"
                        : null;

            return (
              <article
                key={post.post_id}
                className="rounded-2xl border border-slate-200 bg-white p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {post.author_avatar_url ? (
                      <img
                        src={post.author_avatar_url}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded-full border border-slate-200 object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-500">
                        {post.author_name.trim().charAt(0).toUpperCase()}
                      </div>
                    )}

                    <div className="min-w-0">
                      {authorHref ? (
                        <Link href={authorHref} className="font-semibold hover:underline">
                          {post.author_name}
                        </Link>
                      ) : (
                        <p className="font-semibold">{post.author_name}</p>
                      )}

                      <p className="mt-0.5 text-xs capitalize text-slate-500">
                        {post.author_role} · {new Date(post.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeSaved(post.post_id)}
                    className="shrink-0 text-xs font-semibold text-slate-600"
                  >
                    Remove
                  </button>
                </div>

                {post.body && (
                  <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {post.body}
                  </p>
                )}

                {attachmentLabel && (
                  <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-600">
                    {attachmentLabel}
                  </p>
                )}

                <Link
                  href={`/feed#post-${post.post_id}`}
                  className="mt-4 inline-block rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                >
                  Open post
                </Link>
              </article>
            );
          })}

          {posts.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <p className="font-semibold">No saved posts yet.</p>
              <p className="mt-2 text-sm text-slate-500">
                Tap Save on a feed post and it will appear here.
              </p>
              <Link href="/feed" className="mt-5 inline-block text-sm font-semibold">
                Browse the Feed →
              </Link>
            </div>
          )}
        </div>

        {message && <p className="mt-5 text-sm text-red-600">{message}</p>}
      </div>
    </main>
  );
}
