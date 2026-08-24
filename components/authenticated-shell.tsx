"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ExamifyLogo, { ExamifyMark } from "@/components/branding/examify-logo";

export type AppRole = "student" | "teacher" | "parent" | "institution" | "admin";

type NavItem = {
  href: string;
  label: string;
};

function dashboardForRole(role: AppRole) {
  if (role === "admin") return "/admin/dashboard";
  if (role === "teacher") return "/creator/dashboard";
  if (role === "institution") return "/institution/dashboard";
  if (role === "parent") return "/parent/dashboard";
  return "/student/dashboard";
}

function navItemsForRole(role: AppRole): NavItem[] {
  const dashboard = {
    href: dashboardForRole(role),
    label: "Dashboard",
  };

  if (role === "admin") {
    return [
      dashboard,
      { href: "/feed", label: "Feed" },
      { href: "/notifications", label: "Notifications" },
      { href: "/saved-posts", label: "Saved posts" },
      { href: "/search", label: "Search" },
      { href: "/admin/institutions", label: "Institution verification" },
      { href: "/admin/reports", label: "Moderation reports" },
      { href: "/admin/posts", label: "Manage posts" },
      { href: "/admin/users", label: "Users" },
      { href: "/exams", label: "Browse exams" },
      { href: "/teachers", label: "Browse teachers" },
      { href: "/institutions", label: "Browse institutions" },
    ];
  }

  if (role === "teacher") {
    return [
      dashboard,
      { href: "/feed", label: "Feed" },
      { href: "/notifications", label: "Notifications" },
      { href: "/saved-posts", label: "Saved posts" },
      { href: "/search", label: "Search" },
      { href: "/creator/exams", label: "Manage exams" },
      { href: "/creator/analytics", label: "Analytics" },
      { href: "/creator/followers", label: "Followers" },
      { href: "/creator/institution-requests", label: "Institution requests" },
      { href: "/creator/institutions", label: "My institutions" },
      { href: "/institutions", label: "Browse institutions" },
      { href: "/teachers", label: "Browse teachers" },
      { href: "/creator/profile", label: "Profile" },
    ];
  }

  if (role === "institution") {
    return [
      dashboard,
      { href: "/feed", label: "Feed" },
      { href: "/notifications", label: "Notifications" },
      { href: "/saved-posts", label: "Saved posts" },
      { href: "/search", label: "Search" },
      { href: "/institution/members", label: "People & requests" },
      { href: "/teachers", label: "Browse teachers" },
      { href: "/institutions", label: "Browse institutions" },
      { href: "/institution/profile", label: "Institution profile" },
    ];
  }

  if (role === "parent") {
    return [
      dashboard,
      { href: "/feed", label: "Feed" },
      { href: "/notifications", label: "Notifications" },
      { href: "/saved-posts", label: "Saved posts" },
      { href: "/search", label: "Search" },
      { href: "/institutions", label: "Browse institutions" },
      { href: "/parent/institutions", label: "Following institutions" },
      { href: "/parent/requests", label: "Institution requests" },
      { href: "/parent/profile", label: "Profile" },
    ];
  }

  return [
    dashboard,
    { href: "/feed", label: "Feed" },
    { href: "/notifications", label: "Notifications" },
    { href: "/saved-posts", label: "Saved posts" },
    { href: "/search", label: "Search" },
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

function roleLabel(role: AppRole) {
  if (role === "admin") return "Admin";
  if (role === "teacher") return "Teacher";
  if (role === "institution") return "Institution";
  if (role === "parent") return "Parent";
  return "Student";
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10.5V20h13v-9.5" />
      <path d="M9.5 20v-6h5v6" />
    </svg>
  );
}

function FeedIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M8 9h8M8 13h8M8 17h5" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="11" cy="11" r="6" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export default function AuthenticatedShell({
  role,
  children,
}: {
  role: AppRole;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [institutionVerificationStatus, setInstitutionVerificationStatus] = useState<string | null>(
    role === "institution" ? null : "approved"
  );
  const items = navItemsForRole(role);
  const dashboardHref = dashboardForRole(role);

  useEffect(() => {
    let cancelled = false;

    async function loadUnreadNotifications() {
      const { data, error } = await supabase.rpc(
        "get_my_unread_notification_count"
      );

      if (!cancelled && !error) {
        setUnreadNotifications(Number(data ?? 0));
      }
    }

    loadUnreadNotifications();

    const handleNotificationsUpdated = () => {
      loadUnreadNotifications();
    };

    window.addEventListener(
      "examify:notifications-updated",
      handleNotificationsUpdated
    );

    return () => {
      cancelled = true;
      window.removeEventListener(
        "examify:notifications-updated",
        handleNotificationsUpdated
      );
    };
  }, [pathname, supabase]);

  useEffect(() => {
    if (role !== "institution") return;

    let cancelled = false;

    async function checkInstitutionVerification() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { data } = await supabase
        .from("institution_profiles")
        .select("verification_status")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;

      const status = data?.verification_status ?? "pending";
      setInstitutionVerificationStatus(status);

      if (status !== "approved" && pathname !== "/institution/verification") {
        window.location.replace("/institution/verification");
      }
    }

    checkInstitutionVerification();
    return () => {
      cancelled = true;
    };
  }, [pathname, role, supabase]);

  async function logout() {
    setLoggingOut(true);
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  function isActive(href: string) {
    if (href === "/feed") return pathname === "/feed";
    if (href === "/search") return pathname === "/search";
    if (href === dashboardHref) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  if (role === "institution" && institutionVerificationStatus === null) {
    return (
      <main className="min-h-screen bg-white px-4 py-10 text-slate-900">
        <div className="mx-auto max-w-3xl">Checking institution verification...</div>
      </main>
    );
  }

  if (role === "institution" && institutionVerificationStatus !== "approved") {
    return <div className="min-h-screen bg-white text-slate-900">{children}</div>;
  }

  const navigation = (
    <>
      <div className="border-b border-white/10 px-5 py-5">
        <ExamifyLogo href="/feed" inverse className="max-w-full" />
        <p className="mt-2 text-xs font-medium text-blue-100/80">
          {roleLabel(role)} account
        </p>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {items.map((item, index) => {
          const active = isActive(item.href);

          return (
            <Link
              key={`${item.href}-${item.label}`}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`block rounded-xl px-4 py-3 text-sm font-semibold transition ${
                active
                  ? "bg-gradient-to-r from-[#2563EB] to-[#7C3AED] text-white shadow-[0_8px_24px_rgba(37,99,235,0.24)]"
                  : "text-blue-50/90 hover:bg-white/10 hover:text-white"
              }`}
            >
              <span className="flex items-center justify-between gap-3">
                <span>
                  {index === 0 ? "⌂ " : ""}
                  {item.label}
                </span>

                {item.href === "/notifications" && unreadNotifications > 0 && (
                  <span
                    className={`min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold ${
                      active
                        ? "bg-white text-[#1E3A8A]"
                        : "bg-[#2563EB] text-white"
                    }`}
                  >
                    {unreadNotifications > 99 ? "99+" : unreadNotifications}
                  </span>
                )}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-3">
        <button
          type="button"
          onClick={logout}
          disabled={loggingOut}
          className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-left text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-50"
        >
          {loggingOut ? "Logging out..." : "Log out"}
        </button>
      </div>
    </>
  );

  const mobileTabs = [
    { href: dashboardHref, label: "Dashboard", icon: <HomeIcon /> },
    { href: "/feed", label: "Feed", icon: <FeedIcon /> },
    { href: "/search", label: "Search", icon: <SearchIcon /> },
  ];

  return (
    <div className="examify-shell min-h-screen bg-[#F4F7FB] text-slate-900 lg:flex">
      <aside className="hidden h-screen w-64 shrink-0 bg-gradient-to-b from-[#071A46] via-[#0B245C] to-[#081A42] text-white shadow-[10px_0_30px_rgba(15,23,42,0.08)] lg:sticky lg:top-0 lg:flex lg:flex-col">
        {navigation}
      </aside>

      <div className="min-w-0 flex-1">
        <header
          className="sticky top-0 z-30 flex items-center justify-between border-b border-white/10 px-4 py-3 text-white shadow-[0_6px_20px_rgba(7,26,70,0.18)] lg:hidden"
          style={{
            background:
              "linear-gradient(90deg, #071A46 0%, #0B2F78 55%, #123FA0 100%)",
          }}
        >
          <ExamifyLogo href="/feed" inverse compact={false} className="scale-90 origin-left" />

          <Link
            href="/search"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition hover:bg-white/20"
            aria-label="Search Examify"
          >
            <SearchIcon />
          </Link>
        </header>

        <header
          className="hidden h-16 items-center justify-between border-b border-white/10 px-6 text-white shadow-[0_6px_20px_rgba(7,26,70,0.16)] lg:flex"
          style={{
            background:
              "linear-gradient(90deg, #071A46 0%, #0B2F78 55%, #123FA0 100%)",
          }}
        >
          <Link
            href="/search"
            className="flex w-full max-w-md items-center gap-3 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm text-blue-50 transition hover:bg-white/15"
          >
            <SearchIcon />
            <span>Search Examify...</span>
          </Link>

          <div className="ml-6 flex items-center gap-3">
            <Link
              href="/notifications"
              className="relative flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white shadow-sm transition hover:bg-white/20"
              aria-label="Notifications"
            >
              <span className="text-lg">♧</span>
              {unreadNotifications > 0 && (
                <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-[#7C3AED] px-1.5 text-center text-[10px] font-bold leading-5 text-white">
                  {unreadNotifications > 99 ? "99+" : unreadNotifications}
                </span>
              )}
            </Link>
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white">
              {roleLabel(role)}
            </span>
          </div>
        </header>

        <div className="pb-20 lg:pb-0">{children}</div>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_18px_rgba(15,23,42,0.06)] backdrop-blur lg:hidden"
        aria-label="Mobile navigation"
      >
        <div className="mx-auto grid max-w-lg grid-cols-4">
          {mobileTabs.map((item) => {
            const active = isActive(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex min-h-16 flex-col items-center justify-center gap-1 px-2 py-2 text-[11px] font-semibold transition ${
                  active ? "text-[#2563EB]" : "text-slate-500"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <span className={active ? "scale-110" : ""}>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className={`flex min-h-16 flex-col items-center justify-center gap-1 px-2 py-2 text-[11px] font-semibold transition ${
              mobileOpen ? "text-[#7C3AED]" : "text-slate-500"
            }`}
            aria-label="Open navigation menu"
            aria-expanded={mobileOpen}
          >
            <span className="relative">
              <MenuIcon />
              {unreadNotifications > 0 && (
                <span className="absolute -right-2 -top-2 min-w-4 rounded-full bg-red-600 px-1 text-[9px] font-bold leading-4 text-white">
                  {unreadNotifications > 9 ? "9+" : unreadNotifications}
                </span>
              )}
            </span>
            <span>Menu</span>
          </button>
        </div>
      </nav>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation menu"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setMobileOpen(false)}
          />

          <aside className="absolute inset-y-0 right-0 flex w-[min(88vw,340px)] flex-col bg-gradient-to-b from-[#071A46] via-[#0B245C] to-[#081A42] text-white shadow-2xl">
            <div className="absolute right-3 top-3 z-10">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-white/80 hover:bg-white/10 hover:text-white"
                aria-label="Close navigation menu"
              >
                ✕
              </button>
            </div>
            {navigation}
          </aside>
        </div>
      )}
    </div>
  );
}
