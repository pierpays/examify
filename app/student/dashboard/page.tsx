"use client";

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { createClient } from "@/lib/supabase/client";

type ActiveAttempt = {
  id: string;
  exam_id: string;
  exams: {
    title: string;
    cover_image_url: string | null;
  } | null;
};

type StudentSummary = {
  completed: number;
  passed: number;
  averageScore: number;
  saved: number;
};

type RecentResult = {
  id: string;
  score_percent: number | null;
  completed_at: string | null;
  exams: {
    title: string;
    passing_score: number;
  } | null;
};

type RecentExam = {
  id: string;
  title: string;
  category: string | null;
  cover_image_url: string | null;
  published_at: string | null;
};

type FollowedExam = {
  id: string;
  title: string;
  category: string | null;
  cover_image_url: string | null;
  teacher_id: string;
  teacher_name: string;
};

type CategoryPerformance = {
  category: string;
  attempts: number;
  averageScore: number;
};

type ScoreTrend = {
  id: string;
  title: string;
  score: number;
  completed_at: string | null;
};

export default function StudentDashboardPage() {
  const supabase = useMemo(() => createClient(), []);

  const [activeAttempt, setActiveAttempt] = useState<ActiveAttempt | null>(null);
  const [summary, setSummary] = useState<StudentSummary>({
    completed: 0,
    passed: 0,
    averageScore: 0,
    saved: 0,
  });
  const [recentResults, setRecentResults] = useState<RecentResult[]>([]);
  const [recentExams, setRecentExams] = useState<RecentExam[]>([]);
  const [followedExams, setFollowedExams] = useState<FollowedExam[]>([]);
  const [categoryPerformance, setCategoryPerformance] = useState<CategoryPerformance[]>([]);
  const [scoreTrend, setScoreTrend] = useState<ScoreTrend[]>([]);

  useEffect(() => {
    async function loadActiveAttempt() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data } = await supabase
        .from("exam_attempts")
        .select(`
          id,
          exam_id,
          exams (
            title,
            cover_image_url
          )
        `)
        .eq("user_id", user.id)
        .eq("status", "in_progress")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      setActiveAttempt((data ?? null) as ActiveAttempt | null);

      const { data: completedAttempts } = await supabase
        .from("exam_attempts")
        .select(`
          id,
          score_percent,
          completed_at,
          exams (
            title,
            passing_score,
            category
          )
        `)
        .eq("user_id", user.id)
        .eq("status", "completed")
        .order("completed_at", { ascending: false });

      const attempts = (completedAttempts ?? []).map((item) => ({ ...item, exams: one(item.exams) }));

      const passedCount = attempts.filter((attempt) => {
        const score = Number(attempt.score_percent ?? 0);
        const passingScore = Number(
          attempt.exams?.passing_score ?? 0
        );

        return score >= passingScore;
      }).length;

      const scores = attempts
        .map((attempt) => Number(attempt.score_percent))
        .filter((score) => Number.isFinite(score));

      const averageScore =
        scores.length > 0
          ? scores.reduce((sum, score) => sum + score, 0) /
            scores.length
          : 0;

      const { count: savedCount } = await supabase
        .from("saved_exams")
        .select("*", { count: "exact", head: true })
        .eq("student_id", user.id);

      setSummary({
        completed: attempts.length,
        passed: passedCount,
        averageScore,
        saved: savedCount ?? 0,
      });

      setRecentResults(
        attempts.slice(0, 3) as RecentResult[]
      );

      setScoreTrend(
        attempts
          .slice(0, 10)
          .reverse()
          .map((attempt) => ({
            id: attempt.id,
            title: attempt.exams?.title ?? "Exam",
            score: Number(attempt.score_percent ?? 0),
            completed_at: attempt.completed_at,
          }))
      );

      const categoryMap = new Map<
        string,
        { totalScore: number; attempts: number }
      >();

      for (const attempt of attempts) {
        const category =
          attempt.exams?.category?.trim() || "Uncategorized";

        const score = Number(attempt.score_percent);

        if (!Number.isFinite(score)) continue;

        const existing = categoryMap.get(category) ?? {
          totalScore: 0,
          attempts: 0,
        };

        categoryMap.set(category, {
          totalScore: existing.totalScore + score,
          attempts: existing.attempts + 1,
        });
      }

      setCategoryPerformance(
        Array.from(categoryMap.entries())
          .map(([category, values]) => ({
            category,
            attempts: values.attempts,
            averageScore:
              values.attempts > 0
                ? values.totalScore / values.attempts
                : 0,
          }))
          .sort((a, b) => b.averageScore - a.averageScore)
      );

      const { data: latestExams } = await supabase
        .from("exams")
        .select(`
          id,
          title,
          category,
          cover_image_url,
          published_at
        `)
        .eq("status", "published")
        .eq("visibility", "public")
        .order("published_at", { ascending: false })
        .limit(4);

      setRecentExams((latestExams ?? []) as RecentExam[]);

      const { data: follows } = await supabase
        .from("teacher_followers")
        .select("teacher_id")
        .eq("student_id", user.id);

      const followedTeacherIds = (follows ?? []).map(
        (follow) => follow.teacher_id
      );

      if (followedTeacherIds.length > 0) {
        const { data: followedTeacherProfiles } = await supabase
          .from("teacher_profiles")
          .select("user_id, display_name")
          .in("user_id", followedTeacherIds)
          .eq("is_public", true);

        const teacherNameMap = new Map(
          (followedTeacherProfiles ?? []).map((teacher) => [
            teacher.user_id,
            teacher.display_name,
          ])
        );

        const { data: followedExamData } = await supabase
          .from("exams")
          .select(`
            id,
            title,
            category,
            cover_image_url,
            teacher_id,
            published_at
          `)
          .in("teacher_id", followedTeacherIds)
          .eq("status", "published")
          .eq("visibility", "public")
          .order("published_at", { ascending: false })
          .limit(4);

        setFollowedExams(
          (followedExamData ?? []).map((exam) => ({
            id: exam.id,
            title: exam.title,
            category: exam.category,
            cover_image_url: exam.cover_image_url,
            teacher_id: exam.teacher_id,
            teacher_name:
              teacherNameMap.get(exam.teacher_id) ??
              "Examify Instructor",
          }))
        );
      } else {
        setFollowedExams([]);
      }
    }

    loadActiveAttempt();
  }, [supabase]);

  const bestCategory =
    categoryPerformance.length > 0
      ? categoryPerformance[0]
      : null;

  const weakestCategory =
    categoryPerformance.length > 1
      ? categoryPerformance[categoryPerformance.length - 1]
      : null;

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">
              Examify Student
            </p>

            <h1 className="mt-1 text-3xl font-bold">
              Student Dashboard
            </h1>
          </div>

          <button
            type="button"
            onClick={logout}
            className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold sm:w-auto"
          >
            Log out
          </button>
        </div>

        <section className="mt-8">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500">
                Completed exams
              </p>

              <p className="mt-1 text-2xl font-bold">
                {summary.completed}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500">
                Passed
              </p>

              <p className="mt-1 text-2xl font-bold">
                {summary.passed}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500">
                Average score
              </p>

              <p className="mt-1 text-2xl font-bold">
                {summary.averageScore.toFixed(1)}%
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500">
                Saved exams
              </p>

              <p className="mt-1 text-2xl font-bold">
                {summary.saved}
              </p>
            </div>
          </div>
        </section>

        {followedExams.length > 0 && (
          <section className="mt-8">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold">
                From teachers you follow
              </h2>

              <Link
                href="/student/following"
                className="text-sm font-semibold text-slate-600"
              >
                View following →
              </Link>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {followedExams.map((exam) => (
                <Link
                  key={exam.id}
                  href={`/exams/${exam.id}`}
                  className="overflow-hidden rounded-2xl border border-slate-200 transition hover:border-slate-400 hover:shadow-sm"
                >
                  {exam.cover_image_url && (
                    <img
                      src={exam.cover_image_url}
                      alt={`${exam.title} cover`}
                      className="aspect-video w-full object-cover"
                    />
                  )}

                  <div className="p-4">
                    {exam.category && (
                      <span className="inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                        {exam.category}
                      </span>
                    )}

                    <h3 className="mt-3 font-semibold">
                      {exam.title}
                    </h3>

                    <p className="mt-2 text-sm text-slate-500">
                      By {exam.teacher_name}
                    </p>

                    <p className="mt-3 text-sm font-semibold">
                      View exam →
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {recentExams.length > 0 && (
          <section className="mt-8">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold">
                Recently published
              </h2>

              <Link
                href="/exams"
                className="text-sm font-semibold text-slate-600"
              >
                Browse all →
              </Link>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {recentExams.map((exam) => (
                <Link
                  key={exam.id}
                  href={`/exams/${exam.id}`}
                  className="overflow-hidden rounded-2xl border border-slate-200 transition hover:border-slate-400 hover:shadow-sm"
                >
                  {exam.cover_image_url && (
                    <img
                      src={exam.cover_image_url}
                      alt={`${exam.title} cover`}
                      className="aspect-video w-full object-cover"
                    />
                  )}

                  <div className="p-4">
                    {exam.category && (
                      <span className="inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                        {exam.category}
                      </span>
                    )}

                    <h3 className="mt-3 font-semibold">
                      {exam.title}
                    </h3>

                    <p className="mt-3 text-sm font-semibold">
                      View exam →
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {scoreTrend.length > 1 && (
          <section className="mt-8">
            <h2 className="text-xl font-semibold">
              Performance trend
            </h2>

            <p className="mt-1 text-sm text-slate-600">
              Your most recent completed exam scores.
            </p>

            <div className="mt-4 h-72 w-full rounded-2xl border border-slate-200 p-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={scoreTrend.map((result, index) => ({
                    ...result,
                    label: `Exam ${index + 1}`,
                  }))}
                  margin={{
                    top: 10,
                    right: 10,
                    left: -20,
                    bottom: 0,
                  }}
                >
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 12 }}
                  />

                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 12 }}
                  />

                  <Tooltip
                    formatter={(value) => [
                      `${Number(value).toFixed(1)}%`,
                      "Score",
                    ]}
                    labelFormatter={(_, payload) =>
                      payload?.[0]?.payload?.title ?? "Exam"
                    }
                  />

                  <Line
                    type="monotone"
                    dataKey="score"
                    strokeWidth={3}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-4 space-y-2">
              {scoreTrend.map((result, index) => (
                <div
                  key={result.id}
                  className="flex items-center justify-between gap-4 text-sm"
                >
                  <span className="min-w-0 truncate text-slate-600">
                    {index + 1}. {result.title}
                  </span>

                  <span className="shrink-0 font-semibold">
                    {result.score.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {categoryPerformance.length > 0 && (
          <section className="mt-8 grid gap-4 sm:grid-cols-2">
            {bestCategory && (
              <div className="rounded-2xl border border-slate-200 p-5">
                <p className="text-xs font-medium text-slate-500">
                  Strongest category
                </p>

                <p className="mt-2 text-lg font-semibold">
                  {bestCategory.category}
                </p>

                <p className="mt-1 text-2xl font-bold">
                  {bestCategory.averageScore.toFixed(1)}%
                </p>
              </div>
            )}

            {weakestCategory && (
              <div className="rounded-2xl border border-slate-200 p-5">
                <p className="text-xs font-medium text-slate-500">
                  Needs improvement
                </p>

                <p className="mt-2 text-lg font-semibold">
                  {weakestCategory.category}
                </p>

                <p className="mt-1 text-2xl font-bold">
                  {weakestCategory.averageScore.toFixed(1)}%
                </p>
              </div>
            )}
          </section>
        )}

        {categoryPerformance.length > 0 && (
          <section className="mt-8">
            <h2 className="text-xl font-semibold">
              Performance by category
            </h2>

            <div className="mt-4 space-y-3">
              {categoryPerformance.map((item) => (
                <div
                  key={item.category}
                  className="rounded-2xl border border-slate-200 p-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold">
                        {item.category}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        {item.attempts}{" "}
                        {item.attempts === 1
                          ? "completed exam"
                          : "completed exams"}
                      </p>
                    </div>

                    <p className="text-xl font-bold">
                      {item.averageScore.toFixed(1)}%
                    </p>
                  </div>

                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-slate-900"
                      style={{
                        width: `${Math.max(
                          0,
                          Math.min(100, item.averageScore)
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {recentResults.length > 0 && (
          <section className="mt-8">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold">
                Recent results
              </h2>

              <Link
                href="/student/history"
                className="text-sm font-semibold text-slate-600"
              >
                View history →
              </Link>
            </div>

            <div className="mt-4 space-y-3">
              {recentResults.map((result) => {
                const score = Number(result.score_percent ?? 0);
                const passingScore = Number(
                  result.exams?.passing_score ?? 0
                );
                const passed = score >= passingScore;

                return (
                  <Link
                    key={result.id}
                    href={`/student/results/${result.id}`}
                    className="block rounded-2xl border border-slate-200 p-4 transition hover:border-slate-400 hover:shadow-sm"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold">
                          {result.exams?.title ?? "Exam"}
                        </p>

                        {result.completed_at && (
                          <p className="mt-1 text-xs text-slate-500">
                            {new Date(result.completed_at).toLocaleString()}
                          </p>
                        )}
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
            </div>
          </section>
        )}

        {activeAttempt && (
          <section className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-sm font-semibold text-amber-700">
              Exam in progress
            </p>

            <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                {activeAttempt.exams?.cover_image_url && (
                  <img
                    src={activeAttempt.exams.cover_image_url}
                    alt=""
                    className="h-16 w-24 shrink-0 rounded-xl object-cover"
                  />
                )}

                <div>
                  <h2 className="font-semibold">
                    {activeAttempt.exams?.title ?? "Active exam"}
                  </h2>

                  <p className="mt-1 text-sm text-slate-600">
                    Resume where you left off.
                  </p>
                </div>
              </div>

              <Link
                href={`/exams/${activeAttempt.exam_id}/take`}
                className="w-full rounded-xl bg-slate-900 px-5 py-3 text-center font-semibold text-white sm:w-auto"
              >
                Continue exam
              </Link>
            </div>
          </section>
        )}

        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          <Link
            href="/feed"
            className="rounded-2xl border border-slate-200 p-6 transition hover:border-slate-400 hover:shadow-sm"
          >
            <h2 className="text-xl font-semibold">Feed</h2>
            <p className="mt-2 text-sm text-slate-600">
              See teacher and institution updates and optionally share exams you passed.
            </p>
            <p className="mt-5 text-sm font-semibold">Open feed →</p>
          </Link>


          <Link
            href="/exams"
            className="rounded-2xl border border-slate-200 p-6 transition hover:border-slate-400 hover:shadow-sm"
          >
            <h2 className="text-xl font-semibold">Browse exams</h2>
            <p className="mt-2 text-sm text-slate-600">
              Discover published practice exams from teachers on Examify.
            </p>
            <p className="mt-5 text-sm font-semibold">Explore exams →</p>
          </Link>

          <Link
            href="/teachers"
            className="rounded-2xl border border-slate-200 p-6 transition hover:border-slate-400 hover:shadow-sm"
          >
            <h2 className="text-xl font-semibold">Teachers</h2>
            <p className="mt-2 text-sm text-slate-600">
              Discover instructors, view their profiles, and explore the exams they publish.
            </p>
            <p className="mt-5 text-sm font-semibold">Browse teachers →</p>
          </Link>

          <Link
            href="/student/following"
            className="rounded-2xl border border-slate-200 p-6 transition hover:border-slate-400 hover:shadow-sm"
          >
            <h2 className="text-xl font-semibold">Following</h2>
            <p className="mt-2 text-sm text-slate-600">
              View the teachers you follow and quickly find their published exams.
            </p>
            <p className="mt-5 text-sm font-semibold">View teachers →</p>
          </Link>

          <Link
            href="/student/institutions"
            className="rounded-2xl border border-slate-200 p-6 transition hover:border-slate-400 hover:shadow-sm"
          >
            <h2 className="text-xl font-semibold">Following institutions</h2>
            <p className="mt-2 text-sm text-slate-600">
              View institutions you follow and discover their accepted teachers.
            </p>
            <p className="mt-5 text-sm font-semibold">View institutions →</p>
          </Link>

          <Link
            href="/student/saved"
            className="rounded-2xl border border-slate-200 p-6 transition hover:border-slate-400 hover:shadow-sm"
          >
            <h2 className="text-xl font-semibold">Saved exams</h2>
            <p className="mt-2 text-sm text-slate-600">
              Quickly return to exams you bookmarked to take later.
            </p>
            <p className="mt-5 text-sm font-semibold">View saved exams →</p>
          </Link>

          <Link href="/student/institution-requests" className="rounded-2xl border border-slate-200 p-6 transition hover:border-slate-400 hover:shadow-sm"><h2 className="text-xl font-semibold">Institution requests</h2><p className="mt-2 text-sm text-slate-600">Accept or reject institutions that want to add you as a student.</p><p className="mt-5 text-sm font-semibold">Review requests →</p></Link>

          <Link
            href="/student/profile"
            className="rounded-2xl border border-slate-200 p-6 transition hover:border-slate-400 hover:shadow-sm"
          >
            <h2 className="text-xl font-semibold">Profile</h2>
            <p className="mt-2 text-sm text-slate-600">
              Manage your account information and student profile.
            </p>
            <p className="mt-5 text-sm font-semibold">Open profile →</p>
          </Link>

          <Link
            href="/student/history"
            className="rounded-2xl border border-slate-200 p-6 transition hover:border-slate-400 hover:shadow-sm"
          >
            <h2 className="text-xl font-semibold">Exam history</h2>
            <p className="mt-2 text-sm text-slate-600">
              Review your completed exams, scores, results, and past attempts.
            </p>
            <p className="mt-5 text-sm font-semibold">View exam history →</p>
          </Link>
        </div>
      </div>
    </main>
  );
}
