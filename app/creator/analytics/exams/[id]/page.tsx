"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Exam = {
  id: string;
  title: string;
  passing_score: number;
};

type Attempt = {
  attempt_id: string;
  student_id: string;
  student_name: string;
  student_email: string | null;
  status: string;
  score_percent: number | null;
  started_at: string;
  completed_at: string | null;
};

export default function ExamAnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: examId } = use(params);
  const supabase = useMemo(() => createClient(), []);

  const [exam, setExam] = useState<Exam | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
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

      const { data: examData, error: examError } = await supabase
        .from("exams")
        .select("id, title, passing_score")
        .eq("id", examId)
        .eq("teacher_id", user.id)
        .single();

      if (examError || !examData) {
        setMessage(
          examError?.message ?? "Exam not found."
        );
        setLoading(false);
        return;
      }

      setExam(examData);

      const { data: attemptData, error: attemptError } =
        await supabase.rpc("get_teacher_exam_attempts", {
          target_exam_id: examId,
        });

      if (attemptError) {
        setMessage(attemptError.message);
        setLoading(false);
        return;
      }

      setAttempts(attemptData ?? []);
      setLoading(false);
    }

    load();
  }, [examId, supabase]);

  if (loading) {
    return (
      <main className="min-h-screen bg-white px-4 py-10 text-slate-900">
        <div className="mx-auto max-w-5xl">
          Loading analytics...
        </div>
      </main>
    );
  }

  const completed = attempts.filter(
    (attempt) => attempt.status === "completed"
  );

  const scores = completed
    .map((attempt) => Number(attempt.score_percent))
    .filter((score) => Number.isFinite(score));

  const average =
    scores.length > 0
      ? scores.reduce((sum, score) => sum + score, 0) /
        scores.length
      : 0;

  const passed = completed.filter(
    (attempt) =>
      Number(attempt.score_percent) >=
      Number(exam?.passing_score ?? 0)
  ).length;

  const passRate =
    completed.length > 0
      ? (passed / completed.length) * 100
      : 0;

  return (
    <main className="min-h-screen bg-white px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap gap-4">
          <Link
            href="/creator/analytics"
            className="text-sm font-semibold text-slate-600"
          >
            ← Back to analytics
          </Link>

          <Link
            href="/creator/dashboard"
            className="text-sm font-semibold text-slate-600"
          >
            Back to dashboard
          </Link>
        </div>

        <p className="mt-6 text-sm font-medium text-slate-500">
          Exam analytics
        </p>

        <h1 className="mt-1 text-3xl font-bold">
          {exam?.title ?? "Exam"}
        </h1>

        <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 p-5">
            <p className="text-sm text-slate-500">
              Attempts
            </p>
            <p className="mt-2 text-3xl font-bold">
              {attempts.length}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 p-5">
            <p className="text-sm text-slate-500">
              Completed
            </p>
            <p className="mt-2 text-3xl font-bold">
              {completed.length}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 p-5">
            <p className="text-sm text-slate-500">
              Average
            </p>
            <p className="mt-2 text-3xl font-bold">
              {average.toFixed(1)}%
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 p-5">
            <p className="text-sm text-slate-500">
              Pass rate
            </p>
            <p className="mt-2 text-3xl font-bold">
              {passRate.toFixed(1)}%
            </p>
          </div>
        </div>

        <section className="mt-10">
          <h2 className="text-xl font-semibold">
            Student attempts
          </h2>

          <div className="mt-4 space-y-3">
            {attempts.map((attempt) => {
              const score =
                attempt.score_percent === null
                  ? null
                  : Number(attempt.score_percent);

              const didPass =
                score !== null &&
                score >= Number(exam?.passing_score ?? 0);

              return (
                <Link
                  key={attempt.attempt_id}
                  href={`/creator/analytics/attempts/${attempt.attempt_id}`}
                  className="block rounded-2xl border border-slate-200 p-5 transition hover:border-slate-400 hover:shadow-sm"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold">
                        {attempt.student_name}
                      </p>

                      {attempt.student_email && (
                        <p className="mt-1 text-sm text-slate-600">
                          {attempt.student_email}
                        </p>
                      )}

                      <p className="mt-1 text-xs text-slate-500">
                        {new Date(
                          attempt.started_at
                        ).toLocaleString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      {score !== null ? (
                        <>
                          <span className="text-lg font-bold">
                            {score.toFixed(1)}%
                          </span>

                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              didPass
                                ? "bg-green-100 text-green-700"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {didPass ? "Passed" : "Not passed"}
                          </span>
                        </>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                          In progress
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}

            {attempts.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                No student attempts yet.
              </div>
            )}
          </div>
        </section>

        {message && (
          <p className="mt-5 text-sm text-red-600">
            {message}
          </p>
        )}
      </div>
    </main>
  );
}
