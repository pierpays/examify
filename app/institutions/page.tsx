"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Institution = {
  user_id: string;
  name: string;
  description: string | null;
  website_url: string | null;
};

type Role = "student" | "teacher" | "parent" | "institution" | "admin" | null;

export default function InstitutionsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [role, setRole] = useState<Role>(null);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: institutionData, error } = await supabase
        .from("institution_profiles")
        .select("user_id, name, description, website_url")
        .eq("is_public", true)
        .order("name");

      if (error) {
        setMessage(error.message);
        return;
      }

      setInstitutions((institutionData ?? []) as Institution[]);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      setRole((profile?.role as Role) ?? null);

      if (["student", "teacher", "parent"].includes(profile?.role ?? "")) {
        const { data: follows } = await supabase
          .from("institution_followers")
          .select("institution_id")
          .eq("follower_id", user.id);

        setFollowedIds(
          new Set((follows ?? []).map((item) => item.institution_id))
        );
      }
    }

    load();
  }, [supabase]);

  async function toggleFollow(institutionId: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

    setUpdatingId(institutionId);
    setMessage("");

    if (followedIds.has(institutionId)) {
      const { error } = await supabase
        .from("institution_followers")
        .delete()
        .eq("institution_id", institutionId)
        .eq("follower_id", user.id);

      if (error) {
        setMessage(error.message);
        setUpdatingId(null);
        return;
      }

      setFollowedIds((current) => {
        const next = new Set(current);
        next.delete(institutionId);
        return next;
      });
    } else {
      const { error } = await supabase
        .from("institution_followers")
        .insert({ institution_id: institutionId, follower_id: user.id });

      if (error) {
        setMessage(error.message);
        setUpdatingId(null);
        return;
      }

      setFollowedIds((current) => new Set([...current, institutionId]));
    }

    setUpdatingId(null);
  }

  const backHref =
    role === "teacher" || role === "admin"
      ? "/creator/dashboard"
      : role === "parent"
        ? "/parent/dashboard"
        : role === "institution"
          ? "/institution/dashboard"
          : "/student/dashboard";

  const filtered = institutions.filter((institution) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return (
      institution.name.toLowerCase().includes(term) ||
      institution.description?.toLowerCase().includes(term)
    );
  });

  const canFollow = role === "student" || role === "teacher" || role === "parent";

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <Link href={backHref} className="text-sm font-semibold text-slate-600">
          ← Back to dashboard
        </Link>

        <p className="mt-6 text-sm font-medium text-slate-500">Examify</p>
        <h1 className="mt-1 text-3xl font-bold">Institutions</h1>
        <p className="mt-2 text-sm text-slate-600">
          Discover institutions, view their teachers, and follow the ones you want to keep up with.
        </p>

        <div className="mt-6">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search institutions"
            className="w-full rounded-xl border border-slate-300 px-4 py-3"
          />
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {filtered.map((institution) => {
            const following = followedIds.has(institution.user_id);
            return (
              <article key={institution.user_id} className="rounded-2xl border border-slate-200 p-5">
                <h2 className="text-xl font-semibold">{institution.name}</h2>
                {institution.description && (
                  <p className="mt-2 line-clamp-3 text-sm text-slate-600">
                    {institution.description}
                  </p>
                )}

                <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                  <Link
                    href={`/institutions/${institution.user_id}`}
                    className="w-full rounded-xl bg-slate-900 px-4 py-3 text-center text-sm font-semibold text-white sm:w-auto"
                  >
                    View institution
                  </Link>

                  {canFollow && (
                    <button
                      type="button"
                      disabled={updatingId === institution.user_id}
                      onClick={() => toggleFollow(institution.user_id)}
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold disabled:opacity-50 sm:w-auto"
                    >
                      {updatingId === institution.user_id
                        ? "Updating..."
                        : following
                          ? "Following"
                          : "Follow"}
                    </button>
                  )}
                </div>
              </article>
            );
          })}

          {filtered.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center sm:col-span-2">
              <p className="font-semibold">No institutions found.</p>
            </div>
          )}
        </div>

        {message && <p className="mt-5 text-sm text-red-600">{message}</p>}
      </div>
    </main>
  );
}
