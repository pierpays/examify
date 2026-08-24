"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import PolicyAgreement from "@/components/legal/policy-agreement";
import { CURRENT_POLICY_VERSION } from "@/lib/policy";

export default function StudentSignupPage() {
  const supabase = createClient();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [acceptedPolicies, setAcceptedPolicies] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (password !== confirmPassword) {
      setMessage("Passwords do not match. Please enter the same password twice.");
      return;
    }

    if (!acceptedPolicies) {
      setMessage(
        "You must agree to Examify's Terms, Privacy Notice, and Academic Community Standards before creating an account."
      );
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role: "student",
          policy_accepted: true,
          policy_version: CURRENT_POLICY_VERSION,
          policy_accepted_at: new Date().toISOString(),
          policy_acceptance_type: "self",
        },
      },
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setMessage("Account created. Check your email to confirm your account.");
    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-white px-4 py-12 text-slate-900">
      <div className="mx-auto max-w-md">
        <h1 className="text-3xl font-bold">Student account</h1>

        <p className="mt-2 text-sm text-slate-600">
          Create your Examify account and start practicing.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label className="mb-2 block text-sm font-medium">
              Full name
            </label>
            <input
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900"
              placeholder="Your name"
            />
          </div>

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

          <div>
            <label className="mb-2 block text-sm font-medium">
              Password
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
              Confirm password
            </label>
            <input
              required
              minLength={6}
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900"
              placeholder="Enter the same password again"
            />
          </div>

          <PolicyAgreement
            checked={acceptedPolicies}
            onChange={setAcceptedPolicies}
            disabled={loading}
          />

          <button
            disabled={loading || !acceptedPolicies || password !== confirmPassword}
            className="w-full rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Creating account..." : "Create student account"}
          </button>

          {message && (
            <p className="text-sm text-slate-600">
              {message}
            </p>
          )}
          <p className="text-center text-xs text-slate-500">
            Review{" "}
            <Link href="/safety" className="font-semibold text-[#2563EB]">
              Safety & Rules
            </Link>{" "}
            at any time.
          </p>
        </form>
      </div>
    </main>
  );
}
