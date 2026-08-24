"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import SponsoredAd, { type ExamifyAd } from "@/components/feed/sponsored-ad";

type EventRow = {
  id: string;
  title: string;
  starts_at: string;
  location_name: string | null;
  meeting_url: string | null;
};

type TeacherSuggestion = {
  user_id: string;
  display_name: string;
  headline: string | null;
  avatar_url: string | null;
};

type InstitutionSuggestion = {
  user_id: string;
  name: string;
  avatar_url: string | null;
};

export default function FeedRightRail() {
  const supabase = useMemo(() => createClient(), []);
  const [ad, setAd] = useState<ExamifyAd | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [teacher, setTeacher] = useState<TeacherSuggestion | null>(null);
  const [institution, setInstitution] =
    useState<InstitutionSuggestion | null>(null);

  useEffect(() => {
    async function load() {
      const now = new Date().toISOString();

      const [
        adResult,
        eventsResult,
        teacherResult,
        institutionResult,
      ] = await Promise.all([
        supabase.rpc("get_active_ads", {
          p_placement: "right_rail",
          p_limit: 1,
        }),
        supabase
          .from("academic_events")
          .select("id,title,starts_at,location_name,meeting_url")
          .gte("starts_at", now)
          .order("starts_at")
          .limit(3),
        supabase.rpc("get_suggested_teachers", { p_limit: 1 }),
        supabase.rpc("get_suggested_institutions", { p_limit: 1 }),
      ]);

      if (!adResult.error) {
        setAd(((adResult.data ?? [])[0] as ExamifyAd) ?? null);
      }

      if (!eventsResult.error) {
        setEvents((eventsResult.data ?? []) as EventRow[]);
      }

      if (!teacherResult.error) {
        setTeacher(
          ((teacherResult.data ?? [])[0] as TeacherSuggestion) ?? null
        );
      }

      if (!institutionResult.error) {
        setInstitution(
          ((institutionResult.data ?? [])[0] as InstitutionSuggestion) ??
            null
        );
      }
    }

    load();
  }, [supabase]);

  return (
    <aside className="hidden space-y-4 xl:block">
      {ad ? (
        <SponsoredAd ad={ad} placement="right_rail" />
      ) : (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-center shadow-sm">
          <p className="text-xs font-extrabold uppercase tracking-wide text-slate-400">
            Sponsored
          </p>
          <p className="mt-2 text-sm text-slate-500">
            Advertising space
          </p>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-extrabold text-slate-900">
            Upcoming Events
          </h2>
          <Link
            href="/events"
            className="text-sm font-bold text-[#0F5FEA]"
          >
            See all
          </Link>
        </div>

        <div className="mt-4 divide-y divide-slate-100">
          {events.map((event) => {
            const date = new Date(event.starts_at);
            return (
              <Link
                key={event.id}
                href={`/events/${event.id}`}
                className="flex gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="w-12 shrink-0 rounded-xl bg-[#F2F6FF] px-2 py-1.5 text-center">
                  <p className="text-[10px] font-extrabold uppercase text-[#0F5FEA]">
                    {date.toLocaleString(undefined, { month: "short" })}
                  </p>
                  <p className="text-xl font-extrabold text-slate-900">
                    {date.getDate()}
                  </p>
                </div>

                <div className="min-w-0">
                  <p className="line-clamp-2 text-sm font-bold text-slate-900">
                    {event.title}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {date.toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                  <p className="mt-1 truncate text-xs text-slate-400">
                    {event.location_name ||
                      (event.meeting_url ? "Online" : "Examify event")}
                  </p>
                </div>
              </Link>
            );
          })}

          {events.length === 0 && (
            <p className="py-3 text-sm text-slate-500">
              No upcoming events yet.
            </p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-extrabold text-slate-900">Suggestions</h2>
          <Link
            href="/discover"
            className="text-sm font-bold text-[#0F5FEA]"
          >
            See all
          </Link>
        </div>

        <div className="mt-4 divide-y divide-slate-100">
          {teacher && (
            <Link
              href={`/teachers/${teacher.user_id}`}
              className="flex items-center gap-3 py-3 first:pt-0"
            >
              {teacher.avatar_url ? (
                <img
                  src={teacher.avatar_url}
                  alt=""
                  className="h-11 w-11 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-50 font-extrabold text-[#0F5FEA]">
                  {teacher.display_name.charAt(0)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">
                  {teacher.display_name}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {teacher.headline || "Teacher"}
                </p>
              </div>
              <span className="rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-bold text-[#0F5FEA]">
                View
              </span>
            </Link>
          )}

          {institution && (
            <Link
              href={`/institutions/${institution.user_id}`}
              className="flex items-center gap-3 py-3 last:pb-0"
            >
              {institution.avatar_url ? (
                <img
                  src={institution.avatar_url}
                  alt=""
                  className="h-11 w-11 rounded-xl object-cover"
                />
              ) : (
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 font-extrabold text-[#0F5FEA]">
                  {institution.name.charAt(0)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">
                  {institution.name}
                </p>
                <p className="text-xs text-slate-500">Institution</p>
              </div>
              <span className="rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-bold text-[#0F5FEA]">
                View
              </span>
            </Link>
          )}

          {!teacher && !institution && (
            <p className="py-3 text-sm text-slate-500">
              New academic suggestions will appear here.
            </p>
          )}
        </div>
      </section>
    </aside>
  );
}
