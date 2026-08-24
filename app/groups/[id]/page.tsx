"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ShareToFeedButton from "@/components/feed/share-to-feed-button";

type Group = {
  id: string;
  name: string;
  description: string | null;
  group_code: string;
  join_mode: string;
  owner_id: string;
  category: string;
  is_discoverable: boolean;
  rules: string;
};

type Member = {
  user_id: string;
  display_name: string;
  role: string;
  avatar_url: string | null;
  membership_role: "owner" | "moderator" | "member";
  joined_at: string;
};

type PendingMember = {
  user_id: string;
  membership_role: string;
  status: string;
  profile?: {
    full_name: string | null;
    avatar_url: string | null;
  };
};

type Post = {
  id: string;
  author_id: string;
  post_type: string;
  body: string;
  created_at: string;
  author?: {
    full_name: string | null;
    avatar_url: string | null;
  };
};

type Comment = {
  id: string;
  parent_comment_id: string | null;
  author_id: string;
  author_name: string;
  author_role: string;
  author_avatar_url: string | null;
  body: string;
  created_at: string;
  can_delete: boolean;
};

type GroupMedia = {
  id: string;
  post_id: string;
  media_type: "image" | "video";
  object_path: string;
  mime_type: string | null;
  display_order: number;
  signed_url?: string;
};

type ReactionSummary = {
  post_id: string;
  reaction_type: string;
  reaction_count: number;
  viewer_reacted: boolean;
};

type Invitee = {
  user_id: string;
  display_name: string;
  role: string;
  avatar_url: string | null;
  membership_status: string | null;
};

type Report = {
  report_id: string;
  reporter_id: string;
  reporter_name: string;
  reported_author_id: string;
  reported_author_name: string;
  post_id: string | null;
  comment_id: string | null;
  category: string;
  details: string;
  status: string;
  created_at: string;
};

type Doc = {
  id: string;
  title: string;
  file_name: string;
  file_url: string;
  created_at: string;
};

type ExamLink = {
  exam_id: string;
  note: string | null;
  exam?: {
    title: string;
    exam_code: string;
    cover_image_url: string | null;
  };
};

const REACTIONS = [
  ["like", "👍 Like"],
  ["helpful", "💡 Helpful"],
  ["insightful", "🧠 Insightful"],
  ["celebrate", "🎉 Celebrate"],
] as const;

const REPORT_CATEGORIES = [
  ["harassment", "Harassment"],
  ["bullying", "Bullying"],
  ["threats", "Threats or intimidation"],
  ["hate", "Hateful behavior"],
  ["sexual_content", "Sexual/inappropriate content"],
  ["spam", "Spam"],
  ["impersonation", "Impersonation"],
  ["unsafe_behavior", "Unsafe behavior"],
  ["non_academic", "Non-academic content"],
  ["other", "Other"],
] as const;

export default function GroupPage() {
  const { id } = useParams<{ id: string }>();
  const supabase = useMemo(() => createClient(), []);

  const [group, setGroup] = useState<Group | null>(null);
  const [uid, setUid] = useState("");
  const [role, setRole] = useState("");
  const [membershipRole, setMembershipRole] = useState("");
  const [membershipStatus, setMembershipStatus] = useState("");
  const [posts, setPosts] = useState<Post[]>([]);
  const [groupMedia, setGroupMedia] = useState<Record<string, GroupMedia[]>>({});
  const [groupMediaFiles, setGroupMediaFiles] = useState<File[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [pending, setPending] = useState<PendingMember[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [exams, setExams] = useState<ExamLink[]>([]);
  const [myExams, setMyExams] = useState<any[]>([]);
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [reactions, setReactions] = useState<Record<string, ReactionSummary[]>>({});
  const [openComments, setOpenComments] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [body, setBody] = useState("");
  const [postType, setPostType] = useState("discussion");
  const [tab, setTab] = useState("feed");
  const [memberQuery, setMemberQuery] = useState("");
  const [inviteQuery, setInviteQuery] = useState("");
  const [invitees, setInvitees] = useState<Invitee[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [reportTarget, setReportTarget] = useState<{
    postId?: string;
    commentId?: string;
  } | null>(null);
  const [reportCategory, setReportCategory] = useState("harassment");
  const [reportDetails, setReportDetails] = useState("");
  const [docTitle, setDocTitle] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [examId, setExamId] = useState("");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState("");

  const manager =
    membershipRole === "owner" || membershipRole === "moderator";
  const owner = membershipRole === "owner";
  const active = membershipStatus === "active";
  const canModerate = manager || role === "admin";

  async function loadReactions(postRows: Post[]) {
    if (!postRows.length) {
      setReactions({});
      return;
    }

    const { data } = await supabase.rpc(
      "get_group_post_reaction_summary",
      { p_post_ids: postRows.map((post) => post.id) }
    );

    const grouped: Record<string, ReactionSummary[]> = {};

    for (const row of (data ?? []) as ReactionSummary[]) {
      grouped[row.post_id] ??= [];
      grouped[row.post_id].push(row);
    }

    setReactions(grouped);
  }

  async function loadMemberDirectory(query = memberQuery) {
    if (!active) return;

    const { data, error } = await supabase.rpc(
      "search_group_members",
      {
        p_group_id: id,
        p_query: query,
        p_limit: 100,
      }
    );

    if (error) {
      setMessage(error.message);
      return;
    }

    setMembers((data ?? []) as Member[]);
  }

  async function loadReports() {
    if (!canModerate) return;

    const { data, error } = await supabase.rpc(
      "get_group_content_reports",
      {
        p_group_id: id,
        p_limit: 100,
      }
    );

    if (error) {
      setMessage(error.message);
      return;
    }

    setReports((data ?? []) as Report[]);
  }

  async function load() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    setUid(user.id);

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const currentRole = profile?.role ?? "";
    setRole(currentRole);

    const { data: groupData, error: groupError } = await supabase
      .from("academic_groups")
      .select(
        "id,name,description,group_code,join_mode,owner_id,category,is_discoverable,rules"
      )
      .eq("id", id)
      .single();

    if (groupError || !groupData) {
      setMessage(
        groupError?.message ?? "This group is not available."
      );
      return;
    }

    setGroup(groupData as Group);

    const { data: mine } = await supabase
      .from("academic_group_members")
      .select("membership_role,status")
      .eq("group_id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    const currentMembershipRole = mine?.membership_role ?? "";
    const currentMembershipStatus = mine?.status ?? "none";

    setMembershipRole(currentMembershipRole);
    setMembershipStatus(currentMembershipStatus);

    const postResult = await supabase
      .from("academic_group_posts")
      .select(
        "id,author_id,post_type,body,created_at,author:profiles!academic_group_posts_author_id_fkey(full_name,avatar_url)"
      )
      .eq("group_id", id)
      .order("created_at", { ascending: false });

    const postRows = (postResult.data ?? []) as any as Post[];
    setPosts(postRows);
    await loadReactions(postRows);

    if (currentMembershipStatus === "active") {
      const { data: mediaRows } = await supabase.rpc(
        "get_group_post_media",
        { p_post_ids: postRows.map((post) => post.id) }
      );

      const hydrated = await Promise.all(
        ((mediaRows ?? []) as GroupMedia[]).map(async (media) => {
          const { data: signed } = await supabase.storage
            .from("group-media")
            .createSignedUrl(media.object_path, 60 * 60);

          return { ...media, signed_url: signed?.signedUrl };
        })
      );

      const grouped: Record<string, GroupMedia[]> = {};
      for (const media of hydrated) {
        grouped[media.post_id] ??= [];
        grouped[media.post_id].push(media);
      }
      setGroupMedia(grouped);
    } else {
      setGroupMedia({});
    }

    if (currentMembershipStatus === "active") {
      await loadMemberDirectory("");

      const [pendingResult, docResult, examResult] = await Promise.all([
        supabase
          .from("academic_group_members")
          .select(
            "user_id,membership_role,status,profile:profiles!academic_group_members_user_id_fkey(full_name,avatar_url)"
          )
          .eq("group_id", id)
          .eq("status", "requested")
          .order("created_at"),
        supabase
          .from("academic_group_documents")
          .select("*")
          .eq("group_id", id)
          .order("created_at", { ascending: false }),
        supabase
          .from("academic_group_exams")
          .select(
            "exam_id,note,exam:exams!academic_group_exams_exam_id_fkey(title,exam_code,cover_image_url)"
          )
          .eq("group_id", id)
          .order("created_at", { ascending: false }),
      ]);

      setPending((pendingResult.data ?? []) as any);
      setDocs((docResult.data ?? []) as any);
      setExams((examResult.data ?? []) as any);
    } else {
      setMembers([]);
      setPending([]);
      setDocs([]);
      setExams([]);
    }

    if (currentRole === "teacher") {
      const { data } = await supabase
        .from("exams")
        .select("id,title,exam_code")
        .eq("teacher_id", user.id)
        .eq("status", "published")
        .order("title");

      setMyExams(data ?? []);
    }

    if (
      currentRole === "admin" ||
      currentMembershipRole === "owner" ||
      currentMembershipRole === "moderator"
    ) {
      const { data } = await supabase.rpc(
        "get_group_content_reports",
        {
          p_group_id: id,
          p_limit: 100,
        }
      );

      setReports((data ?? []) as Report[]);
    }
  }

  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, supabase]);

  async function createPost(event: FormEvent) {
    event.preventDefault();
    if (!body.trim() && groupMediaFiles.length === 0) return;

    setWorking("create-post");
    setMessage("");

    const { data: createdPost, error } = await supabase
      .from("academic_group_posts")
      .insert({
        group_id: id,
        author_id: uid,
        post_type: postType,
        body: body.trim() || "Shared academic media",
      })
      .select("id")
      .single();

    if (error || !createdPost) {
      setMessage(error?.message ?? "Unable to create group post.");
      setWorking("");
      return;
    }

    const attachmentRows: Array<{
      post_id: string;
      group_id: string;
      uploaded_by: string;
      media_type: "image" | "video";
      object_path: string;
      mime_type: string | null;
      display_order: number;
    }> = [];

    for (const [index, file] of groupMediaFiles.slice(0, 4).entries()) {
      const isVideo = file.type.startsWith("video/");
      const safeName =
        file.name.replace(/[^A-Za-z0-9._-]+/g, "-") || "media";
      const objectPath =
        `${id}/${uid}/${createdPost.id}/${crypto.randomUUID()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from("group-media")
        .upload(objectPath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || undefined,
        });

      if (uploadError) {
        setMessage(
          `Post created, but media upload failed: ${uploadError.message}`
        );
        continue;
      }

      attachmentRows.push({
        post_id: createdPost.id,
        group_id: id,
        uploaded_by: uid,
        media_type: isVideo ? "video" : "image",
        object_path: objectPath,
        mime_type: file.type || null,
        display_order: index,
      });
    }

    if (attachmentRows.length > 0) {
      const { error: mediaError } = await supabase
        .from("academic_group_post_media")
        .insert(attachmentRows);

      if (mediaError) {
        setMessage(
          `Post created, but media could not be attached: ${mediaError.message}`
        );
      }
    }

    setBody("");
    setGroupMediaFiles([]);
    setWorking("");
    await load();
  }

  async function react(postId: string, type: string) {
    setWorking(`reaction-${postId}`);

    const current = reactions[postId]?.find(
      (reaction) =>
        reaction.reaction_type === type &&
        reaction.viewer_reacted
    );

    const result = current
      ? await supabase.rpc("clear_group_post_reaction", {
          p_post_id: postId,
        })
      : await supabase.rpc("set_group_post_reaction", {
          p_post_id: postId,
          p_reaction_type: type,
        });

    if (result.error) setMessage(result.error.message);

    await loadReactions(posts);
    setWorking("");
  }

  async function loadComments(postId: string) {
    if (openComments === postId) {
      setOpenComments(null);
      setReplyTo(null);
      return;
    }

    const { data, error } = await supabase.rpc(
      "get_group_post_comments",
      {
        p_post_id: postId,
        p_limit: 100,
      }
    );

    if (error) {
      setMessage(error.message);
      return;
    }

    setComments((current) => ({
      ...current,
      [postId]: (data ?? []) as Comment[],
    }));
    setOpenComments(postId);
    setReplyTo(null);
  }

  async function addComment(event: FormEvent, postId: string) {
    event.preventDefault();
    if (!commentBody.trim()) return;

    const { error } = await supabase.rpc(
      "add_group_comment",
      {
        p_post_id: postId,
        p_body: commentBody.trim(),
        p_parent_comment_id: replyTo?.id ?? null,
      }
    );

    if (error) {
      setMessage(error.message);
      return;
    }

    setCommentBody("");
    setReplyTo(null);

    const { data } = await supabase.rpc(
      "get_group_post_comments",
      {
        p_post_id: postId,
        p_limit: 100,
      }
    );

    setComments((current) => ({
      ...current,
      [postId]: (data ?? []) as Comment[],
    }));
  }

  async function deleteComment(comment: Comment, postId: string) {
    if (!window.confirm("Delete this comment?")) return;

    const { error } = await supabase
      .from("academic_group_post_comments")
      .delete()
      .eq("id", comment.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    const { data } = await supabase.rpc(
      "get_group_post_comments",
      {
        p_post_id: postId,
        p_limit: 100,
      }
    );

    setComments((current) => ({
      ...current,
      [postId]: (data ?? []) as Comment[],
    }));
  }

  async function reviewMembership(
    userId: string,
    action: string
  ) {
    const { error } = await supabase.rpc(
      "respond_group_membership",
      {
        p_group_id: id,
        p_user_id: userId,
        p_action: action,
      }
    );

    if (error) {
      setMessage(error.message);
      return;
    }

    await load();
  }

  async function setMemberRole(
    userId: string,
    nextRole: "member" | "moderator"
  ) {
    const { error } = await supabase.rpc(
      "set_group_member_role",
      {
        p_group_id: id,
        p_user_id: userId,
        p_role: nextRole,
      }
    );

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadMemberDirectory(memberQuery);
  }

  async function searchInvitees() {
    const { data, error } = await supabase.rpc(
      "search_group_invitees",
      {
        p_group_id: id,
        p_query: inviteQuery,
        p_limit: 30,
      }
    );

    if (error) {
      setMessage(error.message);
      return;
    }

    setInvitees((data ?? []) as Invitee[]);
  }

  async function invite(userId: string) {
    const { error } = await supabase.rpc(
      "invite_user_to_group",
      {
        p_group_id: id,
        p_user_id: userId,
      }
    );

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Group invitation sent.");
    await searchInvitees();
  }

  async function submitReport(event: FormEvent) {
    event.preventDefault();

    if (!reportTarget) return;

    const { error } = await supabase.rpc(
      "submit_group_content_report",
      {
        p_group_id: id,
        p_post_id: reportTarget.postId ?? null,
        p_comment_id: reportTarget.commentId ?? null,
        p_category: reportCategory,
        p_details: reportDetails,
      }
    );

    if (error) {
      setMessage(error.message);
      return;
    }

    setReportTarget(null);
    setReportDetails("");
    setReportCategory("harassment");
    setMessage(
      "Report submitted. Group moderators and Examify administrators have been notified."
    );
  }

  async function reviewReport(
    reportId: string,
    status: "reviewing" | "resolved" | "dismissed"
  ) {
    const { error } = await supabase.rpc(
      "review_group_content_report",
      {
        p_report_id: reportId,
        p_status: status,
      }
    );

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadReports();
  }

  async function uploadDoc(event: FormEvent) {
    event.preventDefault();
    if (!docFile) return;

    const path = `${id}/${crypto.randomUUID()}-${docFile.name.replace(
      /[^a-zA-Z0-9._-]/g,
      "_"
    )}`;

    const { error: uploadError } = await supabase.storage
      .from("group-documents")
      .upload(path, docFile);

    if (uploadError) {
      setMessage(uploadError.message);
      return;
    }

    const { data: signed, error: signError } =
      await supabase.storage
        .from("group-documents")
        .createSignedUrl(path, 60 * 60 * 24 * 365);

    if (signError) {
      setMessage(signError.message);
      return;
    }

    const { error } = await supabase
      .from("academic_group_documents")
      .insert({
        group_id: id,
        uploaded_by: uid,
        title: docTitle.trim() || docFile.name,
        file_name: docFile.name,
        file_url: signed.signedUrl,
        file_size: docFile.size,
      });

    if (error) {
      setMessage(error.message);
      return;
    }

    setDocTitle("");
    setDocFile(null);
    await load();
  }

  async function shareExam(event: FormEvent) {
    event.preventDefault();
    if (!examId) return;

    const { error } = await supabase
      .from("academic_group_exams")
      .insert({
        group_id: id,
        exam_id: examId,
        shared_by: uid,
      });

    if (error) {
      setMessage(error.message);
      return;
    }

    setExamId("");
    await load();
  }

  if (!group) {
    return (
      <main className="min-h-screen p-6">
        <div className="mx-auto max-w-5xl">
          {message || "Loading group..."}
        </div>
      </main>
    );
  }

  const commentTree = (postId: string) => {
    const all = comments[postId] ?? [];
    return {
      roots: all.filter((comment) => !comment.parent_comment_id),
      replies: (parentId: string) =>
        all.filter(
          (comment) => comment.parent_comment_id === parentId
        ),
    };
  };

  return (
    <main className="min-h-screen px-3 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/groups"
          className="text-sm font-bold text-[#2563EB]"
        >
          ← Groups & Classes
        </Link>

        <section className="mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="h-32 bg-gradient-to-r from-[#071A46] via-[#2563EB] to-[#7C3AED] sm:h-44" />

          <div className="p-5 sm:p-7">
            <div className="-mt-12 inline-block rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold capitalize text-[#2563EB]">
                  {group.category.replaceAll("_", " ")}
                </span>

                {group.is_discoverable && (
                  <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-green-700">
                    Discoverable
                  </span>
                )}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-extrabold">
                  {group.name}
                </h1>
                {group.is_discoverable && (
                  <ShareToFeedButton resourceType="group" resourceId={group.id} label="Share group" />
                )}
              </div>
            </div>

            {group.description && (
              <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-600">
                {group.description}
              </p>
            )}

            {group.rules && (
              <details className="mt-5 rounded-xl bg-slate-50 p-4">
                <summary className="cursor-pointer text-sm font-extrabold">
                  Community rules
                </summary>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                  {group.rules}
                </p>
              </details>
            )}
          </div>
        </section>

        {message && (
          <p className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
            {message}
          </p>
        )}

        <nav className="mt-5 flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2">
          {[
            ["feed", "Discussion"],
            ["members", "Members"],
            ["files", "Files"],
            ["exams", "Exams"],
            ...(canModerate ? [["moderation", "Moderation"]] : []),
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setTab(value);
                if (value === "moderation") loadReports();
              }}
              className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-bold ${
                tab === value
                  ? "bg-blue-50 text-[#2563EB]"
                  : "text-slate-500"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {tab === "feed" && (
          <div className="mx-auto mt-5 max-w-3xl space-y-4">
            {active && (
              <form
                onSubmit={createPost}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <textarea
                  rows={3}
                  maxLength={4000}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Start an academic discussion..."
                  className="w-full rounded-xl border border-slate-300 px-4 py-3"
                />

                <div className="mt-3 rounded-xl bg-slate-50 p-3">
                  <label className="text-sm font-semibold">
                    Photos or video
                    <input
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                      onChange={(event) =>
                        setGroupMediaFiles(
                          Array.from(event.target.files ?? []).slice(0, 4)
                        )
                      }
                      className="mt-2 block w-full text-sm font-normal"
                    />
                  </label>
                  <p className="mt-2 text-xs text-slate-500">
                    Up to 4 academic media files. Videos may be up to 50 MB.
                  </p>
                  {groupMediaFiles.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {groupMediaFiles.map((file) => (
                        <span
                          key={`${file.name}-${file.size}`}
                          className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600"
                        >
                          {file.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  {manager ? (
                    <select
                      value={postType}
                      onChange={(e) =>
                        setPostType(e.target.value)
                      }
                      className="rounded-xl border border-slate-300 px-3 py-2"
                    >
                      <option value="discussion">
                        Discussion
                      </option>
                      <option value="announcement">
                        Announcement
                      </option>
                    </select>
                  ) : (
                    <span className="text-xs text-slate-500">
                      Academic discussions only.
                    </span>
                  )}

                  <button className="rounded-xl bg-[#2563EB] px-5 py-2.5 font-bold text-white">
                    Post
                  </button>
                </div>
              </form>
            )}

            {posts.map((post) => {
              const summary = reactions[post.id] ?? [];
              const tree = commentTree(post.id);

              return (
                <article
                  key={post.id}
                  className={`rounded-2xl border bg-white p-5 shadow-sm ${
                    post.post_type === "announcement"
                      ? "border-blue-300"
                      : "border-slate-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Link
                        href={`/people/${post.author_id}`}
                        className="font-bold hover:text-[#2563EB] hover:underline"
                      >
                        {post.author?.full_name ||
                          "Examify member"}
                      </Link>
                      <p className="text-xs text-slate-400">
                        {new Date(
                          post.created_at
                        ).toLocaleString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {post.post_type === "announcement" && (
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-[#2563EB]">
                          Announcement
                        </span>
                      )}

                      {post.author_id !== uid && (
                        <button
                          type="button"
                          onClick={() =>
                            setReportTarget({
                              postId: post.id,
                            })
                          }
                          className="text-xs font-bold text-slate-400 hover:text-red-600"
                        >
                          Report
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {post.body}
                  </p>

                  {(groupMedia[post.id] ?? []).length > 0 && (
                    <div
                      className={`mt-4 grid gap-2 ${
                        (groupMedia[post.id] ?? []).length === 1
                          ? "grid-cols-1"
                          : "grid-cols-2"
                      }`}
                    >
                      {(groupMedia[post.id] ?? []).map((media) =>
                        media.media_type === "video" ? (
                          <video
                            key={media.id}
                            src={media.signed_url}
                            controls
                            playsInline
                            preload="metadata"
                            className="max-h-[520px] w-full rounded-xl bg-black object-contain"
                          />
                        ) : (
                          <img
                            key={media.id}
                            src={media.signed_url}
                            alt="Group academic media"
                            loading="lazy"
                            className={`w-full rounded-xl object-cover ${
                              (groupMedia[post.id] ?? []).length === 1
                                ? "max-h-[520px]"
                                : "aspect-square"
                            }`}
                          />
                        )
                      )}
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    {REACTIONS.map(([value, label]) => {
                      const item = summary.find(
                        (reaction) =>
                          reaction.reaction_type === value
                      );
                      const selected =
                        item?.viewer_reacted ?? false;

                      return (
                        <button
                          key={value}
                          type="button"
                          disabled={
                            !active ||
                            working === `reaction-${post.id}`
                          }
                          onClick={() =>
                            react(post.id, value)
                          }
                          className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
                            selected
                              ? "border-blue-300 bg-blue-50 text-[#2563EB]"
                              : "border-slate-200 text-slate-600"
                          } disabled:opacity-50`}
                        >
                          {label}
                          {Number(item?.reaction_count ?? 0) > 0
                            ? ` · ${item?.reaction_count}`
                            : ""}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => loadComments(post.id)}
                    className="mt-4 text-sm font-bold text-[#2563EB]"
                  >
                    {openComments === post.id
                      ? "Hide comments"
                      : "Comments & replies"}
                  </button>

                  {openComments === post.id && (
                    <div className="mt-4 border-t border-slate-100 pt-4">
                      <div className="space-y-3">
                        {tree.roots.map((comment) => (
                          <div key={comment.id}>
                            <div className="rounded-xl bg-slate-50 p-3">
                              <div className="flex items-start justify-between gap-3">
                                <Link
                                  href={`/people/${comment.author_id}`}
                                  className="text-sm font-bold hover:text-[#2563EB]"
                                >
                                  {comment.author_name}
                                </Link>

                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setReplyTo(comment)
                                    }
                                    className="text-[11px] font-bold text-[#2563EB]"
                                  >
                                    Reply
                                  </button>

                                  {comment.author_id !== uid && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setReportTarget({
                                          commentId: comment.id,
                                        })
                                      }
                                      className="text-[11px] font-bold text-slate-400 hover:text-red-600"
                                    >
                                      Report
                                    </button>
                                  )}

                                  {comment.can_delete && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        deleteComment(
                                          comment,
                                          post.id
                                        )
                                      }
                                      className="text-[11px] font-bold text-red-600"
                                    >
                                      Delete
                                    </button>
                                  )}
                                </div>
                              </div>

                              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                                {comment.body}
                              </p>
                              <p className="mt-1 text-[11px] text-slate-400">
                                {new Date(
                                  comment.created_at
                                ).toLocaleString()}
                              </p>
                            </div>

                            {tree
                              .replies(comment.id)
                              .map((reply) => (
                                <div
                                  key={reply.id}
                                  className="ml-6 mt-2 rounded-xl border-l-2 border-blue-200 bg-slate-50 p-3"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <Link
                                      href={`/people/${reply.author_id}`}
                                      className="text-sm font-bold hover:text-[#2563EB]"
                                    >
                                      {reply.author_name}
                                    </Link>

                                    <div className="flex gap-2">
                                      {reply.author_id !== uid && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setReportTarget({
                                              commentId:
                                                reply.id,
                                            })
                                          }
                                          className="text-[11px] font-bold text-slate-400 hover:text-red-600"
                                        >
                                          Report
                                        </button>
                                      )}

                                      {reply.can_delete && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            deleteComment(
                                              reply,
                                              post.id
                                            )
                                          }
                                          className="text-[11px] font-bold text-red-600"
                                        >
                                          Delete
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                                    {reply.body}
                                  </p>
                                </div>
                              ))}
                          </div>
                        ))}
                      </div>

                      {active && (
                        <form
                          onSubmit={(event) =>
                            addComment(event, post.id)
                          }
                          className="mt-4"
                        >
                          {replyTo && (
                            <div className="mb-2 flex items-center justify-between rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
                              <span>
                                Replying to{" "}
                                <strong>
                                  {replyTo.author_name}
                                </strong>
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setReplyTo(null)
                                }
                                className="font-bold"
                              >
                                ×
                              </button>
                            </div>
                          )}

                          <div className="flex gap-2">
                            <input
                              value={commentBody}
                              onChange={(e) =>
                                setCommentBody(
                                  e.target.value
                                )
                              }
                              maxLength={1500}
                              placeholder={
                                replyTo
                                  ? "Write a reply..."
                                  : "Write an academic comment..."
                              }
                              className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm"
                            />
                            <button className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white">
                              Send
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}

        {tab === "members" && active && (
          <section className="mt-5 space-y-5">
            {manager && pending.length > 0 && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
                <h2 className="font-bold">
                  Join requests
                </h2>
                <div className="mt-3 space-y-2">
                  {pending.map((member) => (
                    <div
                      key={member.user_id}
                      className="flex flex-col gap-2 rounded-xl bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <Link
                        href={`/people/${member.user_id}`}
                        className="font-semibold hover:text-[#2563EB]"
                      >
                        {member.profile?.full_name ||
                          "Examify user"}
                      </Link>

                      <div className="flex gap-2">
                        <button
                          onClick={() =>
                            reviewMembership(
                              member.user_id,
                              "approve"
                            )
                          }
                          className="rounded-lg bg-[#2563EB] px-3 py-2 text-xs font-bold text-white"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() =>
                            reviewMembership(
                              member.user_id,
                              "decline"
                            )
                          }
                          className="rounded-lg border px-3 py-2 text-xs font-bold"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {manager && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="font-bold">
                  Invite people
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Invite students, teachers, parents, or verified institutions.
                </p>

                <div className="mt-3 flex gap-2">
                  <input
                    value={inviteQuery}
                    onChange={(e) =>
                      setInviteQuery(e.target.value)
                    }
                    placeholder="Search by name"
                    className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-3"
                  />
                  <button
                    type="button"
                    onClick={searchInvitees}
                    className="rounded-xl bg-slate-900 px-4 font-bold text-white"
                  >
                    Search
                  </button>
                </div>

                <div className="mt-3 space-y-2">
                  {invitees.map((person) => (
                    <div
                      key={person.user_id}
                      className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3"
                    >
                      <div className="min-w-0">
                        <Link
                          href={`/people/${person.user_id}`}
                          className="block truncate font-semibold hover:text-[#2563EB]"
                        >
                          {person.display_name}
                        </Link>
                        <p className="text-xs capitalize text-slate-400">
                          {person.role}
                        </p>
                      </div>

                      {person.membership_status ? (
                        <span className="text-xs font-bold capitalize text-slate-500">
                          {person.membership_status}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            invite(person.user_id)
                          }
                          className="rounded-lg bg-[#2563EB] px-3 py-2 text-xs font-bold text-white"
                        >
                          Invite
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="font-bold">
                    Member directory
                  </h2>
                  <p className="text-xs text-slate-500">
                    Search people inside this academic community.
                  </p>
                </div>

                <div className="flex gap-2">
                  <input
                    value={memberQuery}
                    onChange={(e) =>
                      setMemberQuery(e.target.value)
                    }
                    placeholder="Search members"
                    className="min-w-0 rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      loadMemberDirectory(memberQuery)
                    }
                    className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold"
                  >
                    Search
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {members.map((member) => (
                  <div
                    key={member.user_id}
                    className="rounded-xl bg-slate-50 p-4"
                  >
                    <Link
                      href={`/people/${member.user_id}`}
                      className="font-bold hover:text-[#2563EB]"
                    >
                      {member.display_name}
                    </Link>

                    <p className="mt-1 text-xs capitalize text-slate-500">
                      {member.role} ·{" "}
                      {member.membership_role}
                    </p>

                    {owner &&
                      member.user_id !== uid &&
                      member.membership_role !==
                        "owner" && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setMemberRole(
                                member.user_id,
                                member.membership_role ===
                                  "moderator"
                                  ? "member"
                                  : "moderator"
                              )
                            }
                            className="text-xs font-bold text-[#2563EB]"
                          >
                            {member.membership_role ===
                            "moderator"
                              ? "Remove moderator"
                              : "Make moderator"}
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              reviewMembership(
                                member.user_id,
                                "remove"
                              )
                            }
                            className="text-xs font-bold text-red-600"
                          >
                            Remove member
                          </button>
                        </div>
                      )}

                    {manager &&
                      !owner &&
                      member.user_id !== uid &&
                      member.membership_role ===
                        "member" && (
                        <button
                          type="button"
                          onClick={() =>
                            reviewMembership(
                              member.user_id,
                              "remove"
                            )
                          }
                          className="mt-3 text-xs font-bold text-red-600"
                        >
                          Remove member
                        </button>
                      )}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {tab === "files" && (
          <section className="mt-5">
            {!active ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
                Join the group to access shared documents.
              </div>
            ) : (
              <>
                {manager && (
                  <form
                    onSubmit={uploadDoc}
                    className="rounded-2xl border border-slate-200 bg-white p-5"
                  >
                    <h2 className="font-bold">
                      Share a document
                    </h2>
                    <input
                      value={docTitle}
                      onChange={(e) =>
                        setDocTitle(e.target.value)
                      }
                      placeholder="Document title"
                      className="mt-3 w-full rounded-xl border px-4 py-3"
                    />
                    <input
                      required
                      type="file"
                      onChange={(e) =>
                        setDocFile(
                          e.target.files?.[0] ?? null
                        )
                      }
                      className="mt-3 block w-full text-sm"
                    />
                    <button className="mt-3 rounded-xl bg-[#2563EB] px-4 py-2.5 font-bold text-white">
                      Upload
                    </button>
                  </form>
                )}

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {docs.map((doc) => (
                    <a
                      key={doc.id}
                      href={doc.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                    >
                      <p className="font-bold">
                        {doc.title}
                      </p>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {doc.file_name}
                      </p>
                      <p className="mt-3 text-sm font-bold text-[#2563EB]">
                        Download / open →
                      </p>
                    </a>
                  ))}
                </div>
              </>
            )}
          </section>
        )}

        {tab === "exams" && (
          <section className="mt-5">
            {!active ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
                Join the group to access shared exams.
              </div>
            ) : (
              <>
                {manager &&
                  role === "teacher" && (
                    <form
                      onSubmit={shareExam}
                      className="rounded-2xl border border-slate-200 bg-white p-5"
                    >
                      <h2 className="font-bold">
                        Assign/share an exam
                      </h2>

                      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <select
                          required
                          value={examId}
                          onChange={(e) =>
                            setExamId(e.target.value)
                          }
                          className="min-w-0 flex-1 rounded-xl border px-4 py-3"
                        >
                          <option value="">
                            Choose one of your published exams
                          </option>

                          {myExams.map((exam) => (
                            <option
                              key={exam.id}
                              value={exam.id}
                            >
                              {exam.title} (
                              {exam.exam_code})
                            </option>
                          ))}
                        </select>

                        <button className="rounded-xl bg-[#2563EB] px-4 py-3 font-bold text-white">
                          Share
                        </button>
                      </div>
                    </form>
                  )}

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {exams.map((examLink) => (
                    <Link
                      key={examLink.exam_id}
                      href={`/exams/${examLink.exam_id}`}
                      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                    >
                      <p className="font-bold">
                        {examLink.exam?.title || "Exam"}
                      </p>
                      <p className="mt-2 font-mono text-xs text-slate-500">
                        {examLink.exam?.exam_code}
                      </p>
                      <p className="mt-4 text-sm font-bold text-[#2563EB]">
                        Open exam →
                      </p>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </section>
        )}

        {tab === "moderation" && canModerate && (
          <section className="mt-5">
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
              <h2 className="font-extrabold text-red-900">
                Group moderation & safety reports
              </h2>
              <p className="mt-1 text-sm leading-6 text-red-800">
                Reports submitted inside this group are visible
                to group managers and Examify administrators.
                Safety and inappropriate-behavior reports cannot
                be disabled through notification preferences.
              </p>
            </div>

            <div className="mt-4 space-y-3">
              {reports.map((report) => (
                <article
                  key={report.report_id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-bold capitalize">
                        {report.category.replaceAll(
                          "_",
                          " "
                        )}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Reported by{" "}
                        {report.reporter_name} · Content by{" "}
                        {report.reported_author_name}
                      </p>
                    </div>

                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold capitalize text-slate-600">
                      {report.status}
                    </span>
                  </div>

                  <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {report.details}
                  </p>

                  <p className="mt-3 text-xs text-slate-400">
                    {new Date(
                      report.created_at
                    ).toLocaleString()}
                  </p>

                  {report.status !== "resolved" &&
                    report.status !== "dismissed" && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            reviewReport(
                              report.report_id,
                              "reviewing"
                            )
                          }
                          className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold"
                        >
                          Mark reviewing
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            reviewReport(
                              report.report_id,
                              "resolved"
                            )
                          }
                          className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white"
                        >
                          Resolve
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            reviewReport(
                              report.report_id,
                              "dismissed"
                            )
                          }
                          className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold"
                        >
                          Dismiss
                        </button>
                      </div>
                    )}
                </article>
              ))}

              {reports.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                  No group content reports.
                </div>
              )}
            </div>
          </section>
        )}

        {reportTarget && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-3 sm:items-center">
            <form
              onSubmit={submitReport}
              className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-extrabold">
                    Report inappropriate behavior
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    The report will be available to group
                    moderators and Examify administrators.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setReportTarget(null)
                  }
                  className="text-xl font-bold text-slate-400"
                >
                  ×
                </button>
              </div>

              <label className="mt-5 block text-sm font-bold">
                Category
                <select
                  value={reportCategory}
                  onChange={(e) =>
                    setReportCategory(e.target.value)
                  }
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal"
                >
                  {REPORT_CATEGORIES.map(
                    ([value, label]) => (
                      <option
                        key={value}
                        value={value}
                      >
                        {label}
                      </option>
                    )
                  )}
                </select>
              </label>

              <label className="mt-4 block text-sm font-bold">
                Description
                <textarea
                  required
                  minLength={10}
                  maxLength={2000}
                  rows={5}
                  value={reportDetails}
                  onChange={(e) =>
                    setReportDetails(e.target.value)
                  }
                  placeholder="Explain what happened and why this content should be reviewed."
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal"
                />
              </label>

              <div className="mt-5 flex gap-2">
                <button className="flex-1 rounded-xl bg-red-600 px-4 py-3 font-bold text-white">
                  Submit report
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setReportTarget(null)
                  }
                  className="rounded-xl border border-slate-300 px-4 py-3 font-bold"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
