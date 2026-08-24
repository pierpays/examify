"use client";

import { FormEvent, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function NewExamPage() {
  const supabase = useMemo(() => createClient(), []);

  const [title, setTitle] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [description, setDescription] = useState("");
  const [passingScore, setPassingScore] = useState("70");
  const [timeLimit, setTimeLimit] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setMessage("You must be logged in.");
      setLoading(false);
      return;
    }

    const slug = slugify(title);

    const { data, error } = await supabase
      .from("exams")
      .insert({
        teacher_id: user.id,
        title,
        slug,
        short_description: shortDescription || null,
        description: description || null,
        passing_score: Number(passingScore),
        time_limit_minutes: timeLimit ? Number(timeLimit) : null,
        status: "draft",
        visibility: "public",
      })
      .select("id")
      .single();

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    window.location.href = `/creator/exams/${data.id}/edit`;
  }

  return (
    <main className="min-h-screen bg-white px-4 py-12 text-slate-900">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-bold">Create a new exam</h1>

        <p className="mt-2 text-slate-600">
          Start building a practice exam for your students.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label className="mb-2 block text-sm font-medium">
              Exam title
            </label>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900"
              placeholder="AWS SAA-C03 Practice Exam #1"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Short description
            </label>
            <input
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900"
              placeholder="A realistic AWS Solutions Architect practice exam"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Full description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900"
              placeholder="Describe what students should expect..."
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium">
                Passing score %
              </label>
              <input
                required
                type="number"
                min="0"
                max="100"
                value={passingScore}
                onChange={(e) => setPassingScore(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">
                Time limit (minutes)
              </label>
              <input
                type="number"
                min="1"
                value={timeLimit}
                onChange={(e) => setTimeLimit(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900"
                placeholder="Optional"
              />
            </div>
          </div>

          <button
            disabled={loading}
            className="w-full rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Creating exam..." : "Create exam"}
          </button>

          {message && (
            <p className="text-sm text-slate-600">
              {message}
            </p>
          )}
        </form>
      </div>
    </main>
  );
}
