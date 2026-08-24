"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Preferences = {
  social_engagement: boolean;
  connections: boolean;
  event_invites: boolean;
  academic_updates: boolean;
};

const defaults: Preferences = {
  social_engagement: true,
  connections: true,
  event_invites: true,
  academic_updates: true,
};

export default function NotificationPreferencesPage() {
  const supabase = useMemo(() => createClient(), []);
  const [prefs, setPrefs] = useState<Preferences>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.rpc("get_my_notification_preferences");
      if (error) setMessage(error.message);

      const row = Array.isArray(data) ? data[0] : data;
      if (row) setPrefs(row as Preferences);
      setLoading(false);
    }

    load();
  }, [supabase]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    const { error } = await supabase.rpc("update_my_notification_preferences", {
      p_social_engagement: prefs.social_engagement,
      p_connections: prefs.connections,
      p_event_invites: prefs.event_invites,
      p_academic_updates: prefs.academic_updates,
    });

    setSaving(false);
    setMessage(error ? error.message : "Notification preferences saved.");
  }

  function Toggle({
    title,
    description,
    value,
    onChange,
  }: {
    title: string;
    description: string;
    value: boolean;
    onChange: (value: boolean) => void;
  }) {
    return (
      <label className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <span>
          <span className="block font-bold">{title}</span>
          <span className="mt-1 block text-sm leading-6 text-slate-500">
            {description}
          </span>
        </span>
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-1 h-5 w-5 shrink-0"
        />
      </label>
    );
  }

  if (loading) return <main className="p-6">Loading notification preferences...</main>;

  return (
    <main className="min-h-screen px-3 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-3xl">
        <p className="text-sm font-bold text-[#2563EB]">YOUR ACCOUNT</p>
        <h1 className="mt-1 text-3xl font-extrabold">Notification preferences</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Choose which non-critical in-app notifications Examify creates for you.
        </p>

        <form onSubmit={save} className="mt-6 space-y-4">
          <Toggle
            title="Social engagement"
            description="Reactions, comments, group activity, invitations, mentions, shares, birthday wishes, anniversaries, and achievement congratulations."
            value={prefs.social_engagement}
            onChange={(value) => setPrefs({ ...prefs, social_engagement: value })}
          />

          <Toggle
            title="Connections"
            description="Connection requests and accepted connection notifications."
            value={prefs.connections}
            onChange={(value) => setPrefs({ ...prefs, connections: value })}
          />

          <Toggle
            title="Event invitations"
            description="Invitations to academic events, workshops, webinars, and study sessions."
            value={prefs.event_invites}
            onChange={(value) => setPrefs({ ...prefs, event_invites: value })}
          />

          <Toggle
            title="Academic updates"
            description="Academic notifications such as linked-child exam results."
            value={prefs.academic_updates}
            onChange={(value) => setPrefs({ ...prefs, academic_updates: value })}
          />

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
            <strong>Safety notifications cannot be disabled.</strong> Reports or alerts
            involving student safety, inappropriate behavior, or platform enforcement
            will still be delivered when applicable.
          </div>

          {message && (
            <p className="rounded-xl bg-slate-100 p-4 text-sm font-semibold text-slate-700">
              {message}
            </p>
          )}

          <button
            disabled={saving}
            className="rounded-xl bg-gradient-to-r from-[#2563EB] to-[#7C3AED] px-5 py-3 font-bold text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save preferences"}
          </button>
        </form>
      </div>
    </main>
  );
}
