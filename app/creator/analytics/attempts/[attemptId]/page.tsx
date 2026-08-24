"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type AttemptDetails = {
  attempt_id: string;
  exam_id: string;
  exam_title: string;
  student_name: string;
  student_email: string | null;
  score_percent: number | null;
  status: string;
  started_at: string;
  completed_at: string | null;
  passing_score: number;
};

type QuestionReview = {
  question_id: string;
  question_text: string;
  topic_name: string;
  is_correct: boolean;
  student_answers: string[];
  correct_answers: string[];
};

export default function TeacherAttemptDetailsPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const { attemptId } = use(params);
  const supabase = useMemo(() => createClient(), []);

  const [attempt, setAttempt] = useState<AttemptDetails | null>(null);
  const [questionReview, setQuestionReview] = useState<QuestionReview[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.rpc(
        "get_teacher_attempt_details",
        {
          target_attempt_id: attemptId,
        },
      );

      if (error) {
        setMessage(error.message);
        setLoading(false);
        return;
      }

      const row = Array.isArray(data) ? data[0] : data;

      if (!row) {
        setMessage("Attempt not found.");
        setLoading(false);
        return;
      }

      setAttempt(row);

      const { data: reviewData, error: reviewError } =
        await supabase.rpc(
          "get_teacher_attempt_question_review",
          {
            target_attempt_id: attemptId,
          },
        );

      if (reviewError) {
        setMessage(reviewError.message);
        setLoading(false);
        return;
      }

      setQuestionReview(reviewData ?? []);
      setLoading(false);
    }

    load();
  }, [attemptId, supabase]);

  if (loading) {
    return (
      <main className="min-h-screen bg-white px-4 py-10 text-slate-900">
        <div className="mx-auto max-w-4xl">
          Loading attempt...
        </div>
      </main>
    );
  }

  if (!attempt) {
    return (
      <main className="min-h-screen bg-white px-4 py-10 text-slate-900">
        <div className="mx-auto max-w-4xl">
          <p className="text-red-600">{message}</p>
        </div>
      </main>
    );
  }

  const score = Number(attempt.score_percent ?? 0);
  const passed = score >= attempt.passing_score;

  return (
    <main className="min-h-screen bg-white px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap gap-4">
          <Link
            href={`/creator/analytics/exams/${attempt.exam_id}`}
            className="text-sm font-semibold text-slate-600"
          >
            ← Back to exam analytics
          </Link>

          <Link
            href="/creator/dashboard"
            className="text-sm font-semibold text-slate-600"
          >
            Back to dashboard
          </Link>
        </div>

        <p className="mt-6 text-sm font-medium text-slate-500">
          Student result
        </p>

        <h1 className="mt-1 text-3xl font-bold">
          {attempt.exam_title}
        </h1>

        <div className="mt-6 rounded-2xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500">
            Exam activity
          </p>

          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-slate-500">
                Started
              </p>

              <p className="mt-1 font-semibold">
                {new Date(attempt.started_at).toLocaleString()}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium text-slate-500">
                Completed
              </p>

              <p className="mt-1 font-semibold">
                {attempt.completed_at
                  ? new Date(attempt.completed_at).toLocaleString()
                  : "Not completed"}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 p-5">
            <p className="text-sm text-slate-500">
              Student
            </p>

            <p className="mt-2 text-lg font-semibold">
              {attempt.student_name}
            </p>

            {attempt.student_email && (
              <p className="mt-1 text-sm text-slate-600">
                {attempt.student_email}
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 p-5">
            <p className="text-sm text-slate-500">
              Score
            </p>

            <p className="mt-2 text-4xl font-bold">
              {score.toFixed(2)}%
            </p>

            <p
              className={`mt-2 font-semibold ${
                passed ? "text-green-600" : "text-red-600"
              }`}
            >
              {passed ? "Passed" : "Not passed"}
            </p>
          </div>
        </div>
        <section className="mt-10">
          <h2 className="text-xl font-semibold">
            Question review
          </h2>

          <div className="mt-6">
            <h3 className="text-lg font-semibold text-green-700">
              Correct questions
            </h3>

            <div className="mt-3 space-y-4">
              {questionReview
                .filter((item) => item.is_correct)
                .map((item) => (
                  <div
                    key={item.question_id}
                    className="rounded-2xl border border-green-200 p-5"
                  >
                    <p className="text-xs font-medium text-slate-500">
                      {item.topic_name}
                    </p>

                    <p className="mt-2 font-semibold">
                      {item.question_text}
                    </p>

                    <div className="mt-4 text-sm">
                      <p className="font-medium text-slate-600">
                        Student answer
                      </p>

                      <p className="mt-1">
                        {item.student_answers.length
                          ? item.student_answers.join(", ")
                          : "No answer"}
                      </p>
                    </div>
                  </div>
                ))}

              {questionReview.filter((item) => item.is_correct).length === 0 && (
                <p className="text-sm text-slate-500">
                  No correctly answered questions.
                </p>
              )}
            </div>
          </div>

          <div className="mt-8">
            <h3 className="text-lg font-semibold text-red-700">
              Incorrect questions
            </h3>

            <div className="mt-3 space-y-4">
              {questionReview
                .filter((item) => !item.is_correct)
                .map((item) => (
                  <div
                    key={item.question_id}
                    className="rounded-2xl border border-red-200 p-5"
                  >
                    <p className="text-xs font-medium text-slate-500">
                      {item.topic_name}
                    </p>

                    <p className="mt-2 font-semibold">
                      {item.question_text}
                    </p>

                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div>
                        <p className="text-sm font-medium text-slate-600">
                          Student answer
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
                  </div>
                ))}

              {questionReview.filter((item) => !item.is_correct).length === 0 && (
                <p className="text-sm text-slate-500">
                  No incorrectly answered questions.
                </p>
              )}
            </div>
          </div>
        </section>

      </div>
    </main>
  );
}
