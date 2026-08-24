"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import ConnectionButton, {
  type ConnectionStatus,
} from "@/components/social/connection-button";

type PersonSuggestion = {
  user_id: string;
  display_name: string;
  role: string;
  avatar_url: string | null;
  career: string | null;
  studying_at: string | null;
  mutual_count: number;
  reason: string;
  connection_status: ConnectionStatus;
};

type TeacherSuggestion = {
  user_id: string;
  display_name: string;
  headline: string | null;
  avatar_url: string | null;
  follower_count: number;
  reason: string;
  is_following: boolean;
};

type InstitutionSuggestion = {
  user_id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  follower_count: number;
  reason: string;
  is_following: boolean;
};

function Avatar({
  name,
  src,
  square = false,
}: {
  name: string;
  src: string | null;
  square?: boolean;
}) {
  const shape = square ? "rounded-2xl" : "rounded-full";

  if (src) {
    return (
      <img
        src={src}
        alt=""
        className={`h-16 w-16 shrink-0 ${shape} object-cover`}
      />
    );
  }

  return (
    <div
      className={`flex h-16 w-16 shrink-0 items-center justify-center ${shape} bg-gradient-to-br from-blue-100 to-violet-100 text-xl font-extrabold text-[#1E3A8A]`}
    >
      {name.trim().charAt(0).toUpperCase() || "E"}
    </div>
  );
}

export default function DiscoverPage() {
  const supabase = useMemo(() => createClient(), []);

  const [people, setPeople] = useState<PersonSuggestion[]>([]);
  const [teachers, setTeachers] = useState<TeacherSuggestion[]>([]);
  const [institutions, setInstitutions] = useState<InstitutionSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setMessage("");

    const [peopleResult, teacherResult, institutionResult] =
      await Promise.all([
        supabase.rpc("get_people_you_may_know", { p_limit: 12 }),
        supabase.rpc("get_suggested_teachers", { p_limit: 8 }),
        supabase.rpc("get_suggested_institutions", { p_limit: 8 }),
      ]);

    const error =
      peopleResult.error ||
      teacherResult.error ||
      institutionResult.error;

    if (error) setMessage(error.message);

    setPeople((peopleResult.data ?? []) as PersonSuggestion[]);
    setTeachers((teacherResult.data ?? []) as TeacherSuggestion[]);
    setInstitutions(
      (institutionResult.data ?? []) as InstitutionSuggestion[]
    );
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [supabase]);

  return (
    <main className="min-h-screen px-3 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-3xl bg-gradient-to-r from-[#071A46] via-[#0B2F78] to-[#5B3FD6] p-6 text-white shadow-sm sm:p-8">
          <p className="text-sm font-bold text-blue-100">
            GROW YOUR ACADEMIC NETWORK
          </p>
          <h1 className="mt-1 text-3xl font-extrabold sm:text-4xl">
            Discover
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-blue-50">
            Find people you may know, teachers worth following, and verified
            institutions that can expand your academic network. Use Global Search
            for exams, groups, events, posts, and more.
          </p>

          <Link
            href="/search"
            className="mt-5 inline-flex rounded-xl bg-white px-5 py-3 text-sm font-bold text-[#1E3A8A]"
          >
            Search all of Examify
          </Link>
        </div>

        {message && (
          <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {message}
          </p>
        )}

        {loading ? (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
            Finding academic connections...
          </div>
        ) : (
          <>
            <section className="mt-8">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-xl font-extrabold">
                    People you may know
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Suggestions use mutual connections and academic context
                    while respecting each user&apos;s privacy settings.
                  </p>
                </div>

                <Link
                  href="/connections"
                  className="shrink-0 text-sm font-bold text-[#2563EB]"
                >
                  All connections →
                </Link>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {people.map((person) => (
                  <article
                    key={person.user_id}
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex items-start gap-4">
                      <Link href={`/people/${person.user_id}`}>
                        <Avatar
                          name={person.display_name}
                          src={person.avatar_url}
                        />
                      </Link>

                      <div className="min-w-0 flex-1">
                        <Link
                          href={
                            person.role === "teacher"
                              ? `/teachers/${person.user_id}`
                              : `/people/${person.user_id}`
                          }
                          className="block truncate font-extrabold hover:text-[#2563EB] hover:underline"
                        >
                          {person.display_name}
                        </Link>

                        <p className="mt-1 text-xs capitalize text-slate-500">
                          {person.role}
                        </p>

                        {person.career && (
                          <p className="mt-2 line-clamp-1 text-sm text-slate-600">
                            {person.career}
                          </p>
                        )}

                        {person.studying_at && (
                          <p className="mt-1 line-clamp-1 text-xs text-slate-500">
                            Studying at {person.studying_at}
                          </p>
                        )}
                      </div>
                    </div>

                    <p className="mt-4 rounded-xl bg-blue-50 px-3 py-2 text-xs font-semibold text-[#1E3A8A]">
                      {person.reason}
                    </p>

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

              {people.length === 0 && (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                  No new connection suggestions right now.
                </div>
              )}
            </section>

            <section className="mt-10">
              <h2 className="text-xl font-extrabold">
                Suggested teachers
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Discover public teacher profiles based on your academic network
                and activity across Examify.
              </p>

              <div className="mt-4 flex gap-4 overflow-x-auto pb-3">
                {teachers.map((teacher) => (
                  <Link
                    key={teacher.user_id}
                    href={`/teachers/${teacher.user_id}`}
                    className="w-[280px] shrink-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-[#2563EB]"
                  >
                    <Avatar
                      name={teacher.display_name}
                      src={teacher.avatar_url}
                    />
                    <h3 className="mt-4 truncate font-extrabold">
                      {teacher.display_name}
                    </h3>
                    {teacher.headline && (
                      <p className="mt-1 line-clamp-2 min-h-10 text-sm text-slate-600">
                        {teacher.headline}
                      </p>
                    )}
                    <p className="mt-3 text-xs font-semibold text-[#2563EB]">
                      {teacher.reason}
                    </p>
                    <p className="mt-2 text-xs text-slate-400">
                      {Number(teacher.follower_count)}{" "}
                      {Number(teacher.follower_count) === 1
                        ? "follower"
                        : "followers"}
                    </p>
                    <div className="mt-4 rounded-xl bg-slate-900 px-4 py-2.5 text-center text-sm font-bold text-white">
                      View teacher
                    </div>
                  </Link>
                ))}
              </div>
            </section>

            <section className="mt-10">
              <h2 className="text-xl font-extrabold">
                Suggested institutions
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Verified schools, academies, universities, training providers,
                and other educational institutions to explore.
              </p>

              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {institutions.map((institution) => (
                  <Link
                    key={institution.user_id}
                    href={`/institutions/${institution.user_id}`}
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-[#2563EB]"
                  >
                    <div className="flex items-start gap-4">
                      <Avatar
                        name={institution.name}
                        src={institution.avatar_url}
                        square
                      />
                      <div className="min-w-0">
                        <h3 className="line-clamp-2 font-extrabold">
                          {institution.name}
                        </h3>
                        <span className="mt-2 inline-block rounded-full bg-green-50 px-2.5 py-1 text-[11px] font-bold text-green-700">
                          ✓ Verified institution
                        </span>
                      </div>
                    </div>

                    {institution.description && (
                      <p className="mt-4 line-clamp-3 text-sm leading-6 text-slate-600">
                        {institution.description}
                      </p>
                    )}

                    <p className="mt-4 text-xs font-semibold text-[#2563EB]">
                      {institution.reason}
                    </p>
                    <p className="mt-2 text-xs text-slate-400">
                      {Number(institution.follower_count)}{" "}
                      {Number(institution.follower_count) === 1
                        ? "follower"
                        : "followers"}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
