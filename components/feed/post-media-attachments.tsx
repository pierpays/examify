"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ImageRow = {
  id: string;
  image_url: string;
  display_order: number;
};

type VideoRow = {
  id: string;
  video_url: string;
};

export default function PostMediaAttachments({
  postId,
  fallbackImageUrl = null,
}: {
  postId: string;
  fallbackImageUrl?: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [images, setImages] = useState<ImageRow[]>([]);
  const [videos, setVideos] = useState<VideoRow[]>([]);

  useEffect(() => {
    async function load() {
      const [imageResult, videoResult] = await Promise.all([
        supabase
          .from("feed_post_images")
          .select("id,image_url,display_order")
          .eq("post_id", postId)
          .order("display_order"),
        supabase
          .from("feed_post_videos")
          .select("id,video_url")
          .eq("post_id", postId),
      ]);

      setImages((imageResult.data ?? []) as ImageRow[]);
      setVideos((videoResult.data ?? []) as VideoRow[]);
    }

    load();
  }, [postId, supabase]);

  const imageUrls =
    images.length > 0
      ? images.map((image) => image.image_url)
      : fallbackImageUrl
        ? [fallbackImageUrl]
        : [];

  if (!imageUrls.length && !videos.length) return null;

  return (
    <div className="mt-4 space-y-3">
      {imageUrls.length > 0 && (
        <div
          className={`grid gap-2 overflow-hidden rounded-xl ${
            imageUrls.length === 1 ? "grid-cols-1" : "grid-cols-2"
          }`}
        >
          {imageUrls.slice(0, 4).map((url, index) => (
            <img
              key={`${url}-${index}`}
              src={url}
              alt="Post attachment"
              loading="lazy"
              className={`w-full border border-slate-200 object-cover ${
                imageUrls.length === 1
                  ? "max-h-[520px] rounded-xl"
                  : "aspect-square rounded-lg"
              }`}
            />
          ))}
        </div>
      )}

      {videos.map((video) => (
        <video
          key={video.id}
          src={video.video_url}
          controls
          playsInline
          preload="metadata"
          className="max-h-[620px] w-full rounded-xl border border-slate-200 bg-black"
        />
      ))}
    </div>
  );
}
