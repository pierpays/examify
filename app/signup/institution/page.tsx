"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import PolicyAgreement from "@/components/legal/policy-agreement";
import { CURRENT_POLICY_VERSION } from "@/lib/policy";

export default function InstitutionSignupPage() {
  const supabase = createClient();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [physicalAddress, setPhysicalAddress] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [acceptedPolicies, setAcceptedPolicies] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (password !== confirmPassword) {
      setMessage("Passwords do not match. Please enter the same password twice.");
      return;
    }

    if (!acceptedPolicies) {
      setMessage(
        "You must agree to Examify's Terms, Privacy Notice, and Academic Community Standards before submitting an institution account."
      );
      return;
    }

    setLoading(true);

    let normalizedWebsite = websiteUrl.trim();
    if (normalizedWebsite && !/^https?:\/\//i.test(normalizedWebsite)) {
      normalizedWebsite = `https://${normalizedWebsite}`;
    }

    try {
      new URL(normalizedWebsite);
    } catch {
      setMessage("Please enter a valid institution website.");
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: name.trim(),
          institution_name: name.trim(),
          role: "institution",
          policy_accepted: true,
          policy_version: CURRENT_POLICY_VERSION,
          policy_accepted_at: new Date().toISOString(),
          policy_acceptance_type: "self",
          physical_address: physicalAddress.trim(),
          contact_email: email.trim(),
          website_url: normalizedWebsite,
          phone_number: phoneNumber.trim(),
        },
      },
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setSubmitted(true);
    setMessage(
      "Application submitted. Confirm your email if requested. An Examify administrator must verify your institution before the account can access the community."
    );
    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-white px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-xl">
        <Link href="/signup" className="text-sm font-semibold text-slate-600">
          ← Back
        </Link>

        <h1 className="mt-6 text-3xl font-bold">Institution account</h1>
        <p className="mt-2 text-sm text-slate-600">
          Institution accounts require manual verification by Examify before they can publish, connect with members, or appear publicly.
        </p>

        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Verification information required</p>
          <p className="mt-1">
            Provide real contact information. An Examify administrator will use the address, email, website, and phone number to verify that the institution is legitimate.
          </p>
        </div>

        <form onSubmit={submit} className="mt-8 space-y-5">
          <label className="block text-sm font-medium">
            Institution name
            <input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
              placeholder="Example Academy"
              disabled={submitted}
            />
          </label>

          <label className="block text-sm font-medium">
            Physical address
            <textarea
              required
              rows={3}
              value={physicalAddress}
              onChange={(event) => setPhysicalAddress(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
              placeholder="Street, city, state/province, postal code, country"
              disabled={submitted}
            />
          </label>

          <label className="block text-sm font-medium">
            Institution email
            <input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
              placeholder="admin@example.edu"
              disabled={submitted}
            />
          </label>

          <label className="block text-sm font-medium">
            Website
            <input
              required
              type="text"
              inputMode="url"
              value={websiteUrl}
              onChange={(event) => setWebsiteUrl(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
              placeholder="https://www.example.edu"
              disabled={submitted}
            />
          </label>

          <label className="block text-sm font-medium">
            Phone number
            <input
              required
              type="tel"
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
              placeholder="+1 555 555 5555"
              disabled={submitted}
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
              disabled={submitted}
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
              disabled={submitted}
            />
          </label>

          {!submitted && (
            <>
              <PolicyAgreement
                checked={acceptedPolicies}
                onChange={setAcceptedPolicies}
                disabled={loading}
              />

              <button
              disabled={loading || !acceptedPolicies || password !== confirmPassword}
              className="w-full rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-50"
            >
              {loading ? "Submitting application..." : "Submit institution for verification"}
            </button>
            </>
          )}

          {message && (
            <p className={`rounded-xl p-4 text-sm ${submitted ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
              {message}
            </p>
          )}

          {submitted && (
            <Link
              href="/login"
              className="block w-full rounded-xl border border-slate-300 px-4 py-3 text-center font-semibold"
            >
              Go to login
            </Link>
          )}
        </form>
      </div>
    </main>
  );
}
