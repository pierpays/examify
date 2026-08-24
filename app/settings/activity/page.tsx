"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Activity = {
  activity_type: string;
  title: string;
  detail: string | null;
  resource_href: string | null;
  occurred_at: string;
};

export default function ActivityLogPage() {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.rpc("get_my_activity_log", {
        p_limit: 150,
      });

      if (error) setMessage(error.message);
      setItems((data ?? []) as Activity[]);
      setLoading(false);
    }

    load();
  }, [supabase]);

  return (
    <main className="min-h-screen px-3 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-4xl">
        <p className="text-sm font-bold text-[#2563EB]">YOUR ACCOUNT</p>
        <h1 className="mt-1 text-3xl font-extrabold">Activity log</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Review your recent posts, comments, reactions, follows, connections,
          and event activity on Examify.
        </p>

        {message && (
          <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {message}
          </p>
        )}

        <div className="mt-6 space-y-3">
          {loading ? (
            <p className="text-sm text-slate-500">Loading activity...</p>
          ) : (
            items.map((item, index) => {
              const content = (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-200">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-bold">{item.title}</p>
                      {item.detail && (
                        <p className="mt-1 text-sm leading-6 text-slate-600">
                          {item.detail}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase text-slate-500">
                      {item.activity_type.replaceAll("_", " ")}
                    </span>
                  </div>

                  <p className="mt-3 text-xs text-slate-400">
                    {new Date(item.occurred_at).toLocaleString()}
                  </p>
                </div>
              );

              return item.resource_href ? (
                <Link key={`${item.activity_type}-${item.occurred_at}-${index}`} href={item.resource_href}>
                  {content}
                </Link>
              ) : (
                <div key={`${item.activity_type}-${item.occurred_at}-${index}`}>
                  {content}
                </div>
              );
            })
          )}

          {!loading && items.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              No account activity to show yet.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
