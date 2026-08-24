"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { uploadProfileMedia } from "@/lib/profile-media-client";

type TeacherInstitution = {
  institution_id: string;
  name: string;
  website_url: string | null;
};

export default function CreatorProfilePage() {
  const supabase = useMemo(() => createClient(), []);

  const [displayName, setDisplayName] = useState("");
  const [headline, setHeadline] = useState("");
  const [career, setCareer] = useState("");
  const [studyingAt, setStudyingAt] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [showBirthday, setShowBirthday] = useState(false);
  const [bio, setBio] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [profileImageUrl, setProfileImageUrl] = useState("");
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null);
  const [profileImagePreview, setProfileImagePreview] = useState("");
  const [removeProfileImage, setRemoveProfileImage] = useState(false);
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [coverImageFile, setCoverImageFile] = useState<File | null>(null);
  const [coverImagePreview, setCoverImagePreview] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [institutions, setInstitutions] = useState<TeacherInstitution[]>([]);
  const [leavingInstitutionId, setLeavingInstitutionId] = useState<string | null>(null);

  useEffect(() => {
    async function loadProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      const { data: personalProfile, error: personalProfileError } = await supabase
        .from("profiles")
        .select("career, studying_at, date_of_birth, show_birthday, cover_image_url")
        .eq("id", user.id)
        .maybeSingle();

      if (personalProfileError) {
        setMessage(personalProfileError.message);
        setLoading(false);
        return;
      }

      setCareer(personalProfile?.career ?? "");
      setStudyingAt(personalProfile?.studying_at ?? "");
      setDateOfBirth(personalProfile?.date_of_birth ?? "");
      setShowBirthday(Boolean(personalProfile?.show_birthday));
      setCoverImageUrl(personalProfile?.cover_image_url ?? "");

      const { data, error } = await supabase
        .from("teacher_profiles")
        .select("display_name, headline, bio, website_url, profile_image_url")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        setMessage(error.message);
        setLoading(false);
        return;
      }

      if (data) {
        setDisplayName(data.display_name ?? "");
        setHeadline(data.headline ?? "");
        setBio(data.bio ?? "");
        setWebsiteUrl(data.website_url ?? "");
        setProfileImageUrl(data.profile_image_url ?? "");
      }

      const { data: institutionData, error: institutionError } =
        await supabase.rpc("get_teacher_institutions", {
          p_teacher_id: user.id,
        });

      if (institutionError) {
        setMessage(institutionError.message);
      } else {
        setInstitutions(
          (institutionData ?? []) as TeacherInstitution[]
        );
      }

      setLoading(false);
    }

    loadProfile();
  }, [supabase]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setMessage("You must be logged in.");
      setSaving(false);
      return;
    }

    let finalProfileImageUrl: string | null =
      removeProfileImage ? null : profileImageUrl || null;

    if (profileImageFile) {
      const extension =
        profileImageFile.name.split(".").pop()?.toLowerCase() || "jpg";

      const filePath =
        `${user.id}/${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("teacher-profile-images")
        .upload(filePath, profileImageFile, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        setMessage(uploadError.message);
        setSaving(false);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from("teacher-profile-images")
        .getPublicUrl(filePath);

      finalProfileImageUrl = publicUrlData.publicUrl;
    }

    let finalCoverImageUrl: string | null = coverImageUrl || null;

    if (coverImageFile) {
      try {
        finalCoverImageUrl = await uploadProfileMedia(
          supabase,
          user.id,
          coverImageFile,
          "cover"
        );
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Unable to upload cover photo."
        );
        setSaving(false);
        return;
      }
    }

    const { error: personalProfileError } = await supabase
      .from("profiles")
      .update({
        career: career.trim() || null,
        studying_at: studyingAt.trim() || null,
        date_of_birth: dateOfBirth || null,
        show_birthday: showBirthday,
        avatar_url: finalProfileImageUrl,
        cover_image_url: finalCoverImageUrl,
      })
      .eq("id", user.id);

    if (personalProfileError) {
      setMessage(personalProfileError.message);
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from("teacher_profiles")
      .upsert({
        user_id: user.id,
        display_name: displayName.trim(),
        headline: headline.trim() || null,
        bio: bio.trim() || null,
        website_url: websiteUrl.trim() || null,
        profile_image_url: finalProfileImageUrl,
        is_public: true,
      });

    if (error) {
      setMessage(error.message);
      setSaving(false);
      return;
    }

    setMessage("Teacher profile saved.");
    setSaving(false);
  }

  async function leaveInstitution(institution: TeacherInstitution) {
    const confirmed = window.confirm(
      `Remove ${institution.name} from your teacher profile? You will no longer be listed as one of its teachers.`
    );

    if (!confirmed) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

    setLeavingInstitutionId(institution.institution_id);
    setMessage("");

    const { error } = await supabase
      .from("institution_relationships")
      .delete()
      .eq("institution_id", institution.institution_id)
      .eq("member_id", user.id)
      .eq("relationship_type", "teacher")
      .eq("status", "accepted");

    if (error) {
      setMessage(error.message);
      setLeavingInstitutionId(null);
      return;
    }

    setInstitutions((current) =>
      current.filter(
        (item) => item.institution_id !== institution.institution_id
      )
    );
    setMessage(`Removed ${institution.name}.`);
    setLeavingInstitutionId(null);
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
      },
    );

    if (error) {
      setMessage(error.message);
      setResettingPassword(false);
      return;
    }

    setMessage("Password reset email sent.");
    setResettingPassword(false);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-white px-4 py-10 text-slate-900">
        <div className="mx-auto max-w-2xl">
          Loading profile...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-2xl">
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
          Teacher profile
        </h1>

        <p className="mt-2 text-sm text-slate-600">
          This information will appear on your public instructor profile.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="h-40 bg-gradient-to-r from-[#0B2F78] via-[#2563EB] to-[#7C3AED] sm:h-52">
              {(coverImagePreview || coverImageUrl) && (
                <img
                  src={coverImagePreview || coverImageUrl}
                  alt="Teacher cover preview"
                  className="h-full w-full object-cover"
                />
              )}
            </div>

            <div className="relative z-10 p-5">
              <label className="text-sm font-semibold">
                Cover photo
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;

                    if (coverImagePreview) {
                      URL.revokeObjectURL(coverImagePreview);
                    }

                    setCoverImageFile(file);
                    setCoverImagePreview(
                      file ? URL.createObjectURL(file) : ""
                    );
                  }}
                  className="mt-2 block w-full text-sm font-normal"
                />
              </label>
              <p className="mt-2 text-xs text-slate-500">
                A wide image works best. Maximum file size: 10 MB.
              </p>
            </div>
          </section>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Profile picture
            </label>

            {!removeProfileImage &&
              (profileImagePreview || profileImageUrl) && (
                <div className="mb-4">
                  <img
                    src={profileImagePreview || profileImageUrl}
                    alt="Teacher profile preview"
                    className="h-28 w-28 rounded-full border border-slate-200 object-cover"
                  />
                </div>
              )}

            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;

                if (profileImagePreview) {
                  URL.revokeObjectURL(profileImagePreview);
                }

                setProfileImageFile(file);
                setRemoveProfileImage(false);
                setProfileImagePreview(
                  file ? URL.createObjectURL(file) : ""
                );
              }}
              className="block w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
            />

            {(profileImageUrl || profileImagePreview) &&
              !removeProfileImage && (
                <button
                  type="button"
                  onClick={() => {
                    if (profileImagePreview) {
                      URL.revokeObjectURL(profileImagePreview);
                    }

                    setProfileImageFile(null);
                    setProfileImagePreview("");
                    setRemoveProfileImage(true);
                  }}
                  className="mt-3 rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600"
                >
                  Remove picture
                </button>
              )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Display name
            </label>

            <input
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
              placeholder="Your public instructor name"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Headline
            </label>

            <input
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
              placeholder="AWS and Networking Instructor"
            />
          </div>

          <section className="rounded-2xl border border-slate-200 p-5">
            <h2 className="text-lg font-semibold">Professional & academic details</h2>
            <p className="mt-2 text-sm text-slate-600">
              These details help students understand your background. Your birth year is never shown publicly.
            </p>

            <div className="mt-5 space-y-5">
              <div>
                <label className="mb-2 block text-sm font-medium">Career / profession</label>
                <input
                  value={career}
                  onChange={(e) => setCareer(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3"
                  placeholder="Example: Cloud architect, Network engineer"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">Studying at</label>
                <input
                  value={studyingAt}
                  onChange={(e) => setStudyingAt(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3"
                  placeholder="University, college, or training institution"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">Date of birth</label>
                <input
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3"
                />
              </div>

              <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4">
                <input
                  type="checkbox"
                  checked={showBirthday}
                  onChange={(e) => setShowBirthday(e.target.checked)}
                  className="mt-0.5 h-5 w-5"
                />
                <span>
                  <span className="block text-sm font-semibold">Show birthday publicly</span>
                  <span className="mt-1 block text-xs text-slate-500">Only month and day are shown; your birth year stays private.</span>
                </span>
              </label>
            </div>
          </section>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Bio
            </label>

            <textarea
              rows={6}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
              placeholder="Tell students about your experience..."
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Website
            </label>

            <input
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
              placeholder="https://example.com"
            />
          </div>

          <section className="rounded-2xl border border-slate-200 p-5">
            <h2 className="text-lg font-semibold">
              Institutions
            </h2>

            <p className="mt-2 text-sm text-slate-600">
              Institutions where you are an accepted teacher. You can belong to multiple institutions and leave any of them at any time.
            </p>

            <div className="mt-4 space-y-3">
              {institutions.map((institution) => (
                <div
                  key={institution.institution_id}
                  className="rounded-xl border border-slate-200 p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <Link
                        href={`/institutions/${institution.institution_id}`}
                        className="font-semibold underline-offset-4 hover:underline"
                      >
                        {institution.name}
                      </Link>

                      {institution.website_url && (
                        <p className="mt-1 truncate text-xs text-slate-500">
                          {institution.website_url}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={
                        leavingInstitutionId === institution.institution_id
                      }
                      onClick={() => leaveInstitution(institution)}
                      className="w-full rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 disabled:opacity-50 sm:w-auto"
                    >
                      {leavingInstitutionId === institution.institution_id
                        ? "Removing..."
                        : "Remove institution"}
                    </button>
                  </div>
                </div>
              ))}

              {institutions.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center">
                  <p className="text-sm font-semibold">
                    No institutions yet.
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Accepted institution requests will appear here.
                  </p>
                </div>
              )}
            </div>
          </section>

          <div className="rounded-2xl border border-slate-200 p-5">
            <h2 className="text-lg font-semibold">
              Password
            </h2>

            <p className="mt-2 text-sm text-slate-600">
              Send a secure password-reset link to your account email.
            </p>

            <button
              type="button"
              onClick={resetPassword}
              disabled={resettingPassword}
              className="mt-4 w-full rounded-xl border border-slate-300 px-5 py-3 font-semibold disabled:opacity-50 sm:w-auto"
            >
              {resettingPassword
                ? "Sending..."
                : "Reset password"}
            </button>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              disabled={saving}
              className="w-full rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white disabled:opacity-50 sm:w-auto"
            >
              {saving ? "Saving..." : "Save profile"}
            </button>

            <Link
              href="/creator/dashboard"
              className="w-full rounded-xl border border-slate-300 px-5 py-3 text-center font-semibold sm:w-auto"
            >
              Cancel
            </Link>
          </div>

          {message && (
            <p className="text-sm text-slate-600">
              {message}
            </p>
          )}
        </form>
      </div>
    </main>
  );
}
