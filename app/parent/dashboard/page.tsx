"use client";

import Link from "next/link";
import { useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ParentDashboardPage() {
  const supabase = useMemo(() => createClient(), []);

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Examify Parent</p>
            <h1 className="mt-1 text-3xl font-bold">Parent Dashboard</h1>
          </div>
          <button type="button" onClick={logout} className="w-full rounded-xl border border-slate-300 px-4 py-2 font-semibold sm:w-auto">Log out</button>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Link href="/parent/children" className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-violet-50 p-6 transition hover:border-blue-400 hover:shadow-sm">
            <h2 className="text-xl font-semibold">My children</h2>
            <p className="mt-2 text-sm text-slate-600">Create student accounts for your children and view their exam results and academic progress.</p>
            <p className="mt-5 text-sm font-semibold text-[#2563EB]">Manage children →</p>
          </Link>
          <Link href="/parent/safety-reports" className="rounded-2xl border border-red-200 bg-red-50 p-6 transition hover:border-red-400 hover:shadow-sm">
            <h2 className="text-xl font-semibold">Safety reports</h2>
            <p className="mt-2 text-sm text-slate-600">Review safety reports involving your linked children.</p>
            <p className="mt-5 text-sm font-semibold text-red-600">Open safety center →</p>
          </Link>

          <Link href="/parent/profile" className="rounded-2xl border border-slate-200 p-6 transition hover:border-slate-400 hover:shadow-sm">
            <h2 className="text-xl font-semibold">Profile</h2>
            <p className="mt-2 text-sm text-slate-600">Add your career, education, birthday preferences, and manage your account.</p>
            <p className="mt-5 text-sm font-semibold">Open profile →</p>
          </Link>

          <Link href="/feed" className="rounded-2xl border border-slate-200 p-6 transition hover:border-slate-400 hover:shadow-sm">
            <h2 className="text-xl font-semibold">Feed</h2>
            <p className="mt-2 text-sm text-slate-600">See updates from teachers and institutions and achievements students choose to share.</p>
            <p className="mt-5 text-sm font-semibold">Open feed →</p>
          </Link>


          <Link href="/parent/requests" className="rounded-2xl border border-slate-200 p-6 transition hover:border-slate-400 hover:shadow-sm">
            <h2 className="text-xl font-semibold">Institution requests</h2>
            <p className="mt-2 text-sm text-slate-600">Review institutions asking to add you as a parent.</p>
            <p className="mt-5 text-sm font-semibold">Review requests →</p>
          </Link>

          <Link href="/parent/institutions" className="rounded-2xl border border-slate-200 p-6 transition hover:border-slate-400 hover:shadow-sm">
            <h2 className="text-xl font-semibold">Following institutions</h2>
            <p className="mt-2 text-sm text-slate-600">View institutions you follow and discover their teachers.</p>
            <p className="mt-5 text-sm font-semibold">View institutions →</p>
          </Link>

          <Link href="/institutions" className="rounded-2xl border border-slate-200 p-6 transition hover:border-slate-400 hover:shadow-sm">
            <h2 className="text-xl font-semibold">Discover institutions</h2>
            <p className="mt-2 text-sm text-slate-600">Find public institutions and choose which ones to follow.</p>
            <p className="mt-5 text-sm font-semibold">Browse institutions →</p>
          </Link>
        </div>
      </div>
    </main>
  );
}
