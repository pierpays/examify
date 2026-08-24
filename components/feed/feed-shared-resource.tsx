"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type SharedResource = {
  resource_type: "exam" | "teacher" | "institution" | "event" | "group";
  resource_id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  href: string;
};

export default function FeedSharedResource({
  postId,
}: {
  postId: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [resource, setResource] = useState<SharedResource | null>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("feed_shared_resources")
        .select(
          "resource_type,resource_id,title,description,image_url,href"
        )
        .eq("post_id", postId)
        .maybeSingle();

      setResource((data as SharedResource | null) ?? null);
    }

    load();
  }, [postId, supabase]);

  if (!resource) return null;

  const typeLabel =
    resource.resource_type === "exam"
      ? "Exam"
      : resource.resource_type === "teacher"
        ? "Teacher"
        : resource.resource_type === "institution"
          ? "Institution"
          : resource.resource_type === "event"
            ? "Academic event"
            : "Academic group";

  return (
    <Link
      href={resource.href}
      className="mx-5 mb-5 block overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-blue-300 hover:shadow-md"
    >
      {resource.image_url && (
        <img
          src={resource.image_url}
          alt=""
          className="aspect-[2/1] w-full object-cover"
        />
      )}

      <div className="p-4">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#0F5FEA]">
          Shared {typeLabel}
        </p>
        <h3 className="mt-2 text-lg font-extrabold text-slate-900">
          {resource.title}
        </h3>

        {resource.description && (
          <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">
            {resource.description}
          </p>
        )}

        <p className="mt-4 text-sm font-bold text-[#0F5FEA]">
          View {typeLabel.toLowerCase()} →
        </p>
      </div>
    </Link>
  );
}
