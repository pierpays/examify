"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import ExamifyLogo from "@/components/branding/examify-logo";

export default function LoginPage() {
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [disabledNotice, setDisabledNotice] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const {
      data: { user },
      error,
    } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !user) {
      setMessage(error?.message ?? "Unable to log in.");
      setLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role,is_disabled,disabled_reason")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      await supabase.auth.signOut();
      setMessage("Unable to load your Examtify profile.");
      setLoading(false);
      return;
    }

    if (profile.is_disabled) {
      await supabase.auth.signOut();
      setDisabledNotice(profile.disabled_reason || "Your account is temporarily disabled while an administrative review is in progress.");
      setLoading(false);
      return;
    }

    if (profile.role === "institution") {
      const { data: institution } = await supabase
        .from("institution_profiles")
        .select("verification_status")
        .eq("user_id", user.id)
        .maybeSingle();

      if (institution?.verification_status !== "approved") {
        window.location.href = "/institution/verification";
        return;
      }
    }

    window.location.href = "/feed";
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-violet-50 px-4 py-12 text-slate-900">
      {disabledNotice && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 px-4" role="dialog" aria-modal="true" aria-labelledby="disabled-title">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-4 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-800">Account disabled</div>
            <h2 id="disabled-title" className="text-2xl font-bold text-slate-900">This account is temporarily unavailable</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">{disabledNotice}</p>
            <p className="mt-3 text-sm leading-6 text-slate-600">If you believe this is an error or need information about the review, please contact Examtify support.</p>
            <button onClick={() => setDisabledNotice(null)} className="mt-6 w-full rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white">Close</button>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-blue-100/60 sm:p-8">
        <div className="mb-8"><ExamifyLogo /></div>
        <h1 className="text-3xl font-bold">Log in to Examtify</h1>

        <p className="mt-2 text-sm text-slate-600">Access your exams, progress, and creator tools.</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label className="mb-2 block text-sm font-medium">Email</label>
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100" placeholder="you@example.com" />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-4">
              <label className="block text-sm font-medium">Password</label>
              <Link href="/forgot-password" className="text-sm font-semibold text-slate-600 underline-offset-4 hover:text-slate-900 hover:underline">Forgot password?</Link>
            </div>
            <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100" placeholder="Your password" />
          </div>

          <button disabled={loading} className="w-full rounded-xl bg-gradient-to-r from-[#2563EB] to-[#7C3AED] px-4 py-3 font-semibold text-white shadow-sm disabled:opacity-50">{loading ? "Logging in..." : "Log in"}</button>

          <div className="pt-1 text-center">
            <p className="mb-3 text-sm text-slate-500">New to Examtify?</p>
            <Link href="/signup" className="block w-full rounded-xl border border-[#2563EB] px-4 py-3 font-semibold text-[#1E3A8A] transition hover:bg-blue-50">Create an account</Link>
          </div>

          {message && <p className="text-sm text-slate-600">{message}</p>}
        </form>

        <p className="mt-6 text-center text-xs leading-5 text-slate-500">Review Examtify&apos;s{" "}<Link href="/safety" className="font-semibold text-[#2563EB]">Safety, Community Rules & Legal Notice</Link>.</p>
      </div>
    </main>
  );
}
