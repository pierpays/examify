"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";

type ResourceType = "exam" | "teacher" | "institution" | "event" | "group";

export default function ShareToFeedButton({
  resourceType,
  resourceId,
  label = "Share",
}: {
  resourceType: ResourceType;
  resourceId: string;
  label?: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [allowed, setAllowed] = useState(false);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState<"examify" | "connections">("examify");
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !working) {
        setOpen(false);
        setStatus("");
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, working]);

  useEffect(() => {
    async function check() {
      const { data } = await supabase.rpc(
        "can_share_academic_resource"
      );
      setAllowed(Boolean(data));
    }
    check();
  }, [supabase]);

  if (!allowed) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setWorking(true);
    setStatus("");

    const { error } = await supabase.rpc(
      "share_academic_resource_to_feed",
      {
        p_resource_type: resourceType,
        p_resource_id: resourceId,
        p_message: message,
        p_audience: audience,
      }
    );

    setWorking(false);

    if (error) {
      setStatus(error.message);
      return;
    }

    setMessage("");
    setOpen(false);
    setStatus("Shared to your Feed.");
  }

  const modal =
    open && mounted
      ? createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !working) {
                setOpen(false);
                setStatus("");
              }
            }}
          >
            <form
              onSubmit={submit}
              role="dialog"
              aria-modal="true"
              aria-labelledby="share-feed-title"
              className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 text-left shadow-2xl sm:max-w-md sm:rounded-3xl sm:p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3
                    id="share-feed-title"
                    className="text-lg font-extrabold text-slate-900"
                  >
                    Share to your Feed
                  </h3>
                  <p className="mt-1 text-sm leading-5 text-slate-500">
                    Add an optional academic comment above this shared resource.
                  </p>
                </div>

                <button
                  type="button"
                  aria-label="Close share dialog"
                  disabled={working}
                  onClick={() => {
                    setOpen(false);
                    setStatus("");
                  }}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xl font-bold text-slate-600 transition hover:bg-slate-200 disabled:opacity-50"
                >
                  ×
                </button>
              </div>

              <textarea
                autoFocus
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={4}
                maxLength={1000}
                placeholder="Say something about this..."
                className="mt-5 w-full rounded-xl border border-slate-300 px-3 py-3 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-400 sm:text-sm"
              />

              <label className="mt-4 block text-sm font-bold text-slate-600">
                Audience
                <select
                  value={audience}
                  onChange={(event) =>
                    setAudience(
                      event.target.value as "examify" | "connections"
                    )
                  }
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base font-normal text-slate-900 sm:text-sm"
                >
                  <option value="examify">All of Examify</option>
                  <option value="connections">Connections only</option>
                </select>
              </label>

              {status && (
                <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-600">
                  {status}
                </p>
              )}

              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
                <button
                  type="button"
                  disabled={working}
                  onClick={() => {
                    setOpen(false);
                    setStatus("");
                  }}
                  className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-700 disabled:opacity-50 sm:flex-1"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={working}
                  className="rounded-xl bg-[#0F5FEA] px-4 py-3 text-sm font-bold text-white disabled:opacity-50 sm:flex-1"
                >
                  {working ? "Sharing..." : "Share now"}
                </button>
              </div>
            </form>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <div>
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setStatus("");
          }}
          className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-2.5 text-sm font-bold text-[#0F5FEA] shadow-sm transition hover:bg-blue-50"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
            <path d="m16 6-4-4-4 4" />
            <path d="M12 2v14" />
          </svg>
          {label}
        </button>

        {status && !open && (
          <p className="mt-2 text-xs font-semibold text-green-700">
            {status}
          </p>
        )}
      </div>

      {modal}
    </>
  );
}
