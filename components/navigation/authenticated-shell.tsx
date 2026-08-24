"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ExamifyLogo, { ExamifyMark } from "@/components/branding/examify-logo";

export type AppRole = "student" | "teacher" | "parent" | "institution" | "admin";

type HeaderSearchSuggestion = {
  result_type:
    | "people"
    | "teachers"
    | "institutions"
    | "exams"
    | "groups"
    | "events"
    | "posts";
  result_id: string;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  href: string;
  meta: string | null;
  occurred_at: string | null;
};

type NavItem = {
  href: string;
  label: string;
};

type NavSection = {
  id: string;
  label: string;
  items: NavItem[];
};

function dashboardForRole(role: AppRole) {
  if (role === "admin") return "/admin/dashboard";
  if (role === "teacher") return "/creator/dashboard";
  if (role === "institution") return "/institution/dashboard";
  if (role === "parent") return "/parent/dashboard";
  return "/student/dashboard";
}

function profileForRole(role: AppRole) {
  if (role === "teacher") return "/creator/profile";
  if (role === "institution") return "/institution/profile";
  if (role === "parent") return "/parent/profile";
  if (role === "student") return "/student/profile";
  return "/admin/dashboard";
}

function navItemsForRole(role: AppRole): NavItem[] {
  const common: NavItem[] = [
    { href: dashboardForRole(role), label: "Dashboard" },
    { href: "/feed", label: "Feed" },
    { href: "/requests", label: "Requests" },
    { href: "/groups", label: "Groups & Classes" },
    { href: "/events", label: "Events" },
    { href: "/messages", label: "Messages" },
    { href: "/notifications", label: "Notifications" },
    { href: "/saved-posts", label: "Saved posts" },
    { href: "/search", label: "Search" },
    { href: "/discover", label: "Discover" },
    { href: "/celebrations", label: "Celebrations" },
    { href: "/reports/new", label: "Report behavior" },
    { href: "/safety", label: "Safety & Rules" },
    { href: "/settings/privacy", label: "Privacy" },
    { href: "/settings/notifications", label: "Notification settings" },
    { href: "/settings/activity", label: "Activity log" },
    { href: "/settings/security", label: "Security" },
  ];

  if (role !== "admin" && role !== "institution") {
    common.splice(6, 0, { href: "/connections", label: "Connections" });
  }

  if (role === "admin") {
    return [
      ...common,
      { href: "/admin/institutions", label: "Institution verification" },
      { href: "/admin/reports", label: "Moderation reports" },
      { href: "/safety-reports", label: "Safety reports" },
      { href: "/admin/posts", label: "Manage posts" },
      { href: "/admin/advertising", label: "Advertising" },
      { href: "/admin/users", label: "Users" },
      { href: "/exams", label: "Browse exams" },
      { href: "/teachers", label: "Browse teachers" },
      { href: "/institutions", label: "Browse institutions" },
    ];
  }

  if (role === "teacher") {
    return [
      ...common,
      { href: "/creator/exams", label: "Manage exams" },
      { href: "/creator/analytics", label: "Analytics" },
      { href: "/creator/followers", label: "Followers" },
      { href: "/creator/institution-requests", label: "Institution requests" },
      { href: "/creator/institutions", label: "My institutions" },
      { href: "/creator/classes", label: "My institution classes" },
      { href: "/institutions", label: "Browse institutions" },
      { href: "/teachers", label: "Browse teachers" },
      { href: "/creator/profile", label: "Profile" },
    ];
  }

  if (role === "institution") {
    return [
      ...common,
      { href: "/institution/members", label: "People & requests" },
      { href: "/institution/classes", label: "Academic years & classes" },
      { href: "/safety-reports", label: "Safety reports" },
      { href: "/teachers", label: "Browse teachers" },
      { href: "/institutions", label: "Browse institutions" },
      { href: "/institution/profile", label: "Institution profile" },
    ];
  }

  if (role === "parent") {
    return [
      ...common,
      { href: "/parent/children", label: "My children" },
      { href: "/safety-reports", label: "Safety reports" },
      { href: "/institutions", label: "Browse institutions" },
      { href: "/parent/institutions", label: "Following institutions" },
      { href: "/parent/requests", label: "Institution requests" },
      { href: "/parent/profile", label: "Profile" },
    ];
  }

  return [
    ...common,
    { href: "/exams", label: "Browse exams" },
    { href: "/teachers", label: "Browse teachers" },
    { href: "/institutions", label: "Browse institutions" },
    { href: "/student/following", label: "Following teachers" },
    { href: "/student/institutions", label: "Following institutions" },
    { href: "/student/saved", label: "Saved exams" },
    { href: "/student/history", label: "Exam history" },
    { href: "/student/institution-requests", label: "Institution requests" },
    { href: "/student/profile", label: "Profile" },
  ];
}

function navigationSectionsForRole(role: AppRole, items: NavItem[]): NavSection[] {
  const sections: NavSection[] = [
    { id: "home", label: "Home", items: [] },
    { id: "community", label: "Community", items: [] },
    { id: "learning", label: "Learning", items: [] },
    {
      id: "role-tools",
      label:
        role === "admin"
          ? "Admin tools"
          : role === "teacher"
            ? "Teacher tools"
            : role === "institution"
              ? "Institution tools"
              : role === "parent"
                ? "Parent tools"
                : "Student tools",
      items: [],
    },
    { id: "safety", label: "Safety & moderation", items: [] },
    { id: "account", label: "Account & settings", items: [] },
  ];

  function add(sectionId: string, item: NavItem) {
    sections.find((section) => section.id === sectionId)?.items.push(item);
  }

  for (const item of items) {
    const href = item.href;

    if (
      item.label === "Dashboard" ||
      href === "/feed" ||
      href === "/requests" ||
      href === "/messages" ||
      href === "/notifications"
    ) {
      add("home", item);
    } else if (
      href === "/groups" ||
      href === "/events" ||
      href === "/connections" ||
      href === "/saved-posts" ||
      href === "/search" ||
      href === "/discover" ||
      href === "/celebrations"
    ) {
      add("community", item);
    } else if (
      href === "/exams" ||
      href === "/teachers" ||
      href === "/institutions" ||
      href === "/student/following" ||
      href === "/student/institutions" ||
      href === "/student/saved" ||
      href === "/student/history"
    ) {
      add("learning", item);
    } else if (
      href === "/reports/new" ||
      href === "/safety" ||
      href === "/safety-reports" ||
      href === "/admin/reports" ||
      href === "/admin/posts"
    ) {
      add("safety", item);
    } else if (href.startsWith("/settings/") || href.endsWith("/profile")) {
      add("account", item);
    } else {
      add("role-tools", item);
    }
  }

  return sections.filter((section) => section.items.length > 0);
}

function roleLabel(role: AppRole) {
  if (role === "admin") return "Admin";
  if (role === "teacher") return "Teacher";
  if (role === "institution") return "Institution";
  if (role === "parent") return "Parent";
  return "Student";
}

function Icon({ type }: { type: "home" | "feed" | "search" | "message" | "menu" | "bell" }) {
  const common = "h-5 w-5";
  if (type === "home") {
    return <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-6h5v6"/></svg>;
  }
  if (type === "feed") {
    return <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>;
  }
  if (type === "search") {
    return <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg>;
  }
  if (type === "message") {
    return <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>;
  }
  if (type === "bell") {
    return <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
  }
  return <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M4 12h16M4 17h16"/></svg>;
}

export default function AuthenticatedShell({ role, children }: { role: AppRole; children: React.ReactNode }) {
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const dashboardHref = dashboardForRole(role);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [headerProfile, setHeaderProfile] = useState<{ id: string; full_name: string | null; avatar_url: string | null } | null>(null);
  const [headerSearch, setHeaderSearch] = useState("");
  const [headerSearchResults, setHeaderSearchResults] = useState<HeaderSearchSuggestion[]>([]);
  const [headerSearchLoading, setHeaderSearchLoading] = useState(false);
  const [headerSearchOpen, setHeaderSearchOpen] = useState(false);
  const headerSearchRef = useRef<HTMLDivElement | null>(null);
  const [institutionVerificationStatus, setInstitutionVerificationStatus] = useState<string | null>(role === "institution" ? null : "approved");

  const items = navItemsForRole(role);
  const sections = navigationSectionsForRole(role, items);

  function isActive(href: string) {
    if (href === "/feed" || href === "/search" || href === "/messages") return pathname === href;
    if (href === dashboardHref) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const state: Record<string, boolean> = {};
    for (const section of sections) {
      state[section.id] = section.id === "home" || section.items.some((item) => isActive(item.href));
    }
    return state;
  });

  useEffect(() => {
    const active = sections.find((section) => section.items.some((item) => isActive(item.href)));
    if (active) setOpenSections((current) => ({ ...current, [active.id]: true }));
    setMobileOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, role]);

  useEffect(() => {
    let cancelled = false;

    async function loadShellData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [notificationsResult, messagesResult, profileResult] = await Promise.all([
        supabase.rpc("get_my_unread_notification_count"),
        supabase.rpc("get_my_unread_message_count"),
        supabase.from("profiles").select("id,full_name,avatar_url").eq("id", user.id).maybeSingle(),
      ]);

      if (cancelled) return;
      if (!notificationsResult.error) setUnreadNotifications(Number(notificationsResult.data ?? 0));
      if (!messagesResult.error) setUnreadMessages(Number(messagesResult.data ?? 0));
      if (!profileResult.error) setHeaderProfile(profileResult.data ?? null);
    }

    void loadShellData();
    const refresh = () => void loadShellData();
    window.addEventListener("examify:notifications-updated", refresh);
    window.addEventListener("examify:messages-updated", refresh);
    const interval = window.setInterval(refresh, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("examify:notifications-updated", refresh);
      window.removeEventListener("examify:messages-updated", refresh);
    };
  }, [pathname, supabase]);

  useEffect(() => {
    if (role !== "institution") return;
    let cancelled = false;

    async function checkInstitutionVerification() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data } = await supabase.from("institution_profiles").select("verification_status").eq("user_id", user.id).maybeSingle();
      if (cancelled) return;
      const status = data?.verification_status ?? "pending";
      setInstitutionVerificationStatus(status);
      if (status !== "approved" && pathname !== "/institution/verification") {
        window.location.replace("/institution/verification");
      }
    }

    void checkInstitutionVerification();
    return () => { cancelled = true; };
  }, [pathname, role, supabase]);

  useEffect(() => {
    const term = headerSearch.trim();
    if (term.length < 2) {
      setHeaderSearchResults([]);
      setHeaderSearchLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setHeaderSearchLoading(true);
      const { data, error } = await supabase.rpc("search_examify_global", {
        p_query: term,
        p_exam_date: null,
        p_limit_per_type: 3,
      });
      if (cancelled) return;
      setHeaderSearchResults(error ? [] : ((data ?? []) as HeaderSearchSuggestion[]));
      setHeaderSearchLoading(false);
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [headerSearch, supabase]);

  useEffect(() => {
    function closeSearch(event: MouseEvent) {
      if (headerSearchRef.current && !headerSearchRef.current.contains(event.target as Node)) setHeaderSearchOpen(false);
    }
    document.addEventListener("mousedown", closeSearch);
    return () => document.removeEventListener("mousedown", closeSearch);
  }, []);

  async function logout() {
    setLoggingOut(true);
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const visibleHeaderSuggestions = ["people", "teachers", "institutions", "exams", "groups", "events", "posts"]
    .flatMap((type) => headerSearchResults.filter((result) => result.result_type === type).slice(0, 2))
    .slice(0, 8);

  if (role === "institution" && institutionVerificationStatus === null) {
    return <main className="min-h-screen px-4 py-10 text-slate-900"><div className="mx-auto max-w-3xl">Checking institution verification...</div></main>;
  }

  if (role === "institution" && institutionVerificationStatus !== "approved") {
    return <div className="min-h-screen bg-white text-slate-900">{children}</div>;
  }

  const navigation = (
    <>
      <nav className="flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
        <div className="space-y-5">
          {sections.map((section) => {
            const open = openSections[section.id] ?? false;
            const containsActive = section.items.some((item) => isActive(item.href));
            return (
              <section key={section.id}>
                <button
                  type="button"
                  onClick={() => setOpenSections((current) => ({ ...current, [section.id]: !open }))}
                  className="flex min-h-11 w-full items-center justify-between gap-3 px-1 text-left"
                  aria-expanded={open}
                >
                  <span className={`text-[12px] font-extrabold uppercase tracking-[0.06em] ${containsActive ? "text-[#123B88]" : "text-slate-600"}`}>{section.label}</span>
                  <span className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}>⌄</span>
                </button>

                {open && (
                  <div className="mt-1 space-y-1">
                    {section.items.map((item) => {
                      const active = isActive(item.href);
                      return (
                        <Link
                          key={`${item.href}-${item.label}`}
                          href={item.href}
                          onClick={() => setMobileOpen(false)}
                          className={`relative flex min-h-11 items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold transition ${active ? "bg-[#E9F1FF] text-[#0F5FEA]" : "text-slate-700 hover:bg-slate-100"}`}
                        >
                          <span className="truncate">{item.label}</span>
                          {item.href === "/notifications" && unreadNotifications > 0 && (
                            <span className="min-w-6 rounded-full bg-red-500 px-1.5 py-0.5 text-center text-[10px] font-extrabold text-white">{unreadNotifications > 99 ? "99+" : unreadNotifications}</span>
                          )}
                          {item.href === "/messages" && unreadMessages > 0 && (
                            <span className="min-w-6 rounded-full bg-red-500 px-1.5 py-0.5 text-center text-[10px] font-extrabold text-white">{unreadMessages > 99 ? "99+" : unreadMessages}</span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </nav>
      <div className="border-t border-slate-200 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <button type="button" onClick={logout} disabled={loggingOut} className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-700 disabled:opacity-50">
          {loggingOut ? "Logging out..." : "Log out"}
        </button>
      </div>
    </>
  );

  const mobileTabs = [
    { href: dashboardHref, label: "Home", icon: <Icon type="home" />, badge: 0 },
    { href: "/feed", label: "Feed", icon: <Icon type="feed" />, badge: 0 },
    { href: "/search", label: "Search", icon: <Icon type="search" />, badge: 0 },
    { href: "/messages", label: "Messages", icon: <Icon type="message" />, badge: unreadMessages },
  ];

  return (
    <div className="examify-shell min-h-screen bg-[#F5F7FB] text-slate-900">
      <header className="sticky top-0 z-50 border-b border-white/10 text-white shadow-[0_4px_18px_rgba(7,26,70,0.16)]" style={{ background: "linear-gradient(90deg, #071A46 0%, #0B2F78 55%, #123FA0 100%)" }}>
        <div className="flex h-[60px] items-center sm:h-[68px] lg:h-[76px]">
          <div className="hidden w-[300px] shrink-0 items-center px-6 lg:flex">
            <ExamifyLogo href="/feed" inverse className="max-w-[210px]" />
          </div>

          <div className="flex min-w-0 flex-1 items-center gap-3 px-3 sm:px-5 lg:px-6">
            <Link href="/feed" className="shrink-0 lg:hidden" aria-label="Go to feed"><ExamifyMark /></Link>

            <div ref={headerSearchRef} className="relative mx-auto hidden min-w-0 flex-1 sm:block lg:max-w-[680px]">
              <form action="/search" method="get" role="search" onSubmit={() => setHeaderSearchOpen(false)}>
                <div className="relative">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><Icon type="search" /></span>
                  <input
                    type="search"
                    name="q"
                    value={headerSearch}
                    onChange={(event) => { setHeaderSearch(event.target.value); setHeaderSearchOpen(true); }}
                    onFocus={() => { if (headerSearch.trim().length >= 2) setHeaderSearchOpen(true); }}
                    autoComplete="off"
                    placeholder="Search Examtify"
                    aria-label="Search Examtify"
                    className="w-full rounded-full border border-white/70 bg-white py-3 pl-12 pr-4 text-base font-medium text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-200 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </form>

              {headerSearchOpen && headerSearch.trim().length >= 2 && (
                <div className="absolute left-0 right-0 top-[calc(100%+10px)] z-[80] overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl">
                  <div className="max-h-[min(70vh,560px)] overflow-y-auto p-2">
                    {headerSearchLoading && <div className="px-4 py-4 text-sm text-slate-500">Searching Examtify...</div>}
                    {!headerSearchLoading && visibleHeaderSuggestions.length === 0 && <div className="px-4 py-4 text-sm text-slate-500">No quick matches. Press Enter to see all results.</div>}
                    {!headerSearchLoading && visibleHeaderSuggestions.map((result) => (
                      <Link key={`${result.result_type}-${result.result_id}`} href={result.href} onClick={() => { setHeaderSearchOpen(false); setHeaderSearch(""); }} className="flex min-h-14 items-center gap-3 rounded-xl px-3 py-3 hover:bg-slate-50">
                        {result.image_url ? <img src={result.image_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" /> : <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-extrabold text-[#0F5FEA]">{result.title.trim().charAt(0).toUpperCase() || "E"}</div>}
                        <div className="min-w-0 flex-1"><p className="truncate text-sm font-extrabold">{result.title}</p><p className="truncate text-xs text-slate-500">{result.meta ?? result.result_type}</p></div>
                        <span className="text-slate-300">→</span>
                      </Link>
                    ))}
                  </div>
                  <Link href={`/search?q=${encodeURIComponent(headerSearch.trim())}`} onClick={() => setHeaderSearchOpen(false)} className="flex min-h-12 items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-3 text-sm font-extrabold text-[#0F5FEA]">
                    <span className="truncate">See all results for “{headerSearch.trim()}”</span><span>→</span>
                  </Link>
                </div>
              )}
            </div>

            <div className="flex flex-1 items-center justify-end gap-1 sm:flex-none sm:gap-2">
              <Link href="/notifications" className="relative flex h-11 w-11 items-center justify-center rounded-full text-white/90 hover:bg-white/10" aria-label="Notifications">
                <Icon type="bell" />
                {unreadNotifications > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-red-500 px-1 text-center text-[10px] font-bold leading-5">{unreadNotifications > 99 ? "99+" : unreadNotifications}</span>}
              </Link>

              <Link href={profileForRole(role)} className="hidden h-11 w-11 items-center justify-center overflow-hidden rounded-full border-2 border-white/70 bg-white/10 text-sm font-extrabold text-white sm:flex" aria-label="Profile">
                {headerProfile?.avatar_url ? <img src={headerProfile.avatar_url} alt="" className="h-full w-full object-cover" /> : (headerProfile?.full_name || roleLabel(role)).charAt(0).toUpperCase()}
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-60px)] lg:min-h-[calc(100vh-76px)]">
        <aside className="hidden w-[300px] shrink-0 border-r border-slate-200 bg-white lg:sticky lg:top-[76px] lg:flex lg:h-[calc(100vh-76px)] lg:flex-col">{navigation}</aside>
        <div className="min-w-0 flex-1"><div className="pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0">{children}</div></div>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_18px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden" aria-label="Primary mobile navigation">
        <div className="mx-auto grid max-w-xl grid-cols-5">
          {mobileTabs.map((item) => {
            const active = isActive(item.href);
            return (
              <Link key={item.href} href={item.href} className={`relative flex min-h-16 flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] font-semibold transition sm:text-[11px] ${active ? "text-[#2563EB]" : "text-slate-500"}`} aria-current={active ? "page" : undefined}>
                <span className={`relative ${active ? "scale-110" : ""}`}>{item.icon}{item.badge > 0 && <span className="absolute -right-2.5 -top-2 min-w-4 rounded-full bg-red-500 px-1 text-center text-[9px] font-bold leading-4 text-white">{item.badge > 99 ? "99+" : item.badge}</span>}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}

          <button type="button" onClick={() => setMobileOpen(true)} className={`relative flex min-h-16 flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] font-semibold transition sm:text-[11px] ${mobileOpen ? "text-[#7C3AED]" : "text-slate-500"}`} aria-label="Open more navigation" aria-expanded={mobileOpen}>
            <span className="relative"><Icon type="menu" />{unreadNotifications > 0 && <span className="absolute -right-2 -top-2 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />}</span>
            <span>More</span>
          </button>
        </div>
      </nav>

      {mobileOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <button type="button" aria-label="Close more menu" className="absolute inset-0 bg-slate-950/50 backdrop-blur-[1px]" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-x-0 bottom-0 flex max-h-[86vh] flex-col overflow-hidden rounded-t-3xl bg-white text-slate-900 shadow-2xl">
            <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-slate-300" />
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#2563EB] to-[#7C3AED] font-extrabold text-white">
                  {headerProfile?.avatar_url ? <img src={headerProfile.avatar_url} alt="" className="h-full w-full object-cover" /> : (headerProfile?.full_name || roleLabel(role)).charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0"><p className="truncate font-extrabold">{headerProfile?.full_name || roleLabel(role)}</p><p className="text-xs font-semibold text-slate-500">{roleLabel(role)} account</p></div>
              </div>
              <button type="button" onClick={() => setMobileOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-xl text-slate-600" aria-label="Close more menu">×</button>
            </div>
            {navigation}
          </aside>
        </div>
      )}
    </div>
  );
}
