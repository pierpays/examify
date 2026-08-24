"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type EventRow = {
  id: string;
  creator_id: string;
  title: string;
  description: string | null;
  event_type: string;
  starts_at: string;
  ends_at: string | null;
  location_name: string | null;
  meeting_url: string | null;
  visibility: "public" | "group";
  group_id: string | null;
  cover_image_url: string | null;
  status: string;
};

function toLocalInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000)
    .toISOString()
    .slice(0, 16);
}

export default function EditEventPage() {
  const { id } = useParams<{ id: string }>();
  const supabase = useMemo(() => createClient(), []);

  const [event, setEvent] = useState<EventRow | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [eventType, setEventType] = useState("other");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [locationName, setLocationName] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [coverImage, setCoverImage] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState("");
  const [removeExistingImage, setRemoveExistingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      const { data, error } = await supabase
        .from("academic_events")
        .select("*")
        .eq("id", id)
        .single();

      if (error || !data) {
        setMessage(error?.message ?? "Event not found.");
        setLoading(false);
        return;
      }

      const row = data as EventRow;

      if (row.creator_id !== user.id) {
        setMessage("Only the event creator can edit this event.");
        setLoading(false);
        return;
      }

      if (row.status === "cancelled") {
        setMessage("Cancelled events cannot be edited.");
        setLoading(false);
        return;
      }

      setEvent(row);
      setTitle(row.title);
      setDescription(row.description ?? "");
      setEventType(row.event_type);
      setStartsAt(toLocalInput(row.starts_at));
      setEndsAt(toLocalInput(row.ends_at));
      setLocationName(row.location_name ?? "");
      setMeetingUrl(row.meeting_url ?? "");
      setLoading(false);
    }

    load();
  }, [id, supabase]);

  useEffect(() => {
    if (!coverImage) {
      setCoverPreview("");
      return;
    }

    const url = URL.createObjectURL(coverImage);
    setCoverPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [coverImage]);

  function chooseImage(file: File | null) {
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
    setRemoveExistingImage(false);
  }

  async function save(eventForm: FormEvent) {
    eventForm.preventDefault();
    if (!event) return;

    if (!title.trim() || !startsAt) {
      setMessage("Title and start date/time are required.");
      return;
    }

    setSaving(true);
    setMessage("");

    let coverImageUrl: string | null | undefined = undefined;

    if (removeExistingImage) {
      coverImageUrl = null;
    }

    if (coverImage) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setSaving(false);
        return;
      }

      const extension =
        coverImage.name
          .split(".")
          .pop()
          ?.toLowerCase()
          .replace(/[^a-z0-9]/g, "") || "jpg";

      const objectPath =
        `${user.id}/${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("event-images")
        .upload(objectPath, coverImage, {
          cacheControl: "3600",
          upsert: false,
          contentType: coverImage.type,
        });

      if (uploadError) {
        setSaving(false);
        setMessage(
          `Unable to upload event image: ${uploadError.message}`
        );
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from("event-images")
        .getPublicUrl(objectPath);

      coverImageUrl = publicUrlData.publicUrl;
    }

    const { error } = await supabase.rpc("update_academic_event", {
      p_event_id: event.id,
      p_title: title.trim(),
      p_description: description.trim() || null,
      p_event_type: eventType,
      p_starts_at: new Date(startsAt).toISOString(),
      p_ends_at: endsAt
        ? new Date(endsAt).toISOString()
        : null,
      p_location_name: locationName.trim() || null,
      p_meeting_url: meetingUrl.trim() || null,
      p_cover_image_url:
        coverImageUrl === undefined
          ? event.cover_image_url
          : coverImageUrl,
    });

    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    window.location.href = `/events/${event.id}`;
  }

  if (loading) {
    return (
      <main className="min-h-screen p-6">
        <div className="mx-auto max-w-3xl">Loading event...</div>
      </main>
    );
  }

  if (!event) {
    return (
      <main className="min-h-screen p-6">
        <div className="mx-auto max-w-3xl">
          <Link
            href="/events"
            className="text-sm font-bold text-[#0F5FEA]"
          >
            ← Events
          </Link>
          <p className="mt-5 text-red-600">{message}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F5F7FB] px-4 py-6 text-slate-900 sm:py-8">
      <div className="mx-auto max-w-3xl">
        <Link
          href={`/events/${event.id}`}
          className="text-sm font-bold text-[#0F5FEA]"
        >
          ← Back to event
        </Link>

        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h1 className="text-3xl font-extrabold">Edit event</h1>
          <p className="mt-2 text-sm text-slate-500">
            Update the event details. Existing attendance responses are preserved.
          </p>

          <form onSubmit={save} className="mt-6 space-y-5">
            <label className="block text-sm font-semibold">
              Event title
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={160}
                required
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal"
              />
            </label>

            <label className="block text-sm font-semibold">
              Description
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                maxLength={5000}
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal"
              />
            </label>

            <label className="block text-sm font-semibold">
              Event type
              <select
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal"
              >
                <option value="class">Class</option>
                <option value="workshop">Workshop</option>
                <option value="webinar">Webinar</option>
                <option value="exam_session">Exam session</option>
                <option value="study_session">Study session</option>
                <option value="conference">Conference</option>
                <option value="deadline">Deadline</option>
                <option value="other">Other</option>
              </select>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold">
                Starts
                <input
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  required
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal"
                />
              </label>

              <label className="text-sm font-semibold">
                Ends
                <input
                  type="datetime-local"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal"
                />
              </label>
            </div>

            <label className="block text-sm font-semibold">
              Location
              <input
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal"
              />
            </label>

            <label className="block text-sm font-semibold">
              Online meeting URL
              <input
                type="url"
                value={meetingUrl}
                onChange={(e) => setMeetingUrl(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal"
              />
            </label>

            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
              <p className="text-sm font-semibold">Event cover image</p>

              {!removeExistingImage &&
                !coverPreview &&
                event.cover_image_url && (
                  <img
                    src={event.cover_image_url}
                    alt=""
                    className="mt-3 h-52 w-full rounded-xl object-cover"
                  />
                )}

              {coverPreview && (
                <img
                  src={coverPreview}
                  alt="New event cover preview"
                  className="mt-3 h-52 w-full rounded-xl object-cover"
                />
              )}

              <input
                type="file"
                accept="image/*"
                onChange={(e) =>
                  chooseImage(e.target.files?.[0] ?? null)
                }
                className="mt-4 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-[#E9F1FF] file:px-4 file:py-2.5 file:font-bold file:text-[#0F5FEA]"
              />

              <div className="mt-3 flex flex-wrap gap-3">
                {(event.cover_image_url || coverPreview) && (
                  <button
                    type="button"
                    onClick={() => {
                      setCoverImage(null);
                      setRemoveExistingImage(true);
                    }}
                    className="text-sm font-bold text-red-600"
                  >
                    Remove image
                  </button>
                )}

                {removeExistingImage && event.cover_image_url && (
                  <button
                    type="button"
                    onClick={() => setRemoveExistingImage(false)}
                    className="text-sm font-bold text-[#0F5FEA]"
                  >
                    Keep current image
                  </button>
                )}
              </div>
            </div>

            {message && (
              <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">
                {message}
              </p>
            )}

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-[#0F5FEA] px-5 py-3 font-bold text-white disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save changes"}
              </button>

              <Link
                href={`/events/${event.id}`}
                className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-center font-bold text-slate-700"
              >
                Cancel
              </Link>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
