"use client";

import { useEffect, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

export default function AccountStatusGuard() {
  const supabase = useMemo(() => createClient(), []);
  const handlingDisabled = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function checkAccountStatus() {
      if (handlingDisabled.current) return;

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled || !user) return;

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("is_disabled,disabled_reason")
        .eq("id", user.id)
        .maybeSingle();

      if (cancelled || error || !profile?.is_disabled) return;

      handlingDisabled.current = true;
      const reason = profile.disabled_reason?.trim();

      await supabase.auth.signOut();

      window.alert(
        reason
          ? `Your Examtify account is temporarily disabled. ${reason}`
          : "Your Examtify account is temporarily disabled. Please contact support for assistance.",
      );

      window.location.replace("/login?disabled=1");
    }

    void checkAccountStatus();

    const interval = window.setInterval(() => {
      void checkAccountStatus();
    }, 30000);

    function handleVisibilityOrFocus() {
      if (document.visibilityState === "visible") {
        void checkAccountStatus();
      }
    }

    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      window.setTimeout(() => void checkAccountStatus(), 0);
    });

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
      authListener.subscription.unsubscribe();
    };
  }, [supabase]);

  return null;
}
