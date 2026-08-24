"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ReceivedReport = {
  report_id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  reporter_name: string;
  reported_user_name: string;
  affected_student_name: string | null;
  recipient_reason: string;
  read_at: string | null;
  created_at: string;
};

function label(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function reasonLabel(value: string) {
  if (value === "admin") return "Admin review";
  if (value === "reported_teacher_institution") {
    return "Teacher affiliated with your institution";
  }
  if (value === "affected_student_parent") {
    return "Linked child safety report";
  }
  if (value === "affected_student_institution") {
    return "Student affiliated with your institution";
  }
  return "Safety report";
}

export default function SafetyReportsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [reports, setReports] = useState<ReceivedReport[]>([]);
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function load() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    setRole(profile?.role ?? "");

    const { data, error } = await supabase.rpc(
      "get_my_received_behavior_reports"
    );

    if (error) {
      setMessage(error.message);
    } else {
      setReports((data ?? []) as ReceivedReport[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  async function markRead(reportId: string) {
    await supabase.rpc("mark_behavior_report_read", {
      p_report_id: reportId,
    });
    await load();
  }

  async function updateStatus(
    reportId: string,
    status: string
  ) {
    const { error } = await supabase.rpc(
      "admin_update_behavior_report_status",
      {
        p_report_id: reportId,
        p_status: status,
      }
    );

    if (error) {
      setMessage(error.message);
      return;
    }

    await load();
  }

  return (
    <main className="min-h-screen px-4 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <p className="text-sm font-semibold text-[#2563EB]">
          Examify Safety
        </p>

        <h1 className="mt-1 text-3xl font-bold">
          Safety reports
        </h1>

        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Reports routed to your account because of your role as an
          administrator, parent/guardian, or institution.
        </p>

        {message && (
          <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {message}
          </p>
        )}

        <div className="mt-8 space-y-4">
          {loading ? (
            <p className="text-sm text-slate-500">
              Loading safety reports...
            </p>
          ) : (
            reports.map((report) => (
              <article
                key={`${report.report_id}-${report.recipient_reason}`}
                className={`rounded-2xl border bg-white p-5 shadow-sm ${
                  report.read_at
                    ? "border-slate-200"
                    : "border-blue-300 ring-2 ring-blue-50"
                }`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-bold">
                        {report.title}
                      </h2>

                      {!report.read_at && (
                        <span className="rounded-full bg-[#2563EB] px-2 py-0.5 text-[10px] font-bold text-white">
                          New
                        </span>
                      )}
                    </div>

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

                  <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                    {reasonLabel(report.recipient_reason)}
                  </span>
                </div>

                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-slate-500">
                      Reporter
                    </dt>
                    <dd className="mt-1 font-semibold">
                      {report.reporter_name}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xs text-slate-500">
                      Reported account
                    </dt>
                    <dd className="mt-1 font-semibold">
                      {report.reported_user_name}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xs text-slate-500">
                      Affected student
                    </dt>
                    <dd className="mt-1 font-semibold">
                      {report.affected_student_name ||
                        "Not specified"}
                    </dd>
                  </div>
                </dl>

                <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {report.description}
                </p>

                <div className="mt-5 flex flex-wrap gap-2">
                  {!report.read_at && (
                    <button
                      type="button"
                      onClick={() =>
                        markRead(report.report_id)
                      }
                      className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold"
                    >
                      Mark as read
                    </button>
                  )}

                  {role === "admin" && (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          updateStatus(
                            report.report_id,
                            "reviewing"
                          )
                        }
                        className="rounded-xl border border-blue-200 px-4 py-2 text-sm font-semibold text-[#2563EB]"
                      >
                        Reviewing
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          updateStatus(
                            report.report_id,
                            "resolved"
                          )
                        }
                        className="rounded-xl border border-green-200 px-4 py-2 text-sm font-semibold text-green-700"
                      >
                        Resolve
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          updateStatus(
                            report.report_id,
                            "dismissed"
                          )
                        }
                        className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600"
                      >
                        Dismiss
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))
          )}

          {!loading && reports.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <p className="font-semibold">
                No safety reports have been routed to this account.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
