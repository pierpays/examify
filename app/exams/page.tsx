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

const PAGE_SIZE = 20;

export default function BrowseExamsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [exams, setExams] = useState<Exam[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [publishedDate, setPublishedDate] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "name">("newest");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    async function loadCategories() {
      const { data } = await supabase
        .from("exams")
        .select("category")
        .eq("status", "published")
        .eq("visibility", "public")
        .not("category", "is", null)
        .limit(500);

      const unique = Array.from(
        new Set((data ?? []).map((row) => row.category).filter((value): value is string => Boolean(value)))
      ).sort((a, b) => a.localeCompare(b));
      setCategories(unique);
    }

    loadCategories();
  }, [supabase]);

  async function fetchPage(targetPage: number, append: boolean) {
    append ? setLoadingMore(true) : setLoading(true);
    setMessage("");

    const from = targetPage * PAGE_SIZE;
    const to = from + PAGE_SIZE;

    let query = supabase
      .from("exams")
      .select(`
        id,title,short_description,passing_score,time_limit_minutes,
        cover_image_url,category,exam_code,published_at,teacher_id
      `)
      .eq("status", "published")
      .eq("visibility", "public");

    if (selectedCategory !== "all") query = query.eq("category", selectedCategory);
    if (publishedDate) {
      query = query
        .gte("published_at", `${publishedDate}T00:00:00.000Z`)
        .lt("published_at", `${publishedDate}T23:59:59.999Z`);
    }
    if (debouncedSearch) {
      const safe = debouncedSearch.replace(/[%_,]/g, " ").trim();
      if (safe) {
        query = query.or(`title.ilike.%${safe}%,exam_code.ilike.%${safe}%,category.ilike.%${safe}%,short_description.ilike.%${safe}%`);
      }
    }

    query = sortBy === "name"
      ? query.order("title", { ascending: true })
      : query.order("published_at", { ascending: false });

    const { data, error } = await query.range(from, to);

    if (error) {
      setMessage(error.message);
      setLoading(false);
      setLoadingMore(false);
      return;
    }

    const rows = data ?? [];
    const pageRows = rows.slice(0, PAGE_SIZE);
    setHasMore(rows.length > PAGE_SIZE);

    const teacherIds = [...new Set(pageRows.map((exam) => exam.teacher_id))];
    const teacherMap = new Map<string, { display_name: string; headline: string | null; profile_image_url: string | null }>();

    if (teacherIds.length > 0) {
      const { data: teachers } = await supabase
        .from("teacher_profiles")
        .select("user_id,display_name,headline,profile_image_url")
        .in("user_id", teacherIds)
        .eq("is_public", true);

      for (const teacher of teachers ?? []) {
        teacherMap.set(teacher.user_id, {
          display_name: teacher.display_name,
          headline: teacher.headline,
          profile_image_url: teacher.profile_image_url,
        });
      }
    }

    const enriched = pageRows.map((exam) => {
      const teacher = teacherMap.get(exam.teacher_id);
      return {
        ...exam,
        teacher_name: teacher?.display_name ?? "Examtify Instructor",
        teacher_headline: teacher?.headline ?? null,
        teacher_profile_image_url: teacher?.profile_image_url ?? null,
      } as Exam;
    });

    setExams((current) => append ? [...current, ...enriched] : enriched);
    setPage(targetPage);
    setLoading(false);
    setLoadingMore(false);
  }

  useEffect(() => {
    fetchPage(0, false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, selectedCategory, publishedDate, sortBy, supabase]);

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <Link href="/student/dashboard" className="text-sm font-semibold text-slate-600">← Back to dashboard</Link>
        <p className="mt-6 text-sm font-medium text-slate-500">Examtify Student</p>
        <h1 className="mt-1 text-3xl font-bold">Browse exams</h1>
        <p className="mt-2 text-sm text-slate-600">Discover published practice exams from teachers on Examtify.</p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto]">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by exam name, code, or category"
            className="w-full rounded-xl border border-slate-300 px-4 py-3"
          />
          <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} aria-label="Filter by category" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 sm:w-auto">
            <option value="all">All categories</option>
            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
          <input type="date" value={publishedDate} onChange={(e) => setPublishedDate(e.target.value)} aria-label="Filter by published date" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 sm:w-auto" />
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as "newest" | "name")} aria-label="Sort exams" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 sm:w-auto">
            <option value="newest">Newest</option>
            <option value="name">Exam name A–Z</option>
          </select>
        </div>

        {loading ? (
          <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Loading exams...</div>
        ) : (
          <>
            <div className="mt-8 grid gap-5 sm:grid-cols-2">
              {exams.map((exam) => (
                <Link key={exam.id} href={`/exams/${exam.id}`} className="rounded-2xl border border-slate-200 p-6 transition hover:border-slate-400 hover:shadow-sm">
                  {exam.cover_image_url && (
                    <div className="-mx-6 -mt-6 mb-5 overflow-hidden rounded-t-2xl">
                      <img src={exam.cover_image_url} alt={`${exam.title} cover`} loading="lazy" decoding="async" className="aspect-video w-full object-cover" />
                    </div>
                  )}
                  {exam.category && <span className="mb-3 inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{exam.category}</span>}
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold">{exam.title}</h2>
                    <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">{exam.exam_code}</span>
                  </div>
                  {exam.short_description && <p className="mt-2 text-sm text-slate-600">{exam.short_description}</p>}
                  <div className="mt-4 flex items-center gap-3 border-t border-slate-100 pt-4">
                    {exam.teacher_profile_image_url ? (
                      <img src={exam.teacher_profile_image_url} alt="" loading="lazy" decoding="async" className="h-10 w-10 shrink-0 rounded-full border border-slate-200 object-cover" />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-500">{(exam.teacher_name ?? "E").trim().charAt(0).toUpperCase()}</div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs text-slate-500">Created by</p>
                      <p className="mt-1 text-sm font-semibold">{exam.teacher_name}</p>
                      {exam.teacher_headline && <p className="mt-1 text-xs text-slate-500">{exam.teacher_headline}</p>}
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500">
                    <span>Passing score: {exam.passing_score}%</span>
                    {exam.published_at && <span>Published {new Date(exam.published_at).toLocaleDateString()}</span>}
                    <span>{exam.time_limit_minutes ? `${exam.time_limit_minutes} min` : "No time limit"}</span>
                  </div>
                  <p className="mt-5 text-sm font-semibold">View exam →</p>
                </Link>
              ))}

              {exams.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center sm:col-span-2">
                  <p className="font-semibold">No exams match those filters.</p>
                  <p className="mt-2 text-sm text-slate-500">Try a different search term or category.</p>
                </div>
              )}
            </div>

            {hasMore && (
              <div className="mt-8 flex justify-center">
                <button type="button" disabled={loadingMore} onClick={() => fetchPage(page + 1, true)} className="min-h-11 rounded-xl bg-slate-900 px-6 py-3 font-semibold text-white disabled:opacity-50">
                  {loadingMore ? "Loading more..." : "Load more exams"}
                </button>
              </div>
            )}
          </>
        )}

        {message && <p className="mt-5 text-sm text-red-600">{message}</p>}
      </div>
    </main>
  );
}
