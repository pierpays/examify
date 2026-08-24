"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import ShareToFeedButton from "@/components/feed/share-to-feed-button";

export default function PublicExamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const supabase = useMemo(() => createClient(), []);

  const [exam, setExam] = useState<any>(null);
  const [teacherProfile, setTeacherProfile] = useState<any>(null);
  const [backHref, setBackHref] = useState("/exams");
  const [backLabel, setBackLabel] = useState("← Back to Browse exams");
  const [currentUserId, setCurrentUserId] = useState("");
  const [isSaved, setIsSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      const { data: examData, error } = await supabase
        .from("exams")
        .select(`
          id,
          title,
          short_description,
          description,
          passing_score,
          time_limit_minutes,
          cover_image_url,
          category,
          exam_code,
          published_at,
          status,
          teacher_id
        `)
        .eq("id", id)
        .eq("status", "published")
        .single();

      if (error || !examData) {
        setMessage(error?.message ?? "Exam not found.");
        setLoading(false);
        return;
      }

      setExam(examData);

      const { data: teacher } = await supabase
        .from("teacher_profiles")
        .select("display_name, headline, profile_image_url")
        .eq("user_id", examData.teacher_id)
        .eq("is_public", true)
        .maybeSingle();

      setTeacherProfile(teacher);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        setCurrentUserId(user.id);

        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();

        if (
          profile?.role === "teacher" ||
          profile?.role === "admin"
        ) {
          setBackHref("/creator/exams");
          setBackLabel("← Back to Manage exams");
        } else {
          const { data: savedExam } = await supabase
            .from("saved_exams")
            .select("exam_id")
            .eq("student_id", user.id)
            .eq("exam_id", id)
            .maybeSingle();

          setIsSaved(Boolean(savedExam));
        }
      }

      setLoading(false);
    }

    load();
  }, [id, supabase]);

  async function toggleSaved() {
    if (!currentUserId) {
      window.location.href = "/login";
      return;
    }

    if (isSaved) {
      const { error } = await supabase
        .from("saved_exams")
        .delete()
        .eq("student_id", currentUserId)
        .eq("exam_id", id);

      if (error) {
        setMessage(error.message);
        return;
      }

      setIsSaved(false);
      return;
    }

    const { error } = await supabase
      .from("saved_exams")
      .insert({
        student_id: currentUserId,
        exam_id: id,
      });

    if (error) {
      setMessage(error.message);
      return;
    }

    setIsSaved(true);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-white px-4 py-10 text-slate-900">
        <div className="mx-auto max-w-3xl">
          Loading exam...
        </div>
      </main>
    );
  }

  if (!exam) {
    return (
      <main className="min-h-screen bg-white px-4 py-10 text-slate-900">
        <div className="mx-auto max-w-3xl">
          <Link
            href={backHref}
            className="text-sm font-semibold text-slate-600"
          >
            {backLabel}
          </Link>

          <p className="mt-6 text-red-600">
            {message || "Exam not found."}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-3xl">
        <Link
          href={backHref}
          className="mb-6 inline-block text-sm font-semibold text-slate-600"
        >
          {backLabel}
        </Link>

        <p className="text-sm font-medium text-slate-500">
          Examify
        </p>

        {exam.cover_image_url && (
          <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
            <img
              src={exam.cover_image_url}
              alt={`${exam.title} cover`}
              className="aspect-video w-full object-cover"
            />
          </div>
        )}

        {exam.category && (
          <span className="mt-6 inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {exam.category}
          </span>
        )}

        <div className={`${exam.category ? "mt-3" : "mt-6"} flex flex-wrap items-center gap-3`}>
          <h1 className="text-3xl font-bold">
            {exam.title}
          </h1>

          <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
            {exam.exam_code}
          </span>
        </div>

        <div className="mt-4">
          <ShareToFeedButton resourceType="exam" resourceId={exam.id} label="Share exam" />
        </div>

        {exam.short_description && (
          <p className="mt-3 text-lg text-slate-600">
            {exam.short_description}
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-3 text-sm text-slate-500">
          <span>
            Passing score: {exam.passing_score}%
          </span>

          <span>
            Time limit:{" "}
            {exam.time_limit_minutes
              ? `${exam.time_limit_minutes} minutes`
              : "No time limit"}
          </span>

          {exam.published_at && (
            <span>
              Published {new Date(exam.published_at).toLocaleDateString()}
            </span>
          )}
        </div>

        <Link
          href={`/teachers/${exam.teacher_id}`}
          className="mt-8 flex items-center gap-4 rounded-2xl border border-slate-200 p-5 transition hover:border-slate-400"
        >
          {teacherProfile?.profile_image_url ? (
            <img
              src={teacherProfile?.profile_image_url}
              alt=""
              className="h-14 w-14 shrink-0 rounded-full border border-slate-200 object-cover"
            />
          ) : (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg font-bold text-slate-500">
              {(teacherProfile?.display_name ?? "Examify Instructor").trim().charAt(0).toUpperCase()}
            </div>
          )}

          <div className="min-w-0">
            <p className="text-xs text-slate-500">
              Created by
            </p>

            <p className="mt-1 font-semibold">
              {(teacherProfile?.display_name ?? "Examify Instructor")}
            </p>

            {teacherProfile?.headline && (
              <p className="mt-1 text-sm text-slate-600">
                {teacherProfile?.headline}
              </p>
            )}
          </div>
        </Link>

        {exam.description && (
          <div className="mt-8">
            <h2 className="text-xl font-semibold">
              About this exam
            </h2>

            <p className="mt-3 whitespace-pre-wrap text-slate-600">
              {exam.description}
            </p>
          </div>
        )}

        {currentUserId && backHref === "/exams" && (
          <button
            type="button"
            onClick={toggleSaved}
            className="mt-8 w-full rounded-xl border border-slate-300 px-5 py-3 font-semibold"
          >
            {isSaved ? "Saved" : "Save exam"}
          </button>
        )}

        <Link
          href={`/exams/${exam.id}/take`}
          className="mt-3 block w-full rounded-xl bg-slate-900 px-5 py-3 text-center font-semibold text-white"
        >
          Start exam
        </Link>
      </div>
    </main>
  );
}
