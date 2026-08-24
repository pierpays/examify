"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type RequestRow = {
  id: string;
  institution_id: string;
  status: string;
  institution_profiles: { name: string } | null;
};

export default function TeacherInstitutionRequestsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [message, setMessage] = useState("");
  const [workingId, setWorkingId] = useState("");

  async function load() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data, error } = await supabase
      .from("institution_relationships")
      .select("id,institution_id,status,institution_profiles(name)")
      .eq("member_id", user.id)
      .eq("relationship_type", "teacher")
      .order("created_at", { ascending: false });

    if (error) setMessage(error.message);
    else setRows((data ?? []) as unknown as RequestRow[]);
  }

  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function respond(
    id: string,
    status: "accepted" | "rejected"
  ) {
    setWorkingId(id);
    setMessage("");

    const { error } = await supabase.rpc(
      "respond_to_institution_relationship",
      {
        p_relationship_id: id,
        p_status: status,
      }
    );

    setWorkingId("");

    if (error) setMessage(error.message);
    else await load();
  }

  return (
    <main className="min-h-screen bg-white px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/creator/dashboard"
          className="font-semibold text-slate-600"
        >
          ← Back to dashboard
        </Link>

        <h1 className="mt-6 text-3xl font-bold">
          Institution requests
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Accept or reject institutions that want to add you as a teacher.
        </p>

        <div className="mt-6 space-y-3">
          {rows.map((row) => (
            <div key={row.id} className="rounded-2xl border p-5">
              <p className="font-semibold">
                {row.institution_profiles?.name ?? "Institution"}
              </p>
              <p className="mt-1 text-sm capitalize text-slate-500">
                {row.status}
              </p>

              {row.status === "pending" && (
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    disabled={workingId === row.id}
                    onClick={() => respond(row.id, "accepted")}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    disabled={workingId === row.id}
                    onClick={() => respond(row.id, "rejected")}
                    className="rounded-xl border px-4 py-2 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}

          {rows.length === 0 && (
            <p className="rounded-2xl border border-dashed p-8 text-center text-slate-500">
              No institution requests yet.
            </p>
          )}
        </div>

        {message && (
          <p className="mt-4 text-red-600">{message}</p>
        )}
      </div>
    </main>
  );
}
