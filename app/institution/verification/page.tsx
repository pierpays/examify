"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type VerificationStatus = "pending" | "approved" | "rejected";

type InstitutionVerification = {
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

export default function InstitutionVerificationPage() {
  const supabase = useMemo(() => createClient(), []);
  const [record, setRecord] = useState<InstitutionVerification | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      window.location.href = "/login";
      return;
    }

    const { data, error } = await supabase
      .from("institution_profiles")
      .select("name, physical_address, contact_email, website_url, phone_number, verification_status, verification_submitted_at, verified_at, verification_notes")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error || !data) {
      setMessage(error?.message ?? "Institution verification record not found.");
      setLoading(false);
      return;
    }

    const verification = data as InstitutionVerification;
    setRecord(verification);
    setName(verification.name ?? "");
    setAddress(verification.physical_address ?? "");
    setEmail(verification.contact_email ?? user.email ?? "");
    setWebsite(verification.website_url ?? "");
    setPhone(verification.phone_number ?? "");
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  async function saveAndResubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    let normalizedWebsite = website.trim();
    if (normalizedWebsite && !/^https?:\/\//i.test(normalizedWebsite)) {
      normalizedWebsite = `https://${normalizedWebsite}`;
    }

    try {
      new URL(normalizedWebsite);
    } catch {
      setMessage("Please enter a valid institution website.");
      setSaving(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      window.location.href = "/login";
      return;
    }

    const { error } = await supabase
      .from("institution_profiles")
      .update({
        name: name.trim(),
        physical_address: address.trim(),
        contact_email: email.trim(),
        website_url: normalizedWebsite,
        phone_number: phone.trim(),
      })
      .eq("user_id", user.id);

    if (error) {
      setMessage(error.message);
      setSaving(false);
      return;
    }

    if (record?.verification_status === "rejected") {
      const { error: resubmitError } = await supabase.rpc("resubmit_institution_verification");
      if (resubmitError) {
        setMessage(resubmitError.message);
        setSaving(false);
        return;
      }
    }

    await load();
    setMessage("Verification information saved and submitted for admin review.");
    setSaving(false);
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (loading) {
    return <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900"><div className="mx-auto max-w-2xl">Loading verification status...</div></main>;
  }

  if (!record) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-3xl font-bold">Institution verification</h1>
          <p className="mt-4 text-red-700">{message}</p>
          <button onClick={logout} className="mt-6 rounded-xl border border-slate-300 px-4 py-3 font-semibold">Log out</button>
        </div>
      </main>
    );
  }

  const statusStyles = record.verification_status === "approved"
    ? "bg-green-100 text-green-800"
    : record.verification_status === "rejected"
      ? "bg-red-100 text-red-800"
      : "bg-amber-100 text-amber-800";

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-2xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Examify Institution</p>
            <h1 className="mt-1 text-3xl font-bold">Institution verification</h1>
          </div>
          <button type="button" onClick={logout} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold sm:w-auto">Log out</button>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${statusStyles}`}>{record.verification_status}</span>
            <span className="text-xs text-slate-500">Submitted {new Date(record.verification_submitted_at).toLocaleString()}</span>
          </div>

          {record.verification_status === "pending" && (
            <div className="mt-4 text-sm text-slate-700">
              <p className="font-semibold">Your application is waiting for admin review.</p>
              <p className="mt-1">Until approval, this institution cannot access the Feed, send member requests, publish posts, or appear in the public institution directory.</p>
            </div>
          )}

          {record.verification_status === "rejected" && (
            <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">
              <p className="font-semibold">Verification was not approved.</p>
              <p className="mt-1">Review the information below, correct anything necessary, and save it to resubmit the institution for review.</p>
              {record.verification_notes && <p className="mt-3"><strong>Admin note:</strong> {record.verification_notes}</p>}
            </div>
          )}

          {record.verification_status === "approved" && (
            <div className="mt-4 text-sm text-green-800">
              <p className="font-semibold">This institution is verified.</p>
              <p className="mt-1">You now have full institution access on Examify.</p>
              <Link href="/feed" className="mt-4 inline-block rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white">Continue to Feed</Link>
            </div>
          )}
        </div>

        {record.verification_status !== "approved" && (
          <form onSubmit={saveAndResubmit} className="mt-6 space-y-5 rounded-2xl border border-slate-200 bg-white p-5">
            <div>
              <h2 className="text-lg font-semibold">Verification details</h2>
              <p className="mt-1 text-sm text-slate-500">Examify admins use these details to confirm the institution is legitimate.</p>
            </div>
            <label className="block text-sm font-medium">Institution name<input required value={name} onChange={(event) => setName(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" /></label>
            <label className="block text-sm font-medium">Physical address<textarea required rows={3} value={address} onChange={(event) => setAddress(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" /></label>
            <label className="block text-sm font-medium">Institution email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" /></label>
            <label className="block text-sm font-medium">Website<input required value={website} onChange={(event) => setWebsite(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" /></label>
            <label className="block text-sm font-medium">Phone number<input required type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" /></label>
            <button disabled={saving} className="w-full rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white disabled:opacity-50 sm:w-auto">{saving ? "Saving..." : record.verification_status === "rejected" ? "Save and resubmit" : "Update application"}</button>
          </form>
        )}

        {message && <p className={`mt-5 rounded-xl p-4 text-sm ${message.includes("saved") ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{message}</p>}
      </div>
    </main>
  );
}
