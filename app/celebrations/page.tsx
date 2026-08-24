"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Birthday = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  birthday_month: number;
  birthday_day: number;
  days_until: number;
  already_congratulated: boolean;
};

type Anniversary = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  years_on_examify: number;
  days_until: number;
  already_congratulated: boolean;
};

type Achievement = {
  post_id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  exam_title: string;
  score_percent: number;
  passing_score: number;
  completed_at: string;
  already_congratulated: boolean;
};

function Avatar({
  name,
  src,
}: {
  name: string;
  src: string | null;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className="h-14 w-14 shrink-0 rounded-full object-cover"
      />
    );
  }

  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-100 to-violet-100 text-lg font-extrabold text-[#1E3A8A]">
      {name.trim().charAt(0).toUpperCase() || "E"}
    </div>
  );
}

function dayLabel(days: number) {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

export default function CelebrationsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [birthdays, setBirthdays] = useState<Birthday[]>([]);
  const [anniversaries, setAnniversaries] = useState<Anniversary[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setMessage("");

    const [birthdayResult, anniversaryResult, achievementResult] =
      await Promise.all([
        supabase.rpc("get_upcoming_connection_birthdays", {
          p_days: 7,
          p_limit: 30,
        }),
        supabase.rpc("get_connection_anniversaries", {
          p_days: 7,
          p_limit: 30,
        }),
        supabase.rpc("get_recent_connection_achievements", {
          p_limit: 20,
        }),
      ]);

    const error =
      birthdayResult.error ||
      anniversaryResult.error ||
      achievementResult.error;

    if (error) setMessage(error.message);

    setBirthdays((birthdayResult.data ?? []) as Birthday[]);
    setAnniversaries(
      (anniversaryResult.data ?? []) as Anniversary[]
    );
    setAchievements(
      (achievementResult.data ?? []) as Achievement[]
    );
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [supabase]);

  async function congratulate({
    recipientId,
    type,
    relatedPostId = null,
    celebrationDate = null,
    key,
  }: {
    recipientId: string;
    type: "birthday" | "examify_anniversary" | "achievement";
    relatedPostId?: string | null;
    celebrationDate?: string | null;
    key: string;
  }) {
    setWorking(key);
    setMessage("");

    const { error } = await supabase.rpc(
      "send_social_congratulations",
      {
        p_recipient_id: recipientId,
        p_celebration_type: type,
        p_related_post_id: relatedPostId,
        p_celebration_date: celebrationDate,
      }
    );

    if (error) setMessage(error.message);
    await load();
    setWorking("");
  }

  return (
    <main className="min-h-screen px-3 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <section className="rounded-3xl bg-gradient-to-r from-[#071A46] via-[#0B2F78] to-[#6D3EF0] p-6 text-white shadow-sm sm:p-8">
          <p className="text-sm font-bold text-blue-100">
            CELEBRATE ACADEMIC COMMUNITY
          </p>
          <h1 className="mt-1 text-3xl font-extrabold sm:text-4xl">
            Celebrations & milestones
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-blue-50">
            Celebrate birthdays your connections choose to share, Examify
            anniversaries, and academic achievements they have made public.
          </p>
        </section>

        {message && (
          <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {message}
          </p>
        )}

        {loading ? (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
            Loading celebrations...
          </div>
        ) : (
          <div className="mt-8 grid gap-8 lg:grid-cols-2">
            <section>
              <div>
                <h2 className="text-xl font-extrabold">
                  🎂 Upcoming birthdays
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Only birthdays that your accepted connections have chosen
                  to make visible are shown here.
                </p>
              </div>

              <div className="mt-4 space-y-3">
                {birthdays.map((person) => {
                  const key = `birthday-${person.user_id}`;

                  return (
                    <article
                      key={person.user_id}
                      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                    >
                      <div className="flex items-center gap-4">
                        <Link href={`/people/${person.user_id}`}>
                          <Avatar
                            name={person.display_name}
                            src={person.avatar_url}
                          />
                        </Link>

                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/people/${person.user_id}`}
                            className="truncate font-extrabold hover:text-[#2563EB] hover:underline"
                          >
                            {person.display_name}
                          </Link>
                          <p className="mt-1 text-sm font-semibold text-[#2563EB]">
                            {dayLabel(Number(person.days_until))}
                          </p>
                        </div>

                        <button
                          type="button"
                          disabled={
                            person.already_congratulated ||
                            working === key ||
                            Number(person.days_until) !== 0
                          }
                          onClick={() =>
                            congratulate({
                              recipientId: person.user_id,
                              type: "birthday",
                              key,
                            })
                          }
                          className="rounded-xl bg-gradient-to-r from-[#2563EB] to-[#7C3AED] px-4 py-2.5 text-xs font-bold text-white disabled:cursor-default disabled:bg-none disabled:bg-slate-100 disabled:text-slate-400"
                        >
                          {person.already_congratulated
                            ? "Sent ✓"
                            : Number(person.days_until) === 0
                              ? working === key
                                ? "Sending..."
                                : "Say happy birthday"
                              : "Upcoming"}
                        </button>
                      </div>
                    </article>
                  );
                })}

                {birthdays.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-7 text-center text-sm text-slate-500">
                    No connection birthdays in the next 7 days.
                  </div>
                )}
              </div>
            </section>

            <section>
              <div>
                <h2 className="text-xl font-extrabold">
                  🎉 Examify anniversaries
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Celebrate connections who have been part of the Examify
                  academic community for another year.
                </p>
              </div>

              <div className="mt-4 space-y-3">
                {anniversaries.map((person) => {
                  const key = `anniversary-${person.user_id}`;

                  return (
                    <article
                      key={person.user_id}
                      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                    >
                      <div className="flex items-center gap-4">
                        <Link href={`/people/${person.user_id}`}>
                          <Avatar
                            name={person.display_name}
                            src={person.avatar_url}
                          />
                        </Link>

                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/people/${person.user_id}`}
                            className="truncate font-extrabold hover:text-[#2563EB] hover:underline"
                          >
                            {person.display_name}
                          </Link>
                          <p className="mt-1 text-sm text-slate-600">
                            {Number(person.years_on_examify)}{" "}
                            {Number(person.years_on_examify) === 1
                              ? "year"
                              : "years"}{" "}
                            on Examify · {dayLabel(Number(person.days_until))}
                          </p>
                        </div>

                        <button
                          type="button"
                          disabled={
                            person.already_congratulated ||
                            working === key ||
                            Number(person.days_until) !== 0
                          }
                          onClick={() =>
                            congratulate({
                              recipientId: person.user_id,
                              type: "examify_anniversary",
                              key,
                            })
                          }
                          className="rounded-xl border border-violet-200 px-4 py-2.5 text-xs font-bold text-violet-700 disabled:cursor-default disabled:border-slate-200 disabled:text-slate-400"
                        >
                          {person.already_congratulated
                            ? "Sent ✓"
                            : Number(person.days_until) === 0
                              ? working === key
                                ? "Sending..."
                                : "Celebrate"
                              : "Upcoming"}
                        </button>
                      </div>
                    </article>
                  );
                })}

                {anniversaries.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-7 text-center text-sm text-slate-500">
                    No Examify anniversaries in the next 7 days.
                  </div>
                )}
              </div>
            </section>

            <section className="lg:col-span-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-xl font-extrabold">
                    🏆 Recent academic milestones
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Passed exams that your connections deliberately shared as
                    public achievements during the last 30 days.
                  </p>
                </div>

                <Link
                  href="/feed"
                  className="text-sm font-bold text-[#2563EB]"
                >
                  View Feed →
                </Link>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {achievements.map((item) => {
                  const key = `achievement-${item.post_id}`;

                  return (
                    <article
                      key={item.post_id}
                      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                    >
                      <div className="flex items-center gap-3">
                        <Link href={`/people/${item.user_id}`}>
                          <Avatar
                            name={item.display_name}
                            src={item.avatar_url}
                          />
                        </Link>
                        <div className="min-w-0">
                          <Link
                            href={`/people/${item.user_id}`}
                            className="block truncate font-extrabold hover:text-[#2563EB] hover:underline"
                          >
                            {item.display_name}
                          </Link>
                          <p className="text-xs text-slate-400">
                            {new Date(item.completed_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 rounded-2xl bg-gradient-to-br from-blue-50 to-violet-50 p-4">
                        <p className="text-xs font-bold uppercase tracking-wide text-[#2563EB]">
                          Passed exam
                        </p>
                        <h3 className="mt-2 line-clamp-2 font-extrabold">
                          {item.exam_title}
                        </h3>
                        <p className="mt-3 text-3xl font-extrabold text-[#1E3A8A]">
                          {Number(item.score_percent).toFixed(0)}%
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Passing score: {item.passing_score}%
                        </p>
                      </div>

                      <div className="mt-4 flex gap-2">
                        <button
                          type="button"
                          disabled={
                            item.already_congratulated || working === key
                          }
                          onClick={() =>
                            congratulate({
                              recipientId: item.user_id,
                              type: "achievement",
                              relatedPostId: item.post_id,
                              key,
                            })
                          }
                          className="flex-1 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white disabled:bg-slate-100 disabled:text-slate-400"
                        >
                          {item.already_congratulated
                            ? "Congratulated ✓"
                            : working === key
                              ? "Sending..."
                              : "👏 Congratulate"}
                        </button>

                        <Link
                          href="/feed"
                          className="rounded-xl border border-slate-300 px-4 py-2.5 text-xs font-bold"
                        >
                          View post
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>

              {achievements.length === 0 && (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                  No recent shared academic milestones from your connections.
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
