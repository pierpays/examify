"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Candidate={id:string;display_name:string;role:string};
type Relationship={
  relationship_id:string;
  member_id:string;
  display_name:string;
  relationship_type:"teacher"|"student"|"parent";
  status:string;
};

export default function InstitutionMembersPage(){
  const supabase=useMemo(()=>createClient(),[]);
  const [role,setRole]=useState("teacher");
  const [query,setQuery]=useState("");
  const [results,setResults]=useState<Candidate[]>([]);
  const [relationships,setRelationships]=useState<Relationship[]>([]);
  const [message,setMessage]=useState("");
  const [workingId,setWorkingId]=useState("");

  async function load(){
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){window.location.href="/login";return;}
    const {data,error}=await supabase.rpc("get_institution_member_directory");
    if(error){setMessage(error.message);return;}
    setRelationships((data??[]) as Relationship[]);
  }

  useEffect(()=>{load();},[]); // eslint-disable-line react-hooks/exhaustive-deps

  async function search(){
    setMessage("");
    const {data,error}=await supabase.rpc("search_institution_candidates",{p_query:query,p_role:role});
    if(error){setMessage(error.message);return;}
    setResults((data??[]) as Candidate[]);
  }

  async function add(candidate:Candidate){
    setWorkingId(candidate.id);setMessage("");
    const {data,error}=await supabase.rpc("send_institution_relationship_request",{p_member_id:candidate.id,p_relationship_type:role});
    setWorkingId("");
    if(error){setMessage(error.message);return;}
    const route=(data?.[0] as {approval_route?:string}|undefined)?.approval_route;
    setMessage(route==="parent"
      ? `Request for ${candidate.display_name} was sent for parent/guardian approval.`
      : `Request sent to ${candidate.display_name}.`);
    await load();
  }

  async function remove(rel:Relationship){
    const action=rel.status==="accepted" ? "Remove" : "Cancel";
    if(!window.confirm(`${action} ${rel.display_name} ${rel.status==="accepted" ? "from this institution" : "request"}? ${rel.status==="accepted" && (rel.relationship_type==="teacher"||rel.relationship_type==="student") ? "Their current institution-class assignments will also be removed. " : ""}Historical records will be preserved.`)) return;
    setWorkingId(rel.relationship_id);setMessage("");
    const {error}=await supabase.rpc("remove_institution_member",{p_relationship_id:rel.relationship_id});
    setWorkingId("");
    if(error){setMessage(error.message);return;}
    setMessage(`${rel.display_name} was removed from the active institution relationship.`);
    await load();
  }

  const active=relationships.filter(r=>r.status==="accepted");
  const requests=relationships.filter(r=>r.status!=="accepted");

  return <main className="min-h-screen bg-[#F5F7FB] px-4 py-8 text-slate-900">
    <div className="mx-auto max-w-4xl">
      <Link href="/institution/dashboard" className="font-semibold text-slate-600">← Back to dashboard</Link>
      <h1 className="mt-6 text-3xl font-extrabold">People & requests</h1>
      <p className="mt-2 text-sm text-slate-600">Add teachers, students, and parents. You can also remove active members from the institution. Removing a teacher or student ends their current institution-class assignments but preserves historical records.</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-[auto_1fr_auto]">
        <select value={role} onChange={e=>setRole(e.target.value)} className="rounded-xl border px-4 py-3">
          <option value="teacher">Add as teacher</option>
          <option value="student">Add as student</option>
          <option value="parent">Add as parent</option>
        </select>
        <input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")search();}} placeholder="Search by name" className="rounded-xl border px-4 py-3"/>
        <button type="button" onClick={search} className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white">Search</button>
      </div>

      <div className="mt-5 space-y-3">{results.map(candidate=><div key={candidate.id} className="flex flex-col gap-3 rounded-2xl border bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="font-semibold">{candidate.display_name}</p><p className="text-xs capitalize text-slate-500">{candidate.role}</p></div>
        <button type="button" disabled={workingId===candidate.id} onClick={()=>add(candidate)} className="rounded-xl border px-4 py-2 font-semibold disabled:opacity-50">{workingId===candidate.id?"Sending...":`Add as ${role}`}</button>
      </div>)}</div>

      <h2 className="mt-10 text-xl font-bold">Active members</h2>
      <div className="mt-4 space-y-3">
        {active.map(rel=><div key={rel.relationship_id} className="flex flex-col gap-3 rounded-2xl border bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="font-semibold">{rel.display_name}</p><p className="text-xs capitalize text-slate-500">{rel.relationship_type}</p></div>
          <button type="button" disabled={workingId===rel.relationship_id} onClick={()=>remove(rel)} className="rounded-xl border border-red-300 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 disabled:opacity-50">{workingId===rel.relationship_id?"Removing...":`Remove ${rel.relationship_type}`}</button>
        </div>)}
        {!active.length&&<p className="text-sm text-slate-500">No active members yet.</p>}
      </div>

      <h2 className="mt-10 text-xl font-bold">Requests</h2>
      <div className="mt-4 space-y-3">
        {requests.map(rel=><div key={rel.relationship_id} className="flex flex-col gap-3 rounded-xl border bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="font-semibold">{rel.display_name}</p><p className="text-xs capitalize text-slate-500">{rel.relationship_type} · {rel.status}</p></div>
          {rel.status==="pending"&&<button type="button" disabled={workingId===rel.relationship_id} onClick={()=>remove(rel)} className="rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-50">Cancel request</button>}
        </div>)}
        {!requests.length&&<p className="text-sm text-slate-500">No pending or previous requests.</p>}
      </div>

      {message&&<p className="mt-5 rounded-xl bg-blue-50 p-3 text-sm text-blue-800">{message}</p>}
    </div>
  </main>;
}
