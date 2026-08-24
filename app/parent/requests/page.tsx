"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type OwnRequest = {
  id: string;
  institution_id: string;
  status: string;
  institution_profiles: { name: string } | null;
};

type ChildRequest = {
  relationship_id: string;
  institution_id: string;
  institution_name: string;
  student_id: string;
  student_name: string;
  status: string;
  created_at: string;
  responded_at: string | null;
};

export default function ParentInstitutionRequestsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [ownRequests, setOwnRequests] = useState<OwnRequest[]>([]);
  const [childRequests, setChildRequests] = useState<ChildRequest[]>([]);
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

    const [ownResult, childResult] = await Promise.all([
      supabase
        .from("institution_relationships")
        .select("id,institution_id,status,institution_profiles(name)")
        .eq("member_id", user.id)
        .eq("relationship_type", "parent")
        .order("created_at", { ascending: false }),
      supabase.rpc("get_parent_child_institution_requests"),
    ]);

    if (ownResult.error) {
      setMessage(ownResult.error.message);
    } else {
      setOwnRequests((ownResult.data ?? []) as unknown as OwnRequest[]);
    }

    if (childResult.error) {
      setMessage(childResult.error.message);
    } else {
      setChildRequests((childResult.data ?? []) as ChildRequest[]);
    }
  }

  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function respondToOwn(
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

  async function respondForChild(
    relationshipId: string,
    status: "accepted" | "rejected"
  ) {
    setWorkingId(relationshipId);
    setMessage("");

    const { error } = await supabase.rpc(
      "respond_to_child_institution_request",
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
      <div className="mx-auto max-w-4xl">
        <Link
          href="/parent/dashboard"
          className="font-semibold text-slate-600"
        >
          ← Back to dashboard
        </Link>

        <h1 className="mt-6 text-3xl font-extrabold">
          Institution requests
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Review requests for you and institution requests that require your approval for a child under 18.
        </p>

        {message && (
          <p className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {message}
          </p>
        )}

        <section className="mt-7">
          <h2 className="text-xl font-extrabold">Requests for my children</h2>
          <p className="mt-1 text-sm text-slate-500">
            A child under 18 cannot accept an institution request without a linked parent or guardian.
          </p>

          <div className="mt-4 space-y-3">
            {childRequests.map((request) => (
              <article
                key={request.relationship_id}
                className="rounded-2xl border border-blue-200 bg-white p-5 shadow-sm"
              >
                <p className="text-xs font-extrabold uppercase tracking-wide text-[#0F5FEA]">
                  Parent approval required
                </p>
                <h3 className="mt-2 text-lg font-extrabold">
                  {request.institution_name}
                </h3>
                <p className="mt-2 text-sm text-slate-700">
                  <strong>{request.institution_name}</strong> wants to add{" "}
                  <strong>{request.student_name}</strong> as a student.
                </p>
                <p className="mt-2 text-xs font-semibold capitalize text-slate-500">
                  Status: {request.status}
                </p>

                {request.status === "pending" && (
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      disabled={workingId === request.relationship_id}
                      onClick={() =>
                        respondForChild(request.relationship_id, "accepted")
                      }
                      className="rounded-xl bg-[#0F5FEA] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                    >
                      Accept for {request.student_name}
                    </button>
                    <button
                      type="button"
                      disabled={workingId === request.relationship_id}
                      onClick={() =>
                        respondForChild(request.relationship_id, "rejected")
                      }
                      className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold"
                    >
                      Decline
                    </button>
                  </div>
                )}
              </article>
            ))}

            {childRequests.length === 0 && (
              <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-7 text-center text-sm text-slate-500">
                No institution requests for your children.
              </p>
            )}
          </div>
        </section>

        <section className="mt-8 border-t border-slate-200 pt-7">
          <h2 className="text-xl font-extrabold">Requests for me</h2>

          <div className="mt-4 space-y-3">
            {ownRequests.map((request) => (
              <article
                key={request.id}
                className="rounded-2xl border border-slate-200 bg-white p-5"
              >
                <p className="font-extrabold">
                  {request.institution_profiles?.name ?? "Institution"}
                </p>
                <p className="mt-1 text-sm capitalize text-slate-500">
                  Add as parent · {request.status}
                </p>

                {request.status === "pending" && (
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      disabled={workingId === request.id}
                      onClick={() => respondToOwn(request.id, "accepted")}
                      className="rounded-xl bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      disabled={workingId === request.id}
                      onClick={() => respondToOwn(request.id, "rejected")}
                      className="rounded-xl border px-4 py-2 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </article>
            ))}

            {ownRequests.length === 0 && (
              <p className="text-sm text-slate-500">
                No direct institution requests for your account.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
