"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SecuritySettingsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState("");
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState("");

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getSession();
      setEmail(data.session?.user.email ?? "");
      setExpiresAt(data.session?.expires_at ?? null);
    }

    load();
  }, [supabase]);

  async function sendPasswordReset() {
    if (!email) return;
    setWorking("password");
    setMessage("");

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setMessage(error?.message ?? "Password reset email sent.");
    setWorking("");
  }

  async function signOutOtherDevices() {
    setWorking("others");
    setMessage("");

    const { error } = await supabase.auth.signOut({ scope: "others" });

    setMessage(
      error?.message ??
        "Other Examify sessions were signed out. This device remains signed in."
    );
    setWorking("");
  }

  async function signOutEverywhere() {
    setWorking("all");
    setMessage("");

    const { error } = await supabase.auth.signOut({ scope: "global" });

    if (error) {
      setMessage(error.message);
      setWorking("");
      return;
    }

    window.location.href = "/login";
  }

  return (
    <main className="min-h-screen px-3 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-3xl">
        <p className="text-sm font-bold text-[#2563EB]">YOUR ACCOUNT</p>
        <h1 className="mt-1 text-3xl font-extrabold">Security & sessions</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Review the account currently signed in, reset your password, and revoke
          sessions from devices you no longer use.
        </p>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">Current session</h2>

          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-4">
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">
                Signed-in email
              </dt>
              <dd className="mt-2 break-all font-semibold">
                {email || "Loading..."}
              </dd>
            </div>

            <div className="rounded-xl bg-slate-50 p-4">
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">
                Session refresh
              </dt>
              <dd className="mt-2 font-semibold">
                {expiresAt
                  ? new Date(expiresAt * 1000).toLocaleString()
                  : "Managed automatically"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">Password</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            If you think somebody may know your password, request a reset and then
            revoke other sessions.
          </p>

          <button
            type="button"
            onClick={sendPasswordReset}
            disabled={working !== ""}
            className="mt-4 rounded-xl border border-slate-300 px-5 py-3 font-bold disabled:opacity-50"
          >
            {working === "password" ? "Sending..." : "Send password reset email"}
          </button>
        </section>

        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">Signed-in devices</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            You can revoke other Examify sessions if you signed in on a shared,
            lost, or old device.
          </p>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={signOutOtherDevices}
              disabled={working !== ""}
              className="rounded-xl bg-slate-900 px-5 py-3 font-bold text-white disabled:opacity-50"
            >
              {working === "others"
                ? "Signing out..."
                : "Sign out other devices"}
            </button>

            <button
              type="button"
              onClick={signOutEverywhere}
              disabled={working !== ""}
              className="rounded-xl border border-red-200 px-5 py-3 font-bold text-red-600 disabled:opacity-50"
            >
              {working === "all"
                ? "Signing out..."
                : "Sign out everywhere"}
            </button>
          </div>
        </section>

        <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
          <strong>Security tip:</strong> never share your Examify password with a
          teacher, institution, other student, or another user. Examify staff should
          not need your password to assist with moderation or support.
        </div>

        {message && (
          <p className="mt-5 rounded-xl bg-slate-100 p-4 text-sm font-semibold text-slate-700">
            {message}
          </p>
        )}
      </div>
    </main>
  );
}
