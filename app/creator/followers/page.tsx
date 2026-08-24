"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Follower = {
  student_id: string;
  created_at: string;
  full_name: string | null;
};

export default function CreatorFollowersPage() {
  const supabase = useMemo(() => createClient(), []);

  const [followers, setFollowers] = useState<Follower[]>([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadFollowers() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      const { data: followRows, error: followError } =
        await supabase
          .from("teacher_followers")
          .select("student_id, created_at")
          .eq("teacher_id", user.id)
          .order("created_at", { ascending: false });

      if (followError) {
        setMessage(followError.message);
        setLoading(false);
        return;
      }

      const studentIds = (followRows ?? []).map(
        (item) => item.student_id
      );

      if (studentIds.length === 0) {
        setLoading(false);
        return;
      }

      const { data: profiles, error: profileError } =
        await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", studentIds);

      if (profileError) {
        setMessage(profileError.message);
        setLoading(false);
        return;
      }

      const profileMap = new Map(
        (profiles ?? []).map((profile) => [
          profile.id,
          profile.full_name,
        ])
      );

      setFollowers(
        (followRows ?? []).map((row) => ({
          student_id: row.student_id,
          created_at: row.created_at,
          full_name: profileMap.get(row.student_id) ?? null,
        }))
      );

      setLoading(false);
    }

    loadFollowers();
  }, [supabase]);

  const filteredFollowers = followers.filter((follower) => {
    const term = search.trim().toLowerCase();

    if (!term) return true;

    return (follower.full_name ?? "Student")
      .toLowerCase()
      .includes(term);
  });

  if (loading) {
    return (
      <main className="min-h-screen bg-white px-4 py-8 text-slate-900 sm:py-10">
        <div className="mx-auto max-w-4xl">
          Loading followers...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/creator/dashboard"
          className="text-sm font-semibold text-slate-600"
        >
          ← Back to dashboard
        </Link>

        <p className="mt-6 text-sm font-medium text-slate-500">
          Examify Creator
        </p>

        <h1 className="mt-1 text-3xl font-bold">
          Followers
        </h1>

        <p className="mt-2 text-sm text-slate-600">
          Students who follow your teacher profile.
        </p>

        <div className="mt-6 rounded-2xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500">
            Total followers
          </p>

          <p className="mt-1 text-3xl font-bold">
            {followers.length}
          </p>
        </div>

        <div className="mt-6">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search followers"
            className="w-full rounded-xl border border-slate-300 px-4 py-3"
          />
        </div>

        <div className="mt-8 space-y-3">
          {filteredFollowers.map((follower) => (
            <div
              key={follower.student_id}
              className="rounded-2xl border border-slate-200 p-5"
            >
              <Link
                href={`/people/${follower.student_id}`}
                className="inline-block font-semibold text-slate-900 transition hover:text-[#2563EB] hover:underline"
              >
                {follower.full_name || "Student"}
              </Link>

              <p className="mt-1 text-xs text-slate-500">
                Followed on{" "}
                {new Date(follower.created_at).toLocaleString()}
              </p>
            </div>
          ))}

          {followers.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center">
              <p className="font-semibold">
                No followers yet.
              </p>

              <p className="mt-2 text-sm text-slate-500">
                Students who follow your public profile will appear here.
              </p>
            </div>
          )}

          {followers.length > 0 &&
            filteredFollowers.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center">
                <p className="font-semibold">
                  No followers found.
                </p>

                <p className="mt-2 text-sm text-slate-500">
                  Try a different search.
                </p>
              </div>
            )}
        </div>

        {message && (
          <p className="mt-5 text-sm text-red-600">
            {message}
          </p>
        )}
      </div>
    </main>
  );
}
