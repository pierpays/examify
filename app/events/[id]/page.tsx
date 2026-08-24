"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import ShareToFeedButton from "@/components/feed/share-to-feed-button";

type EventRow = {
  id: string;
  creator_id: string;
  group_id: string | null;
  title: string;
  description: string | null;
  event_type: string;
  starts_at: string;
  ends_at: string | null;
  location_name: string | null;
  meeting_url: string | null;
  visibility: string;
  cover_image_url: string | null;
  status: string;
  cancelled_at: string | null;
};

type Counts = {
  interested_count: number;
  going_count: number;
};

type Invitee = {
  user_id: string;
  display_name: string;
  role: string;
  avatar_url: string | null;
  already_invited: boolean;
};

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const supabase = useMemo(() => createClient(), []);

  const [event, setEvent] = useState<EventRow | null>(null);
  const [userId, setUserId] = useState("");
  const [response, setResponse] = useState<string | null>(null);
  const [counts, setCounts] = useState<Counts>({ interested_count: 0, going_count: 0 });
  const [query, setQuery] = useState("");
  const [invitees, setInvitees] = useState<Invitee[]>([]);
  const [message, setMessage] = useState("");
  const [cancelling, setCancelling] = useState(false);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    const { data, error } = await supabase
      .from("academic_events")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      setMessage(error.message);
      return;
    }

    setEvent(data as EventRow);

    const { data: responseData } = await supabase
      .from("academic_event_responses")
      .select("response")
      .eq("event_id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    setResponse(responseData?.response ?? null);

    const { data: countData } = await supabase.rpc(
      "get_academic_event_counts",
      { p_event_id: id }
    );

    const first = Array.isArray(countData) ? countData[0] : countData;

    setCounts({
      interested_count: Number(first?.interested_count ?? 0),
      going_count: Number(first?.going_count ?? 0),
    });
  }

  useEffect(() => {
    load();
  }, [id, supabase]);

  async function setEventResponse(value: "interested" | "going") {
    setMessage("");

    if (event?.status === "cancelled") {
      setMessage("This event has been cancelled.");
      return;
    }

    if (response === value) {
      const { error } = await supabase.rpc(
        "clear_academic_event_response",
        { p_event_id: id }
      );

      if (error) return setMessage(error.message);
      setResponse(null);
      await load();
      return;
    }

    const { error } = await supabase.rpc(
      "set_academic_event_response",
      {
        p_event_id: id,
        p_response: value,
      }
    );

    if (error) return setMessage(error.message);
    setResponse(value);
    await load();
  }

  async function cancelEvent() {
    if (!event || event.creator_id !== userId || event.status === "cancelled") return;

    const confirmed = window.confirm(
      "Cancel this event? Users will still be able to see it, but attendance responses and invitations will be disabled."
    );

    if (!confirmed) return;

    setCancelling(true);
    setMessage("");

    const { error } = await supabase.rpc("cancel_academic_event", {
      p_event_id: event.id,
    });

    setCancelling(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Event cancelled.");
    await load();
  }

  async function searchInvitees() {
    const { data, error } = await supabase.rpc(
      "search_event_invitees",
      {
        p_event_id: id,
        p_query: query,
        p_limit: 20,
      }
    );

    if (error) return setMessage(error.message);
    setInvitees((data ?? []) as Invitee[]);
  }

  async function invite(invitedUserId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.rpc(
      "send_academic_event_attendance_request",
      {
        p_event_id: id,
        p_user_id: invitedUserId,
      }
    );

    if (error) return setMessage(error.message);

    setMessage("Attendance request sent.");
    await searchInvitees();
  }

  if (!event) {
    return (
      <main className="min-h-screen p-6">
        <div className="mx-auto max-w-4xl">{message || "Loading event..."}</div>
      </main>
    );
  }

  const isCreator = event.creator_id === userId;

  return (
    <main className="min-h-screen px-3 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-4xl">
        <Link href="/events" className="text-sm font-bold text-[#2563EB]">
          ← Events
        </Link>

        <section className="mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          {event.cover_image_url && (
            <img
              src={event.cover_image_url}
              alt=""
              className="h-56 w-full object-cover sm:h-80"
            />
          )}

          <div className="bg-gradient-to-r from-[#071A46] via-[#2563EB] to-[#7C3AED] px-6 py-10 text-white sm:px-8 sm:py-14">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-100">
              {event.event_type.replaceAll("_", " ")}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">
                {event.title}
              </h1>
              {event.status === "cancelled" && (
                <span className="mt-2 rounded-full bg-red-100 px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-red-800">
                  Cancelled
                </span>
              )}
            </div>
          </div>

          <div className="p-5 sm:p-8">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Starts
                </p>
                <p className="mt-2 font-bold">
                  {new Date(event.starts_at).toLocaleString()}
                </p>
              </div>

              {event.ends_at && (
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                    Ends
                  </p>
                  <p className="mt-2 font-bold">
                    {new Date(event.ends_at).toLocaleString()}
                  </p>
                </div>
              )}
            </div>

            {event.location_name && (
              <p className="mt-5 text-sm font-semibold text-slate-700">
                📍 {event.location_name}
              </p>
            )}

            {event.meeting_url && (
              <a
                href={event.meeting_url}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex rounded-xl bg-[#2563EB] px-5 py-3 text-sm font-bold text-white"
              >
                Open online meeting
              </a>
            )}

            {event.description && (
              <p className="mt-6 whitespace-pre-wrap text-sm leading-7 text-slate-700">
                {event.description}
              </p>
            )}

            {event.status === "cancelled" && (
              <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4">
                <p className="font-bold text-red-800">This event has been cancelled.</p>
                <p className="mt-1 text-sm text-red-700">
                  The event remains visible for reference, but new attendance responses are disabled.
                </p>
              </div>
            )}

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={event.status === "cancelled"}
                onClick={() => setEventResponse("interested")}
                className={`rounded-xl px-4 py-2.5 text-sm font-bold ${
                  response === "interested"
                    ? "bg-amber-100 text-amber-900"
                    : "border border-slate-300"
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                ★ Interested · {counts.interested_count}
              </button>

              <button
                type="button"
                disabled={event.status === "cancelled"}
                onClick={() => setEventResponse("going")}
                className={`rounded-xl px-4 py-2.5 text-sm font-bold ${
                  response === "going"
                    ? "bg-green-100 text-green-800"
                    : "border border-slate-300"
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {response === "going" ? "✓ Attendance confirmed" : "✓ Confirm attendance"} · {counts.going_count}
              </button>

              {event.visibility === "public" && event.status !== "cancelled" && (
                <ShareToFeedButton
                  resourceType="event"
                  resourceId={event.id}
                  label="↗ Share on Feed"
                />
              )}
            </div>
          </div>
        </section>

        {isCreator && event.status !== "cancelled" && (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">Event management</h2>
            <p className="mt-1 text-sm text-slate-500">
              Update event details or cancel the event. Cancelling keeps it visible for reference and stops new attendance responses and invitations.
            </p>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Link
                href={`/events/${event.id}/edit`}
                className="rounded-xl bg-[#0F5FEA] px-4 py-2.5 text-center text-sm font-bold text-white"
              >
                Edit event
              </Link>

              <button
                type="button"
                onClick={cancelEvent}
                disabled={cancelling}
                className="rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 text-sm font-bold text-red-700 disabled:opacity-50"
              >
                {cancelling ? "Cancelling..." : "Cancel event"}
              </button>
            </div>
          </section>
        )}

        {isCreator && event.status !== "cancelled" && (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">Request attendance</h2>
            <p className="mt-1 text-sm text-slate-500">
              Search Examify accounts and request specific users to attend this event.
            </p>

            <div className="mt-4 flex gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name"
                className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-3"
              />
              <button
                type="button"
                onClick={searchInvitees}
                className="rounded-xl bg-slate-900 px-4 py-3 font-bold text-white"
              >
                Search
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {invitees.map((person) => (
                <div
                  key={person.user_id}
                  className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3"
                >
                  <div>
                    <p className="font-semibold">{person.display_name}</p>
                    <p className="text-xs capitalize text-slate-500">
                      {person.role}
                    </p>
                  </div>

                  {person.already_invited ? (
                    <span className="text-xs font-bold text-slate-500">
                      Invited
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => invite(person.user_id)}
                      className="rounded-lg bg-[#2563EB] px-3 py-2 text-xs font-bold text-white"
                    >
                      Invite
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {message && (
          <p className="mt-5 rounded-xl bg-blue-50 p-4 text-sm text-blue-900">
            {message}
          </p>
        )}
      </div>
    </main>
  );
}
