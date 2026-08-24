"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Institution = {
  user_id: string;
  name: string;
  description: string | null;
};

export default function FollowingInstitutionsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }

      const { data: follows, error: followsError } = await supabase
        .from("institution_followers")
        .select("institution_id, created_at")
        .eq("follower_id", user.id)
        .order("created_at", { ascending: false });

      if (followsError) { setMessage(followsError.message); setLoading(false); return; }
      const ids=(follows??[]).map(item=>item.institution_id);
      if (!ids.length) { setLoading(false); return; }

      const { data, error } = await supabase
        .from("institution_profiles")
        .select("user_id, name, description")
        .in("user_id", ids)
        .eq("is_public", true);

      if (error) { setMessage(error.message); setLoading(false); return; }
      const map=new Map((data??[]).map(item=>[item.user_id,item]));
      setInstitutions(ids.map(id=>map.get(id)).filter((item): item is Institution => Boolean(item)));
      setLoading(false);
    }
    load();
  }, [supabase]);

  async function unfollow(institutionId:string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("institution_followers").delete().eq("follower_id",user.id).eq("institution_id",institutionId);
    if (error) { setMessage(error.message); return; }
    setInstitutions(current=>current.filter(item=>item.user_id!==institutionId));
  }

  if (loading) return <main className="min-h-screen bg-white px-4 py-8 text-slate-900"><div className="mx-auto max-w-5xl">Loading institutions...</div></main>;

  return <main className="min-h-screen bg-white px-4 py-8 text-slate-900 sm:py-10"><div className="mx-auto max-w-5xl">
    <Link href="/student/dashboard" className="text-sm font-semibold text-slate-600">← Back to dashboard</Link>
    <p className="mt-6 text-sm font-medium text-slate-500">Examify Student</p>
    <h1 className="mt-1 text-3xl font-bold">Following institutions</h1>
    <p className="mt-2 text-sm text-slate-600">Institutions you follow on Examify.</p>
    <Link href="/institutions" className="mt-5 inline-block rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white">Discover institutions</Link>
    <div className="mt-8 grid gap-4 sm:grid-cols-2">{institutions.map(inst=><article key={inst.user_id} className="rounded-2xl border border-slate-200 p-5"><h2 className="text-xl font-semibold">{inst.name}</h2>{inst.description&&<p className="mt-2 line-clamp-3 text-sm text-slate-600">{inst.description}</p>}<div className="mt-5 flex flex-col gap-2 sm:flex-row"><Link href={`/institutions/${inst.user_id}`} className="w-full rounded-xl bg-slate-900 px-4 py-3 text-center text-sm font-semibold text-white sm:w-auto">View institution</Link><button type="button" onClick={()=>unfollow(inst.user_id)} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold sm:w-auto">Unfollow</button></div></article>)}
      {!institutions.length&&<div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center sm:col-span-2"><p className="font-semibold">You are not following any institutions yet.</p><p className="mt-2 text-sm text-slate-500">Discover institutions and follow the ones you want to keep up with.</p></div>}
    </div>
    {message&&<p className="mt-5 text-sm text-red-600">{message}</p>}
  </div></main>;
}
