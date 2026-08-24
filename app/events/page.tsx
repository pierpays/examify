"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

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

type GroupOption = { id: string; name: string };

export default function EventsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [role, setRole] = useState("");
  const [userId, setUserId] = useState("");
  const [events, setEvents] = useState<EventRow[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [eventType, setEventType] = useState("class");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [locationName, setLocationName] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [visibility, setVisibility] = useState("public");
  const [groupId, setGroupId] = useState("");
  const [coverImage, setCoverImage] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState("");

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setUserId(user.id);

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    setRole(profile?.role ?? "");

    const { data: eventData, error } = await supabase
      .from("academic_events")
      .select("*")
      .order("starts_at", { ascending: true });

    if (error) setMessage(error.message);
    setEvents((eventData ?? []) as EventRow[]);

    if (profile?.role === "teacher" || profile?.role === "institution") {
      const { data: memberships } = await supabase
        .from("academic_group_members")
        .select("group_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .in("membership_role", ["owner", "moderator"]);

      const ids = (memberships ?? []).map((row) => row.group_id);

      if (ids.length) {
        const { data: groupData } = await supabase
          .from("academic_groups")
          .select("id,name")
          .in("id", ids)
          .eq("is_archived", false)
          .order("name");

        setGroups((groupData ?? []) as GroupOption[]);
      }
    }
  }

  useEffect(() => {
    load();
  }, [supabase]);

  useEffect(() => {
    if (!coverImage) {
      setCoverPreview("");
      return;
    }

    const url = URL.createObjectURL(coverImage);
    setCoverPreview(url);

    return () => URL.revokeObjectURL(url);
  }, [coverImage]);

  function chooseCoverImage(file: File | null) {
    setMessage("");

    if (!file) {
      setCoverImage(null);
      return;
    }

    if (!file.type.startsWith("image/")) {
      setMessage("Please choose an image file.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setMessage("Event images must be 5 MB or smaller.");
      return;
    }

    setCoverImage(file);
  }

  async function createEvent(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setMessage("");

    const startIso = new Date(startsAt).toISOString();
    const endIso = endsAt ? new Date(endsAt).toISOString() : null;

    let coverImageUrl: string | null = null;

    if (coverImage) {
      const extension =
        coverImage.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ||
        "jpg";
      const objectPath = `${userId}/${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("event-images")
        .upload(objectPath, coverImage, {
          cacheControl: "3600",
          upsert: false,
          contentType: coverImage.type,
        });

      if (uploadError) {
        setCreating(false);
        setMessage(`Unable to upload event image: ${uploadError.message}`);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from("event-images")
        .getPublicUrl(objectPath);

      coverImageUrl = publicUrlData.publicUrl;
    }

    const { data, error } = await supabase
      .from("academic_events")
      .insert({
        creator_id: userId,
        title: title.trim(),
        description: description.trim() || null,
        event_type: eventType,
        starts_at: startIso,
        ends_at: endIso,
        location_name: locationName.trim() || null,
        meeting_url: meetingUrl.trim() || null,
        visibility,
        group_id: visibility === "group" ? groupId || null : null,
        cover_image_url: coverImageUrl,
      })
      .select("id")
      .single();

    setCreating(false);

    if (error || !data) {
      setMessage(error?.message ?? "Unable to create event.");
      return;
    }

    window.location.href = `/events/${data.id}`;
  }

  const canCreate = role === "teacher" || role === "institution";
  const upcoming = events.filter((event) => new Date(event.starts_at) >= new Date());
  const past = events.filter((event) => new Date(event.starts_at) < new Date());

  function eventCard(event: EventRow) {
    return (
      <Link
        key={event.id}
        href={`/events/${event.id}`}
        className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-[#2563EB]"
      >
        {event.cover_image_url && (
          <img
            src={event.cover_image_url}
            alt=""
            className="-mx-5 -mt-5 mb-5 h-44 w-[calc(100%+2.5rem)] object-cover"
          />
        )}

        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-[#2563EB]">
              {event.event_type.replaceAll("_", " ")}
            </p>
            <h2 className="mt-1 text-xl font-bold">{event.title}</h2>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {event.status === "cancelled" && (
              <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-700">
                Cancelled
              </span>
            )}
            {event.visibility === "group" && (
              <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700">
                Group only
              </span>
            )}
          </div>
        </div>

        <p className="mt-3 text-sm font-semibold text-slate-700">
          {new Date(event.starts_at).toLocaleString()}
        </p>

        {event.location_name && (
          <p className="mt-1 text-sm text-slate-500">📍 {event.location_name}</p>
        )}

        {event.description && (
          <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">
            {event.description}
          </p>
        )}
      </Link>
    );
  }

  return (
    <main className="min-h-screen px-3 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <div>
          <p className="text-sm font-bold text-[#2563EB]">ACADEMIC CALENDAR</p>
          <h1 className="mt-1 text-3xl font-extrabold">Events</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Classes, workshops, webinars, study sessions, exam sessions, deadlines,
            and other academic events.
          </p>
        </div>

        {canCreate && (
          <details className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <summary className="cursor-pointer font-bold">+ Create academic event</summary>

            <form onSubmit={createEvent} className="mt-5 space-y-4">
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Event title"
                className="w-full rounded-xl border border-slate-300 px-4 py-3"
              />

              <textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the event"
                className="w-full rounded-xl border border-slate-300 px-4 py-3"
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold">
                  Event type
                  <select
                    value={eventType}
                    onChange={(e) => setEventType(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
                  >
                    <option value="class">Class</option>
                    <option value="workshop">Workshop</option>
                    <option value="webinar">Webinar</option>
                    <option value="exam_session">Exam session</option>
                    <option value="study_session">Study session</option>
                    <option value="conference">Conference</option>
                    <option value="deadline">Deadline</option>
                    <option value="other">Other academic event</option>
                  </select>
                </label>

                <label className="text-sm font-semibold">
                  Visibility
                  <select
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
                  >
                    <option value="public">All Examify users</option>
                    <option value="group">One of my groups/classes</option>
                  </select>
                </label>
              </div>

              {visibility === "group" && (
                <label className="block text-sm font-semibold">
                  Group / class
                  <select
                    required
                    value={groupId}
                    onChange={(e) => setGroupId(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
                  >
                    <option value="">Choose group</option>
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
                <label className="block text-sm font-semibold">
                  Event cover image <span className="font-normal text-slate-500">(optional)</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => chooseCoverImage(e.target.files?.[0] ?? null)}
                    className="mt-2 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-[#E9F1FF] file:px-4 file:py-2.5 file:font-bold file:text-[#0F5FEA]"
                  />
                </label>
                <p className="mt-2 text-xs text-slate-500">
                  JPG, PNG, WebP or another browser-supported image. Maximum 5 MB.
                </p>

                {coverPreview && (
                  <div className="mt-4">
                    <img
                      src={coverPreview}
                      alt="Event cover preview"
                      className="h-48 w-full rounded-xl object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setCoverImage(null)}
                      className="mt-2 text-sm font-bold text-red-600"
                    >
                      Remove image
                    </button>
                  </div>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold">
                  Starts
                  <input
                    required
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
                  />
                </label>

                <label className="text-sm font-semibold">
                  Ends <span className="font-normal text-slate-500">(optional)</span>
                  <input
                    type="datetime-local"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
                  />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <input
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                  placeholder="Physical location (optional)"
                  className="rounded-xl border border-slate-300 px-4 py-3"
                />
                <input
                  type="url"
                  value={meetingUrl}
                  onChange={(e) => setMeetingUrl(e.target.value)}
                  placeholder="Meeting / webinar URL (optional)"
                  className="rounded-xl border border-slate-300 px-4 py-3"
                />
              </div>

              <button
                disabled={creating}
                className="rounded-xl bg-gradient-to-r from-[#2563EB] to-[#7C3AED] px-5 py-3 font-bold text-white disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create event"}
              </button>
            </form>
          </details>
        )}

        {message && (
          <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {message}
          </p>
        )}

        <section className="mt-8">
          <h2 className="text-xl font-bold">Upcoming</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {upcoming.map(eventCard)}
          </div>
          {upcoming.length === 0 && (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              No upcoming events.
            </div>
          )}
        </section>

        {past.length > 0 && (
          <section className="mt-10">
            <h2 className="text-xl font-bold text-slate-500">Past events</h2>
            <div className="mt-4 grid gap-4 opacity-75 sm:grid-cols-2">
              {past.slice().reverse().map(eventCard)}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
