"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Report = {
  report_id: string;
  post_id: string;
  reporter_id: string;
  reporter_name: string;
  reason: string;
  details: string | null;
  report_status: "open" | "resolved" | "dismissed";
  reported_at: string;
  author_id: string;
  author_name: string;
  author_role: string;
  post_type: string;
  post_body: string | null;
  post_created_at: string;
  image_url: string | null;
  link_url: string | null;
  document_name: string | null;
};

export default function AdminReportsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [reports, setReports] = useState<Report[]>([]);
  const [filter, setFilter] = useState<"open" | "all" | "resolved" | "dismissed">("open");
  const [message, setMessage] = useState("");
  const [workingId, setWorkingId] = useState<string | null>(null);

  async function loadReports() {
    const { data, error } = await supabase.rpc("get_admin_reports");
    if (error) {
      setMessage(error.message);
      return;
    }
    setReports((data ?? []) as Report[]);
  }

  useEffect(() => {
    loadReports();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  async function setStatus(reportId: string, status: "resolved" | "dismissed" | "open") {
    setWorkingId(reportId);
    setMessage("");
    const { error } = await supabase.rpc("admin_set_report_status", {
      p_report_id: reportId,
      p_status: status,
    });
    if (error) setMessage(error.message);
    else await loadReports();
    setWorkingId(null);
  }

  async function removePost(report: Report) {
    if (!window.confirm(`Remove this post by ${report.author_name}? This cannot be undone.`)) return;
    setWorkingId(report.report_id);
    setMessage("");
    const { error } = await supabase.rpc("admin_remove_reported_post", {
      p_report_id: report.report_id,
    });
    if (error) setMessage(error.message);
    else await loadReports();
    setWorkingId(null);
  }

  const visible = reports.filter((report) => filter === "all" || report.report_status === filter);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <p className="text-sm font-medium text-slate-500">Examify Administration</p>
        <h1 className="mt-1 text-3xl font-bold">Moderation reports</h1>
        <p className="mt-2 text-sm text-slate-600">Review community reports and take moderation action.</p>

        <div className="mt-6">
          <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 sm:w-auto">
            <option value="open">Open reports</option>
            <option value="all">All reports</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
          </select>
        </div>

        <div className="mt-6 space-y-4">
          {visible.map((report) => (
            <article key={report.report_id} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold capitalize text-amber-700">{report.reason}</span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold capitalize text-slate-600">{report.report_status}</span>
                  </div>
                  <h2 className="mt-3 font-semibold">Post by {report.author_name}</h2>
                  <p className="mt-1 text-xs capitalize text-slate-500">{report.author_role} · {new Date(report.post_created_at).toLocaleString()}</p>
                </div>
                <p className="text-xs text-slate-500">Reported {new Date(report.reported_at).toLocaleString()}</p>
              </div>

              {report.post_body && <p className="mt-4 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm text-slate-700">{report.post_body}</p>}
              <div className="mt-4 text-sm text-slate-600">
                <p><strong>Reported by:</strong> {report.reporter_name}</p>
                {report.details && <p className="mt-2"><strong>Details:</strong> {report.details}</p>}
                {report.link_url && <p className="mt-2 break-all"><strong>Link:</strong> {report.link_url}</p>}
                {report.document_name && <p className="mt-2"><strong>Document:</strong> {report.document_name}</p>}
              </div>

              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {report.report_status !== "resolved" && (
                  <button disabled={workingId === report.report_id} onClick={() => setStatus(report.report_id, "resolved")} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">Mark resolved</button>
                )}
                {report.report_status !== "dismissed" && (
                  <button disabled={workingId === report.report_id} onClick={() => setStatus(report.report_id, "dismissed")} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">Dismiss report</button>
                )}
                {report.report_status !== "open" && (
                  <button disabled={workingId === report.report_id} onClick={() => setStatus(report.report_id, "open")} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">Reopen</button>
                )}
                <button disabled={workingId === report.report_id} onClick={() => removePost(report)} className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 disabled:opacity-50">Remove post</button>
              </div>
            </article>
          ))}

          {visible.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><p className="font-semibold">No reports in this view.</p></div>}
        </div>
        {message && <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{message}</p>}
      </div>
    </main>
  );
}
