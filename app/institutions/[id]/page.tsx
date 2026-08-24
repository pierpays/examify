"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import ProfilePosts, { type ProfileFeedPost } from "@/components/feed/profile-posts";
import ProfileMediaGallery from "@/components/profile/profile-media-gallery";
import ShareToFeedButton from "@/components/feed/share-to-feed-button";

type Institution = {
  name: string;
  description: string | null;
  website_url: string | null;
};

type PublicProfileMedia = {
  avatar_url: string | null;
  cover_image_url: string | null;
  bio: string | null;
};

type Teacher = {
  user_id: string;
  display_name: string;
  headline: string | null;
  profile_image_url: string | null;
};

type Role = "student" | "teacher" | "parent" | "institution" | "admin" | null;

export default function InstitutionPublicPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const supabase = useMemo(() => createClient(), []);
  const [institution, setInstitution] = useState<Institution | null>(null);
  const [profileMedia, setProfileMedia] = useState<PublicProfileMedia | null>(null);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [posts, setPosts] = useState<ProfileFeedPost[]>([]);
  const [role, setRole] = useState<Role>(null);
  const [currentUserId, setCurrentUserId] = useState("");
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [updating, setUpdating] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      const { data: canView, error: privacyError } = await supabase.rpc(
        "can_view_profile",
        {
          p_target: id,
          p_viewer: user.id,
        }
      );

      if (privacyError || !canView) {
        setMessage(
          "This institution profile is not available under its current privacy settings."
        );
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("institution_profiles")
        .select("name, description, website_url")
        .eq("user_id", id)
        .eq("is_public", true)
        .maybeSingle();

      if (error || !data) {
        setMessage(error?.message ?? "Institution not found.");
        setLoading(false);
        return;
      }

      setInstitution(data as Institution);

      const { data: mediaData } = await supabase.rpc(
        "get_public_profile_media",
        { p_user_id: id }
      );
      const media = Array.isArray(mediaData) ? mediaData[0] : mediaData;
      setProfileMedia((media ?? null) as PublicProfileMedia | null);

      const { data: teacherData } = await supabase.rpc(
        "get_institution_teachers",
        { p_institution_id: id }
      );
      setTeachers((teacherData ?? []) as Teacher[]);

      const { data: countData } = await supabase.rpc(
        "get_institution_follower_count",
        { p_institution_id: id }
      );
      setFollowerCount(Number(countData ?? 0));

      const { data: postData, error: postError } = await supabase.rpc(
        "get_profile_feed_posts",
        { p_author_id: id, p_limit: 50 }
      );

      if (postError) {
        setMessage(postError.message);
      } else {
        setPosts((postData ?? []) as ProfileFeedPost[]);
      }

      if (user) {
        setCurrentUserId(user.id);

        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();

        const currentRole = (profile?.role as Role) ?? null;
        setRole(currentRole);

        if (["student", "teacher", "parent"].includes(currentRole ?? "")) {
          const { data: follow } = await supabase
            .from("institution_followers")
            .select("institution_id")
            .eq("institution_id", id)
            .eq("follower_id", user.id)
            .maybeSingle();

          setIsFollowing(Boolean(follow));
        }
      }

      setLoading(false);
    }

    load();
  }, [id, supabase]);

  async function toggleFollow() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

    setUpdating(true);
    setMessage("");

    if (isFollowing) {
      const { error } = await supabase
        .from("institution_followers")
        .delete()
        .eq("institution_id", id)
        .eq("follower_id", user.id);

      if (error) {
        setMessage(error.message);
        setUpdating(false);
        return;
      }

      setIsFollowing(false);
      setFollowerCount((count) => Math.max(0, count - 1));
    } else {
      const { error } = await supabase
        .from("institution_followers")
        .insert({ institution_id: id, follower_id: user.id });

      if (error) {
        setMessage(error.message);
        setUpdating(false);
        return;
      }

      setIsFollowing(true);
      setFollowerCount((count) => count + 1);
    }

    setUpdating(false);
  }

  if (loading) {
    return <main className="min-h-screen bg-white p-8 text-slate-900">Loading institution...</main>;
  }

  if (!institution) {
    return (
      <main className="min-h-screen bg-white px-4 py-8 text-slate-900">
        <div className="mx-auto max-w-5xl">
          <Link href="/institutions" className="text-sm font-semibold text-slate-600">
            ← Back to institutions
          </Link>
          <p className="mt-6 text-red-600">{message || "Institution not found."}</p>
        </div>
      </main>
    );
  }

  const canFollow = role === "student" || role === "teacher" || role === "parent";

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <Link href="/institutions" className="text-sm font-semibold text-slate-600">
          ← Back to institutions
        </Link>

        <section className="mt-6 overflow-visible rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="h-44 overflow-hidden rounded-t-3xl bg-gradient-to-r from-[#0B2F78] via-[#2563EB] to-[#7C3AED] sm:h-64">
            {profileMedia?.cover_image_url && (
              <img
                src={profileMedia.cover_image_url}
                alt=""
                className="h-full w-full object-cover"
              />
            )}
          </div>

          <div className="px-5 pb-6 sm:px-7">
            <div className="-mt-12 flex flex-col gap-4 sm:-mt-16 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end">
                {profileMedia?.avatar_url ? (
                  <img
                    src={profileMedia.avatar_url}
                    alt={`${institution.name} logo`}
                    className="h-24 w-24 rounded-2xl border-4 border-white bg-white object-cover shadow-md sm:h-32 sm:w-32"
                  />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-2xl border-4 border-white bg-blue-100 text-3xl font-bold text-[#1E3A8A] shadow-md sm:h-32 sm:w-32">
                    {institution.name.trim().charAt(0).toUpperCase()}
                  </div>
                )}

                <div className="min-w-0 pb-2">
                  <p className="text-sm font-medium text-slate-500">
                    Examify Institution
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-3">
                    <h1 className="text-3xl font-bold sm:text-4xl">
                      {institution.name}
                    </h1>
                    <ShareToFeedButton resourceType="institution" resourceId={id} label="Share institution" />
                    <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">
                      Verified institution
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-slate-500">
                    {followerCount} {followerCount === 1 ? "follower" : "followers"}
                  </p>
                </div>
              </div>

              {currentUserId === id && (
                <div className="flex w-full pb-2 sm:w-auto">
                  <Link
                    href="/institution/profile"
                    className="w-full rounded-xl bg-[#0F5FEA] px-5 py-3 text-center text-sm font-bold text-white shadow-sm transition hover:bg-[#0B4FCC] sm:w-auto"
                  >
                    Edit profile
                  </Link>
                </div>
              )}

              {currentUserId && currentUserId !== id && (
                <div className="flex w-full flex-col gap-2 pb-2 sm:w-auto sm:flex-row">
                  {canFollow && (
                    <button
                      type="button"
                      onClick={toggleFollow}
                      disabled={updating}
                      className={`w-full rounded-xl px-5 py-3 font-semibold disabled:opacity-50 sm:w-auto ${
                        isFollowing
                          ? "border border-slate-300 bg-white text-slate-900"
                          : "bg-gradient-to-r from-[#2563EB] to-[#7C3AED] text-white"
                      }`}
                    >
                      {updating
                        ? "Updating..."
                        : isFollowing
                          ? "Following"
                          : "Follow institution"}
                    </button>
                  )}

                  <Link
                    href={`/report-user/${id}`}
                    className="w-full rounded-xl border border-red-200 px-5 py-3 text-center text-sm font-semibold text-red-600 sm:w-auto"
                  >
                    Report
                  </Link>
                </div>
              )}
            </div>
          </div>
        </section>

        {institution.description && (
          <p className="mt-5 max-w-3xl whitespace-pre-wrap text-slate-600">
            {institution.description}
          </p>
        )}

        {institution.website_url && (
          <a
            href={institution.website_url}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-block text-sm font-semibold underline underline-offset-4"
          >
            Visit website ↗
          </a>
        )}

        <section className="mt-10">
          <h2 className="text-2xl font-semibold">Posts</h2>
          <p className="mt-1 text-sm text-slate-500">
            Updates shared by {institution.name}.
          </p>

          <div className="mt-5 max-w-3xl">
            <ProfilePosts
              posts={posts}
              viewerId={currentUserId}
              viewerRole={role}
              onDeleted={(postId) =>
                setPosts((current) =>
                  current.filter((post) => post.id !== postId)
                )
              }
            />
          </div>
        </section>

        <section className="mt-10 max-w-3xl rounded-2xl border border-slate-200 bg-white p-5">
          <ProfileMediaGallery
            userId={id}
            title={`Media by ${institution.name}`}
          />
        </section>

        <section className="mt-10">
          <h2 className="text-2xl font-semibold">Teachers</h2>
          <p className="mt-1 text-sm text-slate-500">
            Only teachers who accepted this institution's request are shown publicly.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {teachers.map((teacher) => (
              <Link
                key={teacher.user_id}
                href={`/teachers/${teacher.user_id}`}
                className="rounded-2xl border border-slate-200 p-5 transition hover:border-slate-400 hover:shadow-sm"
              >
                {teacher.profile_image_url ? (
                  <img
                    src={teacher.profile_image_url}
                    alt=""
                    className="h-14 w-14 rounded-full border border-slate-200 object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-lg font-bold text-slate-500">
                    {teacher.display_name.trim().charAt(0).toUpperCase()}
                  </div>
                )}

                <h3 className="mt-3 font-semibold">{teacher.display_name}</h3>
                {teacher.headline && (
                  <p className="mt-1 text-sm text-slate-600">{teacher.headline}</p>
                )}
              </Link>
            ))}

            {teachers.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center sm:col-span-2 lg:col-span-3">
                <p className="font-semibold">No teachers are listed yet.</p>
              </div>
            )}
          </div>
        </section>

        {message && <p className="mt-6 text-sm text-red-600">{message}</p>}
      </div>
    </main>
  );
}
