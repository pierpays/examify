"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type PrivacySettings = {
  profile_visibility: string;
  career_visibility: string;
  studying_at_visibility: string;
  birthday_visibility: string;
  message_permission: string;
  connection_request_permission: string;
};

const defaults: PrivacySettings = {
  profile_visibility: "examify",
  career_visibility: "examify",
  studying_at_visibility: "examify",
  birthday_visibility: "connections",
  message_permission: "connections",
  connection_request_permission: "everyone",
};

export default function PrivacySettingsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [settings, setSettings] = useState<PrivacySettings>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.rpc("get_my_privacy_settings");
      if (error) setMessage(error.message);
      const row = Array.isArray(data) ? data[0] : data;
      if (row) setSettings(row as PrivacySettings);
      setLoading(false);
    }
    load();
  }, [supabase]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    const { error } = await supabase.rpc("update_my_privacy_settings", {
      p_profile_visibility: settings.profile_visibility,
      p_career_visibility: settings.career_visibility,
      p_studying_at_visibility: settings.studying_at_visibility,
      p_birthday_visibility: settings.birthday_visibility,
      p_message_permission: settings.message_permission,
      p_connection_request_permission: settings.connection_request_permission,
    });

    setSaving(false);
    setMessage(error ? error.message : "Privacy settings saved.");
  }

  if (loading) return <main className="p-6">Loading privacy settings...</main>;

  const selectClass = "mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3";

  return (
    <main className="min-h-screen px-3 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-3xl">
        <p className="text-sm font-bold text-[#2563EB]">ACCOUNT SETTINGS</p>
        <h1 className="mt-1 text-3xl font-extrabold">Privacy & audience</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Control who can see personal profile information and who can contact you.
          Examify administrators may still access information when necessary for platform
          safety, moderation, legal compliance, and investigations under the platform rules.
        </p>

        <form onSubmit={save} className="mt-6 space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">Profile visibility</h2>
            <p className="mt-1 text-sm text-slate-500">
              Choose whether your social profile can be opened by Examify users or only
              accepted connections.
            </p>
            <select
              value={settings.profile_visibility}
              onChange={(e) => setSettings({ ...settings, profile_visibility: e.target.value })}
              className={selectClass}
            >
              <option value="examify">All signed-in Examify users</option>
              <option value="connections">Connections only</option>
            </select>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">About information</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold">
                Career
                <select value={settings.career_visibility}
                  onChange={(e)=>setSettings({...settings,career_visibility:e.target.value})}
                  className={selectClass}>
                  <option value="examify">All Examify users</option>
                  <option value="connections">Connections only</option>
                  <option value="private">Only me</option>
                </select>
              </label>

              <label className="text-sm font-semibold">
                Studying at
                <select value={settings.studying_at_visibility}
                  onChange={(e)=>setSettings({...settings,studying_at_visibility:e.target.value})}
                  className={selectClass}>
                  <option value="examify">All Examify users</option>
                  <option value="connections">Connections only</option>
                  <option value="private">Only me</option>
                </select>
              </label>

              <label className="text-sm font-semibold sm:col-span-2">
                Birthday
                <select value={settings.birthday_visibility}
                  onChange={(e)=>setSettings({...settings,birthday_visibility:e.target.value})}
                  className={selectClass}>
                  <option value="examify">All Examify users</option>
                  <option value="connections">Connections only</option>
                  <option value="private">Only me</option>
                </select>
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">Contact permissions</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold">
                Who can message me?
                <select value={settings.message_permission}
                  onChange={(e)=>setSettings({...settings,message_permission:e.target.value})}
                  className={selectClass}>
                  <option value="everyone">Any Examify user</option>
                  <option value="connections">Connections only</option>
                  <option value="nobody">Nobody</option>
                </select>
              </label>

              <label className="text-sm font-semibold">
                Who can send connection requests?
                <select value={settings.connection_request_permission}
                  onChange={(e)=>setSettings({...settings,connection_request_permission:e.target.value})}
                  className={selectClass}>
                  <option value="everyone">Eligible Examify users</option>
                  <option value="mutuals">People with mutual connections</option>
                  <option value="nobody">Nobody</option>
                </select>
              </label>
            </div>
          </section>

          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
            Blocking a user continues to override these settings. A blocked account cannot
            use these privacy choices to regain access to you.
          </div>

          {message && (
            <p className="rounded-xl bg-slate-100 p-4 text-sm font-semibold text-slate-700">
              {message}
            </p>
          )}

          <button disabled={saving}
            className="w-full rounded-xl bg-gradient-to-r from-[#2563EB] to-[#7C3AED] px-5 py-3 font-bold text-white disabled:opacity-50 sm:w-auto">
            {saving ? "Saving..." : "Save privacy settings"}
          </button>
        </form>
      </div>
    </main>
  );
}
