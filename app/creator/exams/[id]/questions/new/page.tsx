"use client";

import { FormEvent, use, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Answer = {
  id: number;
  text: string;
  isCorrect: boolean;
};

type Topic = {
  id: string;
  name: string;
};

export default function NewQuestionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: examId } = use(params);
  const supabase = useMemo(() => createClient(), []);

  const [question, setQuestion] = useState("");
  const [questionType, setQuestionType] = useState<
    "single_choice" | "multiple_choice"
  >("single_choice");
  const [difficulty, setDifficulty] = useState("medium");
  const [explanation, setExplanation] = useState("");
  const [questionImage, setQuestionImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");

  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicId, setTopicId] = useState("");

  const [answers, setAnswers] = useState<Answer[]>([
    { id: 1, text: "", isCorrect: true },
    { id: 2, text: "", isCorrect: false },
  ]);

  const [nextAnswerId, setNextAnswerId] = useState(3);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadTopics() {
      const { data, error } = await supabase
        .from("exam_topics")
        .select("id, name")
        .eq("exam_id", examId)
        .order("display_order");

      if (error) {
        setMessage(error.message);
        return;
      }

      setTopics(data ?? []);

      if (data && data.length > 0) {
        setTopicId(data[0].id);
      }
    }

    loadTopics();
  }, [examId, supabase]);

  function addAnswer() {
    setAnswers((current) => [
      ...current,
      {
        id: nextAnswerId,
        text: "",
        isCorrect: false,
      },
    ]);

    setNextAnswerId((current) => current + 1);
  }

  function removeAnswer(id: number) {
    if (answers.length <= 2) {
      setMessage("A question must have at least two answers.");
      return;
    }

    const remaining = answers.filter((answer) => answer.id !== id);

    if (
      questionType === "single_choice" &&
      !remaining.some((answer) => answer.isCorrect)
    ) {
      remaining[0] = {
        ...remaining[0],
        isCorrect: true,
      };
    }

    setAnswers(remaining);
    setMessage("");
  }

  function updateAnswerText(id: number, text: string) {
    setAnswers((current) =>
      current.map((answer) =>
        answer.id === id ? { ...answer, text } : answer,
      ),
    );
  }

  function toggleCorrect(id: number) {
    if (questionType === "single_choice") {
      setAnswers((current) =>
        current.map((answer) => ({
          ...answer,
          isCorrect: answer.id === id,
        })),
      );

      return;
    }

    setAnswers((current) =>
      current.map((answer) =>
        answer.id === id
          ? { ...answer, isCorrect: !answer.isCorrect }
          : answer,
      ),
    );
  }

  function changeQuestionType(
    type: "single_choice" | "multiple_choice",
  ) {
    setQuestionType(type);

    if (type === "single_choice") {
      const firstCorrect =
        answers.find((answer) => answer.isCorrect)?.id ??
        answers[0]?.id;

      setAnswers((current) =>
        current.map((answer) => ({
          ...answer,
          isCorrect: answer.id === firstCorrect,
        })),
      );
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const filledAnswers = answers.filter(
      (answer) => answer.text.trim().length > 0,
    );

    if (filledAnswers.length < 2) {
      setMessage("Add at least two answer options.");
      setLoading(false);
      return;
    }

    const correctAnswers = filledAnswers.filter(
      (answer) => answer.isCorrect,
    );

    if (questionType === "single_choice" && correctAnswers.length !== 1) {
      setMessage("Single-choice questions must have exactly one correct answer.");
      setLoading(false);
      return;
    }

    if (questionType === "multiple_choice" && correctAnswers.length < 1) {
      setMessage("Select at least one correct answer.");
      setLoading(false);
      return;
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setMessage("You must be logged in.");
      setLoading(false);
      return;
    }

    let imageUrl: string | null = null;

    if (questionImage) {
      const extension =
        questionImage.name.split(".").pop()?.toLowerCase() || "jpg";

      const filePath =
        `${user.id}/${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("question-images")
        .upload(filePath, questionImage, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        setMessage(uploadError.message);
        setLoading(false);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from("question-images")
        .getPublicUrl(filePath);

      imageUrl = publicUrlData.publicUrl;
    }

    const { data: createdQuestion, error: questionError } =
      await supabase
        .from("questions")
        .insert({
          teacher_id: user.id,
          question_text: question,
          question_type: questionType,
          difficulty,
          explanation: explanation || null,
          image_url: imageUrl,
          status: "draft",
        })
        .select("id")
        .single();

    if (questionError || !createdQuestion) {
      setMessage(
        questionError?.message ?? "Could not create question.",
      );
      setLoading(false);
      return;
    }

    const optionLetters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    const { error: optionsError } = await supabase
      .from("question_options")
      .insert(
        filledAnswers.map((answer, index) => ({
          question_id: createdQuestion.id,
          option_key:
            optionLetters[index] ?? String(index + 1),
          option_text: answer.text,
          is_correct: answer.isCorrect,
          display_order: index + 1,
        })),
      );

    if (optionsError) {
      setMessage(optionsError.message);
      setLoading(false);
      return;
    }

    const { error: examQuestionError } = await supabase
      .from("exam_questions")
      .insert({
        exam_id: examId,
        question_id: createdQuestion.id,
        topic_id: topicId || null,
      });

    if (examQuestionError) {
      setMessage(examQuestionError.message);
      setLoading(false);
      return;
    }

    window.location.href = `/creator/exams/${examId}/edit`;
  }

  return (
    <main className="min-h-screen bg-white px-4 py-12 text-slate-900">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold">Add a question</h1>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div>
            <label className="mb-2 block text-sm font-medium">
              Topic
            </label>

            <select
              value={topicId}
              onChange={(e) => setTopicId(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
            >
              {topics.length === 0 && (
                <option value="">No topics created yet</option>
              )}

              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Question type
            </label>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => changeQuestionType("single_choice")}
                className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
                  questionType === "single_choice"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300"
                }`}
              >
                Single choice
              </button>

              <button
                type="button"
                onClick={() => changeQuestionType("multiple_choice")}
                className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
                  questionType === "multiple_choice"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300"
                }`}
              >
                Multiple choice
              </button>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Question image
              <span className="ml-1 font-normal text-slate-500">
                (optional)
              </span>
            </label>

            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setQuestionImage(file);

                if (imagePreview) {
                  URL.revokeObjectURL(imagePreview);
                }

                setImagePreview(
                  file ? URL.createObjectURL(file) : ""
                );
              }}
              className="block w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
            />

            <p className="mt-2 text-xs text-slate-500">
              JPG, PNG, WebP or GIF. Maximum 5 MB.
              The image will appear above the question.
            </p>

            {imagePreview && (
              <div className="mt-4">
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <img
                    src={imagePreview}
                    alt="Question image preview"
                    className="max-h-80 w-full object-contain"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (imagePreview) {
                      URL.revokeObjectURL(imagePreview);
                    }

                    setQuestionImage(null);
                    setImagePreview("");
                  }}
                  className="mt-3 rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600"
                >
                  Remove image
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Question
            </label>

            <textarea
              required
              rows={5}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
              placeholder="Enter your question..."
            />
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <label className="text-sm font-medium">
                Answer options
              </label>

              <button
                type="button"
                onClick={addAnswer}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
              >
                + Add answer
              </button>
            </div>

            <div className="space-y-4">
              {answers.map((answer, index) => (
                <div
                  key={answer.id}
                  className="rounded-xl border border-slate-200 p-4"
                >
                  <div className="flex items-center gap-3">
                    <input
                      type={
                        questionType === "single_choice"
                          ? "radio"
                          : "checkbox"
                      }
                      name={
                        questionType === "single_choice"
                          ? "correctAnswer"
                          : undefined
                      }
                      checked={answer.isCorrect}
                      onChange={() => toggleCorrect(answer.id)}
                    />

                    <input
                      required
                      value={answer.text}
                      onChange={(e) =>
                        updateAnswerText(
                          answer.id,
                          e.target.value,
                        )
                      }
                      className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-3"
                      placeholder={`Answer ${index + 1}`}
                    />

                    <button
                      type="button"
                      onClick={() => removeAnswer(answer.id)}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <p className="mt-3 text-sm text-slate-500">
              {questionType === "single_choice"
                ? "Select exactly one correct answer."
                : "Select every answer that should be considered correct."}
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Difficulty
            </label>

            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Explanation
            </label>

            <textarea
              rows={4}
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
              placeholder="Explain why the answer is correct..."
            />
          </div>

          <button
            disabled={loading}
            className="w-full rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Adding question..." : "Add question"}
          </button>

          {message && (
            <p className="text-sm text-slate-600">
              {message}
            </p>
          )}
        </form>
      </div>
    </main>
  );
}
