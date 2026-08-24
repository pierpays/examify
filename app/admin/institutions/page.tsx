"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type VerificationStatus = "pending" | "approved" | "rejected";
type InstitutionRequest = {
  institution_id: string;
  name: string;
  physical_address: string | null;
  contact_email: string | null;
  website_url: string | null;
  phone_number: string | null;
  verification_status: VerificationStatus;
  verification_submitted_at: string;
  verified_at: string | null;
  verification_notes: string | null;
};

export default function AdminInstitutionVerificationPage() {
  const supabase = useMemo(() => createClient(), []);
  const [status, setStatus] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [requests, setRequests] = useState<InstitutionRequest[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setMessage("");
    const { data, error } = await supabase.rpc("get_admin_institution_verifications", { p_status: status });
    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }
    setRequests((data ?? []) as InstitutionRequest[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, supabase]);

  async function review(institutionId: string, decision: "approved" | "rejected") {
    if (decision === "rejected" && !window.confirm("Reject this institution verification request?")) return;
    setUpdatingId(institutionId);
    setMessage("");
    const { error } = await supabase.rpc("admin_review_institution", {
      p_institution_id: institutionId,
      p_decision: decision,
      p_notes: notes[institutionId]?.trim() || null,
    });
    if (error) {
      setMessage(error.message);
      setUpdatingId(null);
      return;
    }
    setUpdatingId(null);
    await load();
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <Link href="/admin/dashboard" className="text-sm font-semibold text-slate-600">← Back to dashboard</Link>
        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Examify Administration</p>
            <h1 className="mt-1 text-3xl font-bold">Institution verification</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">Verify that institution applications represent legitimate organizations before allowing them to join the Examify community.</p>
          </div>
          <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm sm:w-auto">
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="all">All requests</option>
          </select>
        </div>

        {loading ? <p className="mt-8 text-sm text-slate-500">Loading institution requests...</p> : (
          <div className="mt-8 space-y-4">
            {requests.map((request) => (
              <article key={request.institution_id} className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-semibold">{request.name}</h2>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${request.verification_status === "approved" ? "bg-green-100 text-green-800" : request.verification_status === "rejected" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>{request.verification_status}</span>
                </div>
                <p className="mt-2 text-xs text-slate-500">Submitted {new Date(request.verification_submitted_at).toLocaleString()}</p>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Physical address</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{request.physical_address || "Not provided"}</p></div>
                  <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email</p>{request.contact_email ? <a href={`mailto:${request.contact_email}`} className="mt-1 inline-block break-all text-sm font-semibold underline underline-offset-4">{request.contact_email}</a> : <p className="mt-1 text-sm text-slate-500">Not provided</p>}</div>
                  <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Website</p>{request.website_url ? <a href={request.website_url} target="_blank" rel="noreferrer" className="mt-1 inline-block break-all text-sm font-semibold underline underline-offset-4">{request.website_url} ↗</a> : <p className="mt-1 text-sm text-slate-500">Not provided</p>}</div>
                  <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Phone</p>{request.phone_number ? <a href={`tel:${request.phone_number}`} className="mt-1 inline-block text-sm font-semibold underline underline-offset-4">{request.phone_number}</a> : <p className="mt-1 text-sm text-slate-500">Not provided</p>}</div>
                </div>

                {request.verification_notes && request.verification_status !== "pending" && <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-700"><strong>Admin note:</strong> {request.verification_notes}</div>}

                {request.verification_status === "pending" && (
                  <div className="mt-6">
                    <label className="block text-sm font-medium">Review note <span className="font-normal text-slate-500">(optional; useful when rejecting)</span>
                      <textarea rows={3} value={notes[request.institution_id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [request.institution_id]: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" placeholder="Verification notes..." />
                    </label>
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                      <button type="button" disabled={updatingId === request.institution_id} onClick={() => review(request.institution_id, "approved")} className="w-full rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white disabled:opacity-50 sm:w-auto">{updatingId === request.institution_id ? "Updating..." : "Approve institution"}</button>
                      <button type="button" disabled={updatingId === request.institution_id} onClick={() => review(request.institution_id, "rejected")} className="w-full rounded-xl border border-red-200 px-5 py-3 font-semibold text-red-700 disabled:opacity-50 sm:w-auto">Reject</button>
                    </div>
                  </div>
                )}
              </article>
            ))}
            {requests.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><p className="font-semibold">No institution requests in this view.</p></div>}
          </div>
        )}
        {message && <p className="mt-5 rounded-xl bg-white p-4 text-sm text-red-700 shadow-sm">{message}</p>}
      </div>
    </main>
  );
}
