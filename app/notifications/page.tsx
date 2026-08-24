"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Notification = {
  id: string;
  notification_type:
    | "post_reaction"
    | "post_comment"
    | "child_exam_result"
    | "user_safety_report"
    | "connection_request"
    | "connection_accepted"
    | "post_mention"
    | "post_shared"
    | "event_invite"
    | "birthday_congrats"
    | "anniversary_congrats"
    | "achievement_congrats"
    | "group_invite"
    | "group_join_request"
    | "group_join_approved"
    | "group_comment"
    | "group_reaction"
    | "group_content_report"
    | "institution_request"
    | "institution_child_request"
    | "institution_request_accepted"
    | "institution_request_rejected";
  user_report_id: string | null;
  event_id: string | null;
  group_id: string | null;
  group_post_id: string | null;
  group_comment_id: string | null;
  institution_relationship_id: string | null;
  exam_attempt_id: string | null;
  exam_title: string | null;
  exam_score: number | null;
  exam_passing_score: number | null;
  post_id: string | null;
  comment_id: string | null;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  read_at: string | null;
  created_at: string;
};

export default function NotificationsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function loadNotifications() {
    const { data, error } = await supabase.rpc("get_my_notifications", {
      p_limit: 100,
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setNotifications((data ?? []) as Notification[]);
    setLoading(false);
  }

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      await loadNotifications();
    }

    load();

    let channel: ReturnType<typeof supabase.channel> | null = null;

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;

      channel = supabase
        .channel(`notifications-page:${user.id}:${crypto.randomUUID()}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            loadNotifications();
            window.dispatchEvent(
              new Event("examify:notifications-updated")
            );
          }
        )
        .subscribe();
    });

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  async function markAllRead() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("read_at", null);

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadNotifications();
    window.dispatchEvent(new Event("examify:notifications-updated"));
  }

  async function openNotification(notification: Notification) {
    if (!notification.read_at) {
      await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", notification.id);

      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id
            ? { ...item, read_at: new Date().toISOString() }
            : item
        )
      );
      window.dispatchEvent(new Event("examify:notifications-updated"));
    }

    if (
      notification.notification_type === "institution_child_request"
    ) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        window.location.href =
          profile?.role === "parent"
            ? "/parent/requests"
            : "/student/institution-requests";
      }
      return;
    }

    if (notification.notification_type === "institution_request") {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        window.location.href =
          profile?.role === "teacher"
            ? "/creator/institution-requests"
            : profile?.role === "parent"
              ? "/parent/requests"
              : "/student/institution-requests";
      }
      return;
    }

    if (
      notification.notification_type === "institution_request_accepted" ||
      notification.notification_type === "institution_request_rejected"
    ) {
      window.location.href = "/institution/members";
      return;
    }

    if (notification.notification_type === "child_exam_result" && notification.actor_id) {
      window.location.href = `/parent/children/${notification.actor_id}`;
      return;
    }

    if (notification.notification_type === "user_safety_report") {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
        window.location.href = profile?.role === "institution" ? "/institution/safety-reports" : "/parent/safety-reports";
      }
      return;
    }

    if (
      notification.notification_type === "achievement_congrats" &&
      notification.post_id
    ) {
      window.location.href = `/feed#post-${notification.post_id}`;
      return;
    }

    if (
      (notification.notification_type === "birthday_congrats" ||
        notification.notification_type === "anniversary_congrats") &&
      notification.actor_id
    ) {
      window.location.href = `/people/${notification.actor_id}`;
      return;
    }

    if (
      [
        "group_invite",
        "group_join_request",
        "group_join_approved",
        "group_comment",
        "group_reaction",
        "group_content_report",
      ].includes(notification.notification_type) &&
      notification.group_id
    ) {
      window.location.href = `/groups/${notification.group_id}`;
      return;
    }

    if (notification.notification_type === "event_invite" && notification.event_id) {
      window.location.href = `/events/${notification.event_id}`;
      return;
    }

    if ((notification.notification_type === "connection_request" || notification.notification_type === "connection_accepted") && notification.actor_id) {
      window.location.href = notification.actor_role === "teacher" ? `/teachers/${notification.actor_id}` : `/people/${notification.actor_id}`;
      return;
    }

    if (notification.post_id) {
      window.location.href = `/feed#post-${notification.post_id}`;
    }
  }

  const unread = notifications.filter((item) => !item.read_at).length;

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
        <div className="mx-auto max-w-3xl">Loading notifications...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/feed"
          className="mb-6 inline-block text-sm font-semibold text-slate-600"
        >
          ← Back to feed
        </Link>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Examify</p>
            <h1 className="mt-1 text-3xl font-bold">Notifications</h1>
            <p className="mt-2 text-sm text-slate-600">
              Social activity and academic updates that matter to you.
            </p>
          </div>

          {unread > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold"
            >
              Mark all as read
            </button>
          )}
        </div>

        <div className="mt-8 space-y-3">
          {notifications.map((notification) => {
            const action =
              notification.notification_type === "institution_child_request"
                ? "sent an institution membership request that requires parent or guardian approval"
                : notification.notification_type === "institution_request"
                  ? "sent you an institution membership request"
                  : notification.notification_type === "institution_request_accepted"
                    ? "accepted your institution membership request"
                    : notification.notification_type === "institution_request_rejected"
                      ? "declined your institution membership request"
                      : notification.notification_type === "child_exam_result"
              ? `completed ${notification.exam_title ?? "an exam"} with ${Number(notification.exam_score ?? 0).toFixed(1)}%${Number(notification.exam_score ?? 0) >= Number(notification.exam_passing_score ?? 0) ? " — Passed" : " — Not passed"}`
              : notification.notification_type === "user_safety_report"
                ? "submitted a safety report that was routed to you"
                : notification.notification_type === "group_invite"
                  ? "invited you to an academic group"
                  : notification.notification_type === "group_join_request"
                    ? "requested to join one of your groups"
                    : notification.notification_type === "group_join_approved"
                      ? "approved your group membership request"
                      : notification.notification_type === "group_comment"
                        ? "commented or replied in your group discussion"
                        : notification.notification_type === "group_reaction"
                          ? "reacted to your group post"
                          : notification.notification_type === "group_content_report"
                            ? "submitted a group safety/content report for review"
                            : notification.notification_type === "birthday_congrats"
                  ? "wished you a happy birthday"
                  : notification.notification_type === "anniversary_congrats"
                    ? "celebrated your Examify anniversary"
                    : notification.notification_type === "achievement_congrats"
                      ? "congratulated you on an academic achievement"
                      : notification.notification_type === "event_invite"
                        ? "invited you to an academic event"
                        : notification.notification_type === "connection_request"
                    ? "sent you a connection request"
                    : notification.notification_type === "connection_accepted"
                      ? "accepted your connection request"
                : notification.notification_type === "post_mention"
                  ? "tagged you in a post"
                  : notification.notification_type === "post_shared"
                    ? "shared your post"
                    : notification.notification_type === "post_comment"
                      ? "commented on your post"
                      : "reacted to your post";

            return (
              <button
                key={notification.id}
                type="button"
                onClick={() => openNotification(notification)}
                className={`block w-full rounded-2xl border p-4 text-left transition hover:border-slate-400 ${
                  notification.read_at
                    ? "border-slate-200 bg-white"
                    : "border-blue-200 bg-blue-50/60 shadow-sm"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-slate-800">
                      <strong>{notification.actor_name ?? "Someone"}</strong> {action}.
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {new Date(notification.created_at).toLocaleString()}
                    </p>
                    <p className="mt-2 text-xs font-bold text-[#0F5FEA]">
                      Open →
                    </p>
                  </div>
                  {!notification.read_at && (
                    <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#0F5FEA]" />
                  )}
                </div>
              </button>
            );
          })}

          {notifications.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <p className="font-semibold">No notifications yet.</p>
              <p className="mt-2 text-sm text-slate-500">
                Reactions, comments, group activity, mentions, shares, celebrations, event invitations, connection activity, and academic updates will appear here.
              </p>
              <Link href="/feed" className="mt-5 inline-block text-sm font-semibold">
                Go to Feed →
              </Link>
            </div>
          )}
        </div>

        {message && <p className="mt-5 text-sm text-red-600">{message}</p>}
      </div>
    </main>
  );
}
