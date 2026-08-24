"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import PostEngagement from "@/components/feed/post-engagement";
import MentionPicker, { type MentionPerson } from "@/components/feed/mention-picker";
import RichPostExtras from "@/components/feed/rich-post-extras";
import AttachmentPreviews from "@/components/feed/attachment-previews";
import FeedRightRail from "@/components/feed/feed-right-rail";
import FeedSharedResource from "@/components/feed/feed-shared-resource";
import SponsoredAd, { type ExamifyAd } from "@/components/feed/sponsored-ad";

type UserRole = "student" | "teacher" | "parent" | "institution" | "admin";
type FeedMode = "recommended" | "latest" | "connections" | "teachers" | "institutions" | "achievements";

const FEED_MODES: { value: FeedMode; label: string; short: string }[] = [
  { value: "recommended", label: "Recommended", short: "For you" },
  { value: "latest", label: "Latest", short: "Latest" },
  { value: "connections", label: "Connections", short: "Connections" },
  { value: "teachers", label: "Teachers", short: "Teachers" },
  { value: "institutions", label: "Institutions", short: "Institutions" },
  { value: "achievements", label: "Achievements", short: "Achievements" },
];

type FeedPost = {
  id: string;
  author_id: string;
  author_role: UserRole;
  author_name: string;
  author_avatar_url: string | null;
  post_type: "post" | "achievement" | "exam";
  body: string | null;
  created_at: string;
  achievement_attempt_id: string | null;
  achievement_exam_id: string | null;
  achievement_exam_title: string | null;
  achievement_cover_image_url: string | null;
  achievement_score: number | null;
  achievement_passing_score: number | null;
  feed_exam_id: string | null;
  feed_exam_title: string | null;
  feed_exam_category: string | null;
  feed_exam_cover_image_url: string | null;
  feed_exam_short_description: string | null;
  image_url: string | null;
  link_url: string | null;
  document_url: string | null;
  document_name: string | null;
  document_size: number | null;
  document_mime_type: string | null;
  shared_post_id: string | null;
  shared_author_id: string | null;
  shared_author_role: string | null;
  shared_author_name: string | null;
  shared_body: string | null;
  shared_image_url: string | null;
  shared_link_url: string | null;
  shared_document_url: string | null;
  shared_document_name: string | null;
  shared_post_type: string | null;
  shared_created_at: string | null;
  audience: "examify" | "connections";
  edited_at: string | null;
  is_pinned: boolean;
  scheduled_at: string | null;
};

type AcademicDiscoveryItem = {
  item_type: "institution" | "group" | "event" | "exam";
  item_id: string;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  href: string;
  badge: string;
};

type Achievement = {
  attempt_id: string;
  exam_id: string;
  exam_title: string;
  cover_image_url: string | null;
  score_percent: number;
  passing_score: number;
  completed_at: string;
};

export default function FeedPage() {
  const supabase = useMemo(() => createClient(), []);

  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<UserRole | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [feedAds, setFeedAds] = useState<ExamifyAd[]>([]);
  const [feedMode, setFeedMode] = useState<FeedMode>("recommended");
  const [savingFeedMode, setSavingFeedMode] = useState(false);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [postBody, setPostBody] = useState("");
  const [postLink, setPostLink] = useState("");
  const [postImageFiles, setPostImageFiles] = useState<File[]>([]);
  const [postImagePreviews, setPostImagePreviews] = useState<string[]>([]);
  const [postVideoFile, setPostVideoFile] = useState<File | null>(null);
  const [postVideoPreview, setPostVideoPreview] = useState("");
  const [postDocumentFile, setPostDocumentFile] = useState<File | null>(null);
  const [mentions, setMentions] = useState<MentionPerson[]>([]);
  const [sharingPostId, setSharingPostId] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState("");
  const [postAudience, setPostAudience] = useState<"examify" | "connections">("examify");
  const [postMode, setPostMode] = useState<"post" | "poll">("post");
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [pollClosesAt, setPollClosesAt] = useState("");
  const [scheduleAt, setScheduleAt] = useState("");
  const [achievementId, setAchievementId] = useState("");
  const [achievementMessage, setAchievementMessage] = useState("");
  const [reportedPostIds, setReportedPostIds] = useState<string[]>([]);
  const [reportingPostId, setReportingPostId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("inappropriate");
  const [reportDetails, setReportDetails] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [reportNotice, setReportNotice] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [discoveryItems, setDiscoveryItems] = useState<AcademicDiscoveryItem[]>([]);
  const [dismissedDiscoveryIds, setDismissedDiscoveryIds] = useState<string[]>([]);

  async function loadAcademicDiscovery() {
    const { data, error } = await supabase.rpc(
      "get_feed_academic_discovery",
      { p_limit_per_type: 4 }
    );

    if (!error) {
      setDiscoveryItems((data ?? []) as AcademicDiscoveryItem[]);
    }
  }

  async function loadFeedAds() {
    const { data, error } = await supabase.rpc("get_active_ads", {
      p_placement: "feed",
      p_limit: 10,
    });
    if (!error) setFeedAds((data ?? []) as ExamifyAd[]);
  }

  async function loadFeed() {
    const { data, error } = await supabase.rpc("get_ranked_feed_posts", {
      p_feed: feedMode,
      p_limit: 50,
      p_offset: 0,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setPosts((data ?? []) as FeedPost[]);
  }

  async function changeFeedMode(nextMode: FeedMode) {
    setFeedMode(nextMode);
    setSavingFeedMode(true);
    setMessage("");

    const { error: preferenceError } = await supabase.rpc(
      "set_my_feed_preference",
      { p_feed: nextMode }
    );

    const { data, error } = await supabase.rpc("get_ranked_feed_posts", {
      p_feed: nextMode,
      p_limit: 50,
      p_offset: 0,
    });

    if (preferenceError || error) {
      setMessage(
        preferenceError?.message ?? error?.message ?? "Unable to change feed."
      );
    } else {
      setPosts((data ?? []) as FeedPost[]);
    }

    setSavingFeedMode(false);
  }

  async function loadAchievements() {
    const { data, error } = await supabase.rpc("get_shareable_achievements");

    if (error) {
      setMessage(error.message);
      return;
    }

    const rows = (data ?? []) as Achievement[];
    setAchievements(rows);

    if (rows.length > 0 && !achievementId) {
      setAchievementId(rows[0].attempt_id);
    }
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

      setUserId(user.id);

      const { data: existingReports } = await supabase
        .from("feed_post_reports")
        .select("post_id")
        .eq("reporter_id", user.id);

      setReportedPostIds((existingReports ?? []).map((item) => item.post_id));

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profileError || !profile) {
        setMessage(profileError?.message ?? "Unable to load your profile.");
        setLoading(false);
        return;
      }

      const currentRole = profile.role as UserRole;
      setRole(currentRole);

      const { data: savedFeedMode } = await supabase.rpc(
        "get_my_feed_preference"
      );
      const initialFeedMode =
        typeof savedFeedMode === "string"
          ? (savedFeedMode as FeedMode)
          : "recommended";
      setFeedMode(initialFeedMode);

      const { data: initialPosts, error: feedError } = await supabase.rpc(
        "get_ranked_feed_posts",
        {
          p_feed: initialFeedMode,
          p_limit: 50,
          p_offset: 0,
        }
      );
      if (feedError) setMessage(feedError.message);
      else setPosts((initialPosts ?? []) as FeedPost[]);

      await loadAcademicDiscovery();
      loadFeedAds();

      if (currentRole === "student") {
        await loadAchievements();
      }

      setLoading(false);
    }

    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  async function createPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const body = postBody.trim();
    const linkUrl = postLink.trim();

    const validPoll =
      postMode === "poll" &&
      pollQuestion.trim().length >= 3 &&
      pollOptions.filter((option) => option.trim()).length >= 2;

    if (
      (!body &&
        !linkUrl &&
        postImageFiles.length === 0 &&
        !postVideoFile &&
        !postDocumentFile &&
        !validPoll) ||
      !userId
    ) {
      return;
    }

    if (scheduleAt && new Date(scheduleAt) <= new Date()) {
      setMessage("Scheduled time must be in the future.");
      return;
    }

    if (linkUrl) {
      try {
        const parsed = new URL(linkUrl);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          throw new Error('Unsupported protocol');
        }
      } catch {
        setMessage('Please enter a valid http:// or https:// link.');
        return;
      }
    }

    setSubmitting(true);
    setMessage("");

    let imageUrl: string | null = null;
    let documentUrl: string | null = null;
    const uploadedImages: string[] = [];

    for (const imageFile of postImageFiles.slice(0, 4)) {
      const extension =
        imageFile.name.split(".").pop()?.toLowerCase() || "jpg";
      const filePath = `${userId}/${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("feed-images")
        .upload(filePath, imageFile, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        setMessage(uploadError.message);
        setSubmitting(false);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from("feed-images")
        .getPublicUrl(filePath);

      uploadedImages.push(publicUrlData.publicUrl);
    }

    imageUrl = uploadedImages[0] ?? null;

    let videoUrl: string | null = null;

    if (postVideoFile) {
      const extension =
        postVideoFile.name.split(".").pop()?.toLowerCase() || "mp4";
      const filePath = `${userId}/${crypto.randomUUID()}.${extension}`;

      const { error: videoUploadError } = await supabase.storage
        .from("feed-videos")
        .upload(filePath, postVideoFile, {
          cacheControl: "3600",
          upsert: false,
          contentType: postVideoFile.type || undefined,
        });

      if (videoUploadError) {
        setMessage(videoUploadError.message);
        setSubmitting(false);
        return;
      }

      const { data: videoPublicUrlData } = supabase.storage
        .from("feed-videos")
        .getPublicUrl(filePath);

      videoUrl = videoPublicUrlData.publicUrl;
    }

    if (postDocumentFile) {
      const safeName = postDocumentFile.name
        .replace(/[^A-Za-z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "") || "document";

      const filePath = `${userId}/${crypto.randomUUID()}-${safeName}`;

      const { error: documentUploadError } = await supabase.storage
        .from("feed-documents")
        .upload(filePath, postDocumentFile, {
          cacheControl: "3600",
          upsert: false,
          contentType: postDocumentFile.type || undefined,
        });

      if (documentUploadError) {
        setMessage(documentUploadError.message);
        setSubmitting(false);
        return;
      }

      const { data: documentPublicUrlData } = supabase.storage
        .from("feed-documents")
        .getPublicUrl(filePath);

      documentUrl = documentPublicUrlData.publicUrl;
    }

    const { data: createdPost, error } = await supabase
      .from("feed_posts")
      .insert({
        author_id: userId,
        post_type: "post",
        body:
          [body, mentions.length ? `With ${mentions.map((person) => `@${person.display_name}`).join(", ")}` : ""]
            .filter(Boolean)
            .join("\n\n") ||
          (postVideoFile ? "Shared an academic video" : null),
        image_url: imageUrl,
        link_url: linkUrl || null,
        document_url: documentUrl,
        document_name: postDocumentFile?.name || null,
        document_size: postDocumentFile?.size || null,
        document_mime_type: postDocumentFile?.type || null,
        audience: postAudience,
        scheduled_at: scheduleAt
          ? new Date(scheduleAt).toISOString()
          : null,
      })
      .select("id")
      .single();

    if (error || !createdPost) {
      setMessage(error?.message ?? "Unable to create post.");
      setSubmitting(false);
      return;
    }

    if (uploadedImages.length > 0) {
      const { error: imageRowsError } = await supabase
        .from("feed_post_images")
        .insert(
          uploadedImages.map((url, index) => ({
            post_id: createdPost.id,
            image_url: url,
            display_order: index,
          }))
        );

      if (imageRowsError) {
        setMessage(
          `Post created, but some images could not be attached: ${imageRowsError.message}`
        );
      }
    }

    if (videoUrl) {
      const { error: videoRowError } = await supabase
        .from("feed_post_videos")
        .insert({
          post_id: createdPost.id,
          video_url: videoUrl,
          mime_type: postVideoFile?.type || null,
        });

      if (videoRowError) {
        setMessage(
          `Post created, but the video could not be attached: ${videoRowError.message}`
        );
      }
    }

    if (postMode === "poll") {
      const cleanOptions = pollOptions
        .map((option) => option.trim())
        .filter(Boolean);

      const { error: pollError } = await supabase.rpc(
        "create_feed_poll",
        {
          p_post_id: createdPost.id,
          p_question: pollQuestion.trim(),
          p_options: cleanOptions,
          p_closes_at: pollClosesAt
            ? new Date(pollClosesAt).toISOString()
            : null,
        }
      );

      if (pollError) {
        setMessage(
          `Post created, but the poll could not be attached: ${pollError.message}`
        );
      }
    }

    if (mentions.length > 0) {
      const { error: mentionError } = await supabase
        .from("feed_post_mentions")
        .insert(
          mentions.map((person) => ({
            post_id: createdPost.id,
            mentioned_user_id: person.user_id,
          }))
        );

      if (mentionError) {
        setMessage(
          `Post created, but some tags could not be saved: ${mentionError.message}`
        );
      }
    }

    setPostBody("");
    setPostLink("");
    setPostImageFiles([]);
    setPostVideoFile(null);
    if (postVideoPreview) URL.revokeObjectURL(postVideoPreview);
    setPostVideoPreview("");
    setPostDocumentFile(null);
    setMentions([]);
    postImagePreviews.forEach((preview) => URL.revokeObjectURL(preview));
    setPostImagePreviews([]);
    setPostMode("post");
    setPollQuestion("");
    setPollOptions(["", ""]);
    setPollClosesAt("");
    setScheduleAt("");
    await loadFeed();
    setComposerOpen(false);
    setSubmitting(false);
  }

  async function shareAchievement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!achievementId || !userId) return;

    setSubmitting(true);
    setMessage("");

    const { error } = await supabase.from("feed_posts").insert({
      author_id: userId,
      post_type: "achievement",
      achievement_attempt_id: achievementId,
      body: achievementMessage.trim() || null,
    });

    if (error) {
      setMessage(error.message);
      setSubmitting(false);
      return;
    }

    setAchievementMessage("");
    setAchievementId("");
    await Promise.all([loadFeed(), loadAchievements()]);
    setSubmitting(false);
  }

  async function sharePost(postId: string) {
    if (!userId || !canWritePost) return;

    setSubmitting(true);
    setMessage("");

    const { error } = await supabase.rpc("share_feed_post", {
      p_post_id: postId,
      p_message: shareMessage,
      p_audience: postAudience,
    });

    if (error) {
      setMessage(error.message);
      setSubmitting(false);
      return;
    }

    setSharingPostId(null);
    setShareMessage("");
    await loadFeed();
    setSubmitting(false);
  }

  async function deletePost(postId: string) {
    const confirmed = window.confirm("Delete this post from the feed?");
    if (!confirmed) return;

    const { error } = await supabase
      .from("feed_posts")
      .delete()
      .eq("id", postId);

    if (error) {
      setMessage(error.message);
      return;
    }

    setPosts((current) => current.filter((post) => post.id !== postId));

    if (role === "student") {
      await loadAchievements();
    }
  }

  async function submitReport(postId: string) {
    if (!userId) return;

    setSubmitting(true);
    setMessage("");
    setReportNotice("");

    const { error } = await supabase.from("feed_post_reports").insert({
      post_id: postId,
      reporter_id: userId,
      reason: reportReason,
      details: reportDetails.trim() || null,
    });

    if (error) {
      if (error.code === "23505") {
        setMessage("You already reported this post.");
        setReportedPostIds((current) =>
          current.includes(postId) ? current : [...current, postId]
        );
      } else {
        setMessage(error.message);
      }
      setSubmitting(false);
      return;
    }

    setReportedPostIds((current) => [...current, postId]);
    setReportingPostId(null);
    setReportReason("inappropriate");
    setReportDetails("");
    setReportNotice("Thank you. The post was sent to Examify moderation for review.");
    setSubmitting(false);
  }

  function youtubeEmbedUrl(url: string | null) {
    if (!url) return null;

    try {
      const parsed = new URL(url);
      let videoId = '';

      if (parsed.hostname === 'youtu.be') {
        videoId = parsed.pathname.replace(/^\//, '').split('/')[0];
      } else if (
        parsed.hostname === 'youtube.com' ||
        parsed.hostname === 'www.youtube.com' ||
        parsed.hostname === 'm.youtube.com'
      ) {
        if (parsed.pathname === '/watch') {
          videoId = parsed.searchParams.get('v') ?? '';
        } else if (parsed.pathname.startsWith('/shorts/')) {
          videoId = parsed.pathname.split('/')[2] ?? '';
        } else if (parsed.pathname.startsWith('/embed/')) {
          videoId = parsed.pathname.split('/')[2] ?? '';
        }
      }

      return /^[A-Za-z0-9_-]{6,}$/.test(videoId)
        ? `https://www.youtube.com/embed/${videoId}`
        : null;
    } catch {
      return null;
    }
  }

  function formatFileSize(bytes: number | null) {
    if (!bytes || bytes <= 0) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  const visibleDiscoveryItems = discoveryItems.filter(
    (item) =>
      !dismissedDiscoveryIds.includes(
        `${item.item_type}:${item.item_id}`
      )
  );

  function dismissDiscovery(item: AcademicDiscoveryItem) {
    setDismissedDiscoveryIds((current) => [
      ...current,
      `${item.item_type}:${item.item_id}`,
    ]);
  }

  function AcademicDiscoveryCard() {
    if (visibleDiscoveryItems.length === 0) return null;

    return (
      <section className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-[#0F5FEA]">
              Academic discovery
            </p>
            <h2 className="mt-1 text-lg font-extrabold text-slate-900">
              Explore more on Examify
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Verified institutions and public academic resources — never suggested people.
            </p>
          </div>
          <Link
            href="/discover"
            className="shrink-0 text-sm font-bold text-[#0F5FEA]"
          >
            Discover →
          </Link>
        </div>

        <div className="flex snap-x gap-3 overflow-x-auto p-4">
          {visibleDiscoveryItems.slice(0, 8).map((item) => (
            <article
              key={`${item.item_type}-${item.item_id}`}
              className="w-[78vw] max-w-[280px] shrink-0 snap-start overflow-hidden rounded-2xl border border-slate-200 bg-white"
            >
              {item.image_url ? (
                <img
                  src={item.image_url}
                  alt=""
                  className="h-28 w-full object-cover"
                />
              ) : (
                <div className="flex h-28 items-center justify-center bg-blue-50 text-3xl font-black text-[#0F5FEA]">
                  {item.title.trim().charAt(0).toUpperCase() || "E"}
                </div>
              )}

              <div className="p-4">
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-extrabold text-[#0F5FEA]">
                  {item.badge}
                </span>
                <h3 className="mt-3 line-clamp-1 font-extrabold text-slate-900">
                  {item.title}
                </h3>
                {item.subtitle && (
                  <p className="mt-1 line-clamp-2 min-h-10 text-sm leading-5 text-slate-500">
                    {item.subtitle}
                  </p>
                )}

                <div className="mt-4 flex gap-2">
                  <Link
                    href={item.href}
                    className="flex-1 rounded-xl bg-[#0F5FEA] px-3 py-2.5 text-center text-sm font-bold text-white"
                  >
                    {item.item_type === "event"
                      ? "Open event"
                      : item.item_type === "exam"
                        ? "View exam"
                        : item.item_type === "group"
                          ? "Open group"
                          : "View institution"}
                  </Link>
                  <button
                    type="button"
                    onClick={() => dismissDiscovery(item)}
                    aria-label={`Dismiss ${item.title}`}
                    className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-500"
                  >
                    ×
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#F5F7FB] px-4 py-8 text-slate-900">
        <div className="mx-auto max-w-[1220px]">Loading feed...</div>
      </main>
    );
  }

  const canWritePost = role === "teacher" || role === "institution";

  return (
    <main className="min-h-screen bg-[#F5F7FB] px-3 py-5 text-slate-900 sm:px-5 lg:px-6">
      <div className="mx-auto grid max-w-[1220px] items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">

        <section className="mb-4">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {FEED_MODES.map((mode) => (
              <button
                key={mode.value}
                type="button"
                disabled={savingFeedMode}
                onClick={() => changeFeedMode(mode.value)}
                title={mode.label}
                className={`shrink-0 rounded-full px-4 py-2.5 text-sm font-bold transition ${
                  feedMode === mode.value
                    ? "bg-[#0F5FEA] text-white shadow-sm"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {mode.short}
              </button>
            ))}
          </div>
          <p className="sr-only">
            {feedMode === "recommended"
              ? "Recommended feed."
              : `${feedMode} feed.`}
          </p>
        </section>

        {canWritePost && (
          <>
            {!composerOpen ? (
              <button
                type="button"
                onClick={() => setComposerOpen(true)}
                className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-200 hover:shadow-md sm:p-5"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-lg font-bold text-[#2563EB]">
                    +
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold text-slate-800">Create a post</p>
                    <p className="mt-0.5 truncate text-sm text-slate-500">
                      What&apos;s on your mind?
                    </p>
                  </div>
                </div>
              </button>
            ) : (
          <form
            onSubmit={createPost}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="text-sm font-extrabold text-slate-800">Create a post</label>
              <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setPostMode("post")}
                  className={`rounded-lg px-3 py-2 ${
                    postMode === "post"
                      ? "bg-white text-[#2563EB] shadow-sm"
                      : "text-slate-500"
                  }`}
                >
                  Post
                </button>
                <button
                  type="button"
                  onClick={() => setPostMode("poll")}
                  className={`rounded-lg px-3 py-2 ${
                    postMode === "poll"
                      ? "bg-white text-[#2563EB] shadow-sm"
                      : "text-slate-500"
                  }`}
                >
                  Poll
                </button>
              </div>
            </div>
            <textarea
              value={postBody}
              onChange={(event) => setPostBody(event.target.value)}
              maxLength={2000}
              rows={2}
              placeholder="What's on your mind?"
              className="mt-3 w-full resize-none rounded-2xl border border-slate-200 bg-[#F7F9FC] px-5 py-4 text-[15px] outline-none transition focus:border-blue-300 focus:bg-white"
            />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium">
                  Images <span className="font-normal text-slate-500">(optional · up to 4)</span>
                </label>
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={(event) => {
                    postImagePreviews.forEach((preview) =>
                      URL.revokeObjectURL(preview)
                    );
                    const files = Array.from(event.target.files ?? []).slice(0, 4);
                    setPostImageFiles(files);
                    setPostImagePreviews(
                      files.map((file) => URL.createObjectURL(file))
                    );
                  }}
                  className="block w-full rounded-xl border border-slate-200 bg-[#F8FAFD] px-4 py-3 text-sm"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Video <span className="font-normal text-slate-500">(optional · up to 50 MB)</span>
                </label>
                <input
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime"
                  onChange={(event) => {
                    if (postVideoPreview) URL.revokeObjectURL(postVideoPreview);
                    const file = event.target.files?.[0] ?? null;
                    setPostVideoFile(file);
                    setPostVideoPreview(file ? URL.createObjectURL(file) : "");
                  }}
                  className="block w-full rounded-xl border border-slate-200 bg-[#F8FAFD] px-4 py-3 text-sm"
                />
                <p className="mt-2 text-xs text-slate-500">
                  MP4, WebM, or QuickTime · one video per post
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Document <span className="font-normal text-slate-500">(optional)</span>
                </label>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,text/csv"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    setPostDocumentFile(file);
                  }}
                  className="block w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
                />
                <p className="mt-2 text-xs text-slate-500">
                  PDF, Word, PowerPoint, Excel, TXT, or CSV · up to 25 MB
                </p>
              </div>

              <div className="sm:col-span-2">
                <label className="mb-2 block text-sm font-medium">
                  Link <span className="font-normal text-slate-500">(optional)</span>
                </label>
                <input
                  type="url"
                  value={postLink}
                  onChange={(event) => setPostLink(event.target.value)}
                  placeholder="https://example.com or YouTube URL"
                  className="w-full rounded-xl border border-slate-200 bg-[#F8FAFD] px-4 py-3"
                />
              </div>
            </div>

            {postMode === "poll" && (
              <section className="mt-4 rounded-2xl border border-violet-200 bg-violet-50/50 p-4">
                <label className="text-sm font-bold">
                  Poll question
                  <input
                    required
                    value={pollQuestion}
                    onChange={(event) => setPollQuestion(event.target.value)}
                    maxLength={300}
                    placeholder="Ask an academic question..."
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal"
                  />
                </label>

                <div className="mt-4 space-y-2">
                  {pollOptions.map((option, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        required={index < 2}
                        value={option}
                        onChange={(event) =>
                          setPollOptions((current) =>
                            current.map((value, optionIndex) =>
                              optionIndex === index
                                ? event.target.value
                                : value
                            )
                          )
                        }
                        maxLength={160}
                        placeholder={`Option ${index + 1}`}
                        className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3"
                      />
                      {pollOptions.length > 2 && (
                        <button
                          type="button"
                          onClick={() =>
                            setPollOptions((current) =>
                              current.filter((_, optionIndex) => optionIndex !== index)
                            )
                          }
                          className="rounded-xl border border-red-200 px-3 text-sm font-bold text-red-600"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {pollOptions.length < 6 && (
                  <button
                    type="button"
                    onClick={() =>
                      setPollOptions((current) => [...current, ""])
                    }
                    className="mt-3 text-sm font-bold text-violet-700"
                  >
                    + Add option
                  </button>
                )}

                <label className="mt-4 block text-sm font-semibold">
                  Close poll <span className="font-normal text-slate-500">(optional)</span>
                  <input
                    type="datetime-local"
                    value={pollClosesAt}
                    onChange={(event) => setPollClosesAt(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal"
                  />
                </label>
              </section>
            )}

            <div className="mt-4">
              <MentionPicker selected={mentions} onChange={setMentions} />
              <p className="mt-2 text-xs text-slate-500">
                Tagged accounts receive a notification when the post is published.
              </p>
            </div>

            {postImagePreviews.length > 0 && (
              <div className="mt-4">
                <div className={`grid gap-2 ${
                  postImagePreviews.length === 1
                    ? "grid-cols-1"
                    : "grid-cols-2"
                }`}>
                  {postImagePreviews.map((preview, index) => (
                    <img
                      key={preview}
                      src={preview}
                      alt={`Post image preview ${index + 1}`}
                      className={`w-full rounded-xl border border-slate-200 object-cover ${
                        postImagePreviews.length === 1
                          ? "max-h-80"
                          : "aspect-square"
                      }`}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    postImagePreviews.forEach((preview) =>
                      URL.revokeObjectURL(preview)
                    );
                    setPostImageFiles([]);
                    setPostImagePreviews([]);
                  }}
                  className="mt-2 text-sm font-semibold text-red-600"
                >
                  Remove images
                </button>
              </div>
            )}

            {postVideoPreview && (
              <div className="mt-4">
                <video
                  src={postVideoPreview}
                  controls
                  preload="metadata"
                  className="max-h-[420px] w-full rounded-xl border border-slate-200 bg-black"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (postVideoPreview) URL.revokeObjectURL(postVideoPreview);
                    setPostVideoFile(null);
                    setPostVideoPreview("");
                  }}
                  className="mt-2 text-sm font-semibold text-red-600"
                >
                  Remove video
                </button>
              </div>
            )}

            {postDocumentFile && (
              <div className="mt-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {postDocumentFile.name}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {(postDocumentFile.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setPostDocumentFile(null)}
                  className="shrink-0 text-sm font-semibold text-red-600"
                >
                  Remove document
                </button>
              </div>
            )}

            <div className="mt-4 rounded-xl border border-slate-200 p-3">
              <label className="text-sm font-semibold">
                Schedule post{" "}
                <span className="font-normal text-slate-500">(optional)</span>
                <input
                  type="datetime-local"
                  value={scheduleAt}
                  onChange={(event) => setScheduleAt(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-normal sm:w-auto"
                />
              </label>
              <p className="mt-2 text-xs text-slate-500">
                Teachers and institutions can prepare academic posts in advance.
              </p>
            </div>

            <div className="mt-4 flex flex-col gap-3 rounded-xl bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold">Audience</p>
                <p className="text-xs text-slate-500">Choose who can see this post.</p>
              </div>
              <select
                value={postAudience}
                onChange={(event) =>
                  setPostAudience(event.target.value as "examify" | "connections")
                }
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold"
              >
                <option value="examify">🌐 Examify</option>
                <option value="connections">👥 Connections only</option>
              </select>
            </div>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-500">{postBody.length}/2000</p>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setComposerOpen(false)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 sm:w-auto"
                >
                  Cancel
                </button>
                <button
                disabled={
                  submitting ||
                  (!postBody.trim() &&
                    !postLink.trim() &&
                    postImageFiles.length === 0 &&
                    !postVideoFile &&
                    !postDocumentFile &&
                    !(
                      postMode === "poll" &&
                      pollQuestion.trim() &&
                      pollOptions.filter((option) => option.trim()).length >= 2
                    ))
                }
                className="w-full rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white disabled:opacity-50 sm:w-auto"
              >
                {submitting ? "Posting..." : "Post"}
                </button>
              </div>
            </div>
          </form>
            )}
          </>
        )}

        {role === "student" && (
          <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-semibold">Share an achievement</h2>
            <p className="mt-1 text-sm text-slate-600">
              Sharing is optional. Only exams you passed are available here.
            </p>

            {achievements.length > 0 ? (
              <form onSubmit={shareAchievement} className="mt-4 space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Passed exam
                  </label>
                  <select
                    value={achievementId}
                    onChange={(event) => setAchievementId(event.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
                  >
                    {achievements.map((achievement) => (
                      <option key={achievement.attempt_id} value={achievement.attempt_id}>
                        {achievement.exam_title} — {Number(achievement.score_percent).toFixed(1)}%
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Message <span className="font-normal text-slate-500">(optional)</span>
                  </label>
                  <textarea
                    value={achievementMessage}
                    onChange={(event) => setAchievementMessage(event.target.value)}
                    maxLength={2000}
                    rows={3}
                    placeholder="Add a message about your achievement..."
                    className="w-full resize-y rounded-xl border border-slate-300 px-4 py-3"
                  />
                </div>

                <button
                  disabled={submitting || !achievementId}
                  className="w-full rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white disabled:opacity-50 sm:w-auto"
                >
                  {submitting ? "Sharing..." : "Share achievement"}
                </button>
              </form>
            ) : (
              <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                You do not have a new passed exam available to share right now.
              </p>
            )}
          </section>
        )}

        {role === "parent" && (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
            Parents can read the community feed. Teachers and institutions can publish posts, and students can optionally share passed-exam achievements.
          </div>
        )}

        {role === "admin" && (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
            Administrators can review the feed but do not publish community posts. Use Admin → Manage posts to hide, archive, restore, or remove teacher and institution content.
          </div>
        )}

        {reportNotice && (
          <p className="mt-5 rounded-xl bg-green-50 p-4 text-sm text-green-700">{reportNotice}</p>
        )}

        {message && (
          <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{message}</p>
        )}

        <section className="mt-5 space-y-4">
          {posts.map((post, postIndex) => {
            const authorHref =
              post.author_role === "teacher"
                ? `/teachers/${post.author_id}`
                : post.author_role === "institution"
                  ? `/institutions/${post.author_id}`
                  : null;

            return (
              <div key={post.id} className="space-y-4">
              <article
                id={`post-${post.id}`}
                className="scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
              >
                <div className="p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      {post.author_avatar_url ? (
                        <img
                          src={post.author_avatar_url}
                          alt=""
                          className="h-11 w-11 shrink-0 rounded-full border border-slate-200 object-cover"
                        />
                      ) : (
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 font-bold text-slate-500">
                          {post.author_name.trim().charAt(0).toUpperCase()}
                        </div>
                      )}

                      <div className="min-w-0">
                        {authorHref ? (
                          <Link href={authorHref} className="font-semibold hover:underline">
                            {post.author_name}
                          </Link>
                        ) : (
                          <p className="font-semibold">{post.author_name}</p>
                        )}
                        <p className="mt-0.5 text-xs capitalize text-slate-500">
                          {post.author_role} · {new Date(post.created_at).toLocaleString()}
                        {" · "}
                        {post.audience === "connections" ? "👥 Connections" : "🌐 Examify"}
                        {post.edited_at ? " · Edited" : ""}
                        {post.is_pinned ? " · 📌 Pinned" : ""}
                        {post.scheduled_at &&
                        new Date(post.scheduled_at) > new Date() &&
                        post.author_id === userId
                          ? ` · Scheduled ${new Date(post.scheduled_at).toLocaleString()}`
                          : ""}
                        </p>
                      </div>
                    </div>

                    {(post.author_id === userId || role === "admin") && (
                      <button
                        type="button"
                        onClick={() => deletePost(post.id)}
                        className="shrink-0 text-xs font-semibold text-red-600"
                      >
                        {post.author_id === userId ? "Delete" : "Remove"}
                      </button>
                    )}
                  </div>

                  {post.body && (
                    <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                      {post.body}
                    </p>
                  )}

                  {post.post_type === "post" && (
                    <RichPostExtras
                      postId={post.id}
                      fallbackImageUrl={post.image_url}
                      authorId={post.author_id}
                      viewerId={userId}
                      viewerRole={role}
                      body={post.body}
                      audience={post.audience}
                      editedAt={post.edited_at}
                      isPinned={post.is_pinned}
                      scheduledAt={post.scheduled_at}
                      onUpdated={loadFeed}
                    />
                  )}

                  {post.post_type === "post" && (
                    <AttachmentPreviews
                      linkUrl={post.link_url}
                      documentUrl={post.document_url}
                      documentName={post.document_name}
                      documentMimeType={post.document_mime_type}
                      documentSize={post.document_size}
                    />
                  )}

                  {post.author_id !== userId && role !== "admin" && (
                    <div className="mt-4 border-t border-slate-100 pt-4">
                      {reportedPostIds.includes(post.id) ? (
                        <p className="text-xs font-semibold text-slate-500">Reported to Examify moderation</p>
                      ) : reportingPostId === post.id ? (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-sm font-semibold">Report this post</p>
                          <p className="mt-1 text-xs text-slate-500">Reports are private and reviewed by Examify administrators.</p>
                          <select
                            value={reportReason}
                            onChange={(e) => setReportReason(e.target.value)}
                            className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
                          >
                            <option value="inappropriate">Inappropriate content</option>
                            <option value="spam">Spam or misleading promotion</option>
                            <option value="harassment">Harassment or bullying</option>
                            <option value="misinformation">Academic misinformation</option>
                            <option value="other">Other</option>
                          </select>
                          <textarea
                            value={reportDetails}
                            onChange={(e) => setReportDetails(e.target.value)}
                            maxLength={1000}
                            rows={3}
                            placeholder="Optional details for the moderation team"
                            className="mt-3 w-full resize-y rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
                          />
                          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                            <button
                              type="button"
                              disabled={submitting}
                              onClick={() => submitReport(post.id)}
                              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                            >
                              Submit report
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setReportingPostId(null);
                                setReportDetails("");
                                setReportReason("inappropriate");
                              }}
                              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setReportingPostId(post.id)}
                          className="text-xs font-semibold text-slate-500 hover:text-slate-900"
                        >
                          Report post
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {post.shared_post_id && (
                  <div className="mx-5 mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                    {post.shared_author_name ? (
                      <>
                        <div className="p-4">
                          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                            Shared post
                          </p>
                          <p className="mt-1 font-bold">
                            {post.shared_author_name}
                          </p>
                          {post.shared_body && (
                            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                              {post.shared_body}
                            </p>
                          )}
                        </div>
                        {post.shared_image_url && (
                          <img
                            src={post.shared_image_url}
                            alt="Shared post"
                            className="max-h-96 w-full object-cover"
                          />
                        )}
                        {post.shared_document_url && (
                          <a
                            href={post.shared_document_url}
                            target="_blank"
                            rel="noreferrer"
                            className="block border-t border-slate-200 p-4 text-sm font-bold text-[#2563EB]"
                          >
                            {post.shared_document_name || "Open shared document"} →
                          </a>
                        )}
                        {post.shared_link_url && (
                          <a
                            href={post.shared_link_url}
                            target="_blank"
                            rel="noreferrer"
                            className="block truncate border-t border-slate-200 p-4 text-sm font-semibold text-[#2563EB]"
                          >
                            {post.shared_link_url}
                          </a>
                        )}
                      </>
                    ) : (
                      <p className="p-4 text-sm text-slate-500">
                        The original post is no longer available.
                      </p>
                    )}
                  </div>
                )}

                <FeedSharedResource postId={post.id} />

                {post.post_type === "achievement" && (
                  <div className="border-t border-slate-200 bg-slate-50">
                    {post.achievement_cover_image_url && (
                      <img
                        src={post.achievement_cover_image_url}
                        alt=""
                        className="aspect-[2/1] w-full object-cover"
                      />
                    )}
                    <div className="p-5">
                      <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                        Achievement · Passed
                      </span>
                      <h3 className="mt-3 text-lg font-semibold">
                        {post.achievement_exam_title ?? "Exam"}
                      </h3>
                      <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-600">
                        <span>
                          Score: <strong className="text-slate-900">{Number(post.achievement_score ?? 0).toFixed(1)}%</strong>
                        </span>
                        <span>
                          Passing score: <strong className="text-slate-900">{Number(post.achievement_passing_score ?? 0).toFixed(1)}%</strong>
                        </span>
                      </div>
                      {post.achievement_exam_id && (
                        <Link
                          href={`/exams/${post.achievement_exam_id}`}
                          className="mt-4 inline-block text-sm font-semibold"
                        >
                          View exam →
                        </Link>
                      )}
                    </div>
                  </div>
                )}

                {post.post_type === "exam" && post.feed_exam_id && (
                  <div className="border-t border-slate-200 bg-slate-50">
                    {post.feed_exam_cover_image_url && (
                      <img
                        src={post.feed_exam_cover_image_url}
                        alt={`${post.feed_exam_title ?? "Exam"} cover`}
                        className="aspect-[2/1] w-full object-cover"
                      />
                    )}

                    <div className="p-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
                          New exam
                        </span>

                        {post.feed_exam_category && (
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                            {post.feed_exam_category}
                          </span>
                        )}
                      </div>

                      <h3 className="mt-3 text-lg font-semibold">
                        {post.feed_exam_title ?? "Exam"}
                      </h3>

                      {post.feed_exam_short_description && (
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          {post.feed_exam_short_description}
                        </p>
                      )}

                      <Link
                        href={`/exams/${post.feed_exam_id}`}
                        className="mt-4 inline-block rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                      >
                        View exam
                      </Link>
                    </div>
                  </div>
                )}

                {canWritePost && post.author_id !== userId && (
                  <div className="border-t border-slate-200 px-5 py-3">
                    {sharingPostId === post.id ? (
                      <div className="rounded-xl bg-slate-50 p-3">
                        <textarea
                          value={shareMessage}
                          onChange={(event) => setShareMessage(event.target.value)}
                          rows={2}
                          maxLength={1000}
                          placeholder="Say something about this post... (optional)"
                          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
                        />
                        <p className="mt-2 text-xs text-slate-500">
                          Only posts shared with all of Examify can be reposted. Original attribution is always preserved.
                        </p>
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            disabled={submitting}
                            onClick={() => sharePost(post.id)}
                            className="rounded-xl bg-[#2563EB] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                          >
                            Share now
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSharingPostId(null);
                              setShareMessage("");
                            }}
                            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setSharingPostId(post.id);
                          setShareMessage("");
                        }}
                        className="text-sm font-bold text-[#2563EB]"
                      >
                        ↗ Share
                      </button>
                    )}
                  </div>
                )}

                <PostEngagement
                  postId={post.id}
                  postAuthorId={post.author_id}
                />
              </article>

              {postIndex === 2 && visibleDiscoveryItems.length > 0 && (
                <AcademicDiscoveryCard />
              )}

              {(postIndex + 1) % 5 === 0 && feedAds.length > 0 && (
                <SponsoredAd
                  ad={feedAds[Math.floor(postIndex / 5) % feedAds.length]}
                  placement="feed"
                />
              )}
              </div>
            );
          })}

          {posts.length > 0 &&
            posts.length < 3 &&
            visibleDiscoveryItems.length > 0 && (
              <AcademicDiscoveryCard />
            )}

          {posts.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <p className="font-semibold">The feed is empty.</p>
              <p className="mt-2 text-sm text-slate-500">
                Teacher and institution updates, along with shared student achievements, will appear here.
              </p>
            </div>
          )}
        </section>
        </div>

        <FeedRightRail />
      </div>
    </main>
  );
}
