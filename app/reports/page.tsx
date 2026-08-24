"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Report = {
  report_id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  reported_user_name: string;
  affected_student_name: string | null;
  created_at: string;
};

function label(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export default function MyReportsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.rpc(
        "get_my_submitted_behavior_reports"
      );

      if (error) {
        setMessage(error.message);
      } else {
        setReports((data ?? []) as Report[]);
      }

      setLoading(false);
    }

    load();
  }, [supabase]);

  return (
    <main className="min-h-screen px-4 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#2563EB]">
              Examify Safety
            </p>
            <h1 className="mt-1 text-3xl font-bold">
              My reports
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Review behavior and safety reports you submitted.
            </p>
          </div>

          <Link
            href="/reports/new"
            className="rounded-xl bg-gradient-to-r from-[#2563EB] to-[#7C3AED] px-5 py-3 text-center font-bold text-white"
          >
            + Report behavior
          </Link>
        </div>

        {message && (
          <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {message}
          </p>
        )}

        <div className="mt-8 space-y-4">
          {loading ? (
            <p className="text-sm text-slate-500">
              Loading reports...
            </p>
          ) : (
            reports.map((report) => (
              <article
                key={report.report_id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="font-bold">{report.title}</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      {new Date(
                        report.created_at
                      ).toLocaleString()}
                    </p>
                  </div>

                  <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-bold capitalize text-slate-600">
                    {report.status}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-[#2563EB]">
                    {label(report.category)}
                  </span>

                  {report.reported_user_name !==
                    "Not specified" && (
                    <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
                      Account: {report.reported_user_name}
                    </span>
                  )}

                  {report.affected_student_name && (
                    <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
                      Student: {report.affected_student_name}
                    </span>
                  )}
                </div>

                <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {report.description}
                </p>
              </article>
            ))
          )}

          {!loading && reports.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <p className="font-semibold">
                You haven&apos;t submitted any reports.
              </p>
              <p className="mt-2 text-sm text-slate-500">
                The reporting form is available to every Examify
                account.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
