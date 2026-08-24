"use client";

import { FormEvent, use, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Topic = {
  id: string;
  name: string;
};

type Answer = {
  id: string;
  option_key: string;
  option_text: string;
  is_correct: boolean;
};

export default function EditQuestionPage({
  params,
}: {
  params: Promise<{ id: string; questionId: string }>;
}) {
  const { id: examId, questionId } = use(params);
  const supabase = useMemo(() => createClient(), []);

  const [question, setQuestion] = useState("");
  const [questionType, setQuestionType] = useState("single_choice");
  const [difficulty, setDifficulty] = useState("medium");
  const [explanation, setExplanation] = useState("");
  const [topicId, setTopicId] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [replacementImage, setReplacementImage] = useState<File | null>(null);
  const [replacementPreview, setReplacementPreview] = useState("");
  const [removeImage, setRemoveImage] = useState(false);

  const [topics, setTopics] = useState<Topic[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);

  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: topicData } = await supabase
        .from("exam_topics")
        .select("id, name")
        .eq("exam_id", examId)
        .order("display_order");

      setTopics(topicData ?? []);

      const { data: questionData, error: questionError } =
        await supabase
          .from("questions")
          .select(
            "question_text, question_type, difficulty, explanation, image_url",
          )
          .eq("id", questionId)
          .single();

      if (questionError || !questionData) {
        setMessage(
          questionError?.message ?? "Unable to load question.",
        );
        return;
      }

      setQuestion(questionData.question_text);
      setQuestionType(questionData.question_type);
      setDifficulty(questionData.difficulty);
      setExplanation(questionData.explanation ?? "");
      setImageUrl(questionData.image_url ?? "");

      const { data: optionData } = await supabase
        .from("question_options")
        .select(
          "id, option_key, option_text, is_correct",
        )
        .eq("question_id", questionId)
        .order("display_order");

      setAnswers(optionData ?? []);

      const { data: mapping } = await supabase
        .from("exam_questions")
        .select("topic_id")
        .eq("exam_id", examId)
        .eq("question_id", questionId)
        .single();

      setTopicId(mapping?.topic_id ?? "");
    }

    load();
  }, [examId, questionId, supabase]);

  function updateAnswer(id: string, text: string) {
    setAnswers((current) =>
      current.map((answer) =>
        answer.id === id
          ? { ...answer, option_text: text }
          : answer,
      ),
    );
  }

  function toggleCorrect(id: string) {
    if (questionType === "single_choice") {
      setAnswers((current) =>
        current.map((answer) => ({
          ...answer,
          is_correct: answer.id === id,
        })),
      );

      return;
    }

    setAnswers((current) =>
      current.map((answer) =>
        answer.id === id
          ? { ...answer, is_correct: !answer.is_correct }
          : answer,
      ),
    );
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    const correctCount = answers.filter(
      (answer) => answer.is_correct,
    ).length;

    if (
      questionType === "single_choice" &&
      correctCount !== 1
    ) {
      setMessage(
        "Single-choice questions must have exactly one correct answer.",
      );
      setSaving(false);
      return;
    }

    if (
      questionType === "multiple_choice" &&
      correctCount < 1
    ) {
      setMessage("Select at least one correct answer.");
      setSaving(false);
      return;
    }

    let finalImageUrl: string | null =
      removeImage ? null : imageUrl || null;

    if (replacementImage) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setMessage("You must be logged in.");
        setSaving(false);
        return;
      }

      const extension =
        replacementImage.name.split(".").pop()?.toLowerCase() || "jpg";

      const filePath =
        `${user.id}/${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("question-images")
        .upload(filePath, replacementImage, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        setMessage(uploadError.message);
        setSaving(false);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from("question-images")
        .getPublicUrl(filePath);

      finalImageUrl = publicUrlData.publicUrl;
    }

    const { error: questionError } = await supabase
      .from("questions")
      .update({
        question_text: question,
        question_type: questionType,
        difficulty,
        explanation: explanation || null,
        image_url: finalImageUrl,
      })
      .eq("id", questionId);

    if (questionError) {
      setMessage(questionError.message);
      setSaving(false);
      return;
    }

    for (const answer of answers) {
      const { error } = await supabase
        .from("question_options")
        .update({
          option_text: answer.option_text,
          is_correct: answer.is_correct,
        })
        .eq("id", answer.id);

      if (error) {
        setMessage(error.message);
        setSaving(false);
        return;
      }
    }

    const { error: topicError } = await supabase
      .from("exam_questions")
      .update({
        topic_id: topicId || null,
      })
      .eq("exam_id", examId)
      .eq("question_id", questionId);

    if (topicError) {
      setMessage(topicError.message);
      setSaving(false);
      return;
    }

    window.location.href =
      `/creator/exams/${examId}/edit`;
  }

  return (
    <main className="min-h-screen bg-white px-4 py-12 text-slate-900">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold">
          Edit question
        </h1>

        <form onSubmit={save} className="mt-8 space-y-6">
          <div>
            <label className="mb-2 block text-sm font-medium">
              Topic
            </label>

            <select
              value={topicId}
              onChange={(e) => setTopicId(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
            >
              <option value="">No topic</option>

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

            <select
              value={questionType}
              onChange={(e) =>
                setQuestionType(e.target.value)
              }
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
            >
              <option value="single_choice">
                Single choice
              </option>
              <option value="multiple_choice">
                Multiple choice
              </option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Question image
            </label>

            {!removeImage && (replacementPreview || imageUrl) && (
              <div className="mb-3 overflow-hidden rounded-xl border border-slate-200">
                <img
                  src={replacementPreview || imageUrl}
                  alt="Question"
                  className="max-h-80 w-full object-contain"
                />
              </div>
            )}

            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setReplacementImage(file);
                setRemoveImage(false);

                if (replacementPreview) {
                  URL.revokeObjectURL(replacementPreview);
                }

                setReplacementPreview(
                  file ? URL.createObjectURL(file) : ""
                );
              }}
              className="block w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
            />

            {(imageUrl || replacementPreview) && !removeImage && (
              <button
                type="button"
                onClick={() => {
                  if (replacementPreview) {
                    URL.revokeObjectURL(replacementPreview);
                  }

                  setReplacementImage(null);
                  setReplacementPreview("");
                  setRemoveImage(true);
                }}
                className="mt-3 rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600"
              >
                Remove image
              </button>
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
            />
          </div>

          <div className="space-y-4">
            {answers.map((answer) => (
              <div
                key={answer.id}
                className="flex items-center gap-3 rounded-xl border border-slate-200 p-4"
              >
                <input
                  type={
                    questionType === "single_choice"
                      ? "radio"
                      : "checkbox"
                  }
                  name={
                    questionType === "single_choice"
                      ? "correct"
                      : undefined
                  }
                  checked={answer.is_correct}
                  onChange={() => toggleCorrect(answer.id)}
                />

                <input
                  required
                  value={answer.option_text}
                  onChange={(e) =>
                    updateAnswer(answer.id, e.target.value)
                  }
                  className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-3"
                />
              </div>
            ))}
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
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              disabled={saving}
              className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save changes"}
            </button>

            <button
              type="button"
              disabled={saving}
              onClick={() => {
                window.location.href =
                  `/creator/exams/${examId}/edit`;
              }}
              className="rounded-xl border border-slate-300 px-5 py-3 font-semibold disabled:opacity-50"
            >
              Cancel
            </button>
          </div>

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
