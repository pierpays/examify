"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type RequestItem = {
  request_key: string;
  request_type:
    | "connection"
    | "event"
    | "class"
    | "child_class"
    | "group"
    | "group_join"
    | "institution"
    | "child_institution";
  sender_id: string | null;
  sender_name: string;
  title: string;
  subtitle: string | null;
  resource_id: string;
  subject_id: string | null;
  href: string | null;
  status: string;
  created_at: string;
  can_respond: boolean;
  requires_parent: boolean;
};

function typeLabel(type: RequestItem["request_type"]) {
  switch (type) {
    case "connection":
      return "Connection request";
    case "event":
      return "Event attendance";
    case "class":
      return "Class invitation";
    case "child_class":
      return "Child class invitation";
    case "group":
      return "Group invitation";
    case "group_join":
      return "Group join request";
    case "institution":
      return "Institution request";
    case "child_institution":
      return "Child institution request";
  }
}

export default function RequestsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [tab, setTab] = useState<"pending" | "history">("pending");
  const [loading, setLoading] = useState(true);
  const [workingKey, setWorkingKey] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_my_requests_hub");

    if (error) {
      setMessage(error.message);
      setRequests([]);
    } else {
      setRequests((data ?? []) as RequestItem[]);
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function respond(item: RequestItem, accept: boolean) {
    setWorkingKey(item.request_key);
    setMessage("");

    const { error } = await supabase.rpc("respond_to_request_hub", {
      p_request_type: item.request_type,
      p_resource_id: item.resource_id,
      p_subject_id: item.subject_id,
      p_accept: accept,
    });

    setWorkingKey("");

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage(accept ? "Request accepted." : "Request declined.");
    await load();
  }

  const pending = requests.filter((item) => item.status === "pending");
  const history = requests.filter((item) => item.status !== "pending");
  const visible = tab === "pending" ? pending : history;

  return (
    <main className="min-h-screen bg-[#F5F7FB] px-3 py-5 text-slate-900 sm:px-5 sm:py-8">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#0F5FEA]">
            Examify
          </p>
          <h1 className="mt-1 text-3xl font-extrabold">Requests</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            One place for invitations and requests sent to you, including
            classes, events, institutions, groups, and connections.
          </p>

          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => setTab("pending")}
              className={`rounded-xl px-4 py-2.5 text-sm font-bold ${
                tab === "pending"
                  ? "bg-[#0F5FEA] text-white"
                  : "border border-slate-200 bg-white text-slate-700"
              }`}
            >
              Pending ({pending.length})
            </button>
            <button
              type="button"
              onClick={() => setTab("history")}
              className={`rounded-xl px-4 py-2.5 text-sm font-bold ${
                tab === "history"
                  ? "bg-[#0F5FEA] text-white"
                  : "border border-slate-200 bg-white text-slate-700"
              }`}
            >
              History ({history.length})
            </button>
          </div>
        </div>

        {message && (
          <p className="mt-4 rounded-xl bg-blue-50 p-3 text-sm font-semibold text-blue-800">
            {message}
          </p>
        )}

        <section className="mt-4 space-y-3">
          {loading && (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
              Loading requests...
            </div>
          )}

          {!loading &&
            visible.map((item) => (
              <article
                key={item.request_key}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-[#0F5FEA]">
                        {typeLabel(item.request_type)}
                      </span>

                      {item.status !== "pending" && (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-extrabold capitalize text-slate-600">
                          {item.status}
                        </span>
                      )}
                    </div>

                    <h2 className="mt-3 text-lg font-extrabold">
                      {item.title}
                    </h2>

                    <p className="mt-1 text-sm text-slate-600">
                      {item.subtitle ?? `From ${item.sender_name}`}
                    </p>

                    <p className="mt-2 text-xs text-slate-400">
                      {new Date(item.created_at).toLocaleString()}
                    </p>

                    {item.requires_parent && item.status === "pending" && (
                      <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-800">
                        Parent or guardian approval is required.
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col gap-2 sm:min-w-40">
                    {item.href && (
                      <Link
                        href={item.href}
                        className="rounded-xl border border-slate-200 px-4 py-2.5 text-center text-sm font-bold text-slate-700"
                      >
                        View
                      </Link>
                    )}

                    {item.status === "pending" && item.can_respond && (
                      <>
                        <button
                          type="button"
                          disabled={workingKey === item.request_key}
                          onClick={() => respond(item, true)}
                          className="rounded-xl bg-[#0F5FEA] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                        >
                          {workingKey === item.request_key
                            ? "Working..."
                            : "Accept"}
                        </button>
                        <button
                          type="button"
                          disabled={workingKey === item.request_key}
                          onClick={() => respond(item, false)}
                          className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 disabled:opacity-50"
                        >
                          Decline
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </article>
            ))}

          {!loading && visible.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
              <p className="font-bold">
                {tab === "pending"
                  ? "No pending requests."
                  : "No request history yet."}
              </p>
              <p className="mt-2 text-sm text-slate-500">
                New invitations and requests will appear here.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
