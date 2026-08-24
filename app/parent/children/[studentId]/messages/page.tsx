"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Conversation = {
  conversation_id: string;
  other_user_id: string;
  display_name: string;
  role: string;
  avatar_url: string | null;
  last_message: string | null;
  last_message_at: string | null;
};

type Message = {
  message_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export default function ParentChildMessagesPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = use(params);
  const supabase = useMemo(() => createClient(), []);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);

  const loadConversations = useCallback(async () => {
    const { data, error } = await supabase.rpc(
      "get_parent_child_conversations",
      { p_student_id: studentId }
    );

    if (error) {
      setNotice(error.message);
      setConversations([]);
    } else {
      setConversations((data ?? []) as Conversation[]);
    }
    setLoading(false);
  }, [studentId, supabase]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!selected) {
      setMessages([]);
      return;
    }

    async function loadMessages() {
      const { data, error } = await supabase.rpc(
        "get_parent_child_messages",
        {
          p_student_id: studentId,
          p_conversation_id: selected?.conversation_id ?? "",
          p_limit: 500,
        }
      );

      if (error) {
        setNotice(error.message);
        setMessages([]);
      } else {
        setMessages((data ?? []) as Message[]);
      }
    }

    loadMessages();
  }, [selected, studentId, supabase]);

  return (
    <main className="min-h-screen bg-[#F5F7FB] px-3 py-5 text-slate-900 sm:px-5 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <Link
          href={`/parent/children/${studentId}`}
          className="text-sm font-bold text-[#0F5FEA]"
        >
          ← Child overview
        </Link>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-extrabold uppercase tracking-wide text-[#0F5FEA]">
            Parent / guardian supervision
          </p>
          <h1 className="mt-1 text-3xl font-extrabold">
            Child messages
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Read-only supervision for your linked child while under 18.
            Viewing here does not mark the child's messages as read.
            Parents cannot send, edit, or delete messages as the child.
          </p>
        </div>

        {notice && (
          <p className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-600">
            {notice}
          </p>
        )}

        <div className="mt-4 grid min-h-[560px] overflow-hidden rounded-2xl border border-slate-200 bg-white lg:grid-cols-[340px_1fr]">
          <aside
            className={`border-r border-slate-100 ${
              selected ? "hidden lg:block" : "block"
            }`}
          >
            <div className="border-b border-slate-100 p-4 font-bold">
              Conversations
            </div>

            <div className="max-h-[650px] overflow-y-auto p-2">
              {loading && (
                <p className="p-3 text-sm text-slate-500">
                  Loading conversations...
                </p>
              )}

              {!loading &&
                conversations.map((conversation) => (
                  <button
                    key={conversation.conversation_id}
                    type="button"
                    onClick={() => setSelected(conversation)}
                    className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-slate-50"
                  >
                    {conversation.avatar_url ? (
                      <img
                        src={conversation.avatar_url}
                        alt=""
                        className="h-11 w-11 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-50 font-bold text-[#0F5FEA]">
                        {conversation.display_name.charAt(0)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-bold">
                        {conversation.display_name}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {conversation.last_message ?? "No messages yet"}
                      </p>
                    </div>
                  </button>
                ))}

              {!loading && conversations.length === 0 && (
                <p className="p-5 text-center text-sm text-slate-500">
                  No conversations yet.
                </p>
              )}
            </div>
          </aside>

          <section className={selected ? "block" : "hidden lg:block"}>
            {selected ? (
              <>
                <header className="flex items-center gap-3 border-b border-slate-100 p-4">
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="rounded-lg border border-slate-200 px-3 py-2 lg:hidden"
                  >
                    ←
                  </button>
                  <div>
                    <p className="font-extrabold">
                      {selected.display_name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {selected.role} · read-only parent view
                    </p>
                  </div>
                </header>

                <div className="max-h-[590px] space-y-3 overflow-y-auto bg-slate-50 p-4">
                  {messages.map((message) => {
                    const fromChild =
                      message.sender_id === studentId;

                    return (
                      <div
                        key={message.message_id}
                        className={`flex ${
                          fromChild
                            ? "justify-end"
                            : "justify-start"
                        }`}
                      >
                        <div
                          className={`max-w-[82%] rounded-2xl px-4 py-3 ${
                            fromChild
                              ? "bg-[#0F5FEA] text-white"
                              : "border border-slate-200 bg-white"
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words text-sm">
                            {message.body}
                          </p>
                          <p
                            className={`mt-2 text-[11px] ${
                              fromChild
                                ? "text-blue-100"
                                : "text-slate-400"
                            }`}
                          >
                            {fromChild
                              ? "Your child"
                              : selected.display_name}{" "}
                            ·{" "}
                            {new Date(
                              message.created_at
                            ).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    );
                  })}

                  {messages.length === 0 && (
                    <p className="py-10 text-center text-sm text-slate-500">
                      No messages in this conversation.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div className="flex h-full items-center justify-center p-8 text-center text-sm text-slate-500">
                Choose a conversation to review.
              </div>
            )}
          </section>
        </div>

        <p className="mt-4 text-xs leading-5 text-slate-500">
          Examify preserves message history when accounts are blocked.
          Blocking prevents future contact; it does not erase prior
          communications.
        </p>
      </div>
    </main>
  );
}
