"use client";

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

import { use, useEffect, useMemo, useState } from "react";
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

export default function StudentAnalyticsDetailPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = use(params);
  const supabase = useMemo(() => createClient(), []);

  const [student, setStudent] = useState<StudentProfile | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [teacherNote, setTeacherNote] = useState("");
  const [noteMessage, setNoteMessage] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [dateRange, setDateRange] = useState<
    "all" | "7" | "30" | "90" | "custom"
  >("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStudentAnalytics() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      setTeacherId(user.id);

      const { data: existingNote, error: noteError } =
        await supabase
          .from("teacher_student_notes")
          .select("note")
          .eq("teacher_id", user.id)
          .eq("student_id", studentId)
          .maybeSingle();

      if (noteError) {
        setMessage(noteError.message);
      } else {
        setTeacherNote(existingNote?.note ?? "");
      }

      const { data: teacherExams, error: examsError } = await supabase
        .from("exams")
        .select("id")
        .eq("teacher_id", user.id);

      if (examsError) {
        setMessage(examsError.message);
        setLoading(false);
        return;
      }

      const examIds = (teacherExams ?? []).map((exam) => exam.id);

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

      if (
        dateRange !== "all" &&
        dateRange !== "custom"
      ) {
        const days = Number(dateRange);

        const cutoff = new Date(
          Date.now() - days * 24 * 60 * 60 * 1000
        ).toISOString();

        attemptsQuery = attemptsQuery.gte(
          "completed_at",
          cutoff
        );
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

      const { data: attemptData, error: attemptsError } =
        await attemptsQuery;

      if (attemptsError) {
        setMessage(attemptsError.message);
        setLoading(false);
        return;
      }

      setAttempts((attemptData ?? []).map((item) => ({ ...item, exams: one(item.exams) })) as Attempt[]);
      setLoading(false);
    }

    loadStudentAnalytics();
  }, [
    studentId,
    supabase,
    dateRange,
    customStartDate,
    customEndDate,
  ]);

  if (loading) {
    return (
      <main className="min-h-screen bg-white px-4 py-8 text-slate-900 sm:py-10">
        <div className="mx-auto max-w-4xl">
          Loading student analytics...
        </div>
      </main>
    );
  }

  function exportStudentPdf() {
    const doc = new jsPDF();

    const studentName =
      student?.full_name?.trim() || "Student";

    let y = 20;

    doc.setFontSize(18);
    doc.text("Examify Student Analytics", 20, y);

    y += 10;

    doc.setFontSize(13);
    doc.text(studentName, 20, y);

    y += 12;

    doc.setFontSize(11);
    doc.text(
      `Completed: ${attempts.length}`,
      20,
      y
    );

    y += 7;

    doc.text(
      `Average score: ${averageScore.toFixed(1)}%`,
      20,
      y
    );

    y += 7;

    doc.text(
      `Pass rate: ${passRate.toFixed(1)}%`,
      20,
      y
    );

    y += 14;

    doc.setFontSize(14);
    doc.text("Exam attempts", 20, y);

    doc.setFontSize(10);

    for (const attempt of attempts) {
      const score = Number(
        attempt.score_percent ?? 0
      );

      const passingScore = Number(
        attempt.exams?.passing_score ?? 0
      );

      const result =
        score >= passingScore
          ? "Passed"
          : "Not passed";

      y += 10;

      if (y > 270) {
        doc.addPage();
        y = 20;
      }

      const titleLines = doc.splitTextToSize(
        attempt.exams?.title ?? "Exam",
        170
      );

      doc.text(titleLines, 20, y);

      y += titleLines.length * 5;

      doc.text(
        `Score: ${score.toFixed(1)}% | Passing: ${passingScore.toFixed(1)}% | ${result}`,
        20,
        y
      );

      y += 5;

      if (attempt.completed_at) {
        doc.text(
          `Completed: ${new Date(
            attempt.completed_at
          ).toLocaleString()}`,
          20,
          y
        );
      }
    }

    const filename =
      studentName
        .replace(/\s+/g, "-")
        .toLowerCase() +
      "-examify-analytics.pdf";

    doc.save(filename);
  }

  function exportStudentCsv() {
    const header = [
      "Exam",
      "Score",
      "Passing Score",
      "Result",
      "Completed At",
    ];

    const rows = attempts.map((attempt) => {
      const score = Number(attempt.score_percent ?? 0);
      const passingScore = Number(
        attempt.exams?.passing_score ?? 0
      );

      return [
        attempt.exams?.title ?? "Exam",
        score.toFixed(1),
        passingScore.toFixed(1),
        score >= passingScore ? "Passed" : "Not passed",
        attempt.completed_at
          ? new Date(attempt.completed_at).toLocaleString()
          : "",
      ];
    });

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
    link.download = `${
      student?.full_name?.trim().replace(/\s+/g, "-").toLowerCase() ||
      "student"
    }-examify-analytics.csv`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  }

  async function saveTeacherNote() {
    if (!teacherId) return;

    setSavingNote(true);
    setNoteMessage("");

    const { error } = await supabase
      .from("teacher_student_notes")
      .upsert(
        {
          teacher_id: teacherId,
          student_id: studentId,
          note: teacherNote.trim() || null,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "teacher_id,student_id",
        }
      );

    if (error) {
      setNoteMessage(error.message);
      setSavingNote(false);
      return;
    }

    setNoteMessage("Note saved.");
    setSavingNote(false);
  }

  const scores = attempts
    .map((attempt) => Number(attempt.score_percent))
    .filter((score) => Number.isFinite(score));

  const averageScore =
    scores.length > 0
      ? scores.reduce((sum, score) => sum + score, 0) / scores.length
      : 0;

  const passed = attempts.filter((attempt) => {
    const score = Number(attempt.score_percent ?? 0);
    const passingScore = Number(attempt.exams?.passing_score ?? 0);

    return score >= passingScore;
  }).length;

  const passRate =
    attempts.length > 0
      ? (passed / attempts.length) * 100
      : 0;

  const reportParams = new URLSearchParams();
  reportParams.set("range", dateRange);
  if (dateRange === "custom") {
    if (customStartDate) reportParams.set("start", customStartDate);
    if (customEndDate) reportParams.set("end", customEndDate);
  }
  const reportHref = `/creator/analytics/students/${studentId}/report?${reportParams.toString()}`;

  const scoreTrend = [...attempts]
    .reverse()
    .map((attempt, index) => ({
      label: `Attempt ${index + 1}`,
      score: Number(attempt.score_percent ?? 0),
      examTitle: attempt.exams?.title ?? "Exam",
      completedAt: attempt.completed_at,
    }));

  const performanceByExam = Array.from(
    attempts.reduce((map, attempt) => {
      const key = attempt.exam_id;
      const existing = map.get(key) ?? {
        examId: attempt.exam_id,
        title: attempt.exams?.title ?? "Exam",
        passingScore: Number(
          attempt.exams?.passing_score ?? 0
        ),
        scores: [] as number[],
      };

      existing.scores.push(
        Number(attempt.score_percent ?? 0)
      );

      map.set(key, existing);
      return map;
    }, new Map<
      string,
      {
        examId: string;
        title: string;
        passingScore: number;
        scores: number[];
      }
    >())
  )
    .map(([, item]) => {
      const averageScore =
        item.scores.length > 0
          ? item.scores.reduce(
              (sum, score) => sum + score,
              0
            ) / item.scores.length
          : 0;

      const passed = item.scores.filter(
        (score) => score >= item.passingScore
      ).length;

      return {
        examId: item.examId,
        title: item.title,
        passingScore: item.passingScore,
        attempts: item.scores.length,
        averageScore,
        passRate:
          item.scores.length > 0
            ? (passed / item.scores.length) * 100
            : 0,
      };
    })
    .sort((a, b) => b.averageScore - a.averageScore);

  const strongestExam =
    performanceByExam.length > 0
      ? performanceByExam[0]
      : null;

  const weakestExam =
    performanceByExam.length > 1
      ? performanceByExam[performanceByExam.length - 1]
      : null;

  const examsNeedingAttention = performanceByExam.filter(
    (exam) =>
      exam.averageScore < exam.passingScore ||
      exam.passRate < 50
  );

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-4xl">
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
          Examify Creator
        </p>

        <h1 className="mt-1 text-3xl font-bold">
          {student?.full_name || "Student"}
        </h1>

        <p className="mt-2 text-sm text-slate-600">
          Performance across your exams.
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-700">
              Date range
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Filter this student's completed attempts.
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
            aria-label="Student analytics date range"
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm sm:w-auto"
          >
            <option value="all">All time</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="custom">Custom range</option>
          </select>
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

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={exportStudentCsv}
            disabled={attempts.length === 0}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold disabled:opacity-50 sm:w-auto"
          >
            Export student CSV
          </button>

          <button
            type="button"
            onClick={exportStudentPdf}
            disabled={attempts.length === 0}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold disabled:opacity-50 sm:w-auto"
          >
            Export student PDF
          </button>

          <Link
            href={reportHref}
            className="w-full rounded-xl bg-slate-900 px-4 py-3 text-center text-sm font-semibold text-white sm:w-auto"
          >
            Open print report
          </Link>
        </div>

        <div className="mt-8 grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500">
              Completed
            </p>

            <p className="mt-1 text-2xl font-bold">
              {attempts.length}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500">
              Average score
            </p>

            <p className="mt-1 text-2xl font-bold">
              {averageScore.toFixed(1)}%
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500">
              Pass rate
            </p>

            <p className="mt-1 text-2xl font-bold">
              {passRate.toFixed(1)}%
            </p>
          </div>
        </div>

        {examsNeedingAttention.length > 0 && (
          <section className="mt-8">
            <h2 className="text-xl font-semibold">
              Needs attention
            </h2>

            <p className="mt-1 text-sm text-slate-600">
              Exams where this student may need additional support.
            </p>

            <div className="mt-4 space-y-3">
              {examsNeedingAttention.map((exam) => (
                <Link
                  key={exam.examId}
                  href={`/creator/analytics/exams/${exam.examId}`}
                  className="block rounded-2xl border border-amber-200 bg-amber-50 p-5 transition hover:border-amber-300"
                >
                  <p className="font-semibold">
                    {exam.title}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {exam.averageScore < exam.passingScore && (
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-amber-700">
                        Avg. {exam.averageScore.toFixed(1)}%
                      </span>
                    )}

                    {exam.passRate < 50 && (
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-amber-700">
                        Pass rate {exam.passRate.toFixed(1)}%
                      </span>
                    )}
                  </div>

                  <p className="mt-4 text-sm font-semibold">
                    Review exam analytics →
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {performanceByExam.length > 0 && (
          <section className="mt-8 grid gap-4 sm:grid-cols-2">
            {strongestExam && (
              <div className="rounded-2xl border border-slate-200 p-5">
                <p className="text-xs font-medium text-slate-500">
                  Strongest exam
                </p>

                <p className="mt-2 font-semibold">
                  {strongestExam.title}
                </p>

                <p className="mt-1 text-2xl font-bold">
                  {strongestExam.averageScore.toFixed(1)}%
                </p>
              </div>
            )}

            {weakestExam && (
              <div className="rounded-2xl border border-slate-200 p-5">
                <p className="text-xs font-medium text-slate-500">
                  Needs improvement
                </p>

                <p className="mt-2 font-semibold">
                  {weakestExam.title}
                </p>

                <p className="mt-1 text-2xl font-bold">
                  {weakestExam.averageScore.toFixed(1)}%
                </p>
              </div>
            )}
          </section>
        )}

        {performanceByExam.length > 0 && (
          <section className="mt-8">
            <h2 className="text-xl font-semibold">
              Performance by exam
            </h2>

            <div className="mt-4 space-y-3">
              {performanceByExam.map((exam) => (
                <Link
                  key={exam.examId}
                  href={`/creator/analytics/exams/${exam.examId}`}
                  className="block rounded-2xl border border-slate-200 p-5 transition hover:border-slate-400 hover:shadow-sm"
                >
                  <p className="font-semibold">
                    {exam.title}
                  </p>

                  <div className="mt-4 grid grid-cols-3 gap-3">
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

                    <div>
                      <p className="text-xs text-slate-500">
                        Pass rate
                      </p>

                      <p className="mt-1 font-bold">
                        {exam.passRate.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {scoreTrend.length > 1 && (
          <section className="mt-8">
            <h2 className="text-xl font-semibold">
              Score trend
            </h2>

            <p className="mt-1 text-sm text-slate-600">
              Performance across this student's completed attempts.
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

        <section className="mt-8">
          <h2 className="text-xl font-semibold">
            Private teacher note
          </h2>

          <p className="mt-1 text-sm text-slate-600">
            Only you can access this note about this student.
          </p>

          <textarea
            value={teacherNote}
            onChange={(e) => {
              setTeacherNote(e.target.value);
              setNoteMessage("");
            }}
            rows={5}
            placeholder="Add a private note about this student..."
            className="mt-4 w-full resize-y rounded-xl border border-slate-300 px-4 py-3"
          />

          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={saveTeacherNote}
              disabled={savingNote}
              className="w-full rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white disabled:opacity-50 sm:w-auto"
            >
              {savingNote ? "Saving..." : "Save note"}
            </button>

            {noteMessage && (
              <p
                className={`text-sm ${
                  noteMessage === "Note saved."
                    ? "text-green-700"
                    : "text-red-600"
                }`}
              >
                {noteMessage}
              </p>
            )}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-semibold">
            Exam attempts
          </h2>

          <div className="mt-4 space-y-3">
            {attempts.map((attempt) => {
              const score = Number(attempt.score_percent ?? 0);
              const passingScore = Number(
                attempt.exams?.passing_score ?? 0
              );
              const passedAttempt = score >= passingScore;

              return (
                <Link
                  key={attempt.id}
                  href={`/creator/analytics/attempts/${attempt.id}`}
                  className="block rounded-2xl border border-slate-200 p-5 transition hover:border-slate-400 hover:shadow-sm"
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

                    <div className="flex items-center gap-3">
                      <span className="text-xl font-bold">
                        {score.toFixed(1)}%
                      </span>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          passedAttempt
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {passedAttempt ? "Passed" : "Not passed"}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}

            {attempts.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center">
                <p className="font-semibold">
                  No completed attempts found.
                </p>
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
