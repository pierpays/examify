"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import PolicyAgreement from "@/components/legal/policy-agreement";

type Child = {
  student_id: string;
  student_name: string;
  avatar_url: string | null;
  completed_exams: number;
  average_score: number;
  latest_activity: string | null;
};

export default function ParentChildrenPage() {
  const supabase = useMemo(() => createClient(), []);
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [resettingChildId, setResettingChildId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [resetSaving, setResetSaving] = useState(false);
  const [acceptedChildPolicies, setAcceptedChildPolicies] = useState(false);
  const [form, setForm] = useState({ fullName: "", email: "", password: "", confirmPassword: "" });

  async function loadChildren() {
    const { data, error } = await supabase.rpc("get_my_children");
    if (error) setMessage(error.message);
    else setChildren((data ?? []) as Child[]);
    setLoading(false);
  }

  useEffect(() => { loadChildren(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function createChild(event: FormEvent) {
    event.preventDefault();
    setMessage("");

    if (form.password !== form.confirmPassword) {
      setMessage("Passwords do not match. Please enter the same password twice.");
      return;
    }

    if (!acceptedChildPolicies) {
      setMessage(
        "You must confirm the parent/guardian policy agreement before creating a child account."
      );
      return;
    }

    setSaving(true);

    const response = await fetch("/api/parent/children", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, parentPolicyAccepted: acceptedChildPolicies }),
    });
    const result = await response.json();

    if (!response.ok) setMessage(result.error ?? "Could not create student account.");
    else {
      setForm({ fullName: "", email: "", password: "", confirmPassword: "" });
      setAcceptedChildPolicies(false);
      setMessage("Student account created and linked to your parent account.");
      await loadChildren();
    }
    setSaving(false);
  }

  async function resetChildPassword(childId: string) {
    setMessage("");

    if (resetPassword.length < 8) {
      setMessage("The new password must be at least 8 characters.");
      return;
    }

    if (resetPassword !== resetConfirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    setResetSaving(true);

    const response = await fetch(
      `/api/parent/children/${childId}/password`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: resetPassword,
          confirmPassword: resetConfirmPassword,
        }),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      setMessage(result.error ?? "Could not reset the child password.");
      setResetSaving(false);
      return;
    }

    setResettingChildId(null);
    setResetPassword("");
    setResetConfirmPassword("");
    setMessage("Child password updated successfully.");
    setResetSaving(false);
  }

  return (
    <main className="min-h-screen px-4 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <p className="text-sm font-semibold text-[#2563EB]">Parent tools</p>
        <h1 className="mt-1 text-3xl font-bold">My children</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">Create a student account for your child and follow their academic exam results from your own account.</p>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-xl font-bold">Add a child</h2>
          <form onSubmit={createChild} className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold">Student name<input required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal" /></label>
            <label className="text-sm font-semibold">Student email<input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal" /></label>
            <label className="text-sm font-semibold">
              Initial password
              <input
                required
                minLength={8}
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={(e) =>
                  setForm({ ...form, password: e.target.value })
                }
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal"
              />
              <span className="mt-1 block text-xs font-normal text-slate-500">
                At least 8 characters.
              </span>
            </label>

            <label className="text-sm font-semibold">
              Confirm password
              <input
                required
                minLength={8}
                type="password"
                autoComplete="new-password"
                value={form.confirmPassword}
                onChange={(e) =>
                  setForm({
                    ...form,
                    confirmPassword: e.target.value,
                  })
                }
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal"
              />
              <span className="mt-1 block text-xs font-normal text-slate-500">
                Enter the same password again to prevent mistakes.
              </span>
            </label>

            <p className="text-xs text-slate-500 sm:col-span-2">
              Give this password directly to your child. They can use it to sign in to their student account.
            </p>

            <div className="sm:col-span-2">
              <PolicyAgreement
                checked={acceptedChildPolicies}
                onChange={setAcceptedChildPolicies}
                parentOnBehalf
                disabled={saving}
              />
            </div>

            <button disabled={saving || !acceptedChildPolicies} className="rounded-xl bg-gradient-to-r from-[#2563EB] to-[#7C3AED] px-5 py-3 font-bold text-white disabled:opacity-60 sm:w-fit">{saving ? "Creating..." : "Create student account"}</button>
          </form>
          {message && <p className="mt-4 text-sm text-slate-600">{message}</p>}
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-bold">Linked students</h2>
          {loading ? <p className="mt-4 text-sm text-slate-500">Loading...</p> : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {children.map((child) => (
                <div
                  key={child.student_id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <Link
                    href={`/parent/children/${child.student_id}`}
                    className="block rounded-xl transition hover:bg-slate-50"
                  >
                    <p className="font-bold">{child.student_name}</p>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-slate-500">Completed</p>
                        <p className="mt-1 text-lg font-bold">
                          {child.completed_exams}
                        </p>
                      </div>

                      <div>
                        <p className="text-slate-500">Average</p>
                        <p className="mt-1 text-lg font-bold">
                          {Number(child.average_score).toFixed(1)}%
                        </p>
                      </div>
                    </div>

                    <p className="mt-4 text-sm font-semibold text-[#2563EB]">
                      View academic activity →
                    </p>
                  </Link>

                  <div className="mt-4 border-t border-slate-100 pt-4">
                    {resettingChildId === child.student_id ? (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-sm font-bold">Reset password</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Set a new password for this child. The existing password will stop working immediately.
                        </p>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <input
                            type="password"
                            minLength={8}
                            autoComplete="new-password"
                            placeholder="New password"
                            value={resetPassword}
                            onChange={(e) => setResetPassword(e.target.value)}
                            className="w-full rounded-xl border border-slate-300 px-4 py-3"
                          />

                          <input
                            type="password"
                            minLength={8}
                            autoComplete="new-password"
                            placeholder="Confirm new password"
                            value={resetConfirmPassword}
                            onChange={(e) =>
                              setResetConfirmPassword(e.target.value)
                            }
                            className="w-full rounded-xl border border-slate-300 px-4 py-3"
                          />
                        </div>

                        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                          <button
                            type="button"
                            onClick={() =>
                              resetChildPassword(child.student_id)
                            }
                            disabled={resetSaving}
                            className="rounded-xl bg-gradient-to-r from-[#2563EB] to-[#7C3AED] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                          >
                            {resetSaving
                              ? "Updating..."
                              : "Update password"}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setResettingChildId(null);
                              setResetPassword("");
                              setResetConfirmPassword("");
                              setMessage("");
                            }}
                            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setResettingChildId(child.student_id);
                          setResetPassword("");
                          setResetConfirmPassword("");
                          setMessage("");
                        }}
                        className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold transition hover:border-[#2563EB] hover:text-[#2563EB]"
                      >
                        Reset password
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {children.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 sm:col-span-2">No child accounts linked yet.</div>}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
