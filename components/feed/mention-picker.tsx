"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type MentionPerson = {
  user_id: string;
  display_name: string;
  role: string;
  avatar_url: string | null;
};

export default function MentionPicker({
  selected,
  onChange,
}: {
  selected: MentionPerson[];
  onChange: (people: MentionPerson[]) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MentionPerson[]>([]);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      if (query.trim().length < 2) {
        setResults([]);
        return;
      }
      const { data } = await supabase.rpc("search_mentionable_people", {
        p_query: query.trim(),
        p_limit: 10,
      });
      setResults((data ?? []) as MentionPerson[]);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, supabase]);

  function add(person: MentionPerson) {
    if (!selected.some((item) => item.user_id === person.user_id)) {
      onChange([...selected, person]);
    }
    setQuery("");
    setResults([]);
  }

  return (
    <div className="relative">
      <label className="mb-2 block text-sm font-medium">
        Tag people or organizations{" "}
        <span className="font-normal text-slate-500">(optional)</span>
      </label>

      {selected.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {selected.map((person) => (
            <button
              key={person.user_id}
              type="button"
              onClick={() =>
                onChange(
                  selected.filter((item) => item.user_id !== person.user_id)
                )
              }
              className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-[#2563EB]"
            >
              @{person.display_name} ×
            </button>
          ))}
        </div>
      )}

      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Type at least 2 letters..."
        className="w-full rounded-xl border border-slate-300 px-4 py-3"
      />

      {results.length > 0 && (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
          {results.map((person) => (
            <button
              key={person.user_id}
              type="button"
              onClick={() => add(person)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-slate-50"
            >
              {person.avatar_url ? (
                <img
                  src={person.avatar_url}
                  alt=""
                  className="h-9 w-9 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 font-bold text-[#1E3A8A]">
                  {person.display_name.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">
                  {person.display_name}
                </span>
                <span className="block text-xs capitalize text-slate-500">
                  {person.role}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
