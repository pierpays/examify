"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import ProfilePosts, { type ProfileFeedPost } from "@/components/feed/profile-posts";
import ProfileMediaGallery from "@/components/profile/profile-media-gallery";
import ShareToFeedButton from "@/components/feed/share-to-feed-button";
import ConnectionButton, {
  type ConnectionStatus,
} from "@/components/social/connection-button";

type TeacherProfile = {
  user_id: string;
  display_name: string;
  headline: string | null;
  bio: string | null;
  website_url: string | null;
  profile_image_url: string | null;
  is_verified: boolean;
};


type PublicPersonDetails = {
  career: string | null;
  studying_at: string | null;
  birthday_month: number | null;
  birthday_day: number | null;
};

type PublicProfileMedia = {
  avatar_url: string | null;
  cover_image_url: string | null;
  bio: string | null;
};

type Exam = {
  id: string;
  title: string;
  short_description: string | null;
  cover_image_url: string | null;
  exam_code: string | null;
};

type TeacherInstitution = {
  institution_id: string;
  name: string;
  website_url: string | null;
};

export default function PublicTeacherPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: teacherId } = use(params);
  const supabase = useMemo(() => createClient(), []);

  const [teacher, setTeacher] = useState<TeacherProfile | null>(null);
  const [personDetails, setPersonDetails] = useState<PublicPersonDetails | null>(null);
  const [profileMedia, setProfileMedia] = useState<PublicProfileMedia | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [examSearch, setExamSearch] = useState("");
  const [institutions, setInstitutions] = useState<TeacherInstitution[]>([]);
  const [posts, setPosts] = useState<ProfileFeedPost[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("unavailable");
  const [canMessage, setCanMessage] = useState(false);
  const [canFollowTeacher, setCanFollowTeacher] = useState(true);
  const [minorSafetyApplies, setMinorSafetyApplies] = useState(false);
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [socialActionBusy, setSocialActionBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setCurrentUserId(user?.id ?? "");

      if (user) {
        const { data: canView, error: privacyError } = await supabase.rpc(
          "can_view_profile",
          {
            p_target: teacherId,
            p_viewer: user.id,
          }
        );

        if (privacyError || !canView) {
          setMessage(
            "This teacher has limited profile visibility to accepted connections."
          );
          setLoading(false);
          return;
        }
      }

      if (user) {
        const { data: viewerProfile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();

        setCurrentUserRole(viewerProfile?.role ?? null);

        if (user.id !== teacherId) {
          const [messagePermission, blockedResult, minorSafetyResult, followPermission] =
            await Promise.all([
              supabase.rpc("can_message_user", {
                p_target: teacherId,
              }),
              supabase.rpc("get_my_blocked_users"),
              viewerProfile?.role === "student"
                ? supabase.rpc("student_requires_minor_safety", {
                    p_student_id: user.id,
                  })
                : Promise.resolve({ data: false, error: null }),
              viewerProfile?.role === "student"
                ? supabase.rpc("can_student_follow_teacher", {
                    p_student_id: user.id,
                    p_teacher_id: teacherId,
                  })
                : Promise.resolve({ data: false, error: null }),
            ]);

          setCanMessage(
            !messagePermission.error &&
              Boolean(messagePermission.data)
          );
          setMinorSafetyApplies(
            !minorSafetyResult.error &&
              Boolean(minorSafetyResult.data)
          );
          setCanFollowTeacher(
            viewerProfile?.role === "student" &&
              !followPermission.error &&
              Boolean(followPermission.data)
          );
          setBlockedByMe(
            !blockedResult.error &&
              ((blockedResult.data ?? []) as { user_id: string }[]).some(
                (item) => item.user_id === teacherId
              )
          );

          if (viewerProfile?.role === "teacher") {
            const { data: connectionData } = await supabase
              .rpc("get_connection_profile", {
                p_user_id: teacherId,
              })
              .single();

            if (connectionData) {
              setConnectionStatus(
                (connectionData as { connection_status: ConnectionStatus })
                  .connection_status
              );
            }
          }
        }
      }

      const { data: teacherData, error: teacherError } =
        await supabase
          .from("teacher_profiles")
          .select(`
            user_id,
            display_name,
            headline,
            bio,
            website_url,
            profile_image_url,
            is_verified
          `)
          .eq("user_id", teacherId)
          .eq("is_public", true)
          .single();

      if (teacherError || !teacherData) {
        setMessage(
          teacherError?.message ?? "Teacher not found."
        );
        setLoading(false);
        return;
      }

      setTeacher(teacherData);

      const { data: detailsData, error: detailsError } = await supabase.rpc(
        "get_public_person_profile_details",
        { p_user_id: teacherId }
      );

      if (!detailsError) {
        const details = Array.isArray(detailsData) ? detailsData[0] : detailsData;
        setPersonDetails((details ?? null) as PublicPersonDetails | null);
      }

      const { data: mediaData, error: mediaError } = await supabase.rpc(
        "get_public_profile_media",
        { p_user_id: teacherId }
      );

      if (!mediaError) {
        const media = Array.isArray(mediaData) ? mediaData[0] : mediaData;
        setProfileMedia((media ?? null) as PublicProfileMedia | null);
      }

      const { data: institutionData, error: institutionError } =
        await supabase.rpc("get_teacher_institutions", {
          p_teacher_id: teacherId,
        });

      if (institutionError) {
        setMessage(institutionError.message);
      } else {
        setInstitutions(
          (institutionData ?? []) as TeacherInstitution[]
        );
      }

      if (user && user.id !== teacherId) {
        const { data: followData } = await supabase
          .from("teacher_followers")
          .select("teacher_id")
          .eq("teacher_id", teacherId)
          .eq("student_id", user.id)
          .maybeSingle();

        setIsFollowing(Boolean(followData));
      }

      const { data: examData, error: examError } =
        await supabase
          .from("exams")
          .select("id, title, short_description, cover_image_url, exam_code")
          .eq("teacher_id", teacherId)
          .eq("status", "published")
          .eq("visibility", "public")
          .order("published_at", { ascending: false });

      if (examError) {
        setMessage(examError.message);
        setLoading(false);
        return;
      }

      setExams(examData ?? []);

      const { data: postData, error: postError } = await supabase.rpc(
        "get_profile_feed_posts",
        { p_author_id: teacherId, p_limit: 50 }
      );

      if (postError) {
        setMessage(postError.message);
      } else {
        setPosts((postData ?? []) as ProfileFeedPost[]);
      }

      setLoading(false);
    }

    load();
  }, [teacherId, supabase]);

  async function toggleFollow() {
    if (!currentUserId) {
      window.location.href = "/login";
      return;
    }

    setMessage("");

    if (currentUserRole !== "student") {
      setMessage("Teacher follows are available to student accounts.");
      return;
    }

    const { error } = await supabase.rpc(
      isFollowing
        ? "unfollow_teacher_safely"
        : "follow_teacher_safely",
      { p_teacher_id: teacherId }
    );

    if (error) {
      setMessage(error.message);
      return;
    }

    setIsFollowing(!isFollowing);
  }

  const filteredExams = exams.filter((exam) => {
    const term = examSearch.trim().toLowerCase();

    if (!term) return true;

    return (
      exam.title.toLowerCase().includes(term) ||
      exam.exam_code?.toLowerCase().includes(term) ||
      exam.short_description?.toLowerCase().includes(term)
    );
  });

  async function toggleBlock() {
    if (!teacher || socialActionBusy) return;

    if (!blockedByMe) {
      const confirmed = window.confirm(
        `Block ${teacher.display_name}? You will not be able to message or interact with each other until you unblock them.`
      );
      if (!confirmed) return;
    }

    setSocialActionBusy(true);
    setMessage("");

    const { error } = await supabase.rpc(
      blockedByMe ? "unblock_examify_user" : "block_examify_user",
      { p_user_id: teacher.user_id }
    );

    if (error) {
      setMessage(error.message);
    } else {
      const nextBlocked = !blockedByMe;
      setBlockedByMe(nextBlocked);
      setCanMessage(false);
      setMessage(
        nextBlocked
          ? `${teacher.display_name} has been blocked.`
          : `${teacher.display_name} has been unblocked.`
      );
    }

    setSocialActionBusy(false);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-white px-4 py-8 text-slate-900 sm:py-10">
        <div className="mx-auto max-w-4xl">
          Loading teacher...
        </div>
      </main>
    );
  }

  if (!teacher) {
    return (
      <main className="min-h-screen bg-white px-4 py-8 text-slate-900 sm:py-10">
        <div className="mx-auto max-w-4xl">
          <p className="text-red-600">
            {message || "Teacher not found."}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-4xl">

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
            <div className="-mt-14 flex flex-col gap-4 sm:-mt-16 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end">
                {teacher.profile_image_url ? (
                  <img
                    src={teacher.profile_image_url}
                    alt={`${teacher.display_name} profile`}
                    className="h-28 w-28 shrink-0 rounded-full border-4 border-white bg-white object-contain shadow-md sm:h-32 sm:w-32"
                  />
                ) : (
                  <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-full border-4 border-white bg-blue-100 text-3xl font-bold text-[#1E3A8A] shadow-md sm:h-32 sm:w-32">
                    {teacher.display_name.trim().charAt(0).toUpperCase()}
                  </div>
                )}

                <div className="min-w-0 pb-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-3xl font-bold">
                      {teacher.display_name}
                    </h1>

                    <ShareToFeedButton resourceType="teacher" resourceId={teacher.user_id} label="Share teacher" />

                    {teacher.is_verified && (
                      <span className="rounded-full bg-[#1E3A8A] px-3 py-1 text-xs font-semibold text-white">
                        Verified teacher
                      </span>
                    )}
                  </div>

                  {teacher.headline && (
                    <p className="mt-2 text-slate-600">
                      {teacher.headline}
                    </p>
                  )}
                </div>
              </div>

              {currentUserId === teacher.user_id && (
                <div className="flex w-full pb-2 sm:w-auto">
                  <Link
                    href="/creator/profile"
                    className="w-full rounded-xl bg-[#0F5FEA] px-5 py-3 text-center text-sm font-bold text-white shadow-sm transition hover:bg-[#0B4FCC] sm:w-auto"
                  >
                    Edit profile
                  </Link>
                </div>
              )}

              {currentUserId && currentUserId !== teacher.user_id && (
                <div className="flex w-full flex-col gap-2 pb-2 sm:w-auto sm:flex-row">
                  {currentUserRole === "student" && (
                    <button
                      type="button"
                      onClick={toggleFollow}
                      disabled={!isFollowing && !canFollowTeacher}
                      title={
                        minorSafetyApplies && !canFollowTeacher
                          ? "Minor students can follow only teachers assigned to one of their active classes."
                          : undefined
                      }
                      className={`w-full rounded-xl px-5 py-3 text-sm font-semibold sm:w-auto ${
                        !isFollowing && !canFollowTeacher
                          ? "cursor-not-allowed bg-slate-100 text-slate-400"
                          : isFollowing
                            ? "border border-slate-300 bg-white"
                            : "bg-gradient-to-r from-[#2563EB] to-[#7C3AED] text-white"
                      }`}
                    >
                      {isFollowing
                        ? "Following"
                        : minorSafetyApplies && !canFollowTeacher
                          ? "Class teacher only"
                          : "Follow teacher"}
                    </button>
                  )}

                  {currentUserRole === "teacher" && (
                    <ConnectionButton
                      userId={teacher.user_id}
                      initialStatus={connectionStatus}
                      onChanged={setConnectionStatus}
                    />
                  )}

                  {canMessage && !blockedByMe ? (
                    <Link
                      href={`/messages?user=${teacher.user_id}`}
                      className="w-full rounded-xl border border-blue-200 bg-white px-5 py-3 text-center text-sm font-semibold text-[#0F5FEA] sm:w-auto"
                    >
                      ✉ Message
                    </Link>
                  ) : (
                    <span className="w-full rounded-xl bg-slate-100 px-5 py-3 text-center text-sm font-semibold text-slate-500 sm:w-auto">
                      Messaging unavailable
                    </span>
                  )}

                  <Link
                    href={`/report-user/${teacher.user_id}`}
                    className="w-full rounded-xl border border-red-200 px-5 py-3 text-center text-sm font-semibold text-red-600 sm:w-auto"
                  >
                    Report
                  </Link>

                  <button
                    type="button"
                    disabled={socialActionBusy}
                    onClick={toggleBlock}
                    className="w-full rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 disabled:opacity-50 sm:w-auto"
                  >
                    {blockedByMe ? "Unblock" : "Block"}
                  </button>
                </div>
              )}
            </div>

          {(personDetails?.career || personDetails?.studying_at || (personDetails?.birthday_month && personDetails?.birthday_day)) && (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {personDetails?.career && (
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Career</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">{personDetails.career}</p>
                </div>
              )}

              {personDetails?.studying_at && (
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Giving classes at</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">{personDetails.studying_at}</p>
                </div>
              )}

              {personDetails?.birthday_month && personDetails?.birthday_day && (
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Birthday</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">
                    {new Date(2000, personDetails.birthday_month - 1, personDetails.birthday_day).toLocaleDateString(undefined, { month: "long", day: "numeric" })}
                  </p>
                </div>
              )}
            </div>
          )}

          {teacher.bio && (
            <p className="mt-5 whitespace-pre-wrap text-sm leading-6 text-slate-600">
              {teacher.bio}
            </p>
          )}

          {teacher.website_url && (
            <a
              href={teacher.website_url}
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-block text-sm font-semibold underline"
            >
              Visit website
            </a>
          )}
          </div>
        </section>

        {institutions.length > 0 && (
          <section className="mt-8">
            <h2 className="text-xl font-semibold">
              Institutions
            </h2>

            <p className="mt-1 text-sm text-slate-600">
              Institutions where {teacher.display_name} is an registered teacher.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {institutions.map((institution) => (
                <Link
                  key={institution.institution_id}
                  href={`/institutions/${institution.institution_id}`}
                  className="rounded-2xl border border-slate-200 p-5 transition hover:border-slate-400 hover:shadow-sm"
                >
                  <p className="font-semibold">
                    {institution.name}
                  </p>

                  {institution.website_url && (
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {institution.website_url}
                    </p>
                  )}

                  <p className="mt-4 text-sm font-semibold">
                    View institution →
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="mt-8">
          <h2 className="text-xl font-semibold">Posts</h2>
          <p className="mt-1 text-sm text-slate-600">
            Updates shared by {teacher.display_name}.
          </p>

          <div className="mt-4">
            <ProfilePosts
              posts={posts}
              viewerId={currentUserId}
              viewerRole={currentUserRole}
              onDeleted={(postId) =>
                setPosts((current) =>
                  current.filter((post) => post.id !== postId)
                )
              }
            />
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
          <ProfileMediaGallery
            userId={teacher.user_id}
            title={`Media by ${teacher.display_name}`}
          />
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-semibold">
            Exams by {teacher.display_name}
          </h2>

          <div className="mt-4">
            <label
              htmlFor="teacher-exam-search"
              className="sr-only"
            >
              Search this teacher's exams
            </label>

            <input
              id="teacher-exam-search"
              type="search"
              value={examSearch}
              onChange={(event) => setExamSearch(event.target.value)}
              placeholder="Search exams by name or code"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-900"
            />

            {examSearch.trim() && (
              <p className="mt-2 text-xs text-slate-500">
                {filteredExams.length}{" "}
                {filteredExams.length === 1 ? "exam" : "exams"} found
              </p>
            )}
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {filteredExams.map((exam) => (
              <Link
                key={exam.id}
                href={`/exams/${exam.id}`}
                className="overflow-hidden rounded-2xl border border-slate-200 transition hover:border-slate-400 hover:shadow-sm"
              >
                {exam.cover_image_url && (
                  <img
                    src={exam.cover_image_url}
                    alt={`${exam.title} cover`}
                    className="aspect-video w-full object-cover"
                  />
                )}

                <div className="p-5">
                  {exam.exam_code && (
                    <p className="mb-1 text-xs font-semibold text-slate-500">
                      {exam.exam_code}
                    </p>
                  )}

                  <h3 className="font-semibold">
                    {exam.title}
                  </h3>

                {exam.short_description && (
                  <p className="mt-2 text-sm text-slate-600">
                    {exam.short_description}
                  </p>
                )}

                  <p className="mt-4 text-sm font-semibold">
                    View exam →
                  </p>
                </div>
              </Link>
            ))}

            {exams.length === 0 && (
              <p className="text-sm text-slate-500">
                No published exams yet.
              </p>
            )}

            {exams.length > 0 && filteredExams.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center sm:col-span-2">
                <p className="font-semibold">
                  No matching exams found.
                </p>

                <p className="mt-2 text-sm text-slate-500">
                  Try another exam name or exam code.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
