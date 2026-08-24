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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const {
      data: { user },
      error,
    } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !user) {
      setMessage(error?.message ?? "Unable to log in.");
      setLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      setMessage("Unable to load your Examify profile.");
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
      <div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-blue-100/60 sm:p-8">
        <div className="mb-8"><ExamifyLogo /></div>
        <h1 className="text-3xl font-bold">Log in to Examify</h1>

        <p className="mt-2 text-sm text-slate-600">
          Access your exams, progress, and creator tools.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label className="mb-2 block text-sm font-medium">
              Email
            </label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-4">
              <label className="block text-sm font-medium">
                Password
              </label>

              <Link
                href="/forgot-password"
                className="text-sm font-semibold text-slate-600 underline-offset-4 hover:text-slate-900 hover:underline"
              >
                Forgot password?
              </Link>
            </div>

            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100"
              placeholder="Your password"
            />
          </div>

          <button
            disabled={loading}
            className="w-full rounded-xl bg-gradient-to-r from-[#2563EB] to-[#7C3AED] px-4 py-3 font-semibold text-white shadow-sm disabled:opacity-50"
          >
            {loading ? "Logging in..." : "Log in"}
          </button>

          <div className="pt-1 text-center">
            <p className="mb-3 text-sm text-slate-500">
              New to Examify?
            </p>

            <Link
              href="/signup"
              className="block w-full rounded-xl border border-[#2563EB] px-4 py-3 font-semibold text-[#1E3A8A] transition hover:bg-blue-50"
            >
              Create an account
            </Link>
          </div>

          {message && (
            <p className="text-sm text-slate-600">
              {message}
            </p>
          )}
        </form>

        <p className="mt-6 text-center text-xs leading-5 text-slate-500">
          Review Examify&apos;s{" "}
          <Link href="/safety" className="font-semibold text-[#2563EB]">
            Safety, Community Rules & Legal Notice
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
