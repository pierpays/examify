"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const supabase = useMemo(() => createClient(), []);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (password.length < 6) {
      setMessage("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setMessage("Password updated successfully.");
    setLoading(false);

    setTimeout(() => {
      window.location.href = "/login";
    }, 1200);
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
          Reset password
        </h1>

        <p className="mt-2 text-sm text-slate-600">
          Choose a new password for your Examify account.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label className="mb-2 block text-sm font-medium">
              New password
            </label>

            <input
              required
              minLength={6}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900"
              placeholder="Minimum 6 characters"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Confirm new password
            </label>

            <input
              required
              minLength={6}
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900"
              placeholder="Enter the password again"
            />
          </div>

          <button
            disabled={loading}
            className="w-full rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Updating..." : "Update password"}
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
