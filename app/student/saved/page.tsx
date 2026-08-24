"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type SavedExamRow = {
  exam_id: string;
  created_at: string;
};

type Exam = {
  id: string;
  title: string;
  short_description: string | null;
  cover_image_url: string | null;
  category: string | null;
  passing_score: number;
  time_limit_minutes: number | null;
};

export default function SavedExamsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [exams, setExams] = useState<Exam[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSavedExams() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      const { data: savedRows, error: savedError } =
        await supabase
          .from("saved_exams")
          .select("exam_id, created_at")
          .eq("student_id", user.id)
          .order("created_at", { ascending: false });

      if (savedError) {
        setMessage(savedError.message);
        setLoading(false);
        return;
      }

      const saved = (savedRows ?? []) as SavedExamRow[];
      const examIds = saved.map((item) => item.exam_id);

      if (examIds.length === 0) {
        setLoading(false);
        return;
      }

      const { data: examData, error: examError } =
        await supabase
          .from("exams")
          .select(`
            id,
            title,
            short_description,
            cover_image_url,
            category,
            passing_score,
            time_limit_minutes
          `)
          .in("id", examIds)
          .eq("status", "published");

      if (examError) {
        setMessage(examError.message);
        setLoading(false);
        return;
      }

      const examMap = new Map(
        (examData ?? []).map((exam) => [exam.id, exam])
      );

      const orderedExams = examIds
        .map((id) => examMap.get(id))
        .filter((exam): exam is Exam => Boolean(exam));

      setExams(orderedExams);
      setLoading(false);
    }

    loadSavedExams();
  }, [supabase]);

  async function removeSavedExam(examId: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

    const { error } = await supabase
      .from("saved_exams")
      .delete()
      .eq("student_id", user.id)
      .eq("exam_id", examId);

    if (error) {
      setMessage(error.message);
      return;
    }

    setExams((current) =>
      current.filter((exam) => exam.id !== examId)
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-white px-4 py-8 text-slate-900 sm:py-10">
        <div className="mx-auto max-w-5xl">
          Loading saved exams...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-5xl">
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
          Saved exams
        </h1>

        <p className="mt-2 text-sm text-slate-600">
          Exams you bookmarked to take later.
        </p>

        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {exams.map((exam) => (
            <article
              key={exam.id}
              className="overflow-hidden rounded-2xl border border-slate-200"
            >
              {exam.cover_image_url && (
                <img
                  src={exam.cover_image_url}
                  alt={`${exam.title} cover`}
                  className="aspect-video w-full object-cover"
                />
              )}

              <div className="p-5">
                {exam.category && (
                  <span className="inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    {exam.category}
                  </span>
                )}

                <h2 className="mt-3 text-lg font-semibold">
                  {exam.title}
                </h2>

                {exam.short_description && (
                  <p className="mt-2 text-sm text-slate-600">
                    {exam.short_description}
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500">
                  <span>
                    Passing score: {exam.passing_score}%
                  </span>

                  <span>
                    {exam.time_limit_minutes
                      ? `${exam.time_limit_minutes} min`
                      : "No time limit"}
                  </span>
                </div>

                <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                  <Link
                    href={`/exams/${exam.id}`}
                    className="w-full rounded-xl bg-slate-900 px-4 py-2 text-center text-sm font-semibold text-white sm:w-auto"
                  >
                    View exam
                  </Link>

                  <button
                    type="button"
                    onClick={() => removeSavedExam(exam.id)}
                    className="w-full rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 sm:w-auto"
                  >
                    Remove from saved
                  </button>
                </div>
              </div>
            </article>
          ))}

          {exams.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center sm:col-span-2">
              <p className="font-semibold">
                No saved exams yet.
              </p>

              <p className="mt-2 text-sm text-slate-500">
                Save an exam from its public page and it will appear here.
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
