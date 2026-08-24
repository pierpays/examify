"use client";

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

import { FormEvent, use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Topic = {
  id: string;
  name: string;
  description: string | null;
  display_order: number;
};

type ExamQuestion = {
  id: string;
  question_id: string;
  topic_id: string | null;
  display_order: number;
  questions: {
    question_text: string;
    question_type: string;
    difficulty: string;
    image_url: string | null;
  } | null;
  exam_topics: {
    name: string;
  } | null;
};

export default function EditExamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: examId } = use(params);
  const supabase = useMemo(() => createClient(), []);

  const [editingExam, setEditingExam] = useState(false);
  const [examStatus, setExamStatus] = useState("draft");
  const [examTitle, setExamTitle] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [passingScore, setPassingScore] = useState("70");
  const [timeLimit, setTimeLimit] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [coverImageFile, setCoverImageFile] = useState<File | null>(null);
  const [coverImagePreview, setCoverImagePreview] = useState("");
  const [removeCoverImage, setRemoveCoverImage] = useState(false);

  const [allowAnswerReview, setAllowAnswerReview] = useState(true);
  const [randomizeQuestions, setRandomizeQuestions] = useState(false);
  const [randomizeAnswers, setRandomizeAnswers] = useState(false);
  const [emailResultsToStudent, setEmailResultsToStudent] = useState(false);
  const [emailResultsToTeacher, setEmailResultsToTeacher] = useState(false);
  const [allowPdfExport, setAllowPdfExport] = useState(false);
  const [allowRetake, setAllowRetake] = useState(true);

  const [topics, setTopics] = useState<Topic[]>([]);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [topicName, setTopicName] = useState("");
  const [topicDescription, setTopicDescription] = useState("");
  const [message, setMessage] = useState("");

  async function loadExam() {
    const { data, error } = await supabase
      .from("exams")
      .select(
        "title, short_description, description, category, passing_score, time_limit_minutes, cover_image_url, status, allow_answer_review, randomize_questions, randomize_answers, email_results_to_student, email_results_to_teacher, allow_pdf_export, allow_retake"
      )
      .eq("id", examId)
      .single();

    if (error) {
      setMessage(error.message);
      return;
    }

    setExamStatus(data.status ?? "draft");
    setExamTitle(data.title ?? "");
    setShortDescription(data.short_description ?? "");
    setDescription(data.description ?? "");
    setCategory(data.category ?? "");
    setPassingScore(String(data.passing_score ?? 70));
    setTimeLimit(
      data.time_limit_minutes
        ? String(data.time_limit_minutes)
        : ""
    );

    setCoverImageUrl(data.cover_image_url ?? "");

    setAllowAnswerReview(data.allow_answer_review ?? true);
    setRandomizeQuestions(data.randomize_questions ?? false);
    setRandomizeAnswers(data.randomize_answers ?? false);
    setEmailResultsToStudent(data.email_results_to_student ?? false);
    setEmailResultsToTeacher(data.email_results_to_teacher ?? false);
    setAllowPdfExport(data.allow_pdf_export ?? false);
    setAllowRetake(data.allow_retake ?? true);
  }

  async function togglePublish() {
    setMessage("");

    const nextStatus =
      examStatus === "published" ? "draft" : "published";

    const { error } = await supabase
      .from("exams")
      .update({
        status: nextStatus,
        published_at:
          nextStatus === "published"
            ? new Date().toISOString()
            : null,
      })
      .eq("id", examId);

    if (error) {
      setMessage(error.message);
      return;
    }

    setExamStatus(nextStatus);

    if (nextStatus === "published") {
      window.location.href = "/creator/dashboard";
      return;
    }

    setMessage("Exam returned to draft.");
  }

  async function saveExam(exitAfterSave = false) {
    setMessage("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setMessage("You must be logged in.");
      return;
    }

    let finalCoverImageUrl: string | null =
      removeCoverImage ? null : coverImageUrl || null;

    if (coverImageFile) {
      const extension =
        coverImageFile.name.split(".").pop()?.toLowerCase() || "jpg";

      const filePath =
        `${user.id}/${examId}-${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("exam-cover-images")
        .upload(filePath, coverImageFile, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        setMessage(uploadError.message);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from("exam-cover-images")
        .getPublicUrl(filePath);

      finalCoverImageUrl = publicUrlData.publicUrl;
    }

    const { error } = await supabase
      .from("exams")
      .update({
        title: examTitle.trim(),
        short_description: shortDescription.trim() || null,
        description: description.trim() || null,
        category: category.trim() || null,
        passing_score: Number(passingScore),
        time_limit_minutes: timeLimit
          ? Number(timeLimit)
          : null,
        cover_image_url: finalCoverImageUrl,
        allow_answer_review: allowAnswerReview,
        randomize_questions: randomizeQuestions,
        randomize_answers: randomizeAnswers,
        email_results_to_student: emailResultsToStudent,
        email_results_to_teacher: emailResultsToTeacher,
        allow_pdf_export: allowPdfExport,
        allow_retake: allowRetake,
      })
      .eq("id", examId);

    if (error) {
      setMessage(error.message);
      return;
    }

    if (exitAfterSave) {
      window.location.href = "/creator/dashboard";
      return;
    }

    setMessage("Exam details saved.");
    setEditingExam(false);
  }

  async function saveExamDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveExam(false);
  }

  async function loadTopics() {
    const { data, error } = await supabase
      .from("exam_topics")
      .select("id, name, description, display_order")
      .eq("exam_id", examId)
      .order("display_order");

    if (error) {
      setMessage(error.message);
      return;
    }

    setTopics(data ?? []);
  }

  async function loadQuestions() {
    const { data, error } = await supabase
      .from("exam_questions")
      .select(`
        id,
        question_id,
        topic_id,
        display_order,
        questions (
          question_text,
          question_type,
          difficulty,
          image_url
        ),
        exam_topics (
          name
        )
      `)
      .eq("exam_id", examId)
      .order("display_order");

    if (error) {
      setMessage(error.message);
      return;
    }

    setQuestions((data ?? []).map((item) => ({ ...item, questions: one(item.questions), exam_topics: one(item.exam_topics) })) as ExamQuestion[]);
  }

  useEffect(() => {
    loadExam();
    loadTopics();
    loadQuestions();
  }, [examId]);

  async function addTopic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const { error } = await supabase
      .from("exam_topics")
      .insert({
        exam_id: examId,
        name: topicName.trim(),
        description: topicDescription.trim() || null,
        display_order: topics.length + 1,
      });

    if (error) {
      setMessage(error.message);
      return;
    }

    setTopicName("");
    setTopicDescription("");
    await loadTopics();
  }

  async function deleteQuestion(examQuestionId: string) {
    const confirmed = window.confirm(
      "Remove this question from the exam?"
    );

    if (!confirmed) return;

    setMessage("");

    const { error } = await supabase
      .from("exam_questions")
      .delete()
      .eq("id", examQuestionId);

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadQuestions();
  }

  async function deleteTopic(topicId: string) {
    const { error } = await supabase
      .from("exam_topics")
      .delete()
      .eq("id", topicId);

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadTopics();
    await loadQuestions();
  }

  return (
    <main className="min-h-screen bg-white px-4 py-12 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <p className="text-sm font-medium text-slate-500">
          Examify Creator
        </p>

        <div className="mt-2">
          <h1 className="text-3xl font-bold">
            Build your exam
          </h1>

          <p className="mt-1 text-sm capitalize text-slate-500">
            Status: {examStatus}
          </p>
        </div>

        <section className="mt-8 rounded-2xl border border-slate-200 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">
                Exam details
              </h2>

              {!editingExam && (
                <div className="mt-4 space-y-2">
                  <h3 className="text-lg font-semibold">
                    {examTitle}
                  </h3>

                  {shortDescription && (
                    <p className="text-slate-600">
                      {shortDescription}
                    </p>
                  )}

                  {description && (
                    <p className="whitespace-pre-wrap text-sm text-slate-600">
                      {description}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-3 pt-2 text-sm text-slate-500">
                    <span>
                      Passing score: {passingScore}%
                    </span>

                    <span>
                      Time limit: {timeLimit ? `${timeLimit} min` : "None"}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {!editingExam && (
              <button
                type="button"
                onClick={() => setEditingExam(true)}
                className="shrink-0 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold"
              >
                Edit details
              </button>
            )}
          </div>

          {editingExam && (
            <form
              onSubmit={saveExamDetails}
              className="mt-5 space-y-4"
            >
              <div>
                <label className="mb-2 block text-sm font-medium">
                  Exam cover image
                </label>

                {!removeCoverImage &&
                  (coverImagePreview || coverImageUrl) && (
                    <div className="mb-4 overflow-hidden rounded-2xl border border-slate-200">
                      <img
                        src={coverImagePreview || coverImageUrl}
                        alt="Exam cover preview"
                        className="aspect-video w-full object-cover"
                      />
                    </div>
                  )}

                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;

                    if (coverImagePreview) {
                      URL.revokeObjectURL(coverImagePreview);
                    }

                    setCoverImageFile(file);
                    setRemoveCoverImage(false);
                    setCoverImagePreview(
                      file ? URL.createObjectURL(file) : ""
                    );
                  }}
                  className="block w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
                />

                {(coverImageUrl || coverImagePreview) &&
                  !removeCoverImage && (
                    <button
                      type="button"
                      onClick={() => {
                        if (coverImagePreview) {
                          URL.revokeObjectURL(coverImagePreview);
                        }

                        setCoverImageFile(null);
                        setCoverImagePreview("");
                        setRemoveCoverImage(true);
                      }}
                      className="mt-3 rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600"
                    >
                      Remove cover image
                    </button>
                  )}
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Exam name
                </label>

                <input
                  required
                  value={examTitle}
                  onChange={(e) => setExamTitle(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Category
                </label>

                <input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3"
                  placeholder="Example: AWS, Cisco, Security, Networking"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Short description
                </label>

                <input
                  value={shortDescription}
                  onChange={(e) => setShortDescription(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Full description
                </label>

                <textarea
                  rows={5}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Passing score %
                  </label>

                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={passingScore}
                    onChange={(e) => setPassingScore(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-4 py-3"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Time limit (minutes)
                  </label>

                  <input
                    type="number"
                    min="1"
                    value={timeLimit}
                    onChange={(e) => setTimeLimit(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-4 py-3"
                    placeholder="Optional"
                  />
                </div>
              </div>

              <div>
                <h3 className="text-base font-semibold">
                  Exam settings
                </h3>

                <div className="mt-4 space-y-3">
                  {[
                    {
                      label: "Allow students to review answers",
                      checked: allowAnswerReview,
                      change: setAllowAnswerReview,
                    },
                    {
                      label: "Randomize questions",
                      checked: randomizeQuestions,
                      change: setRandomizeQuestions,
                    },
                    {
                      label: "Randomize answers",
                      checked: randomizeAnswers,
                      change: setRandomizeAnswers,
                    },
                    {
                      label: "Send results via email to student",
                      checked: emailResultsToStudent,
                      change: setEmailResultsToStudent,
                    },
                    {
                      label: "Receive results via email",
                      checked: emailResultsToTeacher,
                      change: setEmailResultsToTeacher,
                    },
                    {
                      label: "Allow export via PDF",
                      checked: allowPdfExport,
                      change: setAllowPdfExport,
                    },
                    {
                      label: "Allow students to retake exam",
                      checked: allowRetake,
                      change: setAllowRetake,
                    },
                  ].map((setting) => (
                    <label
                      key={setting.label}
                      className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-4"
                    >
                      <input
                        type="checkbox"
                        checked={setting.checked}
                        onChange={(e) =>
                          setting.change(e.target.checked)
                        }
                        className="h-5 w-5"
                      />

                      <span className="text-sm font-medium">
                        {setting.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white">
                  Save changes
                </button>

                <button
                  type="button"
                  onClick={() => setEditingExam(false)}
                  className="rounded-xl border border-slate-300 px-5 py-3 font-semibold"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </section>

        <section className="mt-8 rounded-2xl border border-slate-200 p-6">
          <h2 className="text-xl font-semibold">
            Topics
          </h2>

          <p className="mt-2 text-sm text-slate-600">
            Create the topics that will organize the questions in this exam.
          </p>

          <form onSubmit={addTopic} className="mt-5 space-y-4">
            <input
              required
              value={topicName}
              onChange={(e) => setTopicName(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
              placeholder="Topic name"
            />

            <textarea
              value={topicDescription}
              onChange={(e) => setTopicDescription(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
              placeholder="Optional description"
            />

            <button className="rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white">
              Add topic
            </button>
          </form>

          <div className="mt-6 space-y-3">
            {topics.map((topic) => (
              <div
                key={topic.id}
                className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 p-4"
              >
                <div>
                  <div className="font-semibold">{topic.name}</div>

                  {topic.description && (
                    <div className="mt-1 text-sm text-slate-600">
                      {topic.description}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => deleteTopic(topic.id)}
                  className="text-sm font-medium text-red-600"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">
                Questions
              </h2>

              <p className="mt-2 text-slate-600">
                {questions.length} question{questions.length === 1 ? "" : "s"} in this exam.
              </p>
            </div>

            <Link
              href={`/creator/exams/${examId}/questions/new`}
              className="rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white"
            >
              Add question
            </Link>
          </div>

          <div className="mt-6 space-y-4">
            {questions.map((item, index) => (
              <article
                key={item.id}
                className="rounded-2xl border border-slate-200 p-5"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-sm text-slate-500">
                      Question {index + 1}
                      {item.exam_topics?.name
                        ? ` · ${item.exam_topics.name}`
                        : ""}
                    </div>

                    {item.questions?.image_url && (
                      <img
                        src={item.questions.image_url}
                        alt=""
                        className="mt-3 max-h-40 rounded-xl border border-slate-200 object-contain"
                      />
                    )}

                    <h3 className="mt-3 font-semibold">
                      {item.questions?.question_text ?? "Question unavailable"}
                    </h3>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span className="rounded-full bg-slate-100 px-2 py-1">
                        {item.questions?.question_type === "multiple_choice"
                          ? "Multiple choice"
                          : "Single choice"}
                      </span>

                      <span className="rounded-full bg-slate-100 px-2 py-1 capitalize">
                        {item.questions?.difficulty ?? "Unknown"}
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <Link
                      href={`/creator/exams/${examId}/questions/${item.question_id}/edit`}
                      className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold"
                    >
                      Edit
                    </Link>

                    <button
                      type="button"
                      onClick={() => deleteQuestion(item.id)}
                      className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            ))}

            {questions.length === 0 && (
              <p className="text-sm text-slate-500">
                No questions yet.
              </p>
            )}
          </div>
        </section>

        {message && (
          <p className="mt-5 text-sm text-slate-600">
            {message}
          </p>
        )}

        <div className="mt-10 border-t border-slate-200 pt-6">
          <div className="mb-4">
            <a
              href={`/creator/exams/${examId}/preview`}
              className="inline-block rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold"
            >
              Preview as student
            </a>
          </div>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => {
                const confirmed = window.confirm(
                  "Are you sure you want to cancel? All changes will be lost."
                );

                if (confirmed) {
                  window.location.href = "/creator/dashboard";
                }
              }}
              className="rounded-xl border border-slate-300 px-5 py-3 font-semibold"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={() => saveExam(true)}
              className="rounded-xl border border-slate-900 px-5 py-3 font-semibold"
            >
              Save and exit
            </button>

            <button
              type="button"
              onClick={togglePublish}
              className={`rounded-xl px-5 py-3 font-semibold ${
                examStatus === "published"
                  ? "border border-slate-300"
                  : "bg-slate-900 text-white"
              }`}
            >
              {examStatus === "published"
                ? "Unpublish exam"
                : "Publish exam"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
