"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ImageRow = {
  id: string;
  image_url: string;
  display_order: number;
};

type VideoRow = {
  id: string;
  video_url: string;
  mime_type: string | null;
};

type PollRow = {
  post_id: string;
  question: string;
  closes_at: string | null;
  option_id: string;
  option_text: string;
  display_order: number;
  vote_count: number;
  viewer_voted: boolean;
};

export default function RichPostExtras({
  postId,
  fallbackImageUrl,
  authorId,
  viewerId,
  viewerRole,
  body,
  audience,
  editedAt,
  isPinned,
  scheduledAt,
  onUpdated,
}: {
  postId: string;
  fallbackImageUrl: string | null;
  authorId: string;
  viewerId: string;
  viewerRole: string | null;
  body: string | null;
  audience: "examify" | "connections";
  editedAt: string | null;
  isPinned: boolean;
  scheduledAt: string | null;
  onUpdated: () => Promise<void> | void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [images, setImages] = useState<ImageRow[]>([]);
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [poll, setPoll] = useState<PollRow[]>([]);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(body ?? "");
  const [editAudience, setEditAudience] = useState<"examify" | "connections">(audience);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [shouldLoadExtras, setShouldLoadExtras] = useState(false);
  const extrasSentinelRef = useRef<HTMLDivElement | null>(null);

  const isOwner = authorId === viewerId;
  const canPin = isOwner || viewerRole === "admin";

  async function loadExtras() {
    const [imageResult, videoResult, pollResult] = await Promise.all([
      supabase
        .from("feed_post_images")
        .select("id,image_url,display_order")
        .eq("post_id", postId)
        .order("display_order"),
      supabase
        .from("feed_post_videos")
        .select("id,video_url,mime_type")
        .eq("post_id", postId),
      supabase.rpc("get_feed_poll_details", {
        p_post_ids: [postId],
      }),
    ]);

    if (!imageResult.error) setImages((imageResult.data ?? []) as ImageRow[]);
    if (!videoResult.error) setVideos((videoResult.data ?? []) as VideoRow[]);
    if (!pollResult.error) setPoll((pollResult.data ?? []) as PollRow[]);
  }

  useEffect(() => {
    const node = extrasSentinelRef.current;
    if (!node) return;

    if (!("IntersectionObserver" in window)) {
      setShouldLoadExtras(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoadExtras(true);
          observer.disconnect();
        }
      },
      { rootMargin: "600px 0px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [postId]);

  useEffect(() => {
    if (!shouldLoadExtras) return;
    loadExtras();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, shouldLoadExtras]);

  async function vote(optionId: string) {
    setWorking(true);
    setMessage("");

    const { error } = await supabase.rpc("vote_feed_poll", {
      p_post_id: postId,
      p_option_id: optionId,
    });

    if (error) setMessage(error.message);
    await loadExtras();
    setWorking(false);
  }

  async function saveEdit() {
    setWorking(true);
    setMessage("");

    const { error } = await supabase.rpc("edit_feed_post", {
      p_post_id: postId,
      p_body: editBody,
      p_audience: editAudience,
    });

    if (error) {
      setMessage(error.message);
      setWorking(false);
      return;
    }

    setEditing(false);
    await onUpdated();
    setWorking(false);
  }

  async function togglePin() {
    setWorking(true);
    setMessage("");

    const { error } = await supabase.rpc("toggle_feed_post_pin", {
      p_post_id: postId,
    });

    if (error) setMessage(error.message);
    await onUpdated();
    setWorking(false);
  }

  const shownImages =
    images.length > 0
      ? images.map((image) => image.image_url)
      : fallbackImageUrl
        ? [fallbackImageUrl]
        : [];

  const totalVotes = poll.reduce(
    (sum, option) => sum + Number(option.vote_count ?? 0),
    0
  );
  const pollClosed =
    poll[0]?.closes_at != null &&
    new Date(poll[0].closes_at) <= new Date();

  return (
    <>
      <div ref={extrasSentinelRef} className="h-px" aria-hidden="true" />

      {(isPinned || editedAt || (scheduledAt && new Date(scheduledAt) > new Date())) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {isPinned && (
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-[#2563EB]">
              📌 Pinned
            </span>
          )}
          {editedAt && (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
              Edited
            </span>
          )}
          {scheduledAt && new Date(scheduledAt) > new Date() && isOwner && (
            <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700">
              🕒 Scheduled for {new Date(scheduledAt).toLocaleString()}
            </span>
          )}
        </div>
      )}

      {editing && isOwner && (
        <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50/50 p-4">
          <p className="text-sm font-bold">Edit post</p>
          <textarea
            value={editBody}
            onChange={(event) => setEditBody(event.target.value)}
            maxLength={2000}
            rows={4}
            className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base sm:text-sm"
          />
          <select
            value={editAudience}
            onChange={(event) =>
              setEditAudience(
                event.target.value as "examify" | "connections"
              )
            }
            className="mt-3 rounded-xl border border-slate-300 bg-white px-3 py-2 text-base sm:text-sm"
          >
            <option value="examify">🌐 Examtify</option>
            <option value="connections">👥 Connections only</option>
          </select>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={working}
              onClick={saveEdit}
              className="min-h-11 rounded-xl bg-[#2563EB] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              Save changes
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setEditBody(body ?? "");
                setEditAudience(audience);
              }}
              className="min-h-11 rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {shownImages.length > 0 && (
        <div
          className={`mt-4 grid overflow-hidden rounded-xl border border-slate-200 ${
            shownImages.length === 1
              ? "grid-cols-1"
              : "grid-cols-2"
          }`}
        >
          {shownImages.slice(0, 4).map((url, index) => (
            <img
              key={`${url}-${index}`}
              src={url}
              alt={`Post image ${index + 1}`}
              loading="lazy"
              decoding="async"
              className={`w-full object-cover ${
                shownImages.length === 1
                  ? "max-h-[540px]"
                  : "aspect-square h-full"
              }`}
            />
          ))}
        </div>
      )}

      {videos.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-black">
          {videos.map((video) => (
            <video
              key={video.id}
              src={video.video_url}
              controls
              preload="none"
              playsInline
              className="max-h-[620px] w-full bg-black"
            />
          ))}
        </div>
      )}

      {poll.length > 0 && (
        <section className="mt-4 rounded-2xl border border-violet-200 bg-violet-50/40 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-violet-600">
                Poll
              </p>
              <h3 className="mt-1 font-bold">{poll[0].question}</h3>
            </div>
            {pollClosed && (
              <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-500">
                Closed
              </span>
            )}
          </div>

          <div className="mt-4 space-y-2">
            {poll.map((option) => {
              const count = Number(option.vote_count ?? 0);
              const percent =
                totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;

              return (
                <button
                  key={option.option_id}
                  type="button"
                  disabled={working || pollClosed}
                  onClick={() => vote(option.option_id)}
                  className={`relative min-h-11 w-full overflow-hidden rounded-xl border p-3 text-left transition disabled:cursor-default ${
                    option.viewer_voted
                      ? "border-violet-400 bg-white"
                      : "border-slate-200 bg-white hover:border-violet-300"
                  }`}
                >
                  <span
                    className="absolute inset-y-0 left-0 bg-violet-100"
                    style={{ width: `${percent}%` }}
                  />
                  <span className="relative flex items-center justify-between gap-3 text-sm">
                    <span className="font-semibold">
                      {option.viewer_voted ? "✓ " : ""}
                      {option.option_text}
                    </span>
                    <span className="shrink-0 text-xs font-bold text-slate-500">
                      {percent}% · {count}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <p className="mt-3 text-xs text-slate-500">
            {totalVotes} {totalVotes === 1 ? "vote" : "votes"}
            {poll[0].closes_at
              ? ` · ${pollClosed ? "Closed" : "Closes"} ${new Date(
                  poll[0].closes_at
                ).toLocaleString()}`
              : ""}
          </p>
        </section>
      )}

      {(isOwner || canPin) && (
        <div className="mt-3 flex flex-wrap gap-3 text-xs font-bold">
          {isOwner && (
            <button
              type="button"
              onClick={() => setEditing((value) => !value)}
              className="min-h-11 text-[#2563EB]"
            >
              ✎ Edit post
            </button>
          )}

          {canPin && (
            <button
              type="button"
              disabled={working}
              onClick={togglePin}
              className="min-h-11 text-[#2563EB] disabled:opacity-50"
            >
              {isPinned ? "Unpin post" : "📌 Pin post"}
            </button>
          )}
        </div>
      )}

      {message && (
        <p className="mt-2 text-xs font-semibold text-red-600">{message}</p>
      )}
    </>
  );
}
