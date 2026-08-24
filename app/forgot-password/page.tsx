"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const supabase = useMemo(() => createClient(), []);

  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      {
        redirectTo: `${window.location.origin}/reset-password`,
      },
    );

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setMessage("Password reset email sent. Check your inbox.");
    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-md">
        <Link
          href="/login"
          className="text-sm font-semibold text-slate-600"
        >
          ← Back to login
        </Link>

        <p className="mt-6 text-sm font-medium text-slate-500">
          Examify
        </p>

        <h1 className="mt-1 text-3xl font-bold">
          Forgot password?
        </h1>

        <p className="mt-2 text-sm text-slate-600">
          Enter your account email and we’ll send you a secure reset link.
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
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900"
              placeholder="you@example.com"
            />
          </div>

          <button
            disabled={loading}
            className="w-full rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Sending..." : "Send reset link"}
          </button>

          {message && (
            <p className="text-sm text-slate-600">
              {message}
            </p>
          )}
        </form>
      </div>
    </main>
  );
}
