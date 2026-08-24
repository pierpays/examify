"use client";

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Attempt = {
  id: string;
  score_percent: number | null;
  status: string;
  started_at: string;
  completed_at: string | null;
  exams: {
    title: string;
    passing_score: number;
    cover_image_url: string | null;
    category: string | null;
  } | null;
};

export default function StudentHistoryPage() {
  const supabase = useMemo(() => createClient(), []);

  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadHistory() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      const { data, error } = await supabase
        .from("exam_attempts")
        .select(`
          id,
          score_percent,
          status,
          started_at,
          completed_at,
          exams (
            title,
            passing_score,
            cover_image_url,
            category
          )
        `)
        .eq("user_id", user.id)
        .eq("status", "completed")
        .order("completed_at", { ascending: false });

      if (error) {
        setMessage(error.message);
        setLoading(false);
        return;
      }

      setAttempts((data ?? []).map((item) => ({ ...item, exams: one(item.exams) })) as Attempt[]);
      setLoading(false);
    }

    loadHistory();
  }, [supabase]);

  if (loading) {
    return (
      <main className="min-h-screen bg-white px-4 py-8 text-slate-900 sm:py-10">
        <div className="mx-auto max-w-4xl">
          Loading history...
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
          Exam history
        </h1>

        <p className="mt-2 text-sm text-slate-600">
          Review your completed exams and past results.
        </p>

        <div className="mt-8 space-y-4">
          {attempts.map((attempt) => {
            const score = Number(attempt.score_percent ?? 0);
            const passingScore = Number(
              attempt.exams?.passing_score ?? 0
            );
            const passed = score >= passingScore;

            return (
              <Link
                key={attempt.id}
                href={`/student/results/${attempt.id}`}
                className="block rounded-2xl border border-slate-200 p-5 transition hover:border-slate-400 hover:shadow-sm"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-4">
                    {attempt.exams?.cover_image_url ? (
                      <img
                        src={attempt.exams.cover_image_url}
                        alt=""
                        className="h-16 w-24 shrink-0 rounded-xl border border-slate-200 object-cover"
                      />
                    ) : (
                      <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xs font-semibold text-slate-500">
                        No cover
                      </div>
                    )}

                    <div className="min-w-0">
                      {attempt.exams?.category && (
                        <span className="mb-2 inline-block rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                          {attempt.exams.category}
                        </span>
                      )}

                      <h2 className="font-semibold">
                        {attempt.exams?.title ?? "Exam"}
                      </h2>

                      <p className="mt-1 text-xs text-slate-500">
                        {attempt.completed_at
                          ? new Date(
                              attempt.completed_at
                            ).toLocaleString()
                          : ""}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xl font-bold">
                      {score.toFixed(1)}%
                    </span>

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        passed
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {passed ? "Passed" : "Not passed"}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}

          {attempts.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center">
              <p className="font-semibold">
                No completed exams yet.
              </p>

              <p className="mt-2 text-sm text-slate-500">
                Your completed exam results will appear here.
              </p>
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
