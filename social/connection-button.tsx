"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type ConnectionStatus =
  | "none"
  | "sent"
  | "received"
  | "connected"
  | "self"
  | "unavailable";

export default function ConnectionButton({
  userId,
  initialStatus,
  onChanged,
}: {
  userId: string;
  initialStatus: ConnectionStatus;
  onChanged?: (status: ConnectionStatus) => void;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const supabase = createClient();

  async function run(
    functionName: string,
    args: Record<string, unknown>,
    nextStatus: ConnectionStatus
  ) {
    setBusy(true);
    setError("");

    const { error: rpcError } = await supabase.rpc(functionName, args);

    if (rpcError) {
      setError(rpcError.message);
    } else {
      setStatus(nextStatus);
      onChanged?.(nextStatus);
      window.dispatchEvent(
        new Event("examify:notifications-updated")
      );
    }

    setBusy(false);
  }

  if (status === "self") return null;

  if (status === "unavailable") {
    return (
      <p className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-500">
        Not accepting connection requests
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {status === "none" && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(
                "send_connection_request",
                { p_user_id: userId },
                "sent"
              )
            }
            className="rounded-xl bg-[#0F5FEA] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#0B4FCC] disabled:opacity-50"
          >
            {busy ? "Sending..." : "+ Connect"}
          </button>
        )}

        {status === "sent" && (
          <>
            <span className="inline-flex items-center rounded-xl bg-blue-50 px-4 py-2.5 text-sm font-bold text-[#0F5FEA]">
              Request sent ✓
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(
                  "cancel_connection_request",
                  { p_user_id: userId },
                  "none"
                )
              }
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              {busy ? "Canceling..." : "Cancel request"}
            </button>
          </>
        )}

        {status === "received" && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(
                  "respond_connection_request",
                  {
                    p_user_id: userId,
                    p_accept: true,
                  },
                  "connected"
                )
              }
              className="rounded-xl bg-[#0F5FEA] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#0B4FCC] disabled:opacity-50"
            >
              {busy ? "Working..." : "Accept request"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(
                  "respond_connection_request",
                  {
                    p_user_id: userId,
                    p_accept: false,
                  },
                  "none"
                )
              }
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              Decline
            </button>
          </>
        )}

        {status === "connected" && (
          <>
            <span className="inline-flex items-center rounded-xl bg-green-50 px-4 py-2.5 text-sm font-bold text-green-700">
              ✓ Connected
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    "Remove this person from your connections?"
                  )
                ) {
                  run(
                    "remove_connection",
                    { p_user_id: userId },
                    "none"
                  );
                }
              }}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
            >
              {busy ? "Removing..." : "Remove connection"}
            </button>
          </>
        )}
      </div>

      {error && (
        <p className="mt-2 text-xs font-semibold text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
