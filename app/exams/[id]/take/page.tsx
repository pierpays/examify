"use client";

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
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

type AttemptRow = {
  id: string;
  expires_at: string | null;
  question_order: string[] | null;
  option_order: Record<string, string[]> | null;
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
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

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
        .select("role,is_disabled,disabled_reason")
        .eq("id", user.id)
        .single();

      if (profileError || !profile) {
        setMessage("Unable to load your Examtify profile.");
        setLoading(false);
        return;
      }

      if (profile.is_disabled) {
        const reason = profile.disabled_reason?.trim();
        await supabase.auth.signOut();
        window.alert(
          reason
            ? `Your Examtify account is temporarily disabled. ${reason}`
            : "Your Examtify account is temporarily disabled. Please contact support for assistance.",
        );
        window.location.href = "/login";
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
          setMessage("This exam can only be completed once.");
          setLoading(false);
          return;
        }
      }

      const { data: existingAttempt, error: existingAttemptError } =
        await supabase
          .from("exam_attempts")
          .select("id, expires_at, question_order, option_order")
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

      let attempt = existingAttempt as AttemptRow | null;

      if (!attempt) {
        const { data: newAttempt, error: attemptError } =
          await supabase
            .from("exam_attempts")
            .insert({
              exam_id: examId,
              user_id: user.id,
              expires_at: examSettings.time_limit_minutes
                ? new Date(
                    Date.now() + Number(examSettings.time_limit_minutes) * 60 * 1000,
                  ).toISOString()
                : null,
            })
            .select("id, expires_at, question_order, option_order")
            .single();

        if (attemptError || !newAttempt) {
          setMessage(attemptError?.message ?? "Could not start exam.");
          setLoading(false);
          return;
        }

        attempt = newAttempt as AttemptRow;
      }

      setAttemptId(attempt.id);

      let expiration = attempt.expires_at;

      if (!expiration && examSettings.time_limit_minutes) {
        expiration = new Date(
          Date.now() + Number(examSettings.time_limit_minutes) * 60 * 1000,
        ).toISOString();

        const { error: expirationError } = await supabase
          .from("exam_attempts")
          .update({ expires_at: expiration })
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
          Math.floor((new Date(expiration).getTime() - Date.now()) / 1000),
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

      const canonicalQuestions = (data ?? []).map((item) => ({
        ...item,
        questions: one(item.questions),
      })) as ExamQuestion[];

      const canonicalById = new Map(
        canonicalQuestions.map((item) => [item.question_id, item]),
      );

      let questionOrder = attempt.question_order ?? null;
      const savedQuestionOrderIsUsable =
        Array.isArray(questionOrder) &&
        questionOrder.length === canonicalQuestions.length &&
        questionOrder.every((questionId) => canonicalById.has(questionId));

      if (!savedQuestionOrderIsUsable) {
        const ids = canonicalQuestions.map((item) => item.question_id);
        questionOrder = examSettings.randomize_questions ? shuffled(ids) : ids;
      }

      let loadedQuestions = (questionOrder ?? [])
        .map((questionId) => canonicalById.get(questionId))
        .filter((item): item is ExamQuestion => Boolean(item));

      const savedOptionOrder =
        attempt.option_order && typeof attempt.option_order === "object"
          ? attempt.option_order
          : {};
      const nextOptionOrder: Record<string, string[]> = {};

      loadedQuestions = loadedQuestions.map((item) => {
        if (!item.questions) return item;

        const canonicalOptions = [...item.questions.question_options].sort(
          (a, b) => a.display_order - b.display_order,
        );
        const optionById = new Map(
          canonicalOptions.map((option) => [option.id, option]),
        );
        const persistedIds = savedOptionOrder[item.question_id];
        const persistedIsUsable =
          Array.isArray(persistedIds) &&
          persistedIds.length === canonicalOptions.length &&
          persistedIds.every((optionId) => optionById.has(optionId));

        const optionIds = persistedIsUsable
          ? persistedIds
          : examSettings.randomize_answers
            ? shuffled(canonicalOptions.map((option) => option.id))
            : canonicalOptions.map((option) => option.id);

        nextOptionOrder[item.question_id] = optionIds;
        const options = optionIds
          .map((optionId) => optionById.get(optionId))
          .filter((option): option is QuestionOption => Boolean(option));

        return {
          ...item,
          questions: {
            ...item.questions,
            question_options: options,
          },
        };
      });

      if (!savedQuestionOrderIsUsable || !attempt.option_order) {
        const { error: orderError } = await supabase
          .from("exam_attempts")
          .update({
            question_order: questionOrder,
            option_order: nextOptionOrder,
          })
          .eq("id", attempt.id);

        if (orderError) {
          setMessage(orderError.message);
          setLoading(false);
          return;
        }
      }

      const [{ data: savedAnswers, error: answersError }, { data: savedFlags }] =
        await Promise.all([
          supabase
            .from("attempt_answers")
            .select("question_id,option_id")
            .eq("attempt_id", attempt.id),
          supabase
            .from("attempt_flagged_questions")
            .select("question_id")
            .eq("attempt_id", attempt.id),
        ]);

      if (answersError) {
        setMessage(answersError.message);
        setLoading(false);
        return;
      }

      const loadedAnswers: Record<string, string[]> = {};
      for (const answer of savedAnswers ?? []) {
        loadedAnswers[answer.question_id] = [
          ...(loadedAnswers[answer.question_id] ?? []),
          answer.option_id,
        ];
      }
      setAnswersByQuestion(loadedAnswers);
      setFlaggedQuestionIds((savedFlags ?? []).map((flag) => flag.question_id));
      setQuestions(loadedQuestions);

      const requestedQuestion = Number(searchParams.get("question") ?? "1");
      const requestedIndex = Math.min(
        Math.max(requestedQuestion - 1, 0),
        Math.max(loadedQuestions.length - 1, 0),
      );

      setCurrentIndex(requestedIndex);
      const requestedItem = loadedQuestions[requestedIndex];
      setSelected(
        requestedItem ? loadedAnswers[requestedItem.question_id] ?? [] : [],
      );
      setSaveState("saved");
      setLoading(false);
    }

    startExam();
  }, [examId, supabase, searchParams]);

  useEffect(() => {
    if (secondsRemaining === null || secondsRemaining <= 0 || !attemptId) {
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

  async function persistAnswer(questionId: string, optionIds: string[]) {
    if (!attemptId) return false;

    setSaveState("saving");
    setMessage("");

    const { error: deleteError } = await supabase
      .from("attempt_answers")
      .delete()
      .eq("attempt_id", attemptId)
      .eq("question_id", questionId);

    if (deleteError) {
      setSaveState("error");
      setMessage("Your answer could not be saved. Check your connection and try again.");
      return false;
    }

    if (optionIds.length > 0) {
      const { error: insertError } = await supabase
        .from("attempt_answers")
        .insert(
          optionIds.map((optionId) => ({
            attempt_id: attemptId,
            question_id: questionId,
            option_id: optionId,
          })),
        );

      if (insertError) {
        setSaveState("error");
        setMessage("Your answer could not be saved. Check your connection and try again.");
        return false;
      }
    }

    setAnswersByQuestion((currentAnswers) => ({
      ...currentAnswers,
      [questionId]: optionIds,
    }));
    setSaveState("saved");
    return true;
  }

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
        ids.filter((id) => id !== current.question_id),
      );
      return;
    }

    const { error } = await supabase
      .from("attempt_flagged_questions")
      .insert({ attempt_id: attemptId, question_id: current.question_id });

    if (error) {
      setMessage(error.message);
      return;
    }

    setFlaggedQuestionIds((ids) => [...ids, current.question_id]);
  }

  async function toggleOption(optionId: string) {
    if (!current?.questions) return;

    const nextSelected =
      current.questions.question_type === "single_choice"
        ? [optionId]
        : selected.includes(optionId)
          ? selected.filter((id) => id !== optionId)
          : [...selected, optionId];

    setSelected(nextSelected);
    await persistAnswer(current.question_id, nextSelected);
  }

  async function finishExam() {
    if (!attemptId) return;

    const { data: result, error: gradeError } = await supabase
      .rpc("finish_exam_attempt", { target_attempt_id: attemptId })
      .single();

    if (gradeError || !result) {
      setMessage(gradeError?.message ?? "Could not grade exam.");
      return;
    }

    window.location.href = `/student/results/${attemptId}`;
  }

  async function saveAndContinue() {
    if (!current || !attemptId) return;

    if (selected.length === 0) {
      setMessage("Select at least one answer.");
      return;
    }

    const saved = await persistAnswer(current.question_id, selected);
    if (!saved) return;

    if (currentIndex < questions.length - 1) {
      const nextIndex = currentIndex + 1;
      const nextQuestion = questions[nextIndex];
      setCurrentIndex(nextIndex);
      setSelected(
        nextQuestion ? answersByQuestion[nextQuestion.question_id] ?? [] : [],
      );
      setMessage("");
      return;
    }

    window.location.href = `/exams/${examId}/review`;
  }

  function goToQuestion(nextIndex: number) {
    const nextQuestion = questions[nextIndex];
    setCurrentIndex(nextIndex);
    setSelected(
      nextQuestion ? answersByQuestion[nextQuestion.question_id] ?? [] : [],
    );
    setMessage("");
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-white px-4 py-12 text-slate-900">
        <div className="mx-auto max-w-3xl">Loading exam...</div>
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
    <main className="min-h-screen bg-white px-4 py-6 pb-32 text-slate-900 sm:py-10 sm:pb-10">
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                const confirmed = window.confirm(
                  "Exit the exam? Your saved answers will remain available when you return.",
                );
                if (confirmed) window.location.href = "/student/dashboard";
              }}
              className="min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold"
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

        <div className="mt-3 flex justify-end" aria-live="polite">
          <span
            className={`text-xs font-semibold ${
              saveState === "error"
                ? "text-red-600"
                : saveState === "saving"
                  ? "text-amber-600"
                  : "text-emerald-700"
            }`}
          >
            {saveState === "saving"
              ? "Saving answer..."
              : saveState === "error"
                ? "Not saved"
                : saveState === "saved"
                  ? "Saved ✓"
                  : ""}
          </span>
        </div>

        {question.image_url && (
          <img
            src={question.image_url}
            alt=""
            loading="lazy"
            className="mt-5 max-h-96 w-full rounded-2xl border border-slate-200 object-contain"
          />
        )}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <h1 className="text-2xl font-bold leading-snug">
            {question.question_text}
          </h1>

          <button
            type="button"
            onClick={toggleFlag}
            className={`min-h-11 shrink-0 rounded-xl border px-4 py-2 text-sm font-semibold ${
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
            const displayKey = String.fromCharCode(65 + optionIndex);

            return (
              <button
                key={option.id}
                type="button"
                onClick={() => void toggleOption(option.id)}
                className={`min-h-14 w-full rounded-2xl border p-4 text-left transition ${
                  isSelected
                    ? "border-slate-900 bg-slate-100 ring-1 ring-slate-900"
                    : "border-slate-200 active:bg-slate-50"
                }`}
              >
                <span className="font-semibold">{displayKey}.</span>{" "}
                {option.option_text}
              </button>
            );
          })}
        </div>

        {message && (
          <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">
            {message}
          </p>
        )}

        <div
          className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur sm:static sm:mt-8 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:shadow-none"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <div className="mx-auto flex max-w-3xl items-center gap-3 sm:justify-between">
            <button
              type="button"
              disabled={currentIndex === 0}
              onClick={() => goToQuestion(Math.max(0, currentIndex - 1))}
              className="min-h-12 flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
            >
              Previous
            </button>

            {currentIndex === questions.length - 1 && flaggedQuestionIds.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const firstFlaggedIndex = questions.findIndex((item) =>
                    flaggedQuestionIds.includes(item.question_id),
                  );
                  if (firstFlaggedIndex >= 0) goToQuestion(firstFlaggedIndex);
                }}
                className="hidden min-h-12 rounded-xl border border-amber-300 bg-amber-50 px-5 py-3 font-semibold text-amber-700 sm:block"
              >
                Review flagged ({flaggedQuestionIds.length})
              </button>
            )}

            <button
              type="button"
              onClick={() => void saveAndContinue()}
              disabled={saveState === "saving"}
              className="min-h-12 flex-[1.35] rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60 sm:flex-none"
            >
              {currentIndex === questions.length - 1 ? "Review exam" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
