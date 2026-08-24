"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Campaign = {
  id: string;
  advertiser_name: string;
  title: string;
  body: string | null;
  image_url: string | null;
  destination_url: string;
  cta_text: string;
  placement_feed: boolean;
  placement_right_rail: boolean;
  status: "draft" | "active" | "paused" | "ended";
  starts_at: string | null;
  ends_at: string | null;
  impressions: number;
  clicks: number;
};

const blank = {
  advertiser_name: "",
  title: "",
  body: "",
  image_url: "",
  destination_url: "",
  cta_text: "Learn more",
  placement_feed: true,
  placement_right_rail: false,
  status: "draft" as Campaign["status"],
  starts_at: "",
  ends_at: "",
};

function localDate(value:string|null) {
  if(!value) return "";
  const d=new Date(value), offset=d.getTimezoneOffset();
  return new Date(d.getTime()-offset*60000).toISOString().slice(0,16);
}

export default function AdvertisingAdminPage() {
  const supabase=useMemo(()=>createClient(),[]);
  const [campaigns,setCampaigns]=useState<Campaign[]>([]);
  const [form,setForm]=useState(blank);
  const [editingId,setEditingId]=useState<string|null>(null);
  const [image,setImage]=useState<File|null>(null);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState("");

  async function load(){
    const {data,error}=await supabase.rpc("admin_list_ad_campaigns");
    if(error){setMessage(error.message);return;}
    setCampaigns((data??[]) as Campaign[]);
  }
  useEffect(()=>{load();},[]); // eslint-disable-line react-hooks/exhaustive-deps

  function edit(c:Campaign){
    setEditingId(c.id); setImage(null);
    setForm({
      advertiser_name:c.advertiser_name,title:c.title,body:c.body??"",
      image_url:c.image_url??"",destination_url:c.destination_url,
      cta_text:c.cta_text,placement_feed:c.placement_feed,
      placement_right_rail:c.placement_right_rail,status:c.status,
      starts_at:localDate(c.starts_at),ends_at:localDate(c.ends_at)
    });
    window.scrollTo({top:0,behavior:"smooth"});
  }

  async function save(e:FormEvent){
    e.preventDefault(); setSaving(true); setMessage("");
    let imageUrl=form.image_url;

    if(image){
      if(!image.type.startsWith("image/") || image.size>5*1024*1024){
        setSaving(false);setMessage("Ad images must be image files no larger than 5 MB.");return;
      }
      const ext=image.name.split(".").pop()?.replace(/[^a-z0-9]/gi,"")||"jpg";
      const path=`${crypto.randomUUID()}.${ext}`;
      const {error}=await supabase.storage.from("ad-images").upload(path,image,{contentType:image.type});
      if(error){setSaving(false);setMessage(error.message);return;}
      imageUrl=supabase.storage.from("ad-images").getPublicUrl(path).data.publicUrl;
    }

    const {error}=await supabase.rpc("admin_save_ad_campaign",{
      p_id:editingId,
      p_advertiser_name:form.advertiser_name,
      p_title:form.title,
      p_body:form.body||null,
      p_image_url:imageUrl||null,
      p_destination_url:form.destination_url,
      p_cta_text:form.cta_text,
      p_placement_feed:form.placement_feed,
      p_placement_right_rail:form.placement_right_rail,
      p_status:form.status,
      p_starts_at:form.starts_at?new Date(form.starts_at).toISOString():null,
      p_ends_at:form.ends_at?new Date(form.ends_at).toISOString():null,
    });
    setSaving(false);
    if(error){setMessage(error.message);return;}
    setForm(blank);setEditingId(null);setImage(null);setMessage("Campaign saved.");
    await load();
  }

  async function remove(id:string){
    if(!window.confirm("Delete this advertising campaign and its tracking history?")) return;
    const {error}=await supabase.rpc("admin_delete_ad_campaign",{p_id:id});
    if(error){setMessage(error.message);return;}
    await load();
  }

  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
    <div className="mx-auto max-w-6xl">
      <Link href="/admin/dashboard" className="text-sm font-bold text-[#0F5FEA]">← Admin dashboard</Link>
      <h1 className="mt-5 text-3xl font-extrabold">Advertising</h1>
      <p className="mt-2 text-sm text-slate-600">Manage Examify sponsored campaigns. Feed ads appear after every 5 regular user posts. Right-rail ads replace Your Streak.</p>

      <form onSubmit={save} className="mt-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-xl font-bold">{editingId?"Edit campaign":"Create campaign"}</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold">Advertiser<input required value={form.advertiser_name} onChange={e=>setForm({...form,advertiser_name:e.target.value})} className="mt-2 w-full rounded-xl border px-4 py-3 font-normal"/></label>
          <label className="text-sm font-semibold">Ad title<input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})} className="mt-2 w-full rounded-xl border px-4 py-3 font-normal"/></label>
        </div>
        <label className="mt-4 block text-sm font-semibold">Body<textarea rows={3} value={form.body} onChange={e=>setForm({...form,body:e.target.value})} className="mt-2 w-full rounded-xl border px-4 py-3 font-normal"/></label>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold">Destination URL<input type="url" required value={form.destination_url} onChange={e=>setForm({...form,destination_url:e.target.value})} className="mt-2 w-full rounded-xl border px-4 py-3 font-normal"/></label>
          <label className="text-sm font-semibold">CTA text<input value={form.cta_text} onChange={e=>setForm({...form,cta_text:e.target.value})} className="mt-2 w-full rounded-xl border px-4 py-3 font-normal"/></label>
        </div>
        <label className="mt-4 block text-sm font-semibold">Ad image<input type="file" accept="image/*" onChange={e=>setImage(e.target.files?.[0]??null)} className="mt-2 block w-full text-sm"/></label>
        {form.image_url&&<img src={form.image_url} alt="" className="mt-3 h-36 w-full max-w-md rounded-xl object-cover"/>}

        <div className="mt-5 flex flex-wrap gap-5">
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={form.placement_feed} onChange={e=>setForm({...form,placement_feed:e.target.checked})}/> Feed</label>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={form.placement_right_rail} onChange={e=>setForm({...form,placement_right_rail:e.target.checked})}/> Right rail</label>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <label className="text-sm font-semibold">Status<select value={form.status} onChange={e=>setForm({...form,status:e.target.value as Campaign["status"]})} className="mt-2 w-full rounded-xl border bg-white px-4 py-3 font-normal"><option value="draft">Draft</option><option value="active">Active</option><option value="paused">Paused</option><option value="ended">Ended</option></select></label>
          <label className="text-sm font-semibold">Starts<input type="datetime-local" value={form.starts_at} onChange={e=>setForm({...form,starts_at:e.target.value})} className="mt-2 w-full rounded-xl border px-4 py-3 font-normal"/></label>
          <label className="text-sm font-semibold">Ends<input type="datetime-local" value={form.ends_at} onChange={e=>setForm({...form,ends_at:e.target.value})} className="mt-2 w-full rounded-xl border px-4 py-3 font-normal"/></label>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <button disabled={saving} className="rounded-xl bg-[#0F5FEA] px-5 py-3 font-bold text-white disabled:opacity-50">{saving?"Saving...":editingId?"Save changes":"Create campaign"}</button>
          {editingId&&<button type="button" onClick={()=>{setEditingId(null);setForm(blank);setImage(null)}} className="rounded-xl border px-5 py-3 font-bold">Cancel edit</button>}
        </div>
      </form>

      {message&&<p className="mt-5 rounded-xl bg-blue-50 p-3 text-sm text-blue-800">{message}</p>}

      <section className="mt-8">
        <h2 className="text-xl font-bold">Campaigns</h2>
        <div className="mt-4 space-y-3">
          {campaigns.map(c=><article key={c.id} className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2"><h3 className="font-extrabold">{c.title}</h3><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold capitalize">{c.status}</span></div>
                <p className="mt-1 text-sm text-slate-500">{c.advertiser_name} · {c.placement_feed?"Feed ":""}{c.placement_right_rail?"Right rail":""}</p>
                <p className="mt-2 text-sm font-semibold">{Number(c.impressions)} impressions · {Number(c.clicks)} clicks</p>
              </div>
              <div className="flex gap-2"><button onClick={()=>edit(c)} className="rounded-xl border px-4 py-2 text-sm font-bold">Edit</button><button onClick={()=>remove(c.id)} className="rounded-xl border border-red-200 px-4 py-2 text-sm font-bold text-red-600">Delete</button></div>
            </div>
          </article>)}
          {!campaigns.length&&<p className="rounded-2xl border border-dashed bg-white p-8 text-center text-sm text-slate-500">No advertising campaigns yet.</p>}
        </div>
      </section>
    </div>
  </main>;
}
