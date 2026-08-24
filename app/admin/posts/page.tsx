"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ModerationStatus = "active" | "hidden" | "archived";

type AdminPost = {
  id: string;
  author_id: string;
  author_name: string;
  author_role: string;
  post_type: string;
  body: string | null;
  created_at: string;
  open_report_count: number;
  image_url: string | null;
  link_url: string | null;
  document_name: string | null;
  moderation_status: ModerationStatus;
  moderated_at: string | null;
};

export default function AdminPostsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ModerationStatus>("all");
  const [message, setMessage] = useState("");
  const [workingId, setWorkingId] = useState<string | null>(null);

  async function load() {
    const { data, error } = await supabase.rpc("get_admin_posts", { p_limit: 200 });
    if (error) setMessage(error.message);
    else setPosts((data ?? []) as AdminPost[]);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  async function setModeration(post: AdminPost, status: ModerationStatus) {
    const action = status === "active" ? "restore" : status;
    if (!window.confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} this post by ${post.author_name}?`)) return;

    setWorkingId(post.id);
    setMessage("");

    const { error } = await supabase.rpc("admin_set_feed_post_moderation", {
      p_post_id: post.id,
      p_status: status,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setPosts((current) =>
        current.map((item) =>
          item.id === post.id
            ? {
                ...item,
                moderation_status: status,
                moderated_at: status === "active" ? null : new Date().toISOString(),
              }
            : item
        )
      );
    }

    setWorkingId(null);
  }

  async function remove(post: AdminPost) {
    if (!window.confirm(`Permanently delete this post by ${post.author_name}? This cannot be undone.`)) return;
    setWorkingId(post.id);
    setMessage("");
    const { error } = await supabase.from("feed_posts").delete().eq("id", post.id);
    if (error) setMessage(error.message);
    else setPosts((current) => current.filter((item) => item.id !== post.id));
    setWorkingId(null);
  }

  const q = search.trim().toLowerCase();
  const filtered = posts.filter((post) => {
    const matchesSearch =
      !q ||
      post.author_name.toLowerCase().includes(q) ||
      (post.body ?? "").toLowerCase().includes(q);
    const matchesStatus = statusFilter === "all" || post.moderation_status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <p className="text-sm font-medium text-slate-500">Examify Administration</p>
        <h1 className="mt-1 text-3xl font-bold">Manage posts</h1>
        <p className="mt-2 text-sm text-slate-600">
          Hide or archive teacher and institution posts without deleting them. Restore them later, or permanently delete content when necessary.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto]">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search posts or authors"
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | ModerationStatus)}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 sm:w-auto"
            aria-label="Filter posts by moderation status"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="hidden">Hidden</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        <div className="mt-6 space-y-3">
          {filtered.map((post) => {
            const canModerateVisibility = post.author_role === "teacher" || post.author_role === "institution";
            return (
              <article key={post.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{post.author_name}</p>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${
                          post.moderation_status === "active"
                            ? "bg-green-100 text-green-700"
                            : post.moderation_status === "hidden"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {post.moderation_status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs capitalize text-slate-500">
                      {post.author_role} · {post.post_type} · {new Date(post.created_at).toLocaleString()}
                    </p>
                    {post.moderated_at && (
                      <p className="mt-1 text-xs text-slate-500">
                        Moderated {new Date(post.moderated_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                  {Number(post.open_report_count) > 0 && (
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                      {post.open_report_count} open report{Number(post.open_report_count) === 1 ? "" : "s"}
                    </span>
                  )}
                </div>

                {post.body && <p className="mt-4 whitespace-pre-wrap text-sm text-slate-700">{post.body}</p>}
                <div className="mt-3 space-y-1 text-xs text-slate-500">
                  {post.link_url && <p className="break-all">Link: {post.link_url}</p>}
                  {post.document_name && <p>Document: {post.document_name}</p>}
                  {post.image_url && <p>Image attached</p>}
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  {canModerateVisibility && post.moderation_status !== "hidden" && (
                    <button
                      disabled={workingId === post.id}
                      onClick={() => setModeration(post, "hidden")}
                      className="rounded-xl border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-700 disabled:opacity-50"
                    >
                      Hide post
                    </button>
                  )}

                  {canModerateVisibility && post.moderation_status !== "archived" && (
                    <button
                      disabled={workingId === post.id}
                      onClick={() => setModeration(post, "archived")}
                      className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
                    >
                      Archive post
                    </button>
                  )}

                  {canModerateVisibility && post.moderation_status !== "active" && (
                    <button
                      disabled={workingId === post.id}
                      onClick={() => setModeration(post, "active")}
                      className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      Restore to feed
                    </button>
                  )}

                  <button
                    disabled={workingId === post.id}
                    onClick={() => remove(post)}
                    className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 disabled:opacity-50"
                  >
                    Delete permanently
                  </button>
                </div>

                {!canModerateVisibility && (
                  <p className="mt-3 text-xs text-slate-500">
                    Hide/archive controls apply to teacher and institution posts. Other content can still be permanently removed when necessary.
                  </p>
                )}
              </article>
            );
          })}

          {filtered.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              No posts match these filters.
            </div>
          )}
        </div>

        {message && <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{message}</p>}
      </div>
    </main>
  );
}
