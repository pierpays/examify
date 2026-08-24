"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Exam = {
  id: string;
  title: string;
  short_description: string | null;
  passing_score: number;
  time_limit_minutes: number | null;
  cover_image_url: string | null;
  category: string | null;
  exam_code: string;
  published_at: string | null;
  teacher_id: string;
  teacher_name?: string;
  teacher_headline?: string | null;
  teacher_profile_image_url?: string | null;
};

export default function BrowseExamsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [exams, setExams] = useState<Exam[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [publishedDate, setPublishedDate] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "name">("newest");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadExams() {
      const { data, error } = await supabase
        .from("exams")
        .select(`
          id,
          title,
          short_description,
          passing_score,
          time_limit_minutes,
          cover_image_url,
          category,
          exam_code,
          published_at,
          teacher_id
        `)
        .eq("status", "published")
        .eq("visibility", "public")
        .order("published_at", { ascending: false });

      if (error) {
        setMessage(error.message);
        setLoading(false);
        return;
      }

      const loadedExams = data ?? [];

      const teacherIds = [
        ...new Set(
          loadedExams.map((exam) => exam.teacher_id)
        ),
      ];

      let teacherMap = new Map<
        string,
        {
          display_name: string;
          headline: string | null;
          profile_image_url: string | null;
        }
      >();

      if (teacherIds.length > 0) {
        const { data: teachers, error: teacherError } =
          await supabase
            .from("teacher_profiles")
            .select("user_id, display_name, headline, profile_image_url")
            .in("user_id", teacherIds)
            .eq("is_public", true);

        if (teacherError) {
          setMessage(teacherError.message);
          setLoading(false);
          return;
        }

        teacherMap = new Map(
          (teachers ?? []).map((teacher) => [
            teacher.user_id,
            {
              display_name: teacher.display_name,
              headline: teacher.headline,
              profile_image_url: teacher.profile_image_url,
            },
          ])
        );
      }

      setExams(
        loadedExams.map((exam) => {
          const teacher = teacherMap.get(exam.teacher_id);

          return {
            ...exam,
            teacher_name:
              teacher?.display_name ?? "Examify Instructor",
            teacher_headline:
              teacher?.headline ?? null,
            teacher_profile_image_url:
              teacher?.profile_image_url ?? null,
          };
        })
      );

      setLoading(false);
    }

    loadExams();
  }, [supabase]);

  const categories = Array.from(
    new Set(
      exams
        .map((exam) => exam.category)
        .filter((category): category is string => Boolean(category))
    )
  ).sort((a, b) => a.localeCompare(b));

  const filteredExams = exams
    .filter((exam) => {
      const term = search.trim().toLowerCase();

      const matchesSearch =
        !term ||
        exam.title.toLowerCase().includes(term) ||
        exam.short_description?.toLowerCase().includes(term) ||
        exam.teacher_name?.toLowerCase().includes(term) ||
        exam.category?.toLowerCase().includes(term) ||
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
      if (sortBy === "name") {
        return a.title.localeCompare(b.title);
      }

      // The database already returns newest exams first.
      return 0;
    });

  if (loading) {
    return (
      <main className="min-h-screen bg-white px-4 py-8 text-slate-900 sm:py-10">
        <div className="mx-auto max-w-5xl">
          Loading exams...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/student/dashboard"
          className="text-sm font-semibold text-slate-600"
        >
          ← Back to dashboard
        </Link>

        <p className="mt-6 text-sm font-medium text-slate-500">
          Examify Student
        </p>

        <h1 className="mt-1 text-3xl font-bold">
          Browse exams
        </h1>

        <p className="mt-2 text-sm text-slate-600">
          Discover published practice exams from teachers on Examify.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto]">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by exam name, code, or teacher"
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
              setSortBy(e.target.value as "newest" | "name")
            }
            aria-label="Sort exams"
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 sm:w-auto"
          >
            <option value="newest">Newest</option>
            <option value="name">Exam name A–Z</option>
          </select>
        </div>

        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {filteredExams.map((exam) => (
            <Link
              key={exam.id}
              href={`/exams/${exam.id}`}
              className="rounded-2xl border border-slate-200 p-6 transition hover:border-slate-400 hover:shadow-sm"
            >
              {exam.cover_image_url && (
                <div className="-mx-6 -mt-6 mb-5 overflow-hidden rounded-t-2xl">
                  <img
                    src={exam.cover_image_url}
                    alt={`${exam.title} cover`}
                    className="aspect-video w-full object-cover"
                  />
                </div>
              )}

              {exam.category && (
                <span className="mb-3 inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  {exam.category}
                </span>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold">
                  {exam.title}
                </h2>

                <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">
                  {exam.exam_code}
                </span>
              </div>

              {exam.short_description && (
                <p className="mt-2 text-sm text-slate-600">
                  {exam.short_description}
                </p>
              )}

              <div className="mt-4 flex items-center gap-3 border-t border-slate-100 pt-4">
                {exam.teacher_profile_image_url ? (
                  <img
                    src={exam.teacher_profile_image_url}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded-full border border-slate-200 object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-500">
                    {(exam.teacher_name ?? "E")
                      .trim()
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                )}

                <div className="min-w-0">
                  <p className="text-xs text-slate-500">
                    Created by
                  </p>

                  <p className="mt-1 text-sm font-semibold">
                    {exam.teacher_name}
                  </p>

                  {exam.teacher_headline && (
                    <p className="mt-1 text-xs text-slate-500">
                      {exam.teacher_headline}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500">
                <span>
                  Passing score: {exam.passing_score}%
                </span>

                {exam.published_at && (
                  <span>
                    Published {new Date(exam.published_at).toLocaleDateString()}
                  </span>
                )}

                <span>
                  {exam.time_limit_minutes
                    ? `${exam.time_limit_minutes} min`
                    : "No time limit"}
                </span>
              </div>

              <p className="mt-5 text-sm font-semibold">
                View exam →
              </p>
            </Link>
          ))}

          {filteredExams.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center sm:col-span-2">
              <p className="font-semibold">
                No published exams yet.
              </p>

              <p className="mt-2 text-sm text-slate-500">
                Published exams will appear here.
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
