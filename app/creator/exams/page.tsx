"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Exam = {
  id: string;
  title: string;
  status: string;
  created_at: string;
  cover_image_url: string | null;
  category: string | null;
  exam_code: string;
  published_at: string | null;
  question_count: number;
};

export default function ManageExamsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [exams, setExams] = useState<Exam[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [publishedDate, setPublishedDate] = useState("");
  const [sortBy, setSortBy] = useState<
    "newest" | "oldest" | "name" | "published" | "draft"
  >("newest");
  const [message, setMessage] = useState("");
  const [updatingExamId, setUpdatingExamId] = useState<string | null>(null);
  const [sharingExamId, setSharingExamId] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState("");
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    async function loadExams() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      const { data, error } = await supabase
        .from("exams")
        .select("id, title, status, created_at, cover_image_url, category, exam_code, published_at")
        .eq("teacher_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        setMessage(error.message);
        return;
      }

      const loadedExams = data ?? [];
      const examIds = loadedExams.map((exam) => exam.id);

      let questionCountMap = new Map<string, number>();

      if (examIds.length > 0) {
        const { data: examQuestions, error: questionsError } =
          await supabase
            .from("exam_questions")
            .select("exam_id")
            .in("exam_id", examIds);

        if (questionsError) {
          setMessage(questionsError.message);
          return;
        }

        questionCountMap = new Map<string, number>();

        for (const item of examQuestions ?? []) {
          questionCountMap.set(
            item.exam_id,
            (questionCountMap.get(item.exam_id) ?? 0) + 1
          );
        }
      }

      setExams(
        loadedExams.map((exam) => ({
          ...exam,
          question_count:
            questionCountMap.get(exam.id) ?? 0,
        }))
      );
    }

    loadExams();
  }, [supabase]);

  async function deleteExam(exam: Exam) {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${exam.title}"? This will permanently remove the exam, its topics, and its exam-question assignments.`
    );

    if (!confirmed) return;

    setUpdatingExamId(exam.id);
    setMessage("");

    const { error } = await supabase
      .from("exams")
      .delete()
      .eq("id", exam.id);

    if (error) {
      setMessage(error.message);
      setUpdatingExamId(null);
      return;
    }

    setExams((current) =>
      current.filter((item) => item.id !== exam.id)
    );

    setUpdatingExamId(null);
  }

  async function togglePublish(exam: Exam) {
    setUpdatingExamId(exam.id);
    setMessage("");

    const nextStatus =
      exam.status === "published" ? "draft" : "published";

    const { error } = await supabase
      .from("exams")
      .update({
        status: nextStatus,
        published_at:
          nextStatus === "published"
            ? new Date().toISOString()
            : null,
      })
      .eq("id", exam.id);

    if (error) {
      setMessage(error.message);
      setUpdatingExamId(null);
      return;
    }

    setExams((current) =>
      current.map((item) =>
        item.id === exam.id
          ? { ...item, status: nextStatus }
          : item
      )
    );

    setUpdatingExamId(null);
  }

  async function shareExamToFeed(exam: Exam) {
    const body = shareMessage.trim();

    setSharing(true);
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

    const { error } = await supabase.from("feed_posts").insert({
      author_id: user.id,
      post_type: "exam",
      feed_exam_id: exam.id,
      body: body || null,
    });

    if (error) {
      setMessage(error.message);
      setSharing(false);
      return;
    }

    setShareMessage("");
    setSharingExamId(null);
    setSharing(false);
    setMessage(`“${exam.title}” was shared to the feed.`);
  }

  const categories = Array.from(
    new Set(
      exams
        .map((exam) => exam.category)
        .filter((category): category is string => Boolean(category))
    )
  ).sort((a, b) => a.localeCompare(b));

  const publishedCount = exams.filter(
    (exam) => exam.status === "published"
  ).length;

  const draftCount = exams.filter(
    (exam) => exam.status === "draft"
  ).length;

  const totalQuestionCount = exams.reduce(
    (sum, exam) => sum + exam.question_count,
    0
  );

  const filteredExams = exams
    .filter((exam) => {
      const term = search.trim().toLowerCase();
      const matchesSearch =
        !term ||
        exam.title.toLowerCase().includes(term) ||
        exam.exam_code.toLowerCase().includes(term);

      const matchesCategory =
        selectedCategory === "all" ||
        exam.category === selectedCategory;

      const matchesDate =
        !publishedDate ||
        (exam.published_at &&
          exam.published_at.slice(0, 10) === publishedDate);

      return matchesSearch && matchesCategory && matchesDate;
    })
    .sort((a, b) => {
      if (sortBy === "oldest") {
        return (
          new Date(a.created_at).getTime() -
          new Date(b.created_at).getTime()
        );
      }

      if (sortBy === "name") {
        return a.title.localeCompare(b.title);
      }

      if (sortBy === "published") {
        if (a.status === b.status) return 0;
        return a.status === "published" ? -1 : 1;
      }

      if (sortBy === "draft") {
        if (a.status === b.status) return 0;
        return a.status === "draft" ? -1 : 1;
      }

      return (
        new Date(b.created_at).getTime() -
        new Date(a.created_at).getTime()
      );
    });

  return (
    <main className="min-h-screen bg-white px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/creator/dashboard"
          className="mb-6 inline-block text-sm font-semibold text-slate-600"
        >
          ← Back to dashboard
        </Link>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">
              Examify Creator
            </p>

            <h1 className="mt-1 text-3xl font-bold">
              Manage exams
            </h1>

            <p className="mt-2 text-sm text-slate-600">
              Create, edit, publish, and manage your practice exams.
            </p>
          </div>

          <Link
            href="/creator/exams/new"
            className="rounded-xl bg-slate-900 px-5 py-3 text-center font-semibold text-white"
          >
            + Create exam
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500">
              Total exams
            </p>

            <p className="mt-1 text-2xl font-bold">
              {exams.length}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500">
              Published
            </p>

            <p className="mt-1 text-2xl font-bold">
              {publishedCount}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500">
              Drafts
            </p>

            <p className="mt-1 text-2xl font-bold">
              {draftCount}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500">
              Total questions
            </p>

            <p className="mt-1 text-2xl font-bold">
              {totalQuestionCount}
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto]">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by exam name or code"
            className="w-full rounded-xl border border-slate-300 px-4 py-3"
          />

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            aria-label="Filter by category"
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 sm:w-auto"
          >
            <option value="all">All categories</option>

            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={publishedDate}
            onChange={(e) => setPublishedDate(e.target.value)}
            aria-label="Filter by published date"
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 sm:w-auto"
          />

          <select
            value={sortBy}
            onChange={(e) =>
              setSortBy(
                e.target.value as
                  | "newest"
                  | "oldest"
                  | "name"
                  | "published"
                  | "draft"
              )
            }
            aria-label="Sort exams"
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 sm:w-auto"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="name">Exam name A–Z</option>
            <option value="published">Published first</option>
            <option value="draft">Draft first</option>
          </select>
        </div>

        <div className="mt-8 space-y-4">
          {filteredExams.map((exam) => (
            <article
              key={exam.id}
              className="rounded-2xl border border-slate-200 p-5"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-4">
                  {exam.cover_image_url ? (
                    <img
                      src={exam.cover_image_url}
                      alt=""
                      className="h-16 w-24 shrink-0 rounded-xl border border-slate-200 object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xs font-semibold text-slate-500">
                      No cover
                    </div>
                  )}

                  <div className="min-w-0">
                    {exam.category && (
                      <p className="mb-1 text-xs font-semibold text-slate-500">
                        {exam.category}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-lg font-semibold">
                        {exam.title}
                      </h2>

                      <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">
                        {exam.exam_code}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-block rounded-full px-3 py-1 text-xs font-semibold capitalize ${
                          exam.status === "published"
                            ? "bg-green-100 text-green-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {exam.status}
                      </span>

                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                        {exam.question_count}{" "}
                        {exam.question_count === 1
                          ? "question"
                          : "questions"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                  {exam.status === "published" && (
                    <>
                      <Link
                        href={`/exams/${exam.id}`}
                        className="rounded-xl border border-slate-300 px-4 py-2 text-center text-sm font-semibold"
                      >
                        View public page
                      </Link>

                      <button
                        type="button"
                        onClick={() => {
                          setSharingExamId(
                            sharingExamId === exam.id ? null : exam.id
                          );
                          setShareMessage("");
                          setMessage("");
                        }}
                        className="rounded-xl border border-slate-300 px-4 py-2 text-center text-sm font-semibold"
                      >
                        {sharingExamId === exam.id
                          ? "Cancel share"
                          : "Share to feed"}
                      </button>
                    </>
                  )}

                  <Link
                    href={`/creator/exams/${exam.id}/preview`}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-center text-sm font-semibold"
                  >
                    Preview as student
                  </Link>

                  <button
                    type="button"
                    disabled={updatingExamId === exam.id}
                    onClick={() => togglePublish(exam)}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-center text-sm font-semibold disabled:opacity-50"
                  >
                    {updatingExamId === exam.id
                      ? "Updating..."
                      : exam.status === "published"
                        ? "Unpublish"
                        : "Publish"}
                  </button>

                  <Link
                    href={`/creator/exams/${exam.id}/edit`}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-center text-sm font-semibold text-white"
                  >
                    Edit exam
                  </Link>

                  <button
                    type="button"
                    disabled={updatingExamId === exam.id}
                    onClick={() => deleteExam(exam)}
                    className="rounded-xl border border-red-200 px-4 py-2 text-center text-sm font-semibold text-red-600 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {sharingExamId === exam.id && exam.status === "published" && (
                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="font-semibold">Share “{exam.title}”</p>
                  <p className="mt-1 text-sm text-slate-600">
                    Add an optional message. The feed post will include the exam cover, title, category, and a link to the public exam page.
                  </p>

                  <textarea
                    value={shareMessage}
                    onChange={(event) => setShareMessage(event.target.value)}
                    maxLength={2000}
                    rows={3}
                    placeholder="Example: I just published a new practice exam. Give it a try!"
                    className="mt-4 w-full resize-y rounded-xl border border-slate-300 bg-white px-4 py-3"
                  />

                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-slate-500">
                      {shareMessage.length}/2000
                    </p>

                    <button
                      type="button"
                      disabled={sharing}
                      onClick={() => shareExamToFeed(exam)}
                      className="w-full rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto"
                    >
                      {sharing ? "Sharing..." : "Share exam"}
                    </button>
                  </div>
                </div>
              )}
            </article>
          ))}

          {filteredExams.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center">
              <p className="font-semibold">
                You haven't created any exams yet.
              </p>

              <p className="mt-2 text-sm text-slate-500">
                Create your first exam to start adding topics and questions.
              </p>
            </div>
          )}
        </div>

        {message && (
          <p className="mt-5 text-sm text-red-600">
            {message}
          </p>
        )}
      </div>
    </main>
  );
}
