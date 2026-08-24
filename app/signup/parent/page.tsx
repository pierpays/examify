"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import PolicyAgreement from "@/components/legal/policy-agreement";
import { CURRENT_POLICY_VERSION } from "@/lib/policy";

export default function ParentSignupPage() {
  const supabase = createClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedPolicies, setAcceptedPolicies] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
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
          full_name: name,
          role: "parent",
          policy_accepted: true,
          policy_version: CURRENT_POLICY_VERSION,
          policy_accepted_at: new Date().toISOString(),
          policy_acceptance_type: "self",
        },
      },
    });

    setMessage(
      error?.message ??
        "Account created. Check your email to confirm your account."
    );
    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-white px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-md">
        <Link href="/signup" className="text-sm font-semibold text-slate-600">
          ← Back
        </Link>

        <h1 className="mt-6 text-3xl font-bold">Parent account</h1>
        <p className="mt-2 text-sm text-slate-600">
          Create a parent profile to support your family&apos;s academic
          experience on Examify.
        </p>

        <form onSubmit={submit} className="mt-8 space-y-5">
          <label className="block text-sm font-medium">
            Full name
            <input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
            />
          </label>

          <label className="block text-sm font-medium">
            Email
            <input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
            />
          </label>

          <label className="block text-sm font-medium">
            Password
            <input
              required
              minLength={6}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
            />
          </label>

          <label className="block text-sm font-medium">
            Confirm password
            <input
              required
              minLength={6}
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
              placeholder="Enter the same password again"
            />
          </label>

          <PolicyAgreement
            checked={acceptedPolicies}
            onChange={setAcceptedPolicies}
            disabled={loading}
          />

          <button
            disabled={loading || !acceptedPolicies || password !== confirmPassword}
            className="w-full rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Creating account..." : "Create parent account"}
          </button>

          {message && <p className="text-sm text-slate-600">{message}</p>}

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
