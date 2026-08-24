"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

export default function InstitutionDashboardPage() {
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    async function ensureProfile() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("institution_profiles")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!data) {
        await supabase.from("institution_profiles").insert({
          user_id: user.id,
          name: user.user_metadata.full_name || "Institution",
        });
      }
    }

    ensureProfile();
  }, [supabase]);

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Examify Institution</p>
            <h1 className="mt-1 text-3xl font-bold">Institution Dashboard</h1>
          </div>
          <button
            type="button"
            onClick={logout}
            className="w-full rounded-xl border border-slate-300 px-4 py-2 font-semibold sm:w-auto"
          >
            Log out
          </button>
        </div>

        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          <Link href="/feed" className="rounded-2xl border border-slate-200 p-6 transition hover:border-slate-400 hover:shadow-sm">
            <h2 className="text-xl font-semibold">Feed</h2>
            <p className="mt-2 text-sm text-slate-600">Publish institution updates and see posts from the Examify community.</p>
            <p className="mt-5 text-sm font-semibold">Open feed →</p>
          </Link>

          <Link href="/institution/members" className="rounded-2xl border border-slate-200 p-6 transition hover:border-slate-400 hover:shadow-sm">
            <h2 className="text-xl font-semibold">People & requests</h2>
            <p className="mt-2 text-sm text-slate-600">Add teachers, students, or parents and manage invitations.</p>
            <p className="mt-5 text-sm font-semibold">Manage people →</p>
          </Link>

          <Link href="/institution/classes" className="rounded-2xl border border-blue-200 bg-blue-50 p-6 transition hover:border-blue-400 hover:shadow-sm">
            <h2 className="text-xl font-semibold">Academic years & classes</h2>
            <p className="mt-2 text-sm text-slate-600">Create official classes, assign teachers, and manage student rosters.</p>
            <p className="mt-5 text-sm font-semibold text-[#0F5FEA]">Create or manage classes →</p>
          </Link>

          <Link href="/institution/safety-reports" className="rounded-2xl border border-red-200 bg-red-50 p-6 transition hover:border-red-400 hover:shadow-sm">
            <h2 className="text-xl font-semibold">Safety reports</h2>
            <p className="mt-2 text-sm text-slate-600">Review reports involving your teachers or accepted students.</p>
            <p className="mt-5 text-sm font-semibold text-red-600">Open safety center →</p>
          </Link>

          <Link href="/institution/profile" className="rounded-2xl border border-slate-200 p-6 transition hover:border-slate-400 hover:shadow-sm">
            <h2 className="text-xl font-semibold">Institution profile</h2>
            <p className="mt-2 text-sm text-slate-600">Manage your public institution information.</p>
            <p className="mt-5 text-sm font-semibold">Edit profile →</p>
          </Link>

          <Link href="/institutions" className="rounded-2xl border border-slate-200 p-6 transition hover:border-slate-400 hover:shadow-sm">
            <h2 className="text-xl font-semibold">Institutions directory</h2>
            <p className="mt-2 text-sm text-slate-600">Browse public institution profiles on Examify.</p>
            <p className="mt-5 text-sm font-semibold">Browse institutions →</p>
          </Link>
        </div>
      </div>
    </main>
  );
}
