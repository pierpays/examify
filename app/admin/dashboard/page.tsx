"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Stats = {
  total_users: number;
  students: number;
  teachers: number;
  parents: number;
  institutions: number;
  admins: number;
  total_exams: number;
  published_exams: number;
  total_posts: number;
  open_reports: number;
  pending_institution_verifications: number;
};

const emptyStats: Stats = {
  total_users: 0,
  students: 0,
  teachers: 0,
  parents: 0,
  institutions: 0,
  admins: 0,
  total_exams: 0,
  published_exams: 0,
  total_posts: 0,
  open_reports: 0,
  pending_institution_verifications: 0,
};

export default function AdminDashboardPage() {
  const supabase = useMemo(() => createClient(), []);
  const [stats, setStats] = useState<Stats>(emptyStats);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.rpc("get_admin_dashboard_stats");
      if (error) {
        setMessage(error.message);
        return;
      }
      setStats(((data ?? [])[0] ?? emptyStats) as Stats);
    }
    load();
  }, [supabase]);

  const cards = [
    ["Users", stats.total_users],
    ["Students", stats.students],
    ["Teachers", stats.teachers],
    ["Parents", stats.parents],
    ["Institutions", stats.institutions],
    ["Published exams", stats.published_exams],
    ["Feed posts", stats.total_posts],
    ["Open reports", stats.open_reports],
    ["Pending institution approvals", stats.pending_institution_verifications],
  ] as const;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-medium text-slate-500">Examify Administration</p>
        <h1 className="mt-1 text-3xl font-bold">Admin Dashboard</h1>
        <p className="mt-2 text-sm text-slate-600">
          Moderate the community and monitor the health of Examify.
        </p>

        <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
          {cards.map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="mt-1 text-2xl font-bold">{value}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link href="/admin/institutions" className="rounded-2xl border border-amber-200 bg-amber-50 p-6 hover:border-amber-300">
            <h2 className="text-lg font-semibold">Institution verification</h2>
            <p className="mt-2 text-sm text-slate-700">Review institution signup requests before they can access the community.</p>
            <p className="mt-5 text-sm font-semibold">{stats.pending_institution_verifications} pending →</p>
          </Link>
          <Link href="/admin/reports" className="rounded-2xl border border-slate-200 bg-white p-6 hover:border-slate-400">
            <h2 className="text-lg font-semibold">Moderation reports</h2>
            <p className="mt-2 text-sm text-slate-600">Review inappropriate, spam, harassment, and other reported posts.</p>
            <p className="mt-5 text-sm font-semibold">Review reports →</p>
          </Link>
          <Link href="/admin/posts" className="rounded-2xl border border-slate-200 bg-white p-6 hover:border-slate-400">
            <h2 className="text-lg font-semibold">Manage posts</h2>
            <p className="mt-2 text-sm text-slate-600">Review recent community content and remove posts when necessary.</p>
            <p className="mt-5 text-sm font-semibold">Manage posts →</p>
          </Link>
          <Link href="/admin/advertising" className="rounded-2xl border border-blue-200 bg-blue-50 p-6 hover:border-blue-300">
            <h2 className="text-lg font-semibold">Advertising</h2>
            <p className="mt-2 text-sm text-slate-700">Create sponsored campaigns, choose placements, schedule ads, and review impressions and clicks.</p>
            <p className="mt-5 text-sm font-semibold">Manage advertising →</p>
          </Link>
          <Link href="/admin/users" className="rounded-2xl border border-slate-200 bg-white p-6 hover:border-slate-400">
            <h2 className="text-lg font-semibold">Users</h2>
            <p className="mt-2 text-sm text-slate-600">Search the Examify account directory by role or name.</p>
            <p className="mt-5 text-sm font-semibold">View users →</p>
          </Link>
        </div>

        {message && <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{message}</p>}
      </div>
    </main>
  );
}
