"use client";

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type QuestionOption = {
  id: string;
  option_text: string;
  display_order: number;
};

type PreviewQuestion = {
  question_id: string;
  questions: {
    question_text: string;
    question_type: "single_choice" | "multiple_choice";
    image_url: string | null;
    question_options: QuestionOption[];
  } | null;
};

export default function ExamPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: examId } = use(params);
  const supabase = useMemo(() => createClient(), []);

  const [questions, setQuestions] = useState<PreviewQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadPreview() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      const { data: exam, error: examError } = await supabase
        .from("exams")
        .select("teacher_id, randomize_questions, randomize_answers")
        .eq("id", examId)
        .single();

      if (examError || !exam) {
        setMessage(examError?.message ?? "Exam not found.");
        setLoading(false);
        return;
      }

      if (exam.teacher_id !== user.id) {
        setMessage("You do not have permission to preview this exam.");
        setLoading(false);
        return;
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

      let loaded = (data ?? []).map((item) => ({ ...item, questions: one(item.questions) })) as PreviewQuestion[];

      if (exam.randomize_questions) {
        loaded = [...loaded].sort(() => Math.random() - 0.5);
      }

      loaded = loaded.map((item) => {
        if (!item.questions) return item;

        let options = [...item.questions.question_options];

        options = exam.randomize_answers
          ? options.sort(() => Math.random() - 0.5)
          : options.sort((a, b) => a.display_order - b.display_order);

        return {
          ...item,
          questions: {
            ...item.questions,
            question_options: options,
          },
        };
      });

      setQuestions(loaded);
      setLoading(false);
    }

    loadPreview();
  }, [examId, supabase]);

  const current = questions[currentIndex];

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

  function nextQuestion() {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((index) => index + 1);
      setSelected([]);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-white px-4 py-10 text-slate-900">
        <div className="mx-auto max-w-3xl">Loading preview...</div>
      </main>
    );
  }

  if (!current?.questions) {
    return (
      <main className="min-h-screen bg-white px-4 py-10 text-slate-900">
        <div className="mx-auto max-w-3xl">
          <Link
            href={`/creator/exams/${examId}/edit`}
            className="text-sm font-semibold text-slate-600"
          >
            ← Back to exam editor
          </Link>

          <p className="mt-6">
            {message || "No questions are available for this exam."}
          </p>
        </div>
      </main>
    );
  }

  const question = current.questions;

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Link
            href={`/creator/exams/${examId}/edit`}
            className="text-sm font-semibold text-slate-600"
          >
            ← Exit preview
          </Link>

          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">
            Student preview
          </span>
        </div>

        <p className="text-sm font-medium text-slate-500">
          Question {currentIndex + 1} of {questions.length}
        </p>

        {question.image_url && (
          <img
            src={question.image_url}
            alt=""
            className="mt-5 max-h-96 w-full rounded-2xl border border-slate-200 object-contain"
          />
        )}

        <h1 className="mt-6 text-2xl font-bold">
          {question.question_text}
        </h1>

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
                onClick={() => toggleOption(option.id)}
                className={`w-full rounded-2xl border p-4 text-left ${
                  isSelected
                    ? "border-slate-900 bg-slate-100"
                    : "border-slate-200"
                }`}
              >
                <span className="font-semibold">{displayKey}.</span>{" "}
                {option.option_text}
              </button>
            );
          })}
        </div>

        {currentIndex < questions.length - 1 ? (
          <button
            type="button"
            onClick={nextQuestion}
            className="mt-8 w-full rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white"
          >
            Next question
          </button>
        ) : (
          <div className="mt-8 rounded-xl border border-slate-200 p-4 text-sm text-slate-600">
            Preview complete. No attempt or analytics data was recorded.
          </div>
        )}
      </div>
    </main>
  );
}
