"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type RequestRow = {
  relationship_id: string;
  institution_id: string;
  institution_name: string;
  status: string;
  requires_parent_approval: boolean;
  created_at: string;
  responded_at: string | null;
};

export default function StudentInstitutionRequestsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [message, setMessage] = useState("");
  const [workingId, setWorkingId] = useState("");

  async function load() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

    const { data, error } = await supabase.rpc(
      "get_my_student_institution_requests"
    );

    if (error) {
      setMessage(error.message);
      return;
    }

    setRows((data ?? []) as RequestRow[]);
  }

  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function respond(
    relationshipId: string,
    status: "accepted" | "rejected"
  ) {
    setWorkingId(relationshipId);
    setMessage("");

    const { error } = await supabase.rpc(
      "respond_to_institution_relationship",
      {
        p_relationship_id: relationshipId,
        p_status: status,
      }
    );

    setWorkingId("");

    if (error) {
      setMessage(error.message);
      return;
    }

    await load();
  }

  return (
    <main className="min-h-screen bg-[#F5F7FB] px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/student/dashboard"
          className="font-semibold text-slate-600"
        >
          ← Back to dashboard
        </Link>

        <h1 className="mt-6 text-3xl font-extrabold">
          Institution requests
        </h1>

        <div className="mt-6 space-y-3">
          {rows.map((request) => (
            <article
              key={request.relationship_id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <p className="font-extrabold">{request.institution_name}</p>
              <p className="mt-1 text-sm capitalize text-slate-500">
                Add as student · {request.status}
              </p>

              {request.status === "pending" &&
              request.requires_parent_approval ? (
                <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <p className="text-sm font-bold text-blue-900">
                    Waiting for parent or guardian approval
                  </p>
                  <p className="mt-1 text-xs leading-5 text-blue-800">
                    Because this account belongs to a student under 18, a linked parent or guardian must accept or decline this institution request.
                  </p>
                </div>
              ) : request.status === "pending" ? (
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    disabled={workingId === request.relationship_id}
                    onClick={() =>
                      respond(request.relationship_id, "accepted")
                    }
                    className="rounded-xl bg-[#0F5FEA] px-4 py-2 text-white disabled:opacity-50"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    disabled={workingId === request.relationship_id}
                    onClick={() =>
                      respond(request.relationship_id, "rejected")
                    }
                    className="rounded-xl border px-4 py-2 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              ) : null}
            </article>
          ))}

          {rows.length === 0 && (
            <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
              No institution requests yet.
            </p>
          )}
        </div>

        {message && (
          <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {message}
          </p>
        )}
      </div>
    </main>
  );
}
