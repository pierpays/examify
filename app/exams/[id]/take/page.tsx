"use client";

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

import { use, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type QuestionOption = {
  id: string;
  option_key: string;
  option_text: string;
  display_order: number;
};

type ExamQuestion = {
  question_id: string;
  questions: {
    question_text: string;
    question_type: "single_choice" | "multiple_choice";
    image_url: string | null;
    question_options: QuestionOption[];
  } | null;
};

export default function TakeExamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: examId } = use(params);
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();

  const [attemptId, setAttemptId] = useState("");
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [answersByQuestion, setAnswersByQuestion] = useState<
    Record<string, string[]>
  >({});
  const [flaggedQuestionIds, setFlaggedQuestionIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);

  useEffect(() => {
    async function startExam() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profileError || !profile) {
        setMessage("Unable to load your Examify profile.");
        setLoading(false);
        return;
      }

      if (profile.role === "teacher" || profile.role === "admin") {
        window.location.href = `/creator/exams/${examId}/preview`;
        return;
      }

      const { data: examSettings, error: settingsError } =
        await supabase
          .from("exams")
          .select("randomize_questions, randomize_answers, allow_retake, time_limit_minutes")
          .eq("id", examId)
          .single();

      if (settingsError) {
        setMessage(settingsError.message);
        setLoading(false);
        return;
      }

      setTimeLimitMinutes(examSettings.time_limit_minutes ?? null);

      if (!examSettings.allow_retake) {
        const { data: previousAttempt, error: previousAttemptError } =
          await supabase
            .from("exam_attempts")
            .select("id")
            .eq("exam_id", examId)
            .eq("user_id", user.id)
            .eq("status", "completed")
            .limit(1)
            .maybeSingle();

        if (previousAttemptError) {
          setMessage(previousAttemptError.message);
          setLoading(false);
          return;
        }

        if (previousAttempt) {
          setMessage(
            "This exam can only be completed once."
          );
          setLoading(false);
          return;
        }
      }

      const { data: existingAttempt, error: existingAttemptError } =
        await supabase
          .from("exam_attempts")
          .select("id, expires_at")
          .eq("exam_id", examId)
          .eq("user_id", user.id)
          .eq("status", "in_progress")
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();

      if (existingAttemptError) {
        setMessage(existingAttemptError.message);
        setLoading(false);
        return;
      }

      let attempt = existingAttempt;

      if (!attempt) {
        const { data: newAttempt, error: attemptError } =
          await supabase
            .from("exam_attempts")
            .insert({
              exam_id: examId,
              user_id: user.id,
              expires_at: examSettings.time_limit_minutes
                ? new Date(
                    Date.now() +
                      Number(examSettings.time_limit_minutes) * 60 * 1000
                  ).toISOString()
                : null,
            })
            .select("id, expires_at")
            .single();

        if (attemptError || !newAttempt) {
          setMessage(
            attemptError?.message ?? "Could not start exam.",
          );
          setLoading(false);
          return;
        }

        attempt = newAttempt;
      }

      setAttemptId(attempt.id);

      let expiration = attempt.expires_at;

      if (
        !expiration &&
        examSettings.time_limit_minutes
      ) {
        expiration = new Date(
          Date.now() +
            Number(examSettings.time_limit_minutes) * 60 * 1000
        ).toISOString();

        const { error: expirationError } = await supabase
          .from("exam_attempts")
          .update({
            expires_at: expiration,
          })
          .eq("id", attempt.id);

        if (expirationError) {
          setMessage(expirationError.message);
          setLoading(false);
          return;
        }
      }

      if (expiration) {
        const remaining = Math.max(
          0,
          Math.floor(
            (new Date(expiration).getTime() - Date.now()) / 1000
          )
        );

        setSecondsRemaining(remaining);
      } else {
        setSecondsRemaining(null);
      }

      const { data, error } = await supabase
        .from("exam_questions")
        .select(`
          question_id,
          questions (
            question_text,
            question_type,
            image_url,
            question_options (
              id,
              option_key,
              option_text,
              display_order
            )
          )
        `)
        .eq("exam_id", examId)
        .order("display_order");

      if (error) {
        setMessage(error.message);
        setLoading(false);
        return;
      }

      let loadedQuestions = (data ?? []).map((item) => ({ ...item, questions: one(item.questions) })) as ExamQuestion[];

      if (examSettings.randomize_questions) {
        loadedQuestions = [...loadedQuestions].sort(
          () => Math.random() - 0.5
        );
      }

      loadedQuestions = loadedQuestions.map((item) => {
        if (!item.questions) return item;

        let options = [...item.questions.question_options];

        if (examSettings.randomize_answers) {
          options = options.sort(() => Math.random() - 0.5);
        } else {
          options = options.sort(
            (a, b) => a.display_order - b.display_order
          );
        }

        return {
          ...item,
          questions: {
            ...item.questions,
            question_options: options,
          },
        };
      });

      setQuestions(loadedQuestions);

      const requestedQuestion = Number(
        searchParams.get("question") ?? "1"
      );

      const requestedIndex = Math.min(
        Math.max(requestedQuestion - 1, 0),
        Math.max(loadedQuestions.length - 1, 0),
      );

      setCurrentIndex(requestedIndex);

      const requestedItem = loadedQuestions[requestedIndex];

      if (requestedItem) {
        const { data: savedAnswers } = await supabase
          .from("attempt_answers")
          .select("option_id")
          .eq("attempt_id", attempt.id)
          .eq("question_id", requestedItem.question_id);

        const selectedIds =
          (savedAnswers ?? []).map((item) => item.option_id);

        setSelected(selectedIds);

        setAnswersByQuestion((currentAnswers) => ({
          ...currentAnswers,
          [requestedItem.question_id]: selectedIds,
        }));
      }

      setLoading(false);
    }

    startExam();
  }, [examId, supabase, searchParams]);

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

  const current = questions[currentIndex];

  async function toggleFlag() {
    if (!current || !attemptId) return;

    const isFlagged = flaggedQuestionIds.includes(current.question_id);

    if (isFlagged) {
      const { error } = await supabase
        .from("attempt_flagged_questions")
        .delete()
        .eq("attempt_id", attemptId)
        .eq("question_id", current.question_id);

      if (error) {
        setMessage(error.message);
        return;
      }

      setFlaggedQuestionIds((ids) =>
        ids.filter((id) => id !== current.question_id)
      );

      return;
    }

    const { error } = await supabase
      .from("attempt_flagged_questions")
      .insert({
        attempt_id: attemptId,
        question_id: current.question_id,
      });

    if (error) {
      setMessage(error.message);
      return;
    }

    setFlaggedQuestionIds((ids) => [
      ...ids,
      current.question_id,
    ]);
  }

  function toggleOption(optionId: string) {
    if (!current?.questions) return;

    if (current.questions.question_type === "single_choice") {
      setSelected([optionId]);
      return;
    }

    setSelected((currentSelected) =>
      currentSelected.includes(optionId)
        ? currentSelected.filter((id) => id !== optionId)
        : [...currentSelected, optionId],
    );
  }

  async function finishExam() {
    if (!attemptId) return;

    const { data: result, error: gradeError } = await supabase
      .rpc("finish_exam_attempt", {
        target_attempt_id: attemptId,
      })
      .single();

    if (gradeError || !result) {
      setMessage(
        gradeError?.message ?? "Could not grade exam."
      );
      return;
    }

    window.location.href =
      `/student/results/${attemptId}`;
  }

  async function saveAndContinue() {
    if (!current || !attemptId) return;

    if (selected.length === 0) {
      setMessage("Select at least one answer.");
      return;
    }

    setMessage("");

    const { error: deleteError } = await supabase
      .from("attempt_answers")
      .delete()
      .eq("attempt_id", attemptId)
      .eq("question_id", current.question_id);

    if (deleteError) {
      setMessage(deleteError.message);
      return;
    }

    const { error } = await supabase
      .from("attempt_answers")
      .insert(
        selected.map((optionId) => ({
          attempt_id: attemptId,
          question_id: current.question_id,
          option_id: optionId,
        })),
      );

    if (error) {
      setMessage(error.message);
      return;
    }

    setAnswersByQuestion((currentAnswers) => ({
      ...currentAnswers,
      [current.question_id]: selected,
    }));

    if (currentIndex < questions.length - 1) {
      const nextIndex = currentIndex + 1;
      const nextQuestion = questions[nextIndex];

      setCurrentIndex(nextIndex);
      setSelected(
        nextQuestion
          ? answersByQuestion[nextQuestion.question_id] ?? []
          : []
      );
      return;
    }

    window.location.href = `/exams/${examId}/review`;
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-white px-4 py-12 text-slate-900">
        <div className="mx-auto max-w-3xl">
          Loading exam...
        </div>
      </main>
    );
  }

  if (!current?.questions) {
    return (
      <main className="min-h-screen bg-white px-4 py-12 text-slate-900">
        <div className="mx-auto max-w-3xl">
          <p>No questions are available for this exam.</p>
        </div>
      </main>
    );
  }

  const question = current.questions;

  return (
    <main className="min-h-screen bg-white px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                const confirmed = window.confirm(
                  "Exit the exam? Your saved answers will remain available when you return."
                );

                if (confirmed) {
                  window.location.href = "/student/dashboard";
                }
              }}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold"
            >
              Exit exam
            </button>

            <p className="text-sm font-medium text-slate-500">
              Question {currentIndex + 1} of {questions.length}
            </p>
          </div>

          {timeLimitMinutes && secondsRemaining !== null && (
            <div className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold">
              Time remaining:{" "}
              {String(Math.floor(secondsRemaining / 60)).padStart(2, "0")}:
              {String(secondsRemaining % 60).padStart(2, "0")}
            </div>
          )}
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-slate-900 transition-all"
            style={{
              width: `${
                questions.length > 0
                  ? ((currentIndex + 1) / questions.length) * 100
                  : 0
              }%`,
            }}
          />
        </div>

        {question.image_url && (
          <img
            src={question.image_url}
            alt=""
            className="mt-5 max-h-96 w-full rounded-2xl border border-slate-200 object-contain"
          />
        )}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <h1 className="text-2xl font-bold">
            {question.question_text}
          </h1>

          <button
            type="button"
            onClick={toggleFlag}
            className={`shrink-0 rounded-xl border px-4 py-2 text-sm font-semibold ${
              flaggedQuestionIds.includes(current.question_id)
                ? "border-amber-300 bg-amber-50 text-amber-700"
                : "border-slate-300"
            }`}
          >
            {flaggedQuestionIds.includes(current.question_id)
              ? "Flagged"
              : "Flag question"}
          </button>
        </div>

        {question.question_type === "multiple_choice" && (
          <div className="mt-4 rounded-xl border border-slate-300 bg-slate-50 px-4 py-3">
            <p className="text-sm font-semibold text-slate-700">
              This is a multiple select question. Select all that apply.
            </p>
          </div>
        )}

        <div className="mt-8 space-y-3">
          {question.question_options.map((option, optionIndex) => {
            const isSelected = selected.includes(option.id);
            const displayKey =
              String.fromCharCode(65 + optionIndex);

            return (
              <button
                key={option.id}
                type="button"
                onClick={() => toggleOption(option.id)}
                className={`w-full rounded-2xl border p-4 text-left ${
                  isSelected
                    ? "border-slate-900 bg-slate-100"
                    : "border-slate-200"
                }`}
              >
                <span className="font-semibold">
                  {displayKey}.
                </span>{" "}
                {option.option_text}
              </button>
            );
          })}
        </div>

        <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <button
            type="button"
            disabled={currentIndex === 0}
            onClick={() => {
              const previousIndex = Math.max(0, currentIndex - 1);
              const previousQuestion = questions[previousIndex];

              setCurrentIndex(previousIndex);
              setSelected(
                previousQuestion
                  ? answersByQuestion[previousQuestion.question_id] ?? []
                  : []
              );
              setMessage("");
            }}
            className="w-full rounded-xl border border-slate-300 px-5 py-3 font-semibold disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
          >
            Previous question
          </button>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            {currentIndex === questions.length - 1 &&
              flaggedQuestionIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const firstFlaggedIndex = questions.findIndex(
                      (item) =>
                        flaggedQuestionIds.includes(item.question_id)
                    );

                    if (firstFlaggedIndex >= 0) {
                      const flaggedQuestion =
                        questions[firstFlaggedIndex];

                      setCurrentIndex(firstFlaggedIndex);
                      setSelected(
                        answersByQuestion[
                          flaggedQuestion.question_id
                        ] ?? []
                      );
                      setMessage("");
                    }
                  }}
                  className="w-full rounded-xl border border-amber-300 bg-amber-50 px-5 py-3 font-semibold text-amber-700 sm:w-auto"
                >
                  Review flagged ({flaggedQuestionIds.length})
                </button>
              )}

            <button
              type="button"
              onClick={saveAndContinue}
              className="w-full rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white sm:w-auto"
            >
              {currentIndex === questions.length - 1
                ? "Review exam"
                : "Next question"}
            </button>
          </div>
        </div>

        {message && (
          <p className="mt-4 text-sm text-red-600">
            {message}
          </p>
        )}
      </div>
    </main>
  );
}
