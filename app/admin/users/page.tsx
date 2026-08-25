"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type AdminUser = {
  id: string;
  full_name: string | null;
  username: string | null;
  email: string | null;
  role: string;
  created_at: string;
  is_disabled: boolean;
  disabled_reason: string | null;
  disabled_at: string | null;
};

const roles = ["student", "teacher", "parent", "institution", "admin"];

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setMessage("");
    const res = await fetch("/api/admin/users", { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) setMessage(json.error ?? "Unable to load users.");
    else setUsers(json.users ?? []);
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => users.filter((user) => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || [user.full_name, user.username, user.email].some((v) => (v ?? "").toLowerCase().includes(q));
    return matchesSearch && (role === "all" || user.role === role);
  }), [users, search, role]);

  async function patchUser(payload: Record<string, unknown>, id: string) {
    setBusy(id); setMessage("");
    const res = await fetch("/api/admin/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: id, ...payload }) });
    const json = await res.json();
    if (!res.ok) setMessage(json.error ?? "Unable to update user.");
    else { setEditing(null); await load(); }
    setBusy(null);
  }

  async function deleteUser(user: AdminUser) {
    const label = user.full_name || user.email || user.username || user.id;
    if (!window.confirm(`Permanently delete ${label}? This cannot be undone.`)) return;
    setBusy(user.id); setMessage("");
    const res = await fetch("/api/admin/users", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: user.id }) });
    const json = await res.json();
    if (!res.ok) setMessage(json.error ?? "Unable to delete user.");
    else await load();
    setBusy(null);
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-medium text-slate-500">Examtify Administration</p>
        <h1 className="mt-1 text-3xl font-bold">Users</h1>
        <p className="mt-2 text-sm text-slate-600">Search, view, edit, disable, re-enable, or permanently delete Examtify accounts.</p>

        <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto]">
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, username, or email" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3" />
          <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-4 py-3">
            <option value="all">All roles</option>{roles.map((r) => <option key={r} value={r}>{r[0].toUpperCase()+r.slice(1)}</option>)}
          </select>
        </div>

        {message && <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{message}</p>}

        <div className="mt-6 space-y-3">
          {filtered.map((user) => (
            <div key={user.id} className="rounded-2xl border border-slate-200 bg-white p-5">
              {editing?.id === user.id ? (
                <EditForm user={editing} busy={busy === user.id} onCancel={() => setEditing(null)} onSave={(data) => patchUser(data, user.id)} />
              ) : (
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{user.full_name || "Unnamed user"}</p>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-600">{user.role}</span>
                      {user.is_disabled && <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">Disabled / Under investigation</span>}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{user.email || "No email"}{user.username ? ` · @${user.username}` : ""}</p>
                    <p className="mt-1 text-xs text-slate-400">Joined {new Date(user.created_at).toLocaleString()}</p>
                    {user.is_disabled && user.disabled_reason && <p className="mt-2 text-sm text-red-700">Reason: {user.disabled_reason}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {user.role !== "institution" && user.role !== "admin" && (
                      <Link href={`/people/${user.id}`} className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">View profile</Link>
                    )}
                    <button onClick={() => setEditing({ ...user })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">Edit</button>
                    <button disabled={busy === user.id} onClick={() => user.is_disabled ? patchUser({ is_disabled: false }, user.id) : patchUser({ is_disabled: true, disabled_reason: window.prompt("Reason for disabling this account:", "Account under investigation.") || "Account under investigation." }, user.id)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${user.is_disabled ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{user.is_disabled ? "Re-enable" : "Disable"}</button>
                    <button disabled={busy === user.id} onClick={() => deleteUser(user)} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white">Delete</button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {filtered.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">No users found.</div>}
        </div>
      </div>
    </main>
  );
}

function EditForm({ user, busy, onCancel, onSave }: { user: AdminUser; busy: boolean; onCancel: () => void; onSave: (data: Record<string, unknown>) => void }) {
  const [fullName, setFullName] = useState(user.full_name ?? "");
  const [username, setUsername] = useState(user.username ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [role, setRole] = useState(user.role);

  return <div className="grid gap-3 md:grid-cols-2">
    <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" className="rounded-xl border border-slate-300 px-3 py-2" />
    <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" className="rounded-xl border border-slate-300 px-3 py-2" />
    <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" className="rounded-xl border border-slate-300 px-3 py-2" />
    <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-xl border border-slate-300 px-3 py-2">{roles.map((r) => <option key={r} value={r}>{r}</option>)}</select>
    <div className="flex gap-2 md:col-span-2">
      <button disabled={busy} onClick={() => onSave({ full_name: fullName.trim() || null, username: username.trim() || null, email: email.trim(), role })} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Save changes</button>
      <button disabled={busy} onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Cancel</button>
    </div>
  </div>;
}
