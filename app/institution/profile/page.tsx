"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { uploadProfileMedia } from "@/lib/profile-media-client";

type InstitutionProfile = {
  name: string;
  description: string | null;
  physical_address: string | null;
  contact_email: string | null;
  website_url: string | null;
  phone_number: string | null;
  verification_status: "pending" | "approved" | "rejected";
};

export default function InstitutionProfilePage() {
  const supabase = useMemo(() => createClient(), []);
  const [uid, setUid] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<InstitutionProfile["verification_status"]>("approved");
  const [logoUrl, setLogoUrl] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [coverPreview, setCoverPreview] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUid(user.id);

      const { data: accountProfile } = await supabase
        .from("profiles")
        .select("avatar_url, cover_image_url")
        .eq("id", user.id)
        .maybeSingle();

      setLogoUrl(accountProfile?.avatar_url ?? "");
      setCoverUrl(accountProfile?.cover_image_url ?? "");

      const { data, error } = await supabase
        .from("institution_profiles")
        .select("name, description, physical_address, contact_email, website_url, phone_number, verification_status")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error || !data) {
        setMessage(error?.message ?? "Institution profile not found.");
        return;
      }

      const profile = data as InstitutionProfile;
      setName(profile.name ?? user.user_metadata.full_name ?? "");
      setDescription(profile.description ?? "");
      setAddress(profile.physical_address ?? "");
      setEmail(profile.contact_email ?? user.email ?? "");
      setWebsite(profile.website_url ?? "");
      setPhone(profile.phone_number ?? "");
      setStatus(profile.verification_status);
    }

    void load();
  }, [supabase]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    let normalizedWebsite = website.trim();
    if (normalizedWebsite && !/^https?:\/\//i.test(normalizedWebsite)) normalizedWebsite = `https://${normalizedWebsite}`;

    try {
      new URL(normalizedWebsite);
    } catch {
      setMessage("Please enter a valid institution website.");
      setSaving(false);
      return;
    }

    let nextLogoUrl: string | null = logoUrl || null;
    let nextCoverUrl: string | null = coverUrl || null;

    try {
      if (logoFile) {
        nextLogoUrl = await uploadProfileMedia(
          supabase,
          uid,
          logoFile,
          "logo"
        );
      }

      if (coverFile) {
        nextCoverUrl = await uploadProfileMedia(
          supabase,
          uid,
          coverFile,
          "cover"
        );
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to upload institution images."
      );
      setSaving(false);
      return;
    }

    const { error: mediaError } = await supabase
      .from("profiles")
      .update({
        avatar_url: nextLogoUrl,
        cover_image_url: nextCoverUrl,
      })
      .eq("id", uid);

    if (mediaError) {
      setMessage(mediaError.message);
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from("institution_profiles")
      .update({
        name: name.trim(),
        description: description.trim() || null,
        physical_address: address.trim(),
        contact_email: email.trim(),
        website_url: normalizedWebsite,
        phone_number: phone.trim(),
      })
      .eq("user_id", uid);

    if (error) {
      setMessage(error.message);
      setSaving(false);
      return;
    }

    const { data: refreshed } = await supabase
      .from("institution_profiles")
      .select("verification_status")
      .eq("user_id", uid)
      .maybeSingle();

    const nextStatus = (refreshed?.verification_status ?? status) as InstitutionProfile["verification_status"];
    setStatus(nextStatus);
    setSaving(false);

    if (nextStatus !== "approved") {
      window.location.href = "/institution/verification";
      return;
    }

    setMessage("Institution profile saved.");
  }

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-2xl">
        <Link href="/institution/dashboard" className="text-sm font-semibold text-slate-600">← Back to dashboard</Link>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold">Institution profile</h1>
          <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">Verified</span>
        </div>
        <p className="mt-2 text-sm text-slate-600">Manage the information associated with your verified institution.</p>

        <section className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="h-40 bg-gradient-to-r from-[#0B2F78] via-[#2563EB] to-[#7C3AED] sm:h-52">
            {(coverPreview || coverUrl) && (
              <img
                src={coverPreview || coverUrl}
                alt="Institution cover preview"
                className="h-full w-full object-cover"
              />
            )}
          </div>

          <div className="relative z-10 px-5 pb-5">
            <div className="relative z-20 -mt-12">
              {logoPreview || logoUrl ? (
                <img
                  src={logoPreview || logoUrl}
                  alt="Institution logo preview"
                  className="relative z-20 h-24 w-24 rounded-2xl border-4 border-white bg-white object-cover shadow-sm"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-2xl border-4 border-white bg-blue-100 text-3xl font-bold text-[#1E3A8A] shadow-sm">
                  {name.trim().charAt(0).toUpperCase() || "I"}
                </div>
              )}
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold">
                Institution logo
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    if (logoPreview) URL.revokeObjectURL(logoPreview);
                    setLogoFile(file);
                    setLogoPreview(file ? URL.createObjectURL(file) : "");
                  }}
                  className="mt-2 block w-full text-sm font-normal"
                />
              </label>

              <label className="text-sm font-semibold">
                Cover photo
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    if (coverPreview) URL.revokeObjectURL(coverPreview);
                    setCoverFile(file);
                    setCoverPreview(file ? URL.createObjectURL(file) : "");
                  }}
                  className="mt-2 block w-full text-sm font-normal"
                />
              </label>
            </div>
          </div>
        </section>

        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Verification-sensitive information</p>
          <p className="mt-1">Changing the institution name, physical address, contact email, website, or phone number will temporarily return the account to Pending verification until an admin reviews the new information. Updating only the description does not require re-verification.</p>
        </div>

        <form onSubmit={save} className="mt-6 space-y-5">
          <label className="block text-sm font-medium">Institution name<input required value={name} onChange={(event) => setName(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" /></label>
          <label className="block text-sm font-medium">Description<textarea rows={5} value={description} onChange={(event) => setDescription(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" /></label>
          <label className="block text-sm font-medium">Physical address<textarea required rows={3} value={address} onChange={(event) => setAddress(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" /></label>
          <label className="block text-sm font-medium">Institution email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" /></label>
          <label className="block text-sm font-medium">Website<input required value={website} onChange={(event) => setWebsite(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" /></label>
          <label className="block text-sm font-medium">Phone number<input required type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" /></label>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button disabled={saving} className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Save profile"}</button>
            {uid && status === "approved" && <Link href={`/institutions/${uid}`} className="text-center text-sm font-semibold text-slate-600">View public profile →</Link>}
          </div>

          {message && <p className="text-sm text-slate-600">{message}</p>}
        </form>
      </div>
    </main>
  );
}
