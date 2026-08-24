"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type RecentAttempt = {
  attempt_id: string;
  exam_id: string;
  exam_title: string;
  student_name: string;
  score_percent: number | null;
  completed_at: string | null;
};

type DashboardSummary = {
  totalExams: number;
  publishedExams: number;
  followers: number;
  completedAttempts: number;
};

export default function CreatorDashboardPage() {
  const supabase = useMemo(() => createClient(), []);
  const [recentAttempts, setRecentAttempts] = useState<RecentAttempt[]>([]);
  const [summary, setSummary] = useState<DashboardSummary>({
    totalExams: 0,
    publishedExams: 0,
    followers: 0,
    completedAttempts: 0,
  });

  useEffect(() => {
    async function loadRecentActivity() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data: exams } = await supabase
        .from("exams")
        .select("id, title, status")
        .eq("teacher_id", user.id);

      const examIds = (exams ?? []).map((exam) => exam.id);

      const publishedExams = (exams ?? []).filter(
        (exam) => exam.status === "published"
      ).length;

      const { count: followerCount } = await supabase
        .from("teacher_followers")
        .select("*", { count: "exact", head: true })
        .eq("teacher_id", user.id);

      if (examIds.length === 0) {
        setSummary({
          totalExams: exams?.length ?? 0,
          publishedExams,
          followers: followerCount ?? 0,
          completedAttempts: 0,
        });
        return;
      }

      const examMap = new Map(
        (exams ?? []).map((exam) => [exam.id, exam.title])
      );

      const { data: attempts } = await supabase
        .from("exam_attempts")
        .select("id, exam_id, user_id, score_percent, completed_at")
        .in("exam_id", examIds)
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(5);

      setSummary({
        totalExams: exams?.length ?? 0,
        publishedExams,
        followers: followerCount ?? 0,
        completedAttempts: attempts?.length ?? 0,
      });

      const studentIds = [
        ...new Set((attempts ?? []).map((attempt) => attempt.user_id)),
      ];

      let profileMap = new Map<string, string>();

      if (studentIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", studentIds);

        profileMap = new Map(
          (profiles ?? []).map((profile) => [
            profile.id,
            profile.full_name ?? "Student",
          ])
        );
      }

      setRecentAttempts(
        (attempts ?? []).map((attempt) => ({
          attempt_id: attempt.id,
          exam_id: attempt.exam_id,
          exam_title: examMap.get(attempt.exam_id) ?? "Exam",
          student_name:
            profileMap.get(attempt.user_id) ?? "Student",
          score_percent: attempt.score_percent,
          completed_at: attempt.completed_at,
        }))
      );
    }

    loadRecentActivity();
  }, [supabase]);

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <main className="min-h-screen bg-white px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">
            Examify Creator
          </p>

          <h1 className="mt-1 text-3xl font-bold">
            Creator Dashboard
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
                Total exams
              </p>
              <p className="mt-1 text-2xl font-bold">
                {summary.totalExams}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500">
                Published
              </p>
              <p className="mt-1 text-2xl font-bold">
                {summary.publishedExams}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500">
                Followers
              </p>
              <p className="mt-1 text-2xl font-bold">
                {summary.followers}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500">
                Completed attempts
              </p>
              <p className="mt-1 text-2xl font-bold">
                {summary.completedAttempts}
              </p>
            </div>
          </div>
        </section>

        {recentAttempts.length > 0 && (
          <section className="mt-8">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold">
                Recent activity
              </h2>

              <Link
                href="/creator/analytics"
                className="text-sm font-semibold text-slate-600"
              >
                View analytics →
              </Link>
            </div>

            <div className="mt-4 space-y-3">
              {recentAttempts.map((attempt) => (
                <Link
                  key={attempt.attempt_id}
                  href={`/creator/analytics/attempts/${attempt.attempt_id}`}
                  className="block rounded-2xl border border-slate-200 p-4 transition hover:border-slate-400 hover:shadow-sm"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold">
                        {attempt.student_name}
                      </p>

                      <p className="mt-1 text-sm text-slate-600">
                        {attempt.exam_title}
                      </p>

                      {attempt.completed_at && (
                        <p className="mt-1 text-xs text-slate-500">
                          {new Date(attempt.completed_at).toLocaleString()}
                        </p>
                      )}
                    </div>

                    <p className="text-xl font-bold">
                      {Number(attempt.score_percent ?? 0).toFixed(1)}%
                    </p>
                  </div>
                </Link>
              ))}
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
              Share updates and see posts from teachers, institutions, and student achievements.
            </p>
            <p className="mt-5 text-sm font-semibold">Open feed →</p>
          </Link>


          <Link
            href="/creator/exams/new"
            className="rounded-2xl border border-slate-200 p-6 transition hover:border-slate-400 hover:shadow-sm"
          >
            <h2 className="text-xl font-semibold">
              Create exam
            </h2>

            <p className="mt-2 text-sm text-slate-600">
              Start a new exam, add topics, questions, settings, and publish when ready.
            </p>

            <p className="mt-5 text-sm font-semibold">
              Create new exam →
            </p>
          </Link>

          <Link
            href="/creator/exams"
            className="rounded-2xl border border-slate-200 p-6 transition hover:border-slate-400 hover:shadow-sm"
          >
            <h2 className="text-xl font-semibold">
              Manage exams
            </h2>

            <p className="mt-2 text-sm text-slate-600">
              Create new exams, edit existing exams, manage topics and questions, and publish your content.
            </p>

            <p className="mt-5 text-sm font-semibold">
              Open exam manager →
            </p>
          </Link>

          <Link href="/creator/institution-requests" className="rounded-2xl border border-slate-200 p-6 transition hover:border-slate-400 hover:shadow-sm"><h2 className="text-xl font-semibold">Institution requests</h2><p className="mt-2 text-sm text-slate-600">Accept or reject institutions that want to add you as a teacher.</p><p className="mt-5 text-sm font-semibold">Review requests →</p></Link>

          <Link
            href="/creator/analytics"
            className="rounded-2xl border border-slate-200 p-6 transition hover:border-slate-400 hover:shadow-sm"
          >
            <h2 className="text-xl font-semibold">
              Analytics
            </h2>

            <p className="mt-2 text-sm text-slate-600">
              Track exam attempts, student scores, topic performance, and how your exams are being used.
            </p>

            <p className="mt-5 text-sm font-semibold">
              View analytics →
            </p>
          </Link>

          <Link
            href="/creator/institutions"
            className="rounded-2xl border border-slate-200 p-6 transition hover:border-slate-400 hover:shadow-sm"
          >
            <h2 className="text-xl font-semibold">Following institutions</h2>
            <p className="mt-2 text-sm text-slate-600">
              View institutions you follow and discover other public institutions.
            </p>
            <p className="mt-5 text-sm font-semibold">View institutions →</p>
          </Link>

          <Link
            href="/creator/followers"
            className="rounded-2xl border border-slate-200 p-6 transition hover:border-slate-400 hover:shadow-sm"
          >
            <h2 className="text-xl font-semibold">
              Followers
            </h2>

            <p className="mt-2 text-sm text-slate-600">
              See how many students follow you and view your follower activity.
            </p>

            <p className="mt-5 text-sm font-semibold">
              View followers →
            </p>
          </Link>

          <Link
            href="/creator/profile"
            className="rounded-2xl border border-slate-200 p-6 transition hover:border-slate-400 hover:shadow-sm"
          >
            <h2 className="text-xl font-semibold">
              Teacher profile
            </h2>

            <p className="mt-2 text-sm text-slate-600">
              Update your public instructor name, headline, biography, website, and creator information.
            </p>

            <p className="mt-5 text-sm font-semibold">
              Edit profile →
            </p>
          </Link>
        </div>
      </div>
    </main>
  );
}
