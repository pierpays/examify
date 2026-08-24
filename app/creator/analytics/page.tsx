"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { jsPDF } from "jspdf";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { createClient } from "@/lib/supabase/client";

type Summary = {
  exams: number;
  attempts: number;
  completed: number;
  students: number;
  averageScore: number;
  passRate: number;
  completionRate: number;
};

type ExamPerformance = {
  id: string;
  title: string;
  attempts: number;
  completed: number;
  students: number;
  averageScore: number;
  passRate: number;
  completionRate: number;
};

type ScoreTrendPoint = {
  label: string;
  score: number;
  examTitle: string;
};

type StudentPerformance = {
  studentId: string;
  studentName: string;
  completed: number;
  averageScore: number;
  passRate: number;
  latestActivity: string | null;
  hasNote: boolean;
};

type CompletedAttempt = {
  id: string;
  exam_id: string;
  user_id: string;
  status: string;
  score_percent: number | null;
  completed_at: string | null;
};

export default function CreatorAnalyticsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [summary, setSummary] = useState<Summary>({
    exams: 0,
    attempts: 0,
    completed: 0,
    students: 0,
    averageScore: 0,
    passRate: 0,
    completionRate: 0,
  });

  const [examPerformance, setExamPerformance] = useState<ExamPerformance[]>([]);
  const [scoreTrend, setScoreTrend] = useState<ScoreTrendPoint[]>([]);
  const [studentPerformance, setStudentPerformance] = useState<StudentPerformance[]>([]);
  const [completedAttempts, setCompletedAttempts] = useState<CompletedAttempt[]>([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentNoteFilter, setStudentNoteFilter] = useState<
    "all" | "with-note" | "needs-attention"
  >("all");
  const [studentSort, setStudentSort] = useState<
    | "completed-high"
    | "score-high"
    | "score-low"
    | "pass-high"
    | "pass-low"
    | "name"
  >("completed-high");
  const [performanceSort, setPerformanceSort] = useState<
    "pass-low" | "completion-low" | "attempts-high" | "score-high" | "name"
  >("attempts-high");
  const [dateRange, setDateRange] = useState<
    "all" | "7" | "30" | "90" | "custom"
  >("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadAnalytics() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      const { data: exams, error: examsError } = await supabase
        .from("exams")
        .select("id, title, passing_score")
        .eq("teacher_id", user.id);

      if (examsError) {
        setMessage(examsError.message);
        return;
      }

      const examIds = (exams ?? []).map((exam) => exam.id);

      if (examIds.length === 0) {
        setSummary({
          exams: 0,
          attempts: 0,
          completed: 0,
          students: 0,
          averageScore: 0,
          passRate: 0,
          completionRate: 0,
        });
        setExamPerformance([]);
        setScoreTrend([]);
        setStudentPerformance([]);
        setCompletedAttempts([]);
        return;
      }

      let attemptsQuery = supabase
        .from("exam_attempts")
        .select("id, exam_id, user_id, status, score_percent, completed_at")
        .in("exam_id", examIds)
        .order("completed_at", { ascending: true });

      if (
        dateRange !== "all" &&
        dateRange !== "custom"
      ) {
        const days = Number(dateRange);
        const cutoff = new Date(
          Date.now() - days * 24 * 60 * 60 * 1000
        ).toISOString();

        attemptsQuery = attemptsQuery.gte("completed_at", cutoff);
      }

      if (dateRange === "custom") {
        if (customStartDate) {
          const start = new Date(
            `${customStartDate}T00:00:00`
          ).toISOString();

          attemptsQuery = attemptsQuery.gte(
            "completed_at",
            start
          );
        }

        if (customEndDate) {
          const end = new Date(
            `${customEndDate}T23:59:59.999`
          ).toISOString();

          attemptsQuery = attemptsQuery.lte(
            "completed_at",
            end
          );
        }
      }

      const { data: attempts, error: attemptsError } =
        await attemptsQuery;

      if (attemptsError) {
        setMessage(attemptsError.message);
        return;
      }

      const completed = (attempts ?? []).filter(
        (attempt) => attempt.status === "completed"
      ) as CompletedAttempt[];

      setCompletedAttempts(completed);

      const scores = completed
        .map((attempt) => Number(attempt.score_percent))
        .filter((score) => Number.isFinite(score));

      const averageScore =
        scores.length > 0
          ? scores.reduce((sum, score) => sum + score, 0) / scores.length
          : 0;

      const passingScoreMap = new Map(
        (exams ?? []).map((exam) => [
          exam.id,
          Number(exam.passing_score ?? 0),
        ])
      );

      const passedAttempts = completed.filter((attempt) => {
        const score = Number(attempt.score_percent);
        const passingScore =
          passingScoreMap.get(attempt.exam_id) ?? 0;

        return Number.isFinite(score) && score >= passingScore;
      }).length;

      const studentIds = [
        ...new Set(
          completed
            .map((attempt) => attempt.user_id)
            .filter(Boolean)
        ),
      ];

      let studentNameMap = new Map<string, string>();
      let studentNoteIds = new Set<string>();

      if (studentIds.length > 0) {
        const { data: studentProfiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", studentIds);

        studentNameMap = new Map(
          (studentProfiles ?? []).map((profile) => [
            profile.id,
            profile.full_name ?? "Student",
          ])
        );

        const { data: teacherNotes } = await supabase
          .from("teacher_student_notes")
          .select("student_id, note")
          .eq("teacher_id", user.id)
          .in("student_id", studentIds);

        studentNoteIds = new Set(
          (teacherNotes ?? [])
            .filter((item) => Boolean(item.note?.trim()))
            .map((item) => item.student_id)
        );
      }

      setStudentPerformance(
        studentIds
          .map((studentId) => {
            const studentAttempts = completed.filter(
              (attempt) => attempt.user_id === studentId
            );

            const studentScores = studentAttempts
              .map((attempt) => Number(attempt.score_percent))
              .filter((score) => Number.isFinite(score));

            const averageScore =
              studentScores.length > 0
                ? studentScores.reduce(
                    (sum, score) => sum + score,
                    0
                  ) / studentScores.length
                : 0;

            const passed = studentAttempts.filter((attempt) => {
              const score = Number(attempt.score_percent);
              const passingScore =
                passingScoreMap.get(attempt.exam_id) ?? 0;

              return (
                Number.isFinite(score) &&
                score >= passingScore
              );
            }).length;

            const passRate =
              studentAttempts.length > 0
                ? (passed / studentAttempts.length) * 100
                : 0;

            const latestActivity =
              studentAttempts
                .map((attempt) => attempt.completed_at)
                .filter(
                  (value): value is string => Boolean(value)
                )
                .sort(
                  (a, b) =>
                    new Date(b).getTime() -
                    new Date(a).getTime()
                )[0] ?? null;

            return {
              studentId,
              studentName:
                studentNameMap.get(studentId) ?? "Student",
              completed: studentAttempts.length,
              averageScore,
              passRate,
              latestActivity,
              hasNote: studentNoteIds.has(studentId),
            };
          })
          .sort((a, b) => b.completed - a.completed)
      );

      const passRate =
        completed.length > 0
          ? (passedAttempts / completed.length) * 100
          : 0;

      const totalAttempts = attempts?.length ?? 0;

      const completionRate =
        totalAttempts > 0
          ? (completed.length / totalAttempts) * 100
          : 0;

      const uniqueStudents = new Set(
        completed
          .map((attempt) => attempt.user_id)
          .filter(Boolean)
      ).size;

      setSummary({
        exams: examIds.length,
        attempts: totalAttempts,
        completed: completed.length,
        students: uniqueStudents,
        averageScore,
        passRate,
        completionRate,
      });

      const examTitleMap = new Map(
        (exams ?? []).map((exam) => [exam.id, exam.title])
      );

      setScoreTrend(
        completed
          .slice(-10)
          .map((attempt, index) => ({
            label: `Attempt ${index + 1}`,
            score: Number(attempt.score_percent ?? 0),
            examTitle:
              examTitleMap.get(attempt.exam_id) ?? "Exam",
          }))
      );

      setExamPerformance(
        (exams ?? []).map((exam) => {
          const examAttempts = (attempts ?? []).filter(
            (attempt) => attempt.exam_id === exam.id
          );

          const completedAttempts = examAttempts.filter(
            (attempt) => attempt.status === "completed"
          );

          const examScores = completedAttempts
            .map((attempt) => Number(attempt.score_percent))
            .filter((score) => Number.isFinite(score));

          const examAverage =
            examScores.length > 0
              ? examScores.reduce((sum, score) => sum + score, 0) /
                examScores.length
              : 0;

          const examPassed = completedAttempts.filter(
            (attempt) =>
              Number(attempt.score_percent) >=
              Number(exam.passing_score ?? 0)
          ).length;

          const examPassRate =
            completedAttempts.length > 0
              ? (examPassed / completedAttempts.length) * 100
              : 0;

          const examCompletionRate =
            examAttempts.length > 0
              ? (completedAttempts.length / examAttempts.length) * 100
              : 0;

          const uniqueStudents = new Set(
            completedAttempts
              .map((attempt) => attempt.user_id)
              .filter(Boolean)
          ).size;

          return {
            id: exam.id,
            title: exam.title,
            attempts: examAttempts.length,
            completed: completedAttempts.length,
            students: uniqueStudents,
            averageScore: examAverage,
            passRate: examPassRate,
            completionRate: examCompletionRate,
          };
        })
      );
    }

    loadAnalytics();
  }, [
    supabase,
    dateRange,
    customStartDate,
    customEndDate,
  ]);

  const filteredStudentPerformance = studentPerformance
    .filter((student) => {
      const matchesSearch = student.studentName
        .toLowerCase()
        .includes(studentSearch.trim().toLowerCase());

      const needsAttention =
        student.averageScore < 60 ||
        student.passRate < 50;

      const matchesNoteFilter =
        studentNoteFilter === "all" ||
        (studentNoteFilter === "with-note" &&
          student.hasNote) ||
        (studentNoteFilter === "needs-attention" &&
          needsAttention);

      return matchesSearch && matchesNoteFilter;
    })
    .sort((a, b) => {
      if (studentSort === "score-high") {
        return b.averageScore - a.averageScore;
      }

      if (studentSort === "score-low") {
        return a.averageScore - b.averageScore;
      }

      if (studentSort === "pass-high") {
        return b.passRate - a.passRate;
      }

      if (studentSort === "pass-low") {
        return a.passRate - b.passRate;
      }

      if (studentSort === "name") {
        return a.studentName.localeCompare(b.studentName);
      }

      return b.completed - a.completed;
    });

  const examsNeedingAttention = examPerformance.filter(
    (exam) =>
      (exam.completed > 0 && exam.passRate < 60) ||
      (exam.attempts > 0 && exam.completionRate < 70)
  );

  const mostPopularExams = [...examPerformance]
    .filter((exam) => exam.students > 0)
    .sort((a, b) => {
      if (b.students !== a.students) {
        return b.students - a.students;
      }

      return b.attempts - a.attempts;
    })
    .slice(0, 5);

  const topStudents = [...studentPerformance]
    .filter((student) => student.completed > 0)
    .sort((a, b) => {
      if (b.averageScore !== a.averageScore) {
        return b.averageScore - a.averageScore;
      }

      return b.passRate - a.passRate;
    })
    .slice(0, 5);

  const mostActiveStudents = [...studentPerformance]
    .filter((student) => student.completed > 0)
    .sort((a, b) => {
      if (b.completed !== a.completed) {
        return b.completed - a.completed;
      }

      return b.averageScore - a.averageScore;
    })
    .slice(0, 5);

  const buildStudentScoreChange = (student: StudentPerformance) => {
    const studentAttempts = completedAttempts
      .filter((attempt) => attempt.user_id === student.studentId)
      .filter((attempt) => Number.isFinite(Number(attempt.score_percent)))
      .sort((a, b) => {
        const aTime = a.completed_at ? new Date(a.completed_at).getTime() : 0;
        const bTime = b.completed_at ? new Date(b.completed_at).getTime() : 0;
        return aTime - bTime;
      });

    if (studentAttempts.length < 2) return null;

    const firstScore = Number(studentAttempts[0].score_percent ?? 0);
    const latestScore = Number(
      studentAttempts[studentAttempts.length - 1].score_percent ?? 0
    );

    return {
      ...student,
      firstScore,
      latestScore,
      change: latestScore - firstScore,
    };
  };

  const mostImprovedStudents = studentPerformance
    .map(buildStudentScoreChange)
    .filter((student): student is NonNullable<ReturnType<typeof buildStudentScoreChange>> =>
      Boolean(student && student.change > 0)
    )
    .sort((a, b) => b.change - a.change)
    .slice(0, 5);

  const decliningStudents = studentPerformance
    .map(buildStudentScoreChange)
    .filter((student): student is NonNullable<ReturnType<typeof buildStudentScoreChange>> =>
      Boolean(student && student.change < 0)
    )
    .sort((a, b) => a.change - b.change)
    .slice(0, 5);

  function exportAnalyticsPdf() {
    const doc = new jsPDF();

    let y = 20;

    doc.setFontSize(18);
    doc.text("Examify Analytics Report", 20, y);

    y += 12;

    doc.setFontSize(11);
    doc.text(`Exams: ${summary.exams}`, 20, y);
    y += 7;
    doc.text(`Attempts: ${summary.attempts}`, 20, y);
    y += 7;
    doc.text(`Completed: ${summary.completed}`, 20, y);
    y += 7;
    doc.text(
      `Average score: ${summary.averageScore.toFixed(1)}%`,
      20,
      y,
    );
    y += 7;
    doc.text(
      `Pass rate: ${summary.passRate.toFixed(1)}%`,
      20,
      y,
    );
    y += 7;
    doc.text(
      `Completion rate: ${summary.completionRate.toFixed(1)}%`,
      20,
      y,
    );

    y += 14;

    doc.setFontSize(14);
    doc.text("Performance by exam", 20, y);

    doc.setFontSize(10);

    for (const exam of sortedExamPerformance) {
      y += 10;

      if (y > 270) {
        doc.addPage();
        y = 20;
      }

      const titleLines = doc.splitTextToSize(
        exam.title,
        170,
      );

      doc.text(titleLines, 20, y);
      y += titleLines.length * 5;

      doc.text(
        `Attempts: ${exam.attempts} | Completed: ${exam.completed}`,
        20,
        y,
      );
      y += 5;

      doc.text(
        `Avg: ${exam.averageScore.toFixed(1)}% | Pass: ${exam.passRate.toFixed(1)}% | Completion: ${exam.completionRate.toFixed(1)}%`,
        20,
        y,
      );
    }

    doc.save("examify-analytics-report.pdf");
  }

  function exportAnalyticsCsv() {
    const header = [
      "Exam",
      "Attempts",
      "Completed",
      "Average Score",
      "Pass Rate",
      "Completion Rate",
    ];

    const rows = sortedExamPerformance.map((exam) => [
      exam.title,
      String(exam.attempts),
      String(exam.completed),
      exam.averageScore.toFixed(1),
      exam.passRate.toFixed(1),
      exam.completionRate.toFixed(1),
    ]);

    const csv = [header, ...rows]
      .map((row) =>
        row
          .map((value) =>
            `"${String(value).replace(/"/g, '""')}"`
          )
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "examify-analytics.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  }

  const sortedExamPerformance = [...examPerformance].sort(
    (a, b) => {
      if (performanceSort === "pass-low") {
        return a.passRate - b.passRate;
      }

      if (performanceSort === "completion-low") {
        return a.completionRate - b.completionRate;
      }

      if (performanceSort === "score-high") {
        return b.averageScore - a.averageScore;
      }

      if (performanceSort === "name") {
        return a.title.localeCompare(b.title);
      }

      return b.attempts - a.attempts;
    }
  );

  return (
    <main className="min-h-screen bg-white px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <p className="text-sm font-medium text-slate-500">
          Examify Creator
        </p>

        <h1 className="mt-1 text-3xl font-bold">
          Analytics
        </h1>

        <p className="mt-2 text-slate-600">
          Track how students are using your exams.
        </p>

        <Link
          href="/creator/dashboard"
          className="mt-5 inline-block rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold"
        >
          ← Back to dashboard
        </Link>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="order-2 flex w-full flex-col gap-2 sm:order-1 sm:w-auto sm:flex-row">
            <button
              type="button"
              onClick={exportAnalyticsCsv}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold sm:w-auto"
            >
              Export CSV
            </button>

            <button
              type="button"
              onClick={exportAnalyticsPdf}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold sm:w-auto"
            >
              Export PDF
            </button>
          </div>

          <div className="order-1 sm:order-2">

          <div>
            <p className="text-sm font-medium text-slate-700">
              Date range
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Filter analytics by completed attempt date.
            </p>
          </div>

          <select
            value={dateRange}
            onChange={(e) =>
              setDateRange(
                e.target.value as
                  | "all"
                  | "7"
                  | "30"
                  | "90"
                  | "custom"
              )
            }
            aria-label="Analytics date range"
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm sm:w-auto"
          >
            <option value="all">All time</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="custom">Custom range</option>
          </select>
          </div>
        </div>

        {dateRange === "custom" && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium">
                Start date
              </label>

              <input
                type="date"
                value={customStartDate}
                onChange={(e) =>
                  setCustomStartDate(e.target.value)
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-3"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">
                End date
              </label>

              <input
                type="date"
                value={customEndDate}
                onChange={(e) =>
                  setCustomEndDate(e.target.value)
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-3"
              />
            </div>
          </div>
        )}

        <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-7">
          <div className="rounded-2xl border border-slate-200 p-5">
            <p className="text-sm text-slate-500">
              Exams
            </p>

            <p className="mt-2 text-3xl font-bold">
              {summary.exams}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 p-5">
            <p className="text-sm text-slate-500">
              Attempts
            </p>

            <p className="mt-2 text-3xl font-bold">
              {summary.attempts}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 p-5">
            <p className="text-sm text-slate-500">
              Completed
            </p>

            <p className="mt-2 text-3xl font-bold">
              {summary.completed}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 p-5">
            <p className="text-sm text-slate-500">
              Students
            </p>

            <p className="mt-2 text-3xl font-bold">
              {summary.students}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 p-5">
            <p className="text-sm text-slate-500">
              Average score
            </p>

            <p className="mt-2 text-3xl font-bold">
              {summary.averageScore.toFixed(1)}%
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 p-5">
            <p className="text-sm text-slate-500">
              Pass rate
            </p>

            <p className="mt-2 text-3xl font-bold">
              {summary.passRate.toFixed(1)}%
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 p-5">
            <p className="text-sm text-slate-500">
              Completion rate
            </p>

            <p className="mt-2 text-3xl font-bold">
              {summary.completionRate.toFixed(1)}%
            </p>
          </div>
        </div>

        {mostImprovedStudents.length > 0 && (
          <section className="mt-10">
            <div>
              <h2 className="text-xl font-semibold">
                Most improved students
              </h2>

              <p className="mt-1 text-sm text-slate-600">
                Students whose scores improved the most in the selected date range.
              </p>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {mostImprovedStudents.map((student, index) => (
                <Link
                  key={student.studentId}
                  href={`/creator/analytics/students/${student.studentId}`}
                  className="rounded-2xl border border-slate-200 p-5 transition hover:border-slate-400 hover:shadow-sm"
                >
                  <p className="text-xs font-semibold text-slate-500">
                    #{index + 1}
                  </p>

                  <h3 className="mt-1 font-semibold">
                    {student.studentName}
                  </h3>

                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <div>
                      <p className="text-xs text-slate-500">
                        First
                      </p>

                      <p className="mt-1 font-bold">
                        {student.firstScore.toFixed(1)}%
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-500">
                        Latest
                      </p>

                      <p className="mt-1 font-bold">
                        {student.latestScore.toFixed(1)}%
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-500">
                        Improvement
                      </p>

                      <p className="mt-1 font-bold text-green-700">
                        +{student.change.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {decliningStudents.length > 0 && (
          <section className="mt-10">
            <div>
              <h2 className="text-xl font-semibold">
                Declining performance
              </h2>

              <p className="mt-1 text-sm text-slate-600">
                Students whose latest score is lower than their first score in the selected date range.
              </p>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {decliningStudents.map((student, index) => (
                <Link
                  key={student.studentId}
                  href={`/creator/analytics/students/${student.studentId}`}
                  className="rounded-2xl border border-amber-200 bg-amber-50 p-5 transition hover:border-amber-300"
                >
                  <p className="text-xs font-semibold text-amber-700">
                    #{index + 1}
                  </p>

                  <h3 className="mt-1 font-semibold">
                    {student.studentName}
                  </h3>

                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <div>
                      <p className="text-xs text-slate-500">First</p>
                      <p className="mt-1 font-bold">{student.firstScore.toFixed(1)}%</p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-500">Latest</p>
                      <p className="mt-1 font-bold">{student.latestScore.toFixed(1)}%</p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-500">Decline</p>
                      <p className="mt-1 font-bold text-amber-700">
                        {student.change.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {mostActiveStudents.length > 0 && (
          <section className="mt-10">
            <div>
              <h2 className="text-xl font-semibold">
                Most active students
              </h2>

              <p className="mt-1 text-sm text-slate-600">
                Students with the most completed attempts in the selected date range.
              </p>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {mostActiveStudents.map((student, index) => (
                <Link
                  key={student.studentId}
                  href={`/creator/analytics/students/${student.studentId}`}
                  className="rounded-2xl border border-slate-200 p-5 transition hover:border-slate-400 hover:shadow-sm"
                >
                  <p className="text-xs font-semibold text-slate-500">
                    #{index + 1}
                  </p>

                  <h3 className="mt-1 font-semibold">
                    {student.studentName}
                  </h3>

                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <div>
                      <p className="text-xs text-slate-500">
                        Completed
                      </p>

                      <p className="mt-1 font-bold">
                        {student.completed}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-500">
                        Avg. score
                      </p>

                      <p className="mt-1 font-bold">
                        {student.averageScore.toFixed(1)}%
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-500">
                        Pass rate
                      </p>

                      <p className="mt-1 font-bold">
                        {student.passRate.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {topStudents.length > 0 && (
          <section className="mt-10">
            <div>
              <h2 className="text-xl font-semibold">
                Top students
              </h2>

              <p className="mt-1 text-sm text-slate-600">
                Highest-performing students in the selected date range.
              </p>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {topStudents.map((student, index) => (
                <Link
                  key={student.studentId}
                  href={`/creator/analytics/students/${student.studentId}`}
                  className="rounded-2xl border border-slate-200 p-5 transition hover:border-slate-400 hover:shadow-sm"
                >
                  <p className="text-xs font-semibold text-slate-500">
                    #{index + 1}
                  </p>

                  <h3 className="mt-1 font-semibold">
                    {student.studentName}
                  </h3>

                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <div>
                      <p className="text-xs text-slate-500">
                        Completed
                      </p>

                      <p className="mt-1 font-bold">
                        {student.completed}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-500">
                        Avg. score
                      </p>

                      <p className="mt-1 font-bold">
                        {student.averageScore.toFixed(1)}%
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-500">
                        Pass rate
                      </p>

                      <p className="mt-1 font-bold">
                        {student.passRate.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {mostPopularExams.length > 0 && (
          <section className="mt-10">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">
                  Most popular exams
                </h2>

                <p className="mt-1 text-sm text-slate-600">
                  Exams reaching the most unique students in the selected date range.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {mostPopularExams.map((exam, index) => (
                <Link
                  key={exam.id}
                  href={`/creator/analytics/exams/${exam.id}`}
                  className="rounded-2xl border border-slate-200 p-5 transition hover:border-slate-400 hover:shadow-sm"
                >
                  <p className="text-xs font-semibold text-slate-500">
                    #{index + 1}
                  </p>

                  <h3 className="mt-1 font-semibold">
                    {exam.title}
                  </h3>

                  <div className="mt-4 flex flex-wrap gap-4 text-sm">
                    <div>
                      <p className="text-xs text-slate-500">
                        Students
                      </p>

                      <p className="mt-1 font-bold">
                        {exam.students}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-500">
                        Attempts
                      </p>

                      <p className="mt-1 font-bold">
                        {exam.attempts}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-500">
                        Avg. score
                      </p>

                      <p className="mt-1 font-bold">
                        {exam.averageScore.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {examsNeedingAttention.length > 0 && (
          <section className="mt-10">
            <h2 className="text-xl font-semibold">
              Needs attention
            </h2>

            <p className="mt-1 text-sm text-slate-600">
              Exams with low pass rates or low completion rates.
            </p>

            <div className="mt-4 space-y-3">
              {examsNeedingAttention.map((exam) => (
                <Link
                  key={exam.id}
                  href={`/creator/analytics/exams/${exam.id}`}
                  className="block rounded-2xl border border-amber-200 bg-amber-50 p-5 transition hover:border-amber-300"
                >
                  <h3 className="font-semibold">
                    {exam.title}
                  </h3>

                  <div className="mt-3 flex flex-wrap gap-3 text-sm">
                    {exam.completed > 0 && exam.passRate < 60 && (
                      <span className="rounded-full bg-white px-3 py-1 font-semibold text-amber-700">
                        Pass rate {exam.passRate.toFixed(1)}%
                      </span>
                    )}

                    {exam.attempts > 0 &&
                      exam.completionRate < 70 && (
                        <span className="rounded-full bg-white px-3 py-1 font-semibold text-amber-700">
                          Completion {exam.completionRate.toFixed(1)}%
                        </span>
                      )}
                  </div>

                  <p className="mt-4 text-sm font-semibold">
                    Review analytics →
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {scoreTrend.length > 1 && (
          <section className="mt-10">
            <h2 className="text-xl font-semibold">
              Score trend
            </h2>

            <p className="mt-1 text-sm text-slate-600">
              Recent completed student attempts across your exams.
            </p>

            <div className="mt-4 h-72 w-full rounded-2xl border border-slate-200 p-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={scoreTrend}
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
                      payload?.[0]?.payload?.examTitle ?? "Exam"
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
          </section>
        )}

        {studentPerformance.length > 0 && (
          <section className="mt-10">
            <h2 className="text-xl font-semibold">
              Student performance
            </h2>

            <p className="mt-1 text-sm text-slate-600">
              Performance across completed attempts in the selected date range.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
              <input
                type="search"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Search students"
                className="w-full rounded-xl border border-slate-300 px-4 py-3"
              />

              <select
                value={studentNoteFilter}
                onChange={(e) =>
                  setStudentNoteFilter(
                    e.target.value as
                      | "all"
                      | "with-note"
                      | "needs-attention"
                  )
                }
                aria-label="Filter students by private note"
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm sm:w-auto"
              >
                <option value="all">All students</option>
                <option value="with-note">With private note</option>
                <option value="needs-attention">
                  Needs attention
                </option>
              </select>

              <select
                value={studentSort}
                onChange={(e) =>
                  setStudentSort(
                    e.target.value as
                      | "completed-high"
                      | "score-high"
                      | "score-low"
                      | "pass-high"
                      | "pass-low"
                      | "name"
                  )
                }
                aria-label="Sort students"
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm sm:w-auto"
              >
                <option value="completed-high">
                  Most completed
                </option>
                <option value="score-high">
                  Highest average score
                </option>
                <option value="score-low">
                  Lowest average score
                </option>
                <option value="pass-high">
                  Highest pass rate
                </option>
                <option value="pass-low">
                  Lowest pass rate
                </option>
                <option value="name">
                  Student name A–Z
                </option>
              </select>
            </div>

            <div className="mt-4 space-y-3">
              {filteredStudentPerformance.map((student) => (
                <Link
                  key={student.studentId}
                  href={`/creator/analytics/students/${student.studentId}`}
                  className="block rounded-2xl border border-slate-200 p-5 transition hover:border-slate-400 hover:shadow-sm"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">
                          {student.studentName}
                        </p>

                        {student.hasNote && (
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                            Private note
                          </span>
                        )}

                        {(student.averageScore < 60 ||
                          student.passRate < 50) && (
                          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                            Needs attention
                          </span>
                        )}
                      </div>

                      {student.latestActivity && (
                        <p className="mt-1 text-xs text-slate-500">
                          Last activity:{" "}
                          {new Date(
                            student.latestActivity
                          ).toLocaleString()}
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-4 sm:min-w-[330px]">
                      <div>
                        <p className="text-xs text-slate-500">
                          Completed
                        </p>
                        <p className="mt-1 font-bold">
                          {student.completed}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-slate-500">
                          Avg. score
                        </p>
                        <p className="mt-1 font-bold">
                          {student.averageScore.toFixed(1)}%
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-slate-500">
                          Pass rate
                        </p>
                        <p className="mt-1 font-bold">
                          {student.passRate.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}

              {filteredStudentPerformance.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center">
                  <p className="font-semibold">
                    No students found.
                  </p>

                  <p className="mt-2 text-sm text-slate-500">
                    Try a different search.
                  </p>
                </div>
              )}
            </div>
          </section>
        )}

        <section className="mt-10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-xl font-semibold">
              Performance by exam
            </h2>

            <select
              value={performanceSort}
              onChange={(e) =>
                setPerformanceSort(
                  e.target.value as
                    | "pass-low"
                    | "completion-low"
                    | "attempts-high"
                    | "score-high"
                    | "name"
                )
              }
              aria-label="Sort exam performance"
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm sm:w-auto"
            >
              <option value="attempts-high">
                Highest attempts
              </option>
              <option value="pass-low">
                Lowest pass rate
              </option>
              <option value="completion-low">
                Lowest completion rate
              </option>
              <option value="score-high">
                Highest average score
              </option>
              <option value="name">
                Exam name A–Z
              </option>
            </select>
          </div>

          <div className="mt-4 space-y-4">
            {sortedExamPerformance.map((exam) => (
              <Link
                key={exam.id}
                href={`/creator/analytics/exams/${exam.id}`}
                className="block rounded-2xl border border-slate-200 p-5 transition hover:border-slate-400 hover:shadow-sm"
              >
                <h3 className="font-semibold">
                  {exam.title}
                </h3>

                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <div>
                    <p className="text-xs text-slate-500">
                      Attempts
                    </p>
                    <p className="mt-1 text-lg font-bold">
                      {exam.attempts}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-slate-500">
                      Completed
                    </p>
                    <p className="mt-1 text-lg font-bold">
                      {exam.completed}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-slate-500">
                      Students
                    </p>
                    <p className="mt-1 text-lg font-bold">
                      {exam.students}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-slate-500">
                      Avg. score
                    </p>
                    <p className="mt-1 text-lg font-bold">
                      {exam.averageScore.toFixed(1)}%
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-slate-500">
                      Pass rate
                    </p>
                    <p className="mt-1 text-lg font-bold">
                      {exam.passRate.toFixed(1)}%
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-slate-500">
                      Completion
                    </p>
                    <p className="mt-1 text-lg font-bold">
                      {exam.completionRate.toFixed(1)}%
                    </p>
                  </div>
                </div>
              </Link>
            ))}
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
