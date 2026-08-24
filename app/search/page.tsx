"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type ResultType =
  | "people"
  | "teachers"
  | "institutions"
  | "exams"
  | "groups"
  | "events"
  | "posts";

type SearchResult = {
  result_type: ResultType;
  result_id: string;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  href: string;
  meta: string | null;
  occurred_at: string | null;
};

type Filter = "all" | ResultType;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "people", label: "People" },
  { value: "teachers", label: "Teachers" },
  { value: "institutions", label: "Institutions" },
  { value: "exams", label: "Exams" },
  { value: "groups", label: "Groups" },
  { value: "events", label: "Events" },
  { value: "posts", label: "Posts" },
];

const LABELS: Record<ResultType, string> = {
  people: "People",
  teachers: "Teachers",
  institutions: "Institutions",
  exams: "Exams",
  groups: "Groups & Classes",
  events: "Events",
  posts: "Posts",
};

function ResultAvatar({
  result,
}: {
  result: SearchResult;
}) {
  if (result.image_url) {
    return (
      <img
        src={result.image_url}
        alt=""
        className={`shrink-0 object-cover ${
          result.result_type === "exams" ||
          result.result_type === "groups"
            ? "h-16 w-20 rounded-xl"
            : "h-14 w-14 rounded-full"
        }`}
      />
    );
  }

  return (
    <div
      className={`flex shrink-0 items-center justify-center bg-blue-50 font-extrabold text-[#0F5FEA] ${
        result.result_type === "exams" ||
        result.result_type === "groups"
          ? "h-16 w-20 rounded-xl"
          : "h-14 w-14 rounded-full"
      }`}
    >
      {result.result_type === "posts"
        ? "P"
        : result.result_type === "events"
          ? "E"
          : result.title.trim().charAt(0).toUpperCase() || "E"}
    </div>
  );
}

export default function SearchPage() {
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(
    () => searchParams.get("q") ?? ""
  );
  const [examDate, setExamDate] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const incoming = searchParams.get("q") ?? "";
    setQuery(incoming);
  }, [searchParams]);

  useEffect(() => {
    const term = query.trim();
    const ready = term.length >= 2 || Boolean(examDate);

    if (!ready) {
      setResults([]);
      setMessage("");
      setLoading(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      setLoading(true);
      setMessage("");

      const { data, error } = await supabase.rpc(
        "search_examify_global",
        {
          p_query: term,
          p_exam_date: examDate || null,
          p_limit_per_type: 10,
        }
      );

      if (error) {
        setMessage(error.message);
        setResults([]);
      } else {
        setResults((data ?? []) as SearchResult[]);
      }

      setLoading(false);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [query, examDate, supabase]);

  const readyToSearch =
    query.trim().length >= 2 || Boolean(examDate);

  const filteredResults =
    filter === "all"
      ? results
      : results.filter(
          (result) => result.result_type === filter
        );

  const grouped = FILTERS.filter(
    (item) => item.value !== "all"
  )
    .map((item) => ({
      type: item.value as ResultType,
      label: LABELS[item.value as ResultType],
      items: results.filter(
        (result) => result.result_type === item.value
      ),
    }))
    .filter((group) => group.items.length > 0);

  const counts = Object.fromEntries(
    FILTERS.filter((item) => item.value !== "all").map(
      (item) => [
        item.value,
        results.filter(
          (result) => result.result_type === item.value
        ).length,
      ]
    )
  ) as Record<ResultType, number>;

  function ResultCard({
    result,
  }: {
    result: SearchResult;
  }) {
    return (
      <Link
        href={result.href}
        className="flex min-w-0 items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-blue-300 hover:shadow-sm"
      >
        <ResultAvatar result={result} />

        <div className="min-w-0 flex-1">
          <p className="truncate font-extrabold text-slate-900">
            {result.title}
          </p>

          {result.subtitle && (
            <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-600">
              {result.subtitle}
            </p>
          )}

          {result.meta && (
            <p className="mt-2 text-xs font-semibold text-slate-400">
              {result.meta}
            </p>
          )}
        </div>

        <span className="shrink-0 text-[#0F5FEA]">→</span>
      </Link>
    );
  }

  return (
    <main className="min-h-screen bg-[#F5F7FB] px-3 py-5 text-slate-900 sm:px-5 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <p className="text-sm font-bold text-[#0F5FEA]">
            Examify Search
          </p>
          <h1 className="mt-1 text-3xl font-extrabold">
            Search all of Examify
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Find people, teachers, institutions, exams, groups,
            events, and posts from one place.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
            <div className="relative">
              <svg
                viewBox="0 0 24 24"
                className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="6" />
                <path d="m16 16 4 4" />
              </svg>

              <input
                autoFocus
                type="search"
                value={query}
                onChange={(event) =>
                  setQuery(event.target.value)
                }
                placeholder="Search Examify..."
                className="w-full rounded-2xl border border-slate-300 bg-white py-3 pl-12 pr-4 text-base outline-none transition focus:border-blue-400"
              />
            </div>

            <input
              type="date"
              value={examDate}
              onChange={(event) =>
                setExamDate(event.target.value)
              }
              aria-label="Filter public exams by published date"
              title="Filter public exams by published date"
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base sm:w-auto"
            />
          </div>

          <p className="mt-2 text-xs text-slate-400">
            The date filter applies to exam results only.
          </p>
        </section>

        {results.length > 0 && (
          <nav className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-2">
            {FILTERS.map((item) => {
              const count =
                item.value === "all"
                  ? results.length
                  : counts[item.value];

              if (item.value !== "all" && count === 0) {
                return null;
              }

              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setFilter(item.value)}
                  className={`shrink-0 rounded-full px-4 py-2.5 text-sm font-bold transition ${
                    filter === item.value
                      ? "bg-[#0F5FEA] text-white"
                      : "border border-slate-200 bg-white text-slate-600"
                  }`}
                >
                  {item.label} ({count})
                </button>
              );
            })}
          </nav>
        )}

        {!readyToSearch && (
          <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="font-extrabold">
              Find your academic community
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Type at least two characters to search across Examify.
            </p>
          </div>
        )}

        {loading && (
          <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
            Searching all of Examify...
          </div>
        )}

        {!loading &&
          readyToSearch &&
          results.length === 0 &&
          !message && (
            <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <p className="font-extrabold">No results found</p>
              <p className="mt-2 text-sm text-slate-500">
                Try another name, topic, exam code, institution,
                group, event, or keyword.
              </p>
            </div>
          )}

        {!loading &&
          filter === "all" &&
          grouped.map((group) => (
            <section key={group.type} className="mt-7">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-extrabold">
                  {group.label}
                </h2>
                <button
                  type="button"
                  onClick={() => setFilter(group.type)}
                  className="text-sm font-bold text-[#0F5FEA]"
                >
                  See all ({group.items.length})
                </button>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {group.items.slice(0, 4).map((result) => (
                  <ResultCard
                    key={`${result.result_type}-${result.result_id}`}
                    result={result}
                  />
                ))}
              </div>
            </section>
          ))}

        {!loading &&
          filter !== "all" &&
          filteredResults.length > 0 && (
            <section className="mt-7">
              <h2 className="text-xl font-extrabold">
                {LABELS[filter]}
              </h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {filteredResults.map((result) => (
                  <ResultCard
                    key={`${result.result_type}-${result.result_id}`}
                    result={result}
                  />
                ))}
              </div>
            </section>
          )}

        {message && (
          <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-600">
            {message}
          </p>
        )}
      </div>
    </main>
  );
}
