"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Membership = {
  institution_id: string;
  institution_name: string;
  member_id: string;
  member_name: string;
  relationship_type: "parent" | "student";
  is_parent: boolean;
};

type InstitutionGroup = {
  institution_id: string;
  institution_name: string;
  members: Membership[];
};

export default function ParentInstitutionsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [groups,setGroups]=useState<InstitutionGroup[]>([]);
  const [selected,setSelected]=useState<Record<string,string[]>>({});
  const [working,setWorking]=useState("");
  const [message,setMessage]=useState("");
  const [loading,setLoading]=useState(true);

  async function load() {
    const { data:{user} }=await supabase.auth.getUser();
    if(!user){window.location.href="/login";return;}

    const {data,error}=await supabase.rpc("get_parent_institution_memberships");
    if(error){setMessage(error.message);setLoading(false);return;}

    const map=new Map<string,InstitutionGroup>();
    for(const row of (data??[]) as Membership[]){
      if(!map.has(row.institution_id)){
        map.set(row.institution_id,{
          institution_id:row.institution_id,
          institution_name:row.institution_name,
          members:[]
        });
      }
      map.get(row.institution_id)!.members.push(row);
    }
    setGroups([...map.values()]);
    setLoading(false);
  }

  useEffect(()=>{load();},[]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(institutionId:string,memberId:string){
    setSelected(current=>{
      const values=current[institutionId]??[];
      return {
        ...current,
        [institutionId]:values.includes(memberId)
          ? values.filter(id=>id!==memberId)
          : [...values,memberId]
      };
    });
  }

  async function leave(group:InstitutionGroup){
    const ids=selected[group.institution_id]??[];
    if(!ids.length){setMessage("Choose yourself and/or the child who should leave.");return;}

    const names=group.members.filter(m=>ids.includes(m.member_id)).map(m=>m.member_name).join(", ");
    if(!window.confirm(`Remove ${names} from ${group.institution_name}? Current institution-class memberships for selected students will also end. Historical exams, messages and reports will be preserved.`)) return;

    setWorking(group.institution_id);setMessage("");
    const {error}=await supabase.rpc("parent_leave_institution",{
      p_institution_id:group.institution_id,
      p_member_ids:ids
    });
    setWorking("");
    if(error){setMessage(error.message);return;}
    setSelected(current=>({...current,[group.institution_id]:[]}));
    setMessage("Institution membership updated.");
    await load();
  }

  if(loading)return <main className="min-h-screen bg-[#F5F7FB] px-4 py-8"><div className="mx-auto max-w-5xl">Loading institutions...</div></main>;

  return <main className="min-h-screen bg-[#F5F7FB] px-4 py-8 text-slate-900">
    <div className="mx-auto max-w-5xl">
      <Link href="/parent/dashboard" className="text-sm font-semibold text-slate-600">← Back to dashboard</Link>
      <p className="mt-6 text-sm font-medium text-slate-500">Examify Parent</p>
      <h1 className="mt-1 text-3xl font-extrabold">Institution memberships</h1>
      <p className="mt-2 text-sm text-slate-600">Manage your family's active institution memberships. Following an institution is separate from being enrolled or registered with it.</p>
      <Link href="/institutions" className="mt-5 inline-block rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white">Browse institutions</Link>

      <div className="mt-8 space-y-4">
        {groups.map(group=><article key={group.institution_id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-bold">{group.institution_name}</h2>
              <Link href={`/institutions/${group.institution_id}`} className="mt-1 inline-block text-sm font-semibold text-[#0F5FEA]">View institution</Link>
            </div>
          </div>

          <div className="mt-5 space-y-2">
            {group.members.map(member=><label key={member.member_id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-3">
              <input
                type="checkbox"
                checked={(selected[group.institution_id]??[]).includes(member.member_id)}
                onChange={()=>toggle(group.institution_id,member.member_id)}
                className="h-5 w-5"
              />
              <span>
                <span className="block font-semibold">{member.member_name}</span>
                <span className="text-xs capitalize text-slate-500">{member.is_parent ? "Your parent membership" : "Student membership"}</span>
              </span>
            </label>)}
          </div>

          <button
            type="button"
            disabled={working===group.institution_id}
            onClick={()=>leave(group)}
            className="mt-5 w-full rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 disabled:opacity-50 sm:w-auto"
          >
            {working===group.institution_id ? "Updating..." : "Leave / remove from institution"}
          </button>
        </article>)}

        {!groups.length&&<div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="font-semibold">Your family has no active institution memberships.</p>
          <p className="mt-2 text-sm text-slate-500">You can still follow institutions without being enrolled or registered with them.</p>
        </div>}
      </div>

      {message&&<p className="mt-5 rounded-xl bg-blue-50 p-3 text-sm text-blue-800">{message}</p>}
    </div>
  </main>;
}
