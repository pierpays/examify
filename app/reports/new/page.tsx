"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Candidate = {
  user_id: string;
  display_name: string;
  role: string;
};

type Child = {
  student_id: string;
  student_name: string;
};

const categories = [
  {
    value: "bullying",
    label: "Bullying",
    help: "Repeated intimidation, humiliation, or aggressive behavior.",
  },
  {
    value: "cyberbullying",
    label: "Cyberbullying",
    help: "Harassment through messages, posts, images, or other online activity.",
  },
  {
    value: "verbal_harassment",
    label: "Verbal harassment",
    help: "Insults, name-calling, degrading comments, or repeated verbal abuse.",
  },
  {
    value: "physical_intimidation",
    label: "Physical intimidation or violence",
    help: "Pushing, hitting, unwanted physical contact, or threatening physical behavior.",
  },
  {
    value: "sexual_harassment",
    label: "Sexual harassment",
    help: "Unwanted sexual comments, messages, images, advances, or contact.",
  },
  {
    value: "discriminatory_harassment",
    label: "Discriminatory harassment",
    help: "Harassment related to race, ethnicity, nationality, religion, disability, sex, gender, or another protected characteristic.",
  },
  {
    value: "threats",
    label: "Threats or intimidation",
    help: "Threats of harm, retaliation, coercion, or behavior intended to cause fear.",
  },
  {
    value: "stalking",
    label: "Stalking or repeated unwanted contact",
    help: "Repeated following, monitoring, contacting, or attention after being asked to stop.",
  },
  {
    value: "hazing",
    label: "Hazing",
    help: "Humiliating, dangerous, or coercive initiation behavior.",
  },
  {
    value: "social_exclusion_rumors",
    label: "Social exclusion, rumors, or humiliation",
    help: "Deliberate exclusion, rumor spreading, public embarrassment, or social targeting.",
  },
  {
    value: "inappropriate_content",
    label: "Inappropriate content or messages",
    help: "Offensive, disturbing, sexual, violent, or otherwise inappropriate material.",
  },
  {
    value: "impersonation",
    label: "Impersonation or fake account",
    help: "Pretending to be another person or institution.",
  },
  {
    value: "privacy_violation",
    label: "Privacy violation",
    help: "Sharing private information, images, or personal details without permission.",
  },
  {
    value: "extortion_coercion",
    label: "Extortion, blackmail, or coercion",
    help: "Pressure, threats, or demands intended to force someone to act.",
  },
  {
    value: "other",
    label: "Other inappropriate behavior",
    help: "Use this when none of the categories above accurately describe the incident.",
  },
];

export default function NewBehaviorReportPage() {
  const supabase = useMemo(() => createClient(), []);

  const [myRole, setMyRole] = useState("");
  const [children, setChildren] = useState<Child[]>([]);
  const [affectedStudentId, setAffectedStudentId] = useState("");
  const [accountSearch, setAccountSearch] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [reportedAccount, setReportedAccount] = useState<Candidate | null>(
    null
  );

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("bullying");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadIdentity() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      const role = profile?.role ?? "";
      setMyRole(role);

      if (role === "parent") {
        const { data } = await supabase.rpc(
          "get_reporter_children"
        );

        setChildren((data ?? []) as Child[]);
      }
    }

    loadIdentity();
  }, [supabase]);

  useEffect(() => {
    const query = accountSearch.trim();

    if (query.length < 2 || reportedAccount) {
      setCandidates([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      const { data, error } = await supabase.rpc(
        "search_reportable_accounts",
        {
          p_query: query,
          p_limit: 20,
        }
      );

      if (!error) {
        setCandidates((data ?? []) as Candidate[]);
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [accountSearch, reportedAccount, supabase]);

  async function submitReport(event: FormEvent) {
    event.preventDefault();
    setMessage("");

    if (title.trim().length < 3) {
      setMessage("Please enter a report title.");
      return;
    }

    if (description.trim().length < 10) {
      setMessage(
        "Please provide enough detail for the report to be reviewed."
      );
      return;
    }

    setSubmitting(true);

    const { data, error } = await supabase.rpc(
      "submit_behavior_report",
      {
        p_title: title,
        p_description: description,
        p_category: category,
        p_reported_user_id:
          reportedAccount?.user_id ?? null,
        p_affected_student_id:
          myRole === "parent" && affectedStudentId
            ? affectedStudentId
            : null,
      }
    );

    if (error) {
      setMessage(error.message);
      setSubmitting(false);
      return;
    }

    window.location.href = `/reports?submitted=${data}`;
  }

  const selectedCategory = categories.find(
    (item) => item.value === category
  );

  return (
    <main className="min-h-screen px-4 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/reports"
          className="text-sm font-semibold text-[#2563EB]"
        >
          ← My reports
        </Link>

        <div className="mt-5">
          <p className="text-sm font-semibold text-[#2563EB]">
            Examify Safety
          </p>

          <h1 className="mt-1 text-3xl font-bold">
            Report inappropriate behavior
          </h1>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            Anyone on Examify can use this form to report behavior
            that feels unsafe, inappropriate, harassing, threatening,
            or otherwise concerning. You do not need to know the
            other person&apos;s account to submit a report.
          </p>
        </div>

        <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
          <strong>For urgent danger:</strong> use the appropriate
          local emergency or school safety process. Examify reports
          are intended for platform and institutional review and are
          not an emergency-response service.
        </div>

        <form
          onSubmit={submitReport}
          className="mt-6 space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
        >
          <div>
            <label className="text-sm font-bold">
              Title
            </label>
            <input
              required
              maxLength={160}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Briefly describe what happened"
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
            />
            <p className="mt-1 text-xs text-slate-500">
              Example: Repeated threatening messages after class
            </p>
          </div>

          <div>
            <label className="text-sm font-bold">
              Category
            </label>

            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
            >
              {categories.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>

            {selectedCategory && (
              <p className="mt-2 text-xs leading-5 text-slate-500">
                {selectedCategory.help}
              </p>
            )}
          </div>

          <div>
            <label className="text-sm font-bold">
              Description
            </label>

            <textarea
              required
              rows={7}
              maxLength={6000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what happened, when it happened, where it happened on Examify or elsewhere, and any other information that may help reviewers understand the situation."
              className="mt-2 w-full resize-y rounded-xl border border-slate-300 px-4 py-3"
            />

            <div className="mt-1 flex justify-between gap-4 text-xs text-slate-500">
              <span>
                Do not include passwords or unnecessary sensitive
                personal information.
              </span>
              <span>{description.length}/6000</span>
            </div>
          </div>

          <div>
            <label className="text-sm font-bold">
              Account involved{" "}
              <span className="font-normal text-slate-500">
                (optional)
              </span>
            </label>

            {reportedAccount ? (
              <div className="mt-2 flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div>
                  <p className="font-semibold">
                    {reportedAccount.display_name}
                  </p>
                  <p className="mt-1 text-xs capitalize text-slate-500">
                    {reportedAccount.role}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setReportedAccount(null);
                    setAccountSearch("");
                  }}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold"
                >
                  Change
                </button>
              </div>
            ) : (
              <>
                <input
                  type="search"
                  value={accountSearch}
                  onChange={(e) =>
                    setAccountSearch(e.target.value)
                  }
                  placeholder="Search by name"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
                />

                {candidates.length > 0 && (
                  <div className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
                    {candidates.map((candidate) => (
                      <button
                        key={candidate.user_id}
                        type="button"
                        onClick={() => {
                          setReportedAccount(candidate);
                          setCandidates([]);
                        }}
                        className="flex w-full items-center justify-between gap-3 rounded-lg p-3 text-left transition hover:bg-slate-50"
                      >
                        <span className="font-semibold">
                          {candidate.display_name}
                        </span>

                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold capitalize text-slate-600">
                          {candidate.role}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                <p className="mt-2 text-xs text-slate-500">
                  If you cannot find the account, leave this blank
                  and submit the report anyway.
                </p>
              </>
            )}
          </div>

          {myRole === "student" && (
            <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900">
              Because you are signed in as a student, Examify will
              treat you as the affected student for safety routing.
              Linked parents and accepted institutions may receive
              the report when appropriate.
            </div>
          )}

          {myRole === "parent" && children.length > 0 && (
            <div>
              <label className="text-sm font-bold">
                Is this report about one of your children?{" "}
                <span className="font-normal text-slate-500">
                  (optional)
                </span>
              </label>

              <select
                value={affectedStudentId}
                onChange={(e) =>
                  setAffectedStudentId(e.target.value)
                }
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
              >
                <option value="">
                  No — this is not a child safety report
                </option>
                {children.map((child) => (
                  <option
                    key={child.student_id}
                    value={child.student_id}
                  >
                    {child.student_name}
                  </option>
                ))}
              </select>

              <p className="mt-2 text-xs leading-5 text-slate-500">
                If you select a linked child, their accepted
                institution may receive a safety copy of the report.
              </p>
            </div>
          )}

          {message && (
            <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {message}
            </p>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-gradient-to-r from-[#2563EB] to-[#7C3AED] px-5 py-3 font-bold text-white disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Submit report"}
            </button>

            <Link
              href="/reports"
              className="rounded-xl border border-slate-300 px-5 py-3 text-center font-semibold"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}
