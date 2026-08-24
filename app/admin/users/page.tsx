"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type AdminUser = { id: string; full_name: string | null; role: string; username: string | null; created_at: string };

export default function AdminUsersPage() {
  const supabase = useMemo(() => createClient(), []);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.rpc("get_admin_users");
      if (error) setMessage(error.message);
      else setUsers((data ?? []) as AdminUser[]);
    }
    load();
  }, [supabase]);

  const filtered = users.filter((user) => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || (user.full_name ?? "").toLowerCase().includes(q) || (user.username ?? "").toLowerCase().includes(q);
    return matchesSearch && (role === "all" || user.role === role);
  });

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <p className="text-sm font-medium text-slate-500">Examify Administration</p>
        <h1 className="mt-1 text-3xl font-bold">Users</h1>
        <p className="mt-2 text-sm text-slate-600">Search and review Examify accounts.</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto]">
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or username" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3" />
          <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 sm:w-auto">
            <option value="all">All roles</option><option value="student">Students</option><option value="teacher">Teachers</option><option value="parent">Parents</option><option value="institution">Institutions</option><option value="admin">Admins</option>
          </select>
        </div>
        <div className="mt-6 space-y-3">
          {filtered.map((user) => (
            <div key={user.id} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="font-semibold">{user.full_name || "Unnamed user"}</p>{user.username && <p className="mt-1 text-sm text-slate-500">@{user.username}</p>}</div>
                <div className="sm:text-right"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold capitalize text-slate-600">{user.role}</span><p className="mt-2 text-xs text-slate-500">Joined {new Date(user.created_at).toLocaleString()}</p></div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">No users found.</div>}
        </div>
        {message && <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{message}</p>}
      </div>
    </main>
  );
}
