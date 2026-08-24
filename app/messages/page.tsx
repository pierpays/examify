"use client";

import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";

type Conversation = {
  conversation_id: string;
  other_user_id: string;
  display_name: string;
  role: string;
  avatar_url: string | null;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
  is_blocked_by_me: boolean;
  has_blocked_me: boolean;
};

type Message = {
  message_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

type SearchPerson = {
  user_id: string;
  display_name: string;
  role: string;
  avatar_url: string | null;
  is_blocked_by_me: boolean;
  has_blocked_me: boolean;
};

type BlockedUser = {
  user_id: string;
  display_name: string;
  role: string;
  avatar_url: string | null;
  blocked_at: string;
};

function RoleBadge({ role }: { role: string }) {
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold capitalize text-slate-600">
      {role}
    </span>
  );
}

function Avatar({
  name,
  src,
}: {
  name: string;
  src: string | null;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className="h-11 w-11 shrink-0 rounded-full object-cover"
      />
    );
  }

  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#2563EB] to-[#7C3AED] font-bold text-white">
      {name.trim().charAt(0).toUpperCase() || "E"}
    </div>
  );
}

export default function MessagesPage() {
  const supabase = useMemo(() => createClient(), []);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const [myUserId, setMyUserId] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageBody, setMessageBody] = useState("");
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<SearchPerson[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [showBlocked, setShowBlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [privacyAllowsMessaging, setPrivacyAllowsMessaging] = useState(true);

  async function loadConversations(preferredId?: string) {
    const { data, error } = await supabase.rpc(
      "get_my_direct_conversations"
    );

    if (error) {
      setNotice(error.message);
      return;
    }

    const next = (data ?? []).map((item: Conversation) => ({
      ...item,
      unread_count: Number(item.unread_count ?? 0),
    })) as Conversation[];

    setConversations(next);

    if (preferredId || selected?.conversation_id) {
      const targetId =
        preferredId ?? selected?.conversation_id ?? "";

      const updated =
        next.find(
          (conversation) =>
            conversation.conversation_id === targetId
        ) ?? null;

      if (updated) setSelected(updated);
    }
  }

  async function loadBlockedUsers() {
    const { data } = await supabase.rpc(
      "get_my_blocked_users"
    );

    setBlockedUsers((data ?? []) as BlockedUser[]);
  }

  async function loadMessages(conversationId: string) {
    const { data, error } = await supabase.rpc(
      "get_direct_messages",
      {
        p_conversation_id: conversationId,
        p_limit: 200,
      }
    );

    if (error) {
      setNotice(error.message);
      return;
    }

    setMessages((data ?? []) as Message[]);

    await supabase.rpc("mark_direct_conversation_read", {
      p_conversation_id: conversationId,
    });

    window.dispatchEvent(
      new Event("examify:messages-updated")
    );

    await loadConversations(conversationId);

    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({
        behavior: "smooth",
      });
    });
  }

  useEffect(() => {
    async function initialize() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      setMyUserId(user.id);

      const targetUserId =
        new URLSearchParams(window.location.search).get("user");

      await Promise.all([
        loadConversations(),
        loadBlockedUsers(),
      ]);

      if (targetUserId && targetUserId !== user.id) {
        const { data: allowed, error: permissionError } =
          await supabase.rpc("can_message_user", {
            p_target: targetUserId,
          });

        if (permissionError || !allowed) {
          setNotice(
            "Messaging is unavailable for this account because of privacy or safety settings."
          );
        } else {
          const { data: conversationId, error: conversationError } =
            await supabase.rpc("get_or_create_direct_conversation", {
              p_other_user_id: targetUserId,
            });

          if (conversationError) {
            setNotice(conversationError.message);
          } else if (conversationId) {
            const { data: refreshed } = await supabase.rpc(
              "get_my_direct_conversations"
            );

            const target = (
              (refreshed ?? []) as Conversation[]
            ).find(
              (item) =>
                item.conversation_id === String(conversationId)
            );

            if (target) {
              setConversations(
                (refreshed ?? []).map((item: Conversation) => ({
                  ...item,
                  unread_count: Number(item.unread_count ?? 0),
                })) as Conversation[]
              );
              setSelected(target);
            }
          }
        }

        window.history.replaceState({}, "", "/messages");
      }

      setLoading(false);
    }

    initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  useEffect(() => {
    if (!selected) {
      setMessages([]);
      setPrivacyAllowsMessaging(true);
      return;
    }

    const activeConversation = selected;

    async function loadMessagingPermission() {
      const { data, error } = await supabase.rpc(
        "can_message_user",
        {
          p_target: activeConversation.other_user_id,
        }
      );

      setPrivacyAllowsMessaging(!error && Boolean(data));
    }

    loadMessagingPermission();
    loadMessages(activeConversation.conversation_id);

    const channel = supabase
      .channel(
        `direct-messages:${activeConversation.conversation_id}`
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "direct_messages",
          filter: `conversation_id=eq.${activeConversation.conversation_id}`,
        },
        () => {
          loadMessages(activeConversation.conversation_id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.conversation_id, supabase]);

  useEffect(() => {
    const query = search.trim();

    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      const { data, error } = await supabase.rpc(
        "search_message_people",
        {
          p_query: query,
          p_limit: 20,
        }
      );

      if (error) {
        setNotice(error.message);
        return;
      }

      setSearchResults((data ?? []) as SearchPerson[]);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [search, supabase]);

  async function startConversation(person: SearchPerson) {
    setNotice("");

    if (person.has_blocked_me) {
      setNotice(
        "Messaging is unavailable for this account."
      );
      return;
    }

    if (person.is_blocked_by_me) {
      setNotice(
        "Unblock this account before starting a conversation."
      );
      return;
    }

    const { data, error } = await supabase.rpc(
      "get_or_create_direct_conversation",
      {
        p_other_user_id: person.user_id,
      }
    );

    if (error) {
      setNotice(error.message);
      return;
    }

    setSearch("");
    setSearchResults([]);

    await loadConversations(String(data));

    const { data: refreshed } = await supabase.rpc(
      "get_my_direct_conversations"
    );

    const target = (
      (refreshed ?? []) as Conversation[]
    ).find(
      (item) => item.conversation_id === String(data)
    );

    if (target) setSelected(target);
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();

    if (!selected || !messageBody.trim()) return;

    setSending(true);
    setNotice("");

    const { error } = await supabase.rpc(
      "send_direct_message",
      {
        p_conversation_id: selected.conversation_id,
        p_body: messageBody,
      }
    );

    if (error) {
      setNotice(error.message);
      setSending(false);
      return;
    }

    setMessageBody("");
    await loadMessages(selected.conversation_id);
    setSending(false);
  }

  async function blockUser() {
    if (!selected) return;

    const confirmed = window.confirm(
      `Block ${selected.display_name}? You will not be able to message each other until you unblock them.`
    );

    if (!confirmed) return;

    const { error } = await supabase.rpc(
      "block_examify_user",
      {
        p_user_id: selected.other_user_id,
      }
    );

    if (error) {
      setNotice(error.message);
      return;
    }

    setNotice(`${selected.display_name} has been blocked.`);
    await Promise.all([
      loadConversations(selected.conversation_id),
      loadBlockedUsers(),
    ]);
  }

  async function unblockUser(userId: string) {
    const { error } = await supabase.rpc(
      "unblock_examify_user",
      {
        p_user_id: userId,
      }
    );

    if (error) {
      setNotice(error.message);
      return;
    }

    setNotice("Account unblocked.");

    await Promise.all([
      loadConversations(selected?.conversation_id),
      loadBlockedUsers(),
    ]);
  }

  const messagingBlocked =
    selected?.is_blocked_by_me ||
    selected?.has_blocked_me ||
    !privacyAllowsMessaging;

  return (
    <main className="min-h-screen px-3 py-4 text-slate-900 sm:px-5 sm:py-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5">
          <p className="text-sm font-semibold text-[#2563EB]">
            Examify
          </p>

          <h1 className="mt-1 text-3xl font-bold">
            Messages
          </h1>

          <p className="mt-1 text-sm text-slate-600">
            Send academic messages to students, teachers, parents,
            institutions, and administrators.
          </p>

          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs leading-5 text-blue-900">
            <strong>Academic communications only.</strong> Messages must comply
            with Examify&apos;s Academic Community Standards and may be reviewed
            by authorized Examify personnel when reasonably necessary for
            safety, moderation, abuse prevention, investigations, enforcement,
            or legal compliance.{" "}
            <a href="/safety#messaging" className="font-bold underline">
              Read the messaging rules.
            </a>
          </div>
        </div>

        {notice && (
          <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            {notice}
          </div>
        )}

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:grid lg:min-h-[70vh] lg:grid-cols-[340px_1fr]">
          <aside
            className={`border-slate-200 lg:border-r ${
              selected ? "hidden lg:block" : "block"
            }`}
          >
            <div className="border-b border-slate-200 p-4">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search people to message"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
              />
              <p className="mt-2 text-[11px] leading-4 text-slate-400">
                Search only shows accounts whose messaging settings currently allow you to contact them.
              </p>

              {searchResults.length > 0 && (
                <div className="mt-3 max-h-72 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
                  {searchResults.map((person) => (
                    <button
                      key={person.user_id}
                      type="button"
                      onClick={() =>
                        startConversation(person)
                      }
                      className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition hover:bg-slate-50"
                    >
                      <Avatar
                        name={person.display_name}
                        src={person.avatar_url}
                      />

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold">
                            {person.display_name}
                          </p>
                          <RoleBadge role={person.role} />
                        </div>

                        {(person.is_blocked_by_me ||
                          person.has_blocked_me) && (
                          <p className="mt-1 text-xs text-red-600">
                            {person.is_blocked_by_me
                              ? "Blocked by you"
                              : "Messaging unavailable"}
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() =>
                  setShowBlocked((current) => !current)
                }
                className="mt-3 text-xs font-semibold text-slate-500 hover:text-[#2563EB]"
              >
                {showBlocked
                  ? "Hide blocked users"
                  : `Blocked users${
                      blockedUsers.length
                        ? ` (${blockedUsers.length})`
                        : ""
                    }`}
              </button>

              {showBlocked && (
                <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3">
                  {blockedUsers.map((user) => (
                    <div
                      key={user.user_id}
                      className="flex items-center gap-3"
                    >
                      <Avatar
                        name={user.display_name}
                        src={user.avatar_url}
                      />

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {user.display_name}
                        </p>
                        <p className="text-xs capitalize text-slate-500">
                          {user.role}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          unblockUser(user.user_id)
                        }
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                      >
                        Unblock
                      </button>
                    </div>
                  ))}

                  {blockedUsers.length === 0 && (
                    <p className="text-sm text-slate-500">
                      You have not blocked anyone.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="max-h-[62vh] overflow-y-auto lg:max-h-[calc(70vh-150px)]">
              {loading ? (
                <p className="p-5 text-sm text-slate-500">
                  Loading conversations...
                </p>
              ) : (
                conversations.map((conversation) => (
                  <button
                    key={conversation.conversation_id}
                    type="button"
                    onClick={() =>
                      setSelected(conversation)
                    }
                    className="flex w-full gap-3 border-b border-slate-100 p-4 text-left transition hover:bg-slate-50"
                  >
                    <Avatar
                      name={conversation.display_name}
                      src={conversation.avatar_url}
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-bold">
                              {conversation.display_name}
                            </p>
                            <RoleBadge
                              role={conversation.role}
                            />
                          </div>

                          <p className="mt-1 truncate text-xs text-slate-500">
                            {conversation.is_blocked_by_me
                              ? "Blocked by you"
                              : conversation.has_blocked_me
                                ? "Messaging unavailable"
                                : conversation.last_message ||
                                  "Start a conversation"}
                          </p>
                        </div>

                        {conversation.unread_count > 0 && (
                          <span className="min-w-5 rounded-full bg-[#2563EB] px-1.5 text-center text-[10px] font-bold leading-5 text-white">
                            {conversation.unread_count > 99
                              ? "99+"
                              : conversation.unread_count}
                          </span>
                        )}
                      </div>

                      {conversation.last_message_at && (
                        <p className="mt-1 text-[10px] text-slate-400">
                          {new Date(
                            conversation.last_message_at
                          ).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </button>
                ))
              )}

              {!loading &&
                conversations.length === 0 && (
                  <div className="p-8 text-center">
                    <p className="font-semibold">
                      No conversations yet.
                    </p>
                    <p className="mt-2 text-sm text-slate-500">
                      Search for another Examify user above
                      to start messaging.
                    </p>
                  </div>
                )}
            </div>
          </aside>

          <section
            className={`min-h-[60vh] ${
              selected ? "flex" : "hidden lg:flex"
            } flex-col`}
          >
            {selected ? (
              <>
                <div className="flex items-center gap-3 border-b border-slate-200 p-4">
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="rounded-lg px-2 py-2 text-sm font-semibold lg:hidden"
                    aria-label="Back to conversations"
                  >
                    ←
                  </button>

                  <Avatar
                    name={selected.display_name}
                    src={selected.avatar_url}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-bold">
                        {selected.display_name}
                      </p>
                      <RoleBadge role={selected.role} />
                    </div>

                    {messagingBlocked && (
                      <p className="mt-0.5 text-xs text-red-600">
                        {selected.is_blocked_by_me
                          ? "You blocked this account."
                          : "Messaging is unavailable."}
                      </p>
                    )}
                  </div>

                  {selected.is_blocked_by_me ? (
                    <button
                      type="button"
                      onClick={() =>
                        unblockUser(
                          selected.other_user_id
                        )
                      }
                      className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold"
                    >
                      Unblock
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={blockUser}
                      className="rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600"
                    >
                      Block
                    </button>
                  )}
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/70 p-4">
                  {messages.map((message) => {
                    const mine =
                      message.sender_id === myUserId;

                    return (
                      <div
                        key={message.message_id}
                        className={`flex ${
                          mine
                            ? "justify-end"
                            : "justify-start"
                        }`}
                      >
                        <div
                          className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm sm:max-w-[70%] ${
                            mine
                              ? "rounded-br-md bg-gradient-to-r from-[#2563EB] to-[#6D3EF0] text-white"
                              : "rounded-bl-md border border-slate-200 bg-white text-slate-800"
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words">
                            {message.body}
                          </p>

                          <p
                            className={`mt-1 text-[10px] ${
                              mine
                                ? "text-blue-100"
                                : "text-slate-400"
                            }`}
                          >
                            {new Date(
                              message.created_at
                            ).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    );
                  })}

                  {messages.length === 0 && (
                    <div className="py-16 text-center">
                      <p className="font-semibold">
                        Start the conversation.
                      </p>
                      <p className="mt-2 text-sm text-slate-500">
                        Academic messaging only. Messages are visible
                        to participants and may be reviewed by authorized
                        Examify personnel for safety, moderation, abuse
                        prevention, investigations, rule enforcement, or legal
                        compliance.
                      </p>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>

                <div className="border-t border-slate-200 bg-white p-4">
                  {messagingBlocked ? (
                    <div className="rounded-xl bg-slate-100 p-4 text-center text-sm text-slate-600">
                      {selected.is_blocked_by_me
                        ? "Unblock this account to send messages again."
                        : selected.has_blocked_me
                          ? "You cannot send messages to this account."
                          : "This user’s privacy settings do not currently allow messages from your account."}
                    </div>
                  ) : (
                    <form
                      onSubmit={sendMessage}
                      className="flex items-end gap-2"
                    >
                      <textarea
                        rows={1}
                        maxLength={5000}
                        value={messageBody}
                        onChange={(e) =>
                          setMessageBody(e.target.value)
                        }
                        placeholder="Write a message..."
                        className="max-h-36 min-h-11 flex-1 resize-y rounded-xl border border-slate-300 px-4 py-3 text-sm"
                      />

                      <button
                        type="submit"
                        disabled={
                          sending ||
                          !messageBody.trim()
                        }
                        className="rounded-xl bg-gradient-to-r from-[#2563EB] to-[#7C3AED] px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
                      >
                        {sending ? "Sending..." : "Send"}
                      </button>
                    </form>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center p-8 text-center">
                <div>
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-2xl">
                    ✉
                  </div>
                  <h2 className="mt-4 text-xl font-bold">
                    Your Examify messages
                  </h2>
                  <p className="mt-2 max-w-sm text-sm text-slate-500">
                    Choose a conversation or search for
                    another Examify user to start one.
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>

        <p className="mt-4 text-xs text-slate-500">
          Blocking prevents both accounts from sending new
          direct messages to each other. Existing conversation
          history is preserved and cannot be deleted by users
          the account.
        </p>
      </div>
    </main>
  );
}
