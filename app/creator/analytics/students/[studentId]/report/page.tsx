"use client";

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type StudentProfile = {
  id: string;
  full_name: string | null;
};

type Attempt = {
  id: string;
  exam_id: string;
  score_percent: number | null;
  completed_at: string | null;
  exams: {
    title: string;
    passing_score: number;
  } | null;
};

export default function StudentAnalyticsReportPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = use(params);
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();
  const range = searchParams.get("range") ?? "all";
  const startDate = searchParams.get("start") ?? "";
  const endDate = searchParams.get("end") ?? "";

  const [student, setStudent] =
    useState<StudentProfile | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadReport() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      const { data: teacherExams, error: examsError } =
        await supabase
          .from("exams")
          .select("id")
          .eq("teacher_id", user.id);

      if (examsError) {
        setMessage(examsError.message);
        setLoading(false);
        return;
      }

      const examIds = (teacherExams ?? []).map(
        (exam) => exam.id
      );

      const { data: studentData } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("id", studentId)
        .maybeSingle();

      setStudent(studentData ?? null);

      if (examIds.length === 0) {
        setLoading(false);
        return;
      }

      let attemptsQuery = supabase
        .from("exam_attempts")
        .select(`
          id,
          exam_id,
          score_percent,
          completed_at,
          exams (
            title,
            passing_score
          )
        `)
        .eq("user_id", studentId)
        .eq("status", "completed")
        .in("exam_id", examIds)
        .order("completed_at", { ascending: false });

      if (["7", "30", "90"].includes(range)) {
        const days = Number(range);
        const cutoff = new Date(
          Date.now() - days * 24 * 60 * 60 * 1000
        ).toISOString();
        attemptsQuery = attemptsQuery.gte("completed_at", cutoff);
      }

      if (range === "custom") {
        if (startDate) {
          attemptsQuery = attemptsQuery.gte(
            "completed_at",
            new Date(`${startDate}T00:00:00`).toISOString()
          );
        }
        if (endDate) {
          attemptsQuery = attemptsQuery.lte(
            "completed_at",
            new Date(`${endDate}T23:59:59.999`).toISOString()
          );
        }
      }

      const { data: attemptData, error: attemptsError } = await attemptsQuery;

      if (attemptsError) {
        setMessage(attemptsError.message);
        setLoading(false);
        return;
      }

      setAttempts((attemptData ?? []).map((item) => ({ ...item, exams: one(item.exams) })) as Attempt[]);
      setLoading(false);
    }

    loadReport();
  }, [studentId, supabase, range, startDate, endDate]);

  if (loading) {
    return (
      <main className="min-h-screen bg-white px-4 py-10 text-slate-900">
        <div className="mx-auto max-w-4xl">
          Loading report...
        </div>
      </main>
    );
  }

  const scores = attempts
    .map((attempt) => Number(attempt.score_percent))
    .filter((score) => Number.isFinite(score));

  const averageScore =
    scores.length > 0
      ? scores.reduce(
          (sum, score) => sum + score,
          0
        ) / scores.length
      : 0;

  const passedAttempts = attempts.filter((attempt) => {
    const score = Number(attempt.score_percent ?? 0);
    const passingScore = Number(
      attempt.exams?.passing_score ?? 0
    );

    return score >= passingScore;
  }).length;

  const passRate =
    attempts.length > 0
      ? (passedAttempts / attempts.length) * 100
      : 0;

  const rangeLabel =
    range === "7"
      ? "Last 7 days"
      : range === "30"
        ? "Last 30 days"
        : range === "90"
          ? "Last 90 days"
          : range === "custom"
            ? `${startDate || "Start"} to ${endDate || "End"}`
            : "All time";

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-slate-900 sm:px-6 sm:py-10 print:px-0 print:py-0">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
          <Link
            href={`/creator/analytics/students/${studentId}`}
            className="text-sm font-semibold text-slate-600"
          >
            ← Back to student analytics
          </Link>

          <button
            type="button"
            onClick={() => window.print()}
            className="w-full rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white sm:w-auto"
          >
            Print report
          </button>
        </div>

        <header className="mt-8 border-b border-slate-200 pb-6 print:mt-0">
          <p className="text-sm font-semibold text-slate-500">
            Examify
          </p>

          <h1 className="mt-1 text-3xl font-bold">
            Student Analytics Report
          </h1>

          <p className="mt-3 text-xl font-semibold">
            {student?.full_name || "Student"}
          </p>

          <p className="mt-1 text-sm text-slate-500">
            Date range: {rangeLabel}
          </p>

          <p className="mt-1 text-sm text-slate-500">
            Generated {new Date().toLocaleString()}
          </p>
        </header>

        <section className="mt-8 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500">
              Completed
            </p>

            <p className="mt-1 text-2xl font-bold">
              {attempts.length}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500">
              Average score
            </p>

            <p className="mt-1 text-2xl font-bold">
              {averageScore.toFixed(1)}%
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500">
              Pass rate
            </p>

            <p className="mt-1 text-2xl font-bold">
              {passRate.toFixed(1)}%
            </p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-semibold">
            Exam attempts
          </h2>

          <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
            {attempts.map((attempt, index) => {
              const score = Number(
                attempt.score_percent ?? 0
              );

              const passingScore = Number(
                attempt.exams?.passing_score ?? 0
              );

              const passed = score >= passingScore;

              return (
                <div
                  key={attempt.id}
                  className={`p-4 ${
                    index !== attempts.length - 1
                      ? "border-b border-slate-200"
                      : ""
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold">
                        {attempt.exams?.title ?? "Exam"}
                      </p>

                      {attempt.completed_at && (
                        <p className="mt-1 text-xs text-slate-500">
                          {new Date(
                            attempt.completed_at
                          ).toLocaleString()}
                        </p>
                      )}
                    </div>

                    <div className="sm:text-right">
                      <p className="font-bold">
                        {score.toFixed(1)}%
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        Passing score:{" "}
                        {passingScore.toFixed(1)}%
                      </p>

                      <p className="mt-1 text-xs font-semibold">
                        {passed
                          ? "Passed"
                          : "Not passed"}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}

            {attempts.length === 0 && (
              <div className="p-8 text-center text-sm text-slate-500">
                No completed attempts found.
              </div>
            )}
          </div>
        </section>

        {message && (
          <p className="mt-6 text-sm text-red-600 print:hidden">
            {message}
          </p>
        )}

        <footer className="mt-10 border-t border-slate-200 pt-4 text-xs text-slate-500">
          Generated by Examify
        </footer>
      </div>
    </main>
  );
}
