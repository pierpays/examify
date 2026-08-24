"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import ConnectionButton, {
  type ConnectionStatus,
} from "@/components/social/connection-button";

type Person = {
  user_id: string;
  display_name: string;
  role: string;
  avatar_url: string | null;
  career: string | null;
  studying_at: string | null;
  connection_status: ConnectionStatus;
  mutual_count: number;
};

type Request = {
  user_id: string;
  display_name: string;
  role: string;
  avatar_url: string | null;
  created_at: string;
};

function Avatar({
  person,
  size = "h-14 w-14",
}: {
  person: {
    display_name: string;
    avatar_url: string | null;
  };
  size?: string;
}) {
  return person.avatar_url ? (
    <img
      src={person.avatar_url}
      alt=""
      className={`${size} shrink-0 rounded-full object-cover`}
    />
  ) : (
    <div
      className={`${size} flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-100 to-violet-100 text-lg font-bold text-[#1E3A8A]`}
    >
      {person.display_name.charAt(0).toUpperCase()}
    </div>
  );
}

export default function ConnectionsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setMessage("");

    const [peopleResult, requestsResult] = await Promise.all([
      supabase.rpc("search_connectable_people", {
        p_query: query.trim(),
        p_limit: 100,
      }),
      supabase.rpc("get_my_connection_requests"),
    ]);

    if (peopleResult.error || requestsResult.error) {
      setMessage(
        peopleResult.error?.message ??
          requestsResult.error?.message ??
          "Unable to load connections."
      );
    }

    setPeople((peopleResult.data ?? []) as Person[]);
    setRequests((requestsResult.data ?? []) as Request[]);
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(load, 220);
    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function profileHref(person: Person | Request) {
    return person.role === "teacher"
      ? `/teachers/${person.user_id}`
      : `/people/${person.user_id}`;
  }

  const connected = people.filter(
    (person) => person.connection_status === "connected"
  );

  const discover = people.filter(
    (person) =>
      person.connection_status !== "connected" &&
      person.connection_status !== "received"
  );

  return (
    <main className="min-h-screen bg-[#F5F7FB] px-4 py-6 text-slate-900 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <p className="text-sm font-bold text-[#0F5FEA]">
          Examify Community
        </p>
        <h1 className="mt-1 text-3xl font-extrabold">Connections</h1>
        <p className="mt-2 text-sm text-slate-600">
          Build your academic network. Students connect with students,
          teachers with teachers, and parents with parents.
        </p>

        {requests.length > 0 && (
          <section className="mt-7 rounded-2xl border border-blue-200 bg-blue-50/50 p-5">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-extrabold">
                Connection requests
              </h2>
              <span className="rounded-full bg-[#0F5FEA] px-2.5 py-1 text-xs font-bold text-white">
                {requests.length}
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {requests.map((person) => (
                <article
                  key={person.user_id}
                  className="rounded-2xl border border-blue-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <Avatar person={person} />
                    <div className="min-w-0">
                      <Link
                        href={profileHref(person)}
                        className="block truncate font-extrabold hover:text-[#0F5FEA]"
                      >
                        {person.display_name}
                      </Link>
                      <p className="mt-1 text-xs capitalize text-slate-500">
                        {person.role} · sent you a connection request
                      </p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <ConnectionButton
                      userId={person.user_id}
                      initialStatus="received"
                      onChanged={() => load()}
                    />
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        <section className="mt-7">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-extrabold">My connections</h2>
              <p className="mt-1 text-sm text-slate-500">
                People already in your academic network.
              </p>
            </div>
            <span className="text-sm font-bold text-slate-500">
              {connected.length} connection
              {connected.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {connected.map((person) => (
              <article
                key={person.user_id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <Avatar person={person} />

                  <div className="min-w-0 flex-1">
                    <Link
                      href={profileHref(person)}
                      className="block truncate font-extrabold hover:text-[#0F5FEA]"
                    >
                      {person.display_name}
                    </Link>
                    <p className="text-xs capitalize text-slate-500">
                      {person.role}
                    </p>

                    {Number(person.mutual_count) > 0 && (
                      <p className="mt-1 text-xs font-semibold text-[#0F5FEA]">
                        {person.mutual_count} mutual connection
                        {Number(person.mutual_count) === 1 ? "" : "s"}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-4">
                  <ConnectionButton
                    userId={person.user_id}
                    initialStatus="connected"
                    onChanged={() => load()}
                  />
                </div>
              </article>
            ))}
          </div>

          {!loading && connected.length === 0 && (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-7 text-center text-sm text-slate-500">
              You do not have any connections yet.
            </div>
          )}
        </section>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-extrabold">Find people</h2>
          <p className="mt-1 text-sm text-slate-500">
            Search for people in your role who allow connection requests.
          </p>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search people by name"
            className="mt-4 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-400"
          />
        </section>

        {loading ? (
          <p className="mt-5 text-sm text-slate-500">
            Loading people...
          </p>
        ) : (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {discover.map((person) => (
              <article
                key={person.user_id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <Avatar person={person} />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={profileHref(person)}
                      className="block truncate font-extrabold hover:text-[#0F5FEA]"
                    >
                      {person.display_name}
                    </Link>
                    <p className="text-xs capitalize text-slate-500">
                      {person.role}
                    </p>
                    {person.career && (
                      <p className="mt-1 text-sm text-slate-600">
                        {person.career}
                      </p>
                    )}
                    {person.studying_at && (
                      <p className="text-xs text-slate-500">
                        Studying at {person.studying_at}
                      </p>
                    )}
                    {Number(person.mutual_count) > 0 && (
                      <p className="mt-1 text-xs font-semibold text-[#0F5FEA]">
                        {person.mutual_count} mutual connection
                        {Number(person.mutual_count) === 1 ? "" : "s"}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-4">
                  <ConnectionButton
                    userId={person.user_id}
                    initialStatus={person.connection_status}
                    onChanged={() => load()}
                  />
                </div>
              </article>
            ))}
          </div>
        )}

        {!loading && discover.length === 0 && query.trim() && (
          <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            No additional people matched “{query.trim()}”.
          </div>
        )}

        {message && (
          <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-600">
            {message}
          </p>
        )}
      </div>
    </main>
  );
}
