"use client";

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type ReviewQuestion = {
  question_id: string;
  question_text: string;
  answered: boolean;
  flagged: boolean;
};

export default function ExamReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: examId } = use(params);
  const supabase = useMemo(() => createClient(), []);

  const [attemptId, setAttemptId] = useState("");
  const [questions, setQuestions] = useState<ReviewQuestion[]>([]);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadReview() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      const { data: attempt, error: attemptError } = await supabase
        .from("exam_attempts")
        .select("id, expires_at")
        .eq("exam_id", examId)
        .eq("user_id", user.id)
        .eq("status", "in_progress")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (attemptError || !attempt) {
        setMessage(
          attemptError?.message ?? "No active attempt found."
        );
        setLoading(false);
        return;
      }

      setAttemptId(attempt.id);

      if (attempt.expires_at) {
        setSecondsRemaining(
          Math.max(
            0,
            Math.floor(
              (new Date(attempt.expires_at).getTime() - Date.now()) / 1000
            )
          )
        );
      }

      const { data: examQuestions, error: questionsError } =
        await supabase
          .from("exam_questions")
          .select(`
            question_id,
            display_order,
            questions (
              question_text
            )
          `)
          .eq("exam_id", examId)
          .order("display_order");

      if (questionsError) {
        setMessage(questionsError.message);
        setLoading(false);
        return;
      }

      const { data: answers } = await supabase
        .from("attempt_answers")
        .select("question_id")
        .eq("attempt_id", attempt.id);

      const { data: flagged } = await supabase
        .from("attempt_flagged_questions")
        .select("question_id")
        .eq("attempt_id", attempt.id);

      const answeredIds = new Set(
        (answers ?? []).map((item) => item.question_id)
      );

      const flaggedIds = new Set(
        (flagged ?? []).map((item) => item.question_id)
      );

      setQuestions(
        (examQuestions ?? []).map((item) => ({
          question_id: item.question_id,
          question_text:
            one(item.questions)?.question_text ?? "Question",
          answered: answeredIds.has(item.question_id),
          flagged: flaggedIds.has(item.question_id),
        }))
      );

      setLoading(false);
    }

    loadReview();
  }, [examId, supabase]);

  async function finishExam() {
    if (!attemptId) return;

    const confirmed = window.confirm(
      "Are you sure you want to finish the exam? Your answers will be submitted for grading."
    );

    if (!confirmed) return;

    setMessage("");

    const { data, error } = await supabase
      .rpc("finish_exam_attempt", {
        target_attempt_id: attemptId,
      })
      .single();

    if (error || !data) {
      setMessage(
        error?.message ?? "Could not finish the exam."
      );
      return;
    }

    window.location.href =
      `/student/results/${attemptId}`;
  }

  useEffect(() => {
    if (
      secondsRemaining === null ||
      secondsRemaining <= 0 ||
      !attemptId
    ) {
      return;
    }

    const timer = window.setInterval(() => {
      setSecondsRemaining((current) => {
        if (current === null) return null;

        if (current <= 1) {
          window.clearInterval(timer);

          setTimeout(() => {
            finishExam();
          }, 0);

          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [attemptId, secondsRemaining === null]);

  if (loading) {
    return (
      <main className="min-h-screen bg-white px-4 py-8 text-slate-900 sm:py-10">
        <div className="mx-auto max-w-3xl">
          Loading review...
        </div>
      </main>
    );
  }

  const answeredCount = questions.filter(
    (question) => question.answered
  ).length;

  const flaggedCount = questions.filter(
    (question) => question.flagged
  ).length;

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <Link
          href={`/exams/${examId}/take`}
          className="text-sm font-semibold text-slate-600"
        >
          ← Back to exam
        </Link>

        <p className="mt-6 text-sm font-medium text-slate-500">
          Examify
        </p>

        <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-3xl font-bold">
            Review exam
          </h1>

          {secondsRemaining !== null && (
            <div className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold">
              Time remaining:{" "}
              {String(Math.floor(secondsRemaining / 60)).padStart(2, "0")}:
              {String(secondsRemaining % 60).padStart(2, "0")}
            </div>
          )}
        </div>

        <div className="mt-6 grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500">
              Questions
            </p>
            <p className="mt-1 text-2xl font-bold">
              {questions.length}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500">
              Answered
            </p>
            <p className="mt-1 text-2xl font-bold">
              {answeredCount}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500">
              Flagged
            </p>
            <p className="mt-1 text-2xl font-bold">
              {flaggedCount}
            </p>
          </div>
        </div>

        <div className="mt-8 space-y-3">
          {questions.map((question, index) => (
            <Link
              key={question.question_id}
              href={`/exams/${examId}/take?question=${index + 1}`}
              className="block rounded-2xl border border-slate-200 p-4 transition hover:border-slate-400 hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-slate-500">
                    Question {index + 1}
                  </p>

                  <p className="mt-1 font-semibold">
                    {question.question_text}
                  </p>
                </div>

                <div className="flex flex-col gap-2 text-right">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      question.answered
                        ? "bg-green-100 text-green-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {question.answered ? "Answered" : "Unanswered"}
                  </span>

                  {question.flagged && (
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                      Flagged
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>

        {message && (
          <p className="mt-5 text-sm text-red-600">
            {message}
          </p>
        )}

        {attemptId && (
          <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Link
              href={`/exams/${examId}/take`}
              className="w-full rounded-xl border border-slate-300 px-5 py-3 text-center font-semibold sm:w-auto"
            >
              Return to exam
            </Link>

            <button
              type="button"
              onClick={finishExam}
              className="w-full rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white sm:w-auto"
            >
              Finish exam
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
