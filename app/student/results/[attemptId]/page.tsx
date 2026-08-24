"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { use, useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import { createClient } from "@/lib/supabase/client";

export default function StudentResultsPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const { attemptId } = use(params);
  const supabase = useMemo(() => createClient(), []);

  const [attempt, setAttempt] = useState<any>(null);
  const [topicAnalytics, setTopicAnalytics] = useState<any[]>([]);
  const [questionReview, setQuestionReview] = useState<any[]>([]);
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

      const { data: attemptData, error } = await supabase
        .from("exam_attempts")
        .select(`
          id,
          score_percent,
          status,
          completed_at,
          exams (
            title,
            passing_score,
            allow_pdf_export
          )
        `)
        .eq("id", attemptId)
        .eq("user_id", user.id)
        .single();

      if (error || !attemptData) {
        setLoading(false);
        return;
      }

      setAttempt(attemptData);

      const { data: topicData } = await supabase.rpc(
        "get_attempt_topic_analytics",
        { target_attempt_id: attemptId },
      );

      const { data: reviewData } = await supabase.rpc(
        "get_student_attempt_question_review",
        { target_attempt_id: attemptId },
      );

      setTopicAnalytics(topicData ?? []);
      setQuestionReview(reviewData ?? []);
      setLoading(false);
    }

    load();
  }, [attemptId, supabase]);

  if (loading) {
    return (
      <main className="min-h-screen bg-white px-4 py-12 text-slate-900">
        <div className="mx-auto max-w-2xl">
          Loading results...
        </div>
      </main>
    );
  }

  if (!attempt) {
    return (
      <main className="min-h-screen bg-white px-4 py-12 text-slate-900">
        <div className="mx-auto max-w-2xl">
          Result not found.
        </div>
      </main>
    );
  }

  const passingScore = attempt.exams?.passing_score ?? 0;
  const score = Number(attempt.score_percent ?? 0);
  const passed = score >= passingScore;

  function exportPdf() {
    const doc = new jsPDF();

    let y = 20;

    doc.setFontSize(18);
    doc.text(attempt.exams?.title ?? "Examify Results", 20, y);

    y += 12;

    doc.setFontSize(12);
    doc.text(`Final score: ${score.toFixed(2)}%`, 20, y);

    y += 8;
    doc.text(`Result: ${passed ? "Passed" : "Not passed"}`, 20, y);

    y += 8;
    doc.text(`Passing score: ${passingScore}%`, 20, y);

    if (attempt.completed_at) {
      y += 8;
      doc.text(
        `Completed: ${new Date(attempt.completed_at).toLocaleString()}`,
        20,
        y,
      );
    }

    if (topicAnalytics.length > 0) {
      y += 14;
      doc.setFontSize(14);
      doc.text("Performance by topic", 20, y);

      doc.setFontSize(11);

      for (const topic of topicAnalytics) {
        y += 8;

        if (y > 275) {
          doc.addPage();
          y = 20;
        }

        doc.text(
          `${topic.topic_name}: ${Number(topic.score_percent ?? 0).toFixed(2)}% (${topic.correct_questions}/${topic.total_questions})`,
          20,
          y,
        );
      }
    }

    if (questionReview.length > 0) {
      y += 14;

      if (y > 270) {
        doc.addPage();
        y = 20;
      }

      doc.setFontSize(14);
      doc.text("Question review", 20, y);

      doc.setFontSize(10);

      questionReview.forEach((item, index) => {
        y += 10;

        if (y > 260) {
          doc.addPage();
          y = 20;
        }

        const questionLines = doc.splitTextToSize(
          `${index + 1}. ${item.question_text}`,
          170,
        );

        doc.text(questionLines, 20, y);
        y += questionLines.length * 5;

        const yourAnswer = item.student_answers?.length
          ? item.student_answers.join(", ")
          : "No answer";

        const correctAnswer = item.correct_answers?.length
          ? item.correct_answers.join(", ")
          : "";

        doc.text(`Your answer: ${yourAnswer}`, 20, y);
        y += 5;
        doc.text(`Correct answer: ${correctAnswer}`, 20, y);
        y += 5;
        doc.text(
          `Result: ${item.is_correct ? "Correct" : "Incorrect"}`,
          20,
          y,
        );
      });
    }

    const safeTitle = (attempt.exams?.title ?? "exam-results")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    doc.save(`${safeTitle || "exam-results"}.pdf`);
  }



  return (
    <main className="min-h-screen bg-white px-4 py-12 text-slate-900">
      <div className="mx-auto max-w-2xl">
        <p className="text-sm font-medium text-slate-500">
          Examify Results
        </p>

        <h1 className="mt-2 text-3xl font-bold">
          {attempt.exams?.title ?? "Exam results"}
        </h1>

        <div className="mt-8 rounded-2xl border border-slate-200 p-6">
          <p className="text-sm text-slate-500">
            Final score
          </p>

          <p className="mt-2 text-5xl font-bold">
            {score.toFixed(2)}%
          </p>

          <p
            className={`mt-4 text-lg font-semibold ${
              passed ? "text-green-600" : "text-red-600"
            }`}
          >
            {passed ? "Passed" : "Not passed"}
          </p>

          <p className="mt-2 text-sm text-slate-500">
            Passing score: {passingScore}%
          </p>
        </div>

        <div className="mt-8">
          <h2 className="text-xl font-semibold">
            Performance by topic
          </h2>

          <div className="mt-4 space-y-4">
            {topicAnalytics.map((topic) => {
              const topicScore = Number(topic.score_percent ?? 0);

              return (
                <div
                  key={topic.topic_id ?? topic.topic_name}
                  className="rounded-2xl border border-slate-200 p-5"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h3 className="font-semibold">
                        {topic.topic_name}
                      </h3>

                      <p className="mt-1 text-sm text-slate-500">
                        {topic.correct_questions} of{" "}
                        {topic.total_questions} correct
                      </p>
                    </div>

                    <div className="text-xl font-bold">
                      {topicScore.toFixed(2)}%
                    </div>
                  </div>

                  <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-slate-900"
                      style={{
                        width: `${Math.max(
                          0,
                          Math.min(100, topicScore),
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}

            {topicAnalytics.length === 0 && (
              <p className="text-sm text-slate-500">
                No topic analytics are available.
              </p>
            )}
          </div>
        </div>

        {questionReview.length > 0 && (
          <section className="mt-8">
            <h2 className="text-xl font-semibold">
              Review your answers
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Review the questions you answered correctly and incorrectly.
            </p>

            <div className="mt-5 space-y-4">
              {questionReview.map((item, index) => (
                <div
                  key={item.question_id}
                  className="rounded-2xl border border-slate-200 p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-slate-500">
                        Question {index + 1} · {item.topic_name}
                      </p>

                      <p className="mt-2 font-semibold">
                        {item.question_text}
                      </p>
                    </div>

                    <span
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                        item.is_correct
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {item.is_correct ? "Correct" : "Incorrect"}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-sm font-medium text-slate-600">
                        Your answer
                      </p>

                      <p className="mt-1 text-sm">
                        {item.student_answers.length
                          ? item.student_answers.join(", ")
                          : "No answer"}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm font-medium text-slate-600">
                        Correct answer
                      </p>

                      <p className="mt-1 text-sm">
                        {item.correct_answers.join(", ")}
                      </p>
                    </div>
                  </div>

                  {item.explanation && (
                    <div className="mt-4 rounded-xl bg-slate-50 p-4">
                      <p className="text-sm font-semibold">
                        Explanation
                      </p>

                      <p className="mt-1 text-sm text-slate-600">
                        {item.explanation}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {attempt.exams?.allow_pdf_export && (
          <button
            type="button"
            onClick={exportPdf}
            className="mt-6 w-full rounded-xl border border-slate-900 px-5 py-3 text-center font-semibold"
          >
            Export results as PDF
          </button>
        )}

        <Link
          href="/student/dashboard"
          className="mt-6 block w-full rounded-xl bg-slate-900 px-5 py-3 text-center font-semibold text-white"
        >
          Go back to dashboard
        </Link>
      </div>
    </main>
  );
}
