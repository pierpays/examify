"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

export type ExamifyAd = {
  id: string;
  advertiser_name: string;
  title: string;
  body: string | null;
  image_url: string | null;
  destination_url: string;
  cta_text: string;
};

export default function SponsoredAd({
  ad,
  placement,
}: {
  ad: ExamifyAd;
  placement: "feed" | "right_rail";
}) {
  const seen = useRef(false);

  useEffect(() => {
    if (seen.current) return;
    seen.current = true;
    const supabase = createClient();
    void supabase.rpc("record_ad_event", {
      p_campaign_id: ad.id,
      p_event_type: "impression",
      p_placement: placement,
    });
  }, [ad.id, placement]);

  async function openAd() {
    const supabase = createClient();
    await supabase.rpc("record_ad_event", {
      p_campaign_id: ad.id,
      p_event_type: "click",
      p_placement: placement,
    });
    window.open(ad.destination_url, "_blank", "noopener,noreferrer");
  }

  return (
    <article className={`overflow-hidden border border-slate-200 bg-white shadow-sm ${
      placement === "feed" ? "rounded-2xl" : "rounded-2xl"
    }`}>
      <div className={placement === "feed" ? "p-5 sm:p-6" : "p-5"}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-extrabold text-slate-900">
            {ad.advertiser_name}
          </p>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-slate-500">
            Sponsored
          </span>
        </div>

        {ad.image_url && (
          <img
            src={ad.image_url}
            alt=""
            className="mt-4 max-h-80 w-full rounded-xl object-cover"
          />
        )}

        <h2 className="mt-4 text-lg font-extrabold text-slate-900">
          {ad.title}
        </h2>
        {ad.body && (
          <p className="mt-2 text-sm leading-6 text-slate-600">{ad.body}</p>
        )}

        <button
          type="button"
          onClick={openAd}
          className="mt-4 w-full rounded-xl bg-[#0F5FEA] px-4 py-3 text-sm font-bold text-white"
        >
          {ad.cta_text || "Learn more"}
        </button>
      </div>
    </article>
  );
}
