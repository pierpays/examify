"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type MediaItem = {
  media_type: "image" | "video";
  media_url: string;
  post_id: string;
  created_at: string;
};

export default function ProfileMediaGallery({
  userId,
  title = "Photos & videos",
}: {
  userId: string;
  title?: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.rpc("get_profile_media_gallery", {
        p_user_id: userId,
        p_limit: 60,
      });
      setItems((data ?? []) as MediaItem[]);
      setLoading(false);
    }
    load();
  }, [supabase, userId]);

  if (loading) {
    return <p className="text-sm text-slate-500">Loading media...</p>;
  }

  return (
    <section>
      <h2 className="text-xl font-bold">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">
        Academic media shared in visible Examify posts.
      </p>

      {items.length > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {items.map((item, index) =>
            item.media_type === "video" ? (
              <video
                key={`${item.post_id}-${index}`}
                src={item.media_url}
                controls
                preload="metadata"
                className="aspect-square w-full rounded-xl border border-slate-200 bg-black object-cover"
              />
            ) : (
              <img
                key={`${item.post_id}-${index}`}
                src={item.media_url}
                alt="Shared academic media"
                loading="lazy"
                className="aspect-square w-full rounded-xl border border-slate-200 object-cover"
              />
            )
          )}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No visible photos or videos yet.
        </div>
      )}
    </section>
  );
}
