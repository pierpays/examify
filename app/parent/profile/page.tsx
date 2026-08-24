"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { uploadProfileMedia } from "@/lib/profile-media-client";

export default function ParentProfilePage() {
  const supabase = useMemo(() => createClient(), []);

  const [fullName, setFullName] = useState("");
  const [bio, setBio] = useState("");
  const [career, setCareer] = useState("");
  const [studyingAt, setStudyingAt] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [showBirthday, setShowBirthday] = useState(false);

  const [avatarUrl, setAvatarUrl] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [coverPreview, setCoverPreview] = useState("");

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select(
          "full_name, bio, avatar_url, cover_image_url, career, studying_at, date_of_birth, show_birthday"
        )
        .eq("id", user.id)
        .single();

      if (error) {
        setMessage(error.message);
        setLoading(false);
        return;
      }

      setFullName(data.full_name ?? "");
      setBio(data.bio ?? "");
      setAvatarUrl(data.avatar_url ?? "");
      setCoverUrl(data.cover_image_url ?? "");
      setCareer(data.career ?? "");
      setStudyingAt(data.studying_at ?? "");
      setDateOfBirth(data.date_of_birth ?? "");
      setShowBirthday(Boolean(data.show_birthday));
      setLoading(false);
    }

    loadProfile();
  }, [supabase]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

    try {
      let nextAvatarUrl = avatarUrl || null;
      let nextCoverUrl = coverUrl || null;

      if (avatarFile) {
        nextAvatarUrl = await uploadProfileMedia(
          supabase,
          user.id,
          avatarFile,
          "avatar"
        );
      }

      if (coverFile) {
        nextCoverUrl = await uploadProfileMedia(
          supabase,
          user.id,
          coverFile,
          "cover"
        );
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim() || null,
          bio: bio.trim() || null,
          avatar_url: nextAvatarUrl,
          cover_image_url: nextCoverUrl,
          career: career.trim() || null,
          studying_at: studyingAt.trim() || null,
          date_of_birth: dateOfBirth || null,
          show_birthday: showBirthday,
        })
        .eq("id", user.id);

      if (error) throw error;

      setAvatarUrl(nextAvatarUrl ?? "");
      setCoverUrl(nextCoverUrl ?? "");
      setAvatarFile(null);
      setCoverFile(null);
      setMessage("Profile saved.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to save profile."
      );
    } finally {
      setSaving(false);
    }
  }

  async function resetPassword() {
    setResettingPassword(true);
    setMessage("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user?.email) {
      setMessage("Unable to find your account email.");
      setResettingPassword(false);
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(
      user.email,
      {
        redirectTo: `${window.location.origin}/reset-password`,
      }
    );

    setMessage(error?.message ?? "Password reset email sent.");
    setResettingPassword(false);
  }

  if (loading) {
    return (
      <main className="min-h-screen px-4 py-10">
        <div className="mx-auto max-w-3xl">Loading profile...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/parent/dashboard"
          className="text-sm font-semibold text-[#2563EB]"
        >
          ← Back to dashboard
        </Link>

        <p className="mt-6 text-sm font-semibold text-[#2563EB]">
          Examify Parent
        </p>
        <h1 className="mt-1 text-3xl font-bold">Edit profile</h1>
        <p className="mt-2 text-sm text-slate-600">
          Personalize the social profile other Examify users see.
        </p>

        <form onSubmit={saveProfile} className="mt-8 space-y-6">
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="relative h-36 bg-gradient-to-r from-[#0B2F78] via-[#2563EB] to-[#7C3AED] sm:h-52">
              {(coverPreview || coverUrl) && (
                <img
                  src={coverPreview || coverUrl}
                  alt="Cover preview"
                  className="h-full w-full object-cover"
                />
              )}
            </div>

            <div className="px-5 pb-6 sm:px-7">
              <div className="relative z-10 -mt-12 flex flex-col gap-4 sm:-mt-16 sm:flex-row sm:items-end">
                <div className="shrink-0">
                  {avatarPreview || avatarUrl ? (
                    <img
                      src={avatarPreview || avatarUrl}
                      alt="Profile preview"
                      className="relative z-20 h-24 w-24 rounded-full border-4 border-white bg-white object-cover shadow-sm sm:h-32 sm:w-32"
                    />
                  ) : (
                    <div className="relative z-20 flex h-24 w-24 items-center justify-center rounded-full border-4 border-white bg-blue-100 text-3xl font-bold text-[#1E3A8A] shadow-sm sm:h-32 sm:w-32">
                      {fullName.trim().charAt(0).toUpperCase() || "P"}
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1 pb-1">
                  <p className="text-xl font-bold">
                    {fullName || "Your profile"}
                  </p>
                  <p className="text-sm text-slate-500">
                    Parent profile
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold">
                  Profile picture
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
                      setAvatarFile(file);
                      setAvatarPreview(file ? URL.createObjectURL(file) : "");
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

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">About</h2>
            <div className="mt-5 space-y-5">
              <label className="block text-sm font-semibold">
                Full name
                <input
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal"
                />
              </label>

              <label className="block text-sm font-semibold">
                About me
                <textarea
                  rows={4}
                  maxLength={1000}
                  value={bio}
                  onChange={(event) => setBio(event.target.value)}
                  placeholder="Tell the Examify community a little about yourself."
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal"
                />
              </label>

              <div className="grid gap-5 sm:grid-cols-2">
                <label className="block text-sm font-semibold">
                  Career / profession
                  <input
                    value={career}
                    onChange={(event) => setCareer(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal"
                  />
                </label>

                <label className="block text-sm font-semibold">
                  Studying at
                  <input
                    value={studyingAt}
                    onChange={(event) => setStudyingAt(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal"
                  />
                </label>
              </div>

              <label className="block text-sm font-semibold">
                Date of birth
                <input
                  type="date"
                  value={dateOfBirth}
                  onChange={(event) => setDateOfBirth(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal"
                />
                <span className="mt-2 block text-xs font-normal text-slate-500">
                  Your birth year remains private. Public birthday display only
                  uses month and day.
                </span>
              </label>

              <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4">
                <input
                  type="checkbox"
                  checked={showBirthday}
                  onChange={(event) => setShowBirthday(event.target.checked)}
                  className="mt-0.5 h-5 w-5"
                />
                <span>
                  <span className="block text-sm font-semibold">
                    Show birthday publicly
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">
                    Month and day only.
                  </span>
                </span>
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">Account security</h2>
            <p className="mt-2 text-sm text-slate-600">
              Send a password reset link to your account email.
            </p>
            <button
              type="button"
              onClick={resetPassword}
              disabled={resettingPassword}
              className="mt-4 rounded-xl border border-slate-300 px-5 py-3 font-semibold disabled:opacity-50"
            >
              {resettingPassword ? "Sending..." : "Reset password"}
            </button>
          </section>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              disabled={saving}
              className="rounded-xl bg-gradient-to-r from-[#2563EB] to-[#7C3AED] px-5 py-3 font-bold text-white disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save profile"}
            </button>

            <Link
              href="/connections"
              className="rounded-xl border border-slate-300 px-5 py-3 text-center font-semibold"
            >
              View connections
            </Link>
          </div>

          {message && (
            <p className="text-sm text-slate-600">{message}</p>
          )}
        </form>
      </div>
    </main>
  );
}
