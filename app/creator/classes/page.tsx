"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type ClassRow={group_id:string;class_name:string;academic_year:string;institution_id:string;institution_name:string};
type Student={user_id:string;display_name:string;avatar_url:string|null;membership_status:string|null};

export default function TeacherClassesPage(){
  const supabase=useMemo(()=>createClient(),[]);
  const [classes,setClasses]=useState<ClassRow[]>([]);
  const [selected,setSelected]=useState("");
  const [query,setQuery]=useState("");
  const [students,setStudents]=useState<Student[]>([]);
  const [message,setMessage]=useState("");
  const [loading,setLoading]=useState(true);

  async function load(){
    const {data,error}=await supabase.rpc("get_my_assigned_institution_classes");
    if(error){setMessage(error.message);setLoading(false);return;}
    const rows=(data??[]) as ClassRow[];setClasses(rows);
    if(rows[0]&&!selected)setSelected(rows[0].group_id);
    setLoading(false);
  }
  useEffect(()=>{load();},[]);

  async function search(){
    if(!selected)return;
    setMessage("");
    const {data,error}=await supabase.rpc("search_students_for_assigned_class",{p_group_id:selected,p_query:query,p_limit:100});
    if(error){setMessage(error.message);return;}
    setStudents((data??[]) as Student[]);
  }

  async function add(studentId:string){
    const {error}=await supabase.rpc("add_student_to_institution_class",{p_group_id:selected,p_student_id:studentId});
    if(error){setMessage(error.message);return;}await search();
  }
  async function remove(studentId:string){
    const {error}=await supabase.rpc("remove_student_from_institution_class",{p_group_id:selected,p_student_id:studentId});
    if(error){setMessage(error.message);return;}await search();
  }

  if(loading)return <main className="p-6">Loading classes...</main>;
  const current=classes.find(c=>c.group_id===selected);

  return <main className="min-h-screen bg-[#F5F7FB] px-4 py-6 text-slate-900">
    <div className="mx-auto max-w-5xl">
      <p className="text-sm font-bold text-[#0F5FEA]">Teacher</p>
      <h1 className="mt-1 text-3xl font-extrabold">My institution classes</h1>
      <p className="mt-2 text-sm text-slate-600">Manage the students in classes your institution assigned to you.</p>
      {message&&<p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{message}</p>}

      <div className="mt-6 grid gap-5 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-extrabold">Assigned classes</h2>
          <div className="mt-3 space-y-2">
            {classes.map(c=><button key={c.group_id} onClick={()=>{setSelected(c.group_id);setStudents([]);setQuery("");}} className={`w-full rounded-xl p-3 text-left ${selected===c.group_id?"bg-blue-50 text-[#0F5FEA]":"hover:bg-slate-50"}`}>
              <p className="font-bold">{c.class_name}</p><p className="mt-1 text-xs">{c.academic_year} · {c.institution_name}</p>
            </button>)}
            {!classes.length&&<p className="text-sm text-slate-500">Your institution has not assigned you to a class yet.</p>}
          </div>
        </aside>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {current?<><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-extrabold uppercase text-[#0F5FEA]">{current.academic_year}</p><h2 className="mt-1 text-xl font-extrabold">{current.class_name}</h2><p className="text-sm text-slate-500">{current.institution_name}</p></div><Link href={`/groups/${current.group_id}`} className="rounded-xl border px-4 py-2 text-sm font-bold">Open class</Link></div>
          <div className="mt-5 flex gap-2"><input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")search();}} placeholder="Search students registered with this institution" className="min-w-0 flex-1 rounded-xl border px-4 py-3"/><button onClick={search} className="rounded-xl bg-[#0F5FEA] px-4 text-sm font-bold text-white">Search</button></div>
          <p className="mt-2 text-xs text-slate-500">For student safety, only students registered with {current.institution_name} can appear here.</p>
          <div className="mt-4 space-y-2">{students.map(s=><div key={s.user_id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3"><div className="min-w-0"><Link href={`/people/${s.user_id}`} className="font-bold hover:text-[#0F5FEA]">{s.display_name}</Link><p className="text-xs text-slate-500">{s.membership_status==="active"?"Already in this class":"Registered student"}</p></div>{s.membership_status==="active"?<button onClick={()=>remove(s.user_id)} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-600">Remove</button>:<button onClick={()=>add(s.user_id)} className="rounded-lg bg-[#0F5FEA] px-3 py-2 text-xs font-bold text-white">Add to class</button>}</div>)}</div>
          </>:<p className="text-sm text-slate-500">Select an assigned class.</p>}
        </section>
      </div>
    </div>
  </main>;
}
