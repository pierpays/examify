"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Teacher = {
  user_id: string;
  display_name: string;
  headline: string | null;
  bio: string | null;
  profile_image_url: string | null;
  is_verified: boolean;
};

export default function StudentFollowingPage() {
  const supabase = useMemo(() => createClient(), []);

  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadFollowing() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      const { data: follows, error: followsError } =
        await supabase
          .from("teacher_followers")
          .select("teacher_id")
          .eq("student_id", user.id)
          .order("created_at", { ascending: false });

      if (followsError) {
        setMessage(followsError.message);
        setLoading(false);
        return;
      }

      const teacherIds = (follows ?? []).map(
        (follow) => follow.teacher_id,
      );

      if (teacherIds.length === 0) {
        setLoading(false);
        return;
      }

      const { data: profiles, error: profilesError } =
        await supabase
          .from("teacher_profiles")
          .select(`
            user_id,
            display_name,
            headline,
            bio,
            profile_image_url,
            is_verified
          `)
          .in("user_id", teacherIds)
          .eq("is_public", true);

      if (profilesError) {
        setMessage(profilesError.message);
        setLoading(false);
        return;
      }

      const profileMap = new Map(
        (profiles ?? []).map((profile) => [
          profile.user_id,
          profile,
        ]),
      );

      const orderedTeachers = teacherIds
        .map((id) => profileMap.get(id))
        .filter((teacher): teacher is Teacher =>
          Boolean(teacher)
        );

      setTeachers(orderedTeachers);
      setLoading(false);
    }

    loadFollowing();
  }, [supabase]);

  if (loading) {
    return (
      <main className="min-h-screen bg-white px-4 py-8 text-slate-900 sm:py-10">
        <div className="mx-auto max-w-4xl">
          Loading teachers...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/student/dashboard"
          className="text-sm font-semibold text-slate-600"
        >
          ← Back to dashboard
        </Link>

        <p className="mt-6 text-sm font-medium text-slate-500">
          Examify Student
        </p>

        <h1 className="mt-1 text-3xl font-bold">
          Following
        </h1>

        <p className="mt-2 text-sm text-slate-600">
          Teachers you follow on Examify. Students under 18 can follow only teachers assigned to one of their active institution classes.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {teachers.map((teacher) => (
            <Link
              key={teacher.user_id}
              href={`/teachers/${teacher.user_id}`}
              className="rounded-2xl border border-slate-200 p-5 transition hover:border-slate-400 hover:shadow-sm"
            >
              <div className="flex items-center gap-4">
                {teacher.profile_image_url ? (
                  <img
                    src={teacher.profile_image_url}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-full border border-slate-200 object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg font-bold text-slate-500">
                    {teacher.display_name
                      .trim()
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                )}

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold">
                      {teacher.display_name}
                    </h2>

                    {teacher.is_verified && (
                      <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">
                        Verified
                      </span>
                    )}
                  </div>

                  {teacher.headline && (
                    <p className="mt-1 text-sm text-slate-600">
                      {teacher.headline}
                    </p>
                  )}
                </div>
              </div>

              {teacher.bio && (
                <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-500">
                  {teacher.bio}
                </p>
              )}

              <p className="mt-5 text-sm font-semibold">
                View teacher →
              </p>
            </Link>
          ))}

          {teachers.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center sm:col-span-2">
              <p className="font-semibold">
                You're not following any teachers yet.
              </p>

              <p className="mt-2 text-sm text-slate-500">
                Browse exams and follow instructors whose content you want to find again.
              </p>

              <Link
                href="/exams"
                className="mt-5 inline-block rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white"
              >
                Browse exams
              </Link>
            </div>
          )}
        </div>

        {message && (
          <p className="mt-5 text-sm text-red-600">
            {message}
          </p>
        )}
      </div>
    </main>
  );
}
