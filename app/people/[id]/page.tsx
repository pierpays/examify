"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ConnectionButton, {
  type ConnectionStatus,
} from "@/components/social/connection-button";
import ProfilePosts, {
  type ProfileFeedPost,
} from "@/components/feed/profile-posts";
import ProfileMediaGallery from "@/components/profile/profile-media-gallery";

type Profile = {
  user_id: string;
  display_name: string;
  role: "student" | "teacher" | "parent";
  avatar_url: string | null;
  cover_image_url: string | null;
  bio: string | null;
  career: string | null;
  studying_at: string | null;
  birthday: string | null;
  connection_status: ConnectionStatus;
  mutual_count: number;
  connection_count: number;
};

type ConnectionPreview = {
  user_id: string;
  display_name: string;
  role: string;
  avatar_url: string | null;
};

type Tab = "posts" | "media" | "about" | "connections";

function Avatar({
  name,
  src,
}: {
  name: string;
  src: string | null;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className="h-16 w-16 rounded-full object-cover"
      />
    );
  }

  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-xl font-bold text-[#1E3A8A]">
      {name.trim().charAt(0).toUpperCase() || "E"}
    </div>
  );
}

export default function PeopleProfile() {
  const { id } = useParams<{ id: string }>();
  const supabase = useMemo(() => createClient(), []);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [connections, setConnections] = useState<ConnectionPreview[]>([]);
  const [posts, setPosts] = useState<ProfileFeedPost[]>([]);
  const [viewerId, setViewerId] = useState("");
  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("posts");
  const [message, setMessage] = useState("");
  const [canMessage, setCanMessage] = useState(false);
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [socialActionBusy, setSocialActionBusy] = useState(false);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      setViewerId(user.id);

      const { data: viewerProfile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      setViewerRole(viewerProfile?.role ?? null);

      if (user.id !== id) {
        const [messagePermission, blockedResult] = await Promise.all([
          supabase.rpc("can_message_user", { p_target: id }),
          supabase.rpc("get_my_blocked_users"),
        ]);

        setCanMessage(
          !messagePermission.error && Boolean(messagePermission.data)
        );
        setBlockedByMe(
          !blockedResult.error &&
            ((blockedResult.data ?? []) as { user_id: string }[]).some(
              (item) => item.user_id === id
            )
        );
      }

      const [
        profileResult,
        connectionsResult,
        postsResult,
      ] = await Promise.all([
        supabase
          .rpc("get_connection_profile", {
            p_user_id: id,
          })
          .single(),
        supabase.rpc("get_connection_preview", {
          p_user_id: id,
          p_limit: 12,
        }),
        supabase.rpc("get_profile_feed_posts", {
          p_author_id: id,
          p_limit: 30,
        }),
      ]);

      if (profileResult.error) {
        setMessage(
          "This profile is not available to you. The user may have limited profile visibility to connections."
        );
        return;
      }

      setProfile(profileResult.data as Profile);

      if (!connectionsResult.error) {
        setConnections(
          (connectionsResult.data ?? []) as ConnectionPreview[]
        );
      }

      if (!postsResult.error) {
        setPosts(
          (postsResult.data ?? []) as ProfileFeedPost[]
        );
      }
    }

    load();
  }, [id, supabase]);

  function handleConnectionChanged(nextStatus: ConnectionStatus) {
    setProfile((current) => {
      if (!current) return current;

      const wasConnected =
        current.connection_status === "connected";
      const isConnected = nextStatus === "connected";

      return {
        ...current,
        connection_status: nextStatus,
        connection_count:
          Number(current.connection_count) +
          (wasConnected === isConnected
            ? 0
            : isConnected
              ? 1
              : -1),
      };
    });
  }

  async function toggleBlock() {
    if (!profile || socialActionBusy) return;

    if (!blockedByMe) {
      const confirmed = window.confirm(
        `Block ${profile.display_name}? You will not be able to message or interact with each other until you unblock them.`
      );
      if (!confirmed) return;
    }

    setSocialActionBusy(true);
    setMessage("");

    const { error } = await supabase.rpc(
      blockedByMe ? "unblock_examify_user" : "block_examify_user",
      { p_user_id: profile.user_id }
    );

    if (error) {
      setMessage(error.message);
    } else {
      const nextBlocked = !blockedByMe;
      setBlockedByMe(nextBlocked);
      setCanMessage(false);
      setMessage(
        nextBlocked
          ? `${profile.display_name} has been blocked.`
          : `${profile.display_name} has been unblocked.`
      );
    }

    setSocialActionBusy(false);
  }

  if (!profile) {
    return (
      <main className="min-h-screen px-4 py-8">
        <div className="mx-auto max-w-4xl">
          {message ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
              <h1 className="text-xl font-bold">Profile unavailable</h1>
              <p className="mt-2 text-sm text-slate-600">{message}</p>
              <Link href="/connections" className="mt-5 inline-block font-bold text-[#2563EB]">
                Back to connections
              </Link>
            </div>
          ) : (
            "Loading profile..."
          )}
        </div>
      </main>
    );
  }

  const roleLabel =
    profile.role === "teacher"
      ? "Teacher"
      : profile.role === "parent"
        ? "Parent"
        : "Student";

  return (
    <main className="min-h-screen px-3 py-4 text-slate-900 sm:px-5 sm:py-7">
      <div className="mx-auto max-w-5xl">
        <section className="overflow-visible rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="relative h-44 overflow-hidden rounded-t-3xl bg-gradient-to-r from-[#0B2F78] via-[#2563EB] to-[#7C3AED] sm:h-72">
            {profile.cover_image_url && (
              <img
                src={profile.cover_image_url}
                alt=""
                className="h-full w-full object-cover"
              />
            )}
          </div>

          <div className="px-5 pb-0 sm:px-8">
            <div className="relative z-20 -mt-14 flex flex-col gap-4 sm:-mt-20 sm:flex-row sm:items-end">
              <div className="relative z-30 shrink-0">
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={`${profile.display_name} profile`}
                    className="h-28 w-28 rounded-full border-4 border-white bg-white object-contain shadow-md sm:h-40 sm:w-40"
                  />
                ) : (
                  <div className="flex h-28 w-28 items-center justify-center rounded-full border-4 border-white bg-blue-100 text-4xl font-bold text-[#1E3A8A] shadow-md sm:h-40 sm:w-40">
                    {profile.display_name
                      .trim()
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1 pb-3">
                <h1 className="text-3xl font-extrabold sm:text-4xl">
                  {profile.display_name}
                </h1>

                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                  <span className="rounded-full bg-blue-50 px-3 py-1 font-semibold text-[#2563EB]">
                    {roleLabel}
                  </span>
                  <span>
                    {Number(profile.connection_count)}{" "}
                    {Number(profile.connection_count) === 1
                      ? "connection"
                      : "connections"}
                  </span>
                  {Number(profile.mutual_count) > 0 && (
                    <span>
                      · {Number(profile.mutual_count)} mutual
                    </span>
                  )}
                </div>
              </div>

              {viewerId === profile.user_id && (
                <div className="w-full pb-3 sm:w-auto">
                  <Link
                    href={
                      viewerRole === "parent"
                        ? "/parent/profile"
                        : viewerRole === "student"
                          ? "/student/profile"
                          : viewerRole === "teacher"
                            ? "/creator/profile"
                            : "/settings/privacy"
                    }
                    className="block w-full rounded-xl bg-[#0F5FEA] px-5 py-3 text-center text-sm font-bold text-white shadow-sm transition hover:bg-[#0B4FCC] sm:w-auto"
                  >
                    Edit profile
                  </Link>
                </div>
              )}

              {viewerId !== profile.user_id && (
                <div className="w-full pb-3 sm:w-auto">
                  {profile.connection_status === "received" && (
                    <p className="mb-2 rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-[#0F5FEA]">
                      {profile.display_name} sent you a connection request.
                    </p>
                  )}

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <ConnectionButton
                      userId={profile.user_id}
                      initialStatus={profile.connection_status}
                      onChanged={handleConnectionChanged}
                    />

                    {canMessage && !blockedByMe ? (
                      <Link
                        href={`/messages?user=${profile.user_id}`}
                        className="rounded-xl border border-blue-200 bg-white px-4 py-2.5 text-center text-sm font-semibold text-[#0F5FEA]"
                      >
                        ✉ Message
                      </Link>
                    ) : (
                      <span className="rounded-xl bg-slate-100 px-4 py-2.5 text-center text-sm font-semibold text-slate-500">
                        Messaging unavailable
                      </span>
                    )}

                    <Link
                      href={`/report-user/${profile.user_id}`}
                      className="rounded-xl border border-red-200 px-4 py-2.5 text-center text-sm font-semibold text-red-600"
                    >
                      Report
                    </Link>

                    <button
                      type="button"
                      disabled={socialActionBusy}
                      onClick={toggleBlock}
                      className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50"
                    >
                      {blockedByMe ? "Unblock" : "Block"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {profile.bio && (
              <p className="mt-4 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-slate-600">
                {profile.bio}
              </p>
            )}

            <nav className="mt-6 flex gap-1 overflow-x-auto border-t border-slate-200 pt-2">
              {(
                [
                  ["posts", "Posts"],
                  ["media", "Media"],
                  ["about", "About"],
                  ["connections", `Connections (${profile.connection_count})`],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTab(value)}
                  className={`whitespace-nowrap rounded-xl px-4 py-3 text-sm font-bold transition ${
                    tab === value
                      ? "bg-blue-50 text-[#2563EB]"
                      : "text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </nav>
          </div>
        </section>

        {tab === "posts" && (
          <section className="mx-auto mt-6 max-w-3xl">
            <div className="mb-4">
              <h2 className="text-xl font-bold">
                {profile.role === "student"
                  ? "Posts & achievements"
                  : "Posts"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Public activity shared by {profile.display_name}.
              </p>
            </div>

            <ProfilePosts
              posts={posts}
              viewerId={viewerId}
              viewerRole={viewerRole}
              onDeleted={(postId) =>
                setPosts((current) =>
                  current.filter((post) => post.id !== postId)
                )
              }
            />

            {posts.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
                <p className="font-semibold">No public posts yet.</p>
              </div>
            )}
          </section>
        )}

        {tab === "media" && (
          <section className="mx-auto mt-6 max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <ProfileMediaGallery userId={profile.user_id} />
          </section>
        )}

        {tab === "about" && (
          <section className="mx-auto mt-6 max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold">About</h2>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {profile.career && (
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                    Career / profession
                  </p>
                  <p className="mt-2 font-semibold">{profile.career}</p>
                </div>
              )}

              {profile.studying_at && (
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                    Studying at
                  </p>
                  <p className="mt-2 font-semibold">
                    {profile.studying_at}
                  </p>
                </div>
              )}

              {profile.birthday && (
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                    Birthday
                  </p>
                  <p className="mt-2 font-semibold">{profile.birthday}</p>
                </div>
              )}
            </div>

            {!profile.career &&
              !profile.studying_at &&
              !profile.birthday &&
              !profile.bio && (
                <p className="mt-4 text-sm text-slate-500">
                  No public About information yet.
                </p>
              )}
          </section>
        )}

        {tab === "connections" && (
          <section className="mx-auto mt-6 max-w-4xl">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">Connections</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Academic connections visible on this profile.
                </p>
              </div>

              {profile.user_id === viewerId && (
                <Link
                  href="/connections"
                  className="text-sm font-bold text-[#2563EB]"
                >
                  Manage connections
                </Link>
              )}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {connections.map((connection) => (
                <Link
                  key={connection.user_id}
                  href={`/people/${connection.user_id}`}
                  className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-[#2563EB]"
                >
                  <Avatar
                    name={connection.display_name}
                    src={connection.avatar_url}
                  />

                  <div className="min-w-0">
                    <p className="truncate font-bold">
                      {connection.display_name}
                    </p>
                    <p className="mt-1 text-xs capitalize text-slate-500">
                      {connection.role}
                    </p>
                  </div>
                </Link>
              ))}
            </div>

            {connections.length === 0 && (
              <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                No connections to show yet.
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
