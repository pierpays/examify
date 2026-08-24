"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Group = {
  id: string;
  name: string;
  description: string | null;
  group_code: string;
  join_mode: string;
  category: string;
  is_discoverable: boolean;
  owner_id: string;
  owner_name: string;
  member_count: number;
  membership_status: string;
  membership_role: string;
};

type Membership = {
  group_id: string;
  status: string;
  membership_role: string;
};

export default function GroupsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState("");
  const [scope, setScope] = useState<"discover" | "mine">("discover");
  const [groups, setGroups] = useState<Group[]>([]);
  const [invites, setInvites] = useState<Membership[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("study_group");
  const [joinMode, setJoinMode] = useState("request");
  const [rules, setRules] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function load(nextScope = scope) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    setUserId(user.id);

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    setRole(profile?.role ?? "");

    const [{ data, error }, { data: membershipRows }] = await Promise.all([
      supabase.rpc("get_academic_groups", {
        p_scope: nextScope,
        p_limit: 50,
      }),
      supabase
        .from("academic_group_members")
        .select("group_id,status,membership_role")
        .eq("user_id", user.id)
        .eq("status", "invited"),
    ]);

    if (error) setMessage(error.message);
    else setGroups((data ?? []) as Group[]);

    setInvites((membershipRows ?? []) as Membership[]);
  }

  useEffect(() => {
    load();
  }, [supabase]);

  async function createCommunity(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    const { data, error } = await supabase.rpc(
      "create_academic_community",
      {
        p_name: name,
        p_description: description,
        p_category: category,
        p_join_mode: joinMode,
        p_rules: rules,
      }
    );

    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    window.location.href = `/groups/${data}`;
  }

  async function joinGroupByCode(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    const { data, error } = await supabase.rpc("join_group_by_code", {
      p_code: joinCode,
    });

    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setJoinCode("");
    if (data) window.location.href = `/groups/${data}`;
  }

  async function acceptInvite(groupId: string) {
    const { error } = await supabase.rpc("respond_group_membership", {
      p_group_id: groupId,
      p_user_id: userId,
      p_action: "accept_invite",
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    await load(scope);
  }

  return (
    <main className="min-h-screen px-3 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <section className="rounded-3xl bg-gradient-to-r from-[#071A46] via-[#0B2F78] to-[#6D3EF0] p-6 text-white sm:p-8">
          <p className="text-sm font-bold text-blue-100">
            ACADEMIC COMMUNITIES
          </p>
          <h1 className="mt-1 text-3xl font-extrabold sm:text-4xl">
            Groups & Classes
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-blue-50">
            Join classes by code or discover academic communities for subjects,
            certifications, careers, and study groups.
          </p>
        </section>

        {message && (
          <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {message}
          </p>
        )}

        {role === "student" && (
          <form
            onSubmit={joinGroupByCode}
            className="mt-6 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-end"
          >
            <label className="flex-1 text-sm font-semibold">
              Join a class with a code
              <input
                value={joinCode}
                onChange={(e) =>
                  setJoinCode(e.target.value.toUpperCase())
                }
                required
                maxLength={12}
                placeholder="Example: A1B2C3D4"
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 uppercase"
              />
            </label>
            <button
              disabled={saving}
              className="rounded-xl bg-slate-900 px-5 py-3 font-bold text-white disabled:opacity-50"
            >
              Join class
            </button>
          </form>
        )}

        {invites.length > 0 && (
          <section className="mt-6 rounded-2xl border border-violet-200 bg-violet-50 p-5">
            <h2 className="font-extrabold">Group invitations</h2>
            <div className="mt-3 space-y-2">
              {invites.map((invite) => (
                <div
                  key={invite.group_id}
                  className="flex items-center justify-between gap-3 rounded-xl bg-white p-3"
                >
                  <Link
                    href={`/groups/${invite.group_id}`}
                    className="font-bold text-[#2563EB]"
                  >
                    View invitation
                  </Link>
                  <button
                    onClick={() => acceptInvite(invite.group_id)}
                    className="rounded-lg bg-[#2563EB] px-3 py-2 text-xs font-bold text-white"
                  >
                    Accept
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        <details className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <summary className="cursor-pointer font-extrabold text-[#2563EB]">
            + Create an academic community
          </summary>

          <form
            onSubmit={createCommunity}
            className="mt-5 grid gap-4"
          >
            <input
              required
              minLength={3}
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Community name"
              className="rounded-xl border border-slate-300 px-4 py-3"
            />

            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="What is this academic community for?"
              className="rounded-xl border border-slate-300 px-4 py-3"
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold">
                Category
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
                >
                  <option value="study_group">Study group</option>
                  <option value="subject">Subject</option>
                  <option value="certification">Certification</option>
                  <option value="career">Career</option>
                  <option value="institution">Institution</option>
                  <option value="other">Other academic</option>
                </select>
              </label>

              <label className="text-sm font-semibold">
                Joining
                <select
                  value={joinMode}
                  onChange={(e) => setJoinMode(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
                >
                  <option value="request">Request approval</option>
                  <option value="code">Join immediately</option>
                  <option value="closed">Invitation only</option>
                </select>
              </label>
            </div>

            <textarea
              value={rules}
              onChange={(e) => setRules(e.target.value)}
              maxLength={4000}
              rows={3}
              placeholder="Optional community rules"
              className="rounded-xl border border-slate-300 px-4 py-3"
            />

            <button
              disabled={saving}
              className="rounded-xl bg-gradient-to-r from-[#2563EB] to-[#7C3AED] px-5 py-3 font-bold text-white disabled:opacity-50"
            >
              {saving ? "Creating..." : "Create community"}
            </button>
          </form>
        </details>

        <div className="mt-7 flex gap-2 overflow-x-auto pb-1">
          {(["discover", "mine"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setScope(value);
                load(value);
              }}
              className={`shrink-0 rounded-full px-4 py-2.5 text-sm font-bold ${
                scope === value
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-600"
              }`}
            >
              {value === "discover"
                ? "Discover communities"
                : "My groups & classes"}
            </button>
          ))}
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => (
            <Link
              key={group.id}
              href={`/groups/${group.id}`}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold capitalize text-[#2563EB]">
                  {group.category.replaceAll("_", " ")}
                </span>
                <span className="text-xs font-semibold text-slate-400">
                  {group.join_mode === "closed"
                    ? "🔒 Invitation only"
                    : group.join_mode === "request"
                      ? "Approval required"
                      : "Open"}
                </span>
              </div>

              <h2 className="mt-4 text-xl font-extrabold">
                {group.name}
              </h2>

              <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">
                {group.description || "Academic community on Examify."}
              </p>

              <p className="mt-4 text-xs text-slate-400">
                Created by {group.owner_name}
              </p>

              <div className="mt-4 flex items-center justify-between text-xs">
                <span className="text-slate-500">
                  {Number(group.member_count)}{" "}
                  {Number(group.member_count) === 1
                    ? "member"
                    : "members"}
                </span>

                <span className="font-bold text-[#2563EB]">
                  {group.membership_status === "active"
                    ? "Joined"
                    : group.membership_status === "requested"
                      ? "Requested"
                      : group.membership_status === "invited"
                        ? "Invited"
                        : "View"}{" "}
                  →
                </span>
              </div>
            </Link>
          ))}
        </div>

        {groups.length === 0 && (
          <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            {scope === "discover"
              ? "No discoverable communities yet."
              : "You have not joined any groups or classes yet."}
          </div>
        )}
      </div>
    </main>
  );
}
