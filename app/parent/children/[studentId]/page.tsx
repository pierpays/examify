"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Attempt = {
  attempt_id: string;
  exam_id: string;
  exam_title: string;
  score_percent: number;
  passing_score: number;
  passed: boolean;
  completed_at: string;
};

type FollowedTeacher = {
  teacher_id: string;
  display_name: string;
  avatar_url: string | null;
  shared_class_names: string;
  parent_blocked: boolean;
  followed_at: string;
};

type BlockedTeacher = {
  teacher_id: string;
  display_name: string;
  avatar_url: string | null;
  blocked_at: string;
};

export default function ChildAcademicPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = use(params);
  const supabase = useMemo(() => createClient(), []);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [teachers, setTeachers] = useState<FollowedTeacher[]>([]);
  const [blockedTeachers, setBlockedTeachers] = useState<BlockedTeacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");

    const [academicResult, teachersResult, blocksResult] =
      await Promise.all([
        supabase.rpc("get_child_academic_overview", {
          p_student_id: studentId,
        }),
        supabase.rpc("get_parent_child_followed_teachers", {
          p_student_id: studentId,
        }),
        supabase.rpc("get_parent_child_teacher_blocks", {
          p_student_id: studentId,
        }),
      ]);

    if (academicResult.error) {
      setMessage(academicResult.error.message);
    } else {
      setAttempts((academicResult.data ?? []) as Attempt[]);
    }

    if (teachersResult.error) {
      setMessage(teachersResult.error.message);
    } else {
      setTeachers((teachersResult.data ?? []) as FollowedTeacher[]);
    }

    if (!blocksResult.error) {
      setBlockedTeachers((blocksResult.data ?? []) as BlockedTeacher[]);
    }

    setLoading(false);
  }, [studentId, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function removeTeacher(teacher: FollowedTeacher) {
    if (
      !window.confirm(
        `Remove ${teacher.display_name} from your child's followed teachers?`
      )
    ) {
      return;
    }

    const { error } = await supabase.rpc(
      "parent_remove_child_teacher_follow",
      {
        p_student_id: studentId,
        p_teacher_id: teacher.teacher_id,
      }
    );

    if (error) {
      setMessage(error.message);
      return;
    }

    await load();
  }

  async function blockTeacher(teacher: FollowedTeacher) {
    if (
      !window.confirm(
        `Block ${teacher.display_name} for your child? This removes the follow and prevents teacher follow/private messaging even if they share a class.`
      )
    ) {
      return;
    }

    const { error } = await supabase.rpc(
      "parent_block_teacher_for_child",
      {
        p_student_id: studentId,
        p_teacher_id: teacher.teacher_id,
      }
    );

    if (error) {
      setMessage(error.message);
      return;
    }

    await load();
  }

  async function unblockTeacher(teacherId: string) {
    const { error } = await supabase.rpc(
      "parent_unblock_teacher_for_child",
      {
        p_student_id: studentId,
        p_teacher_id: teacherId,
      }
    );

    if (error) {
      setMessage(error.message);
      return;
    }

    await load();
  }

  const average = attempts.length
    ? attempts.reduce(
        (sum, attempt) => sum + Number(attempt.score_percent),
        0
      ) / attempts.length
    : 0;
  const passed = attempts.filter((attempt) => attempt.passed).length;

  return (
    <main className="min-h-screen px-4 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/parent/children"
          className="text-sm font-semibold text-[#2563EB]"
        >
          ← My children
        </Link>

        <h1 className="mt-4 text-3xl font-bold">
          Child overview & safety
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Parents and guardians can supervise teacher follows and review
          messages for linked children under 18. This access ends
          automatically when the child turns 18.
        </p>

        <div className="mt-5">
          <Link
            href={`/parent/children/${studentId}/messages`}
            className="inline-flex rounded-xl bg-[#0F5FEA] px-5 py-3 text-sm font-bold text-white"
          >
            Review child messages
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">Completed</p>
            <p className="mt-1 text-xl font-bold">{attempts.length}</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">Average</p>
            <p className="mt-1 text-xl font-bold">
              {average.toFixed(1)}%
            </p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">Passed</p>
            <p className="mt-1 text-xl font-bold">{passed}</p>
          </div>
        </div>

        {message && (
          <p className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-600">
            {message}
          </p>
        )}

        <section className="mt-8">
          <h2 className="text-xl font-bold">Teachers followed</h2>
          <p className="mt-1 text-sm text-slate-500">
            For a minor, a teacher follow is permitted only while the
            teacher is assigned to an active class containing your child.
          </p>

          <div className="mt-4 space-y-3">
            {teachers.map((teacher) => (
              <div
                key={teacher.teacher_id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  {teacher.avatar_url ? (
                    <img
                      src={teacher.avatar_url}
                      alt=""
                      className="h-12 w-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 font-bold text-[#0F5FEA]">
                      {teacher.display_name.charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">
                      {teacher.display_name}
                    </p>
                    <p className="text-xs text-slate-500">
                      Class: {teacher.shared_class_names}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <Link
                    href={`/teachers/${teacher.teacher_id}`}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-center text-xs font-bold"
                  >
                    View
                  </Link>
                  <button
                    type="button"
                    onClick={() => removeTeacher(teacher)}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold"
                  >
                    Remove
                  </button>
                  <button
                    type="button"
                    onClick={() => blockTeacher(teacher)}
                    className="rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-600"
                  >
                    Block
                  </button>
                </div>
              </div>
            ))}

            {!loading && teachers.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
                Your child is not following any teachers.
              </div>
            )}
          </div>
        </section>

        {blockedTeachers.length > 0 && (
          <section className="mt-8">
            <h2 className="text-xl font-bold">
              Parent teacher safety blocks
            </h2>
            <div className="mt-4 space-y-3">
              {blockedTeachers.map((teacher) => (
                <div
                  key={teacher.teacher_id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-red-100 bg-white p-4"
                >
                  <div>
                    <p className="font-bold">{teacher.display_name}</p>
                    <p className="text-xs text-slate-500">
                      Follow and private teacher messaging are blocked.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => unblockTeacher(teacher.teacher_id)}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold"
                  >
                    Unblock
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="mt-8">
          <h2 className="text-xl font-bold">Academic activity</h2>
          <div className="mt-4 space-y-3">
            {loading ? (
              <p>Loading...</p>
            ) : (
              attempts.map((attempt) => (
                <div
                  key={attempt.attempt_id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-bold">{attempt.exam_title}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {new Date(
                          attempt.completed_at
                        ).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${
                          attempt.passed
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {attempt.passed ? "Passed" : "Not passed"}
                      </span>
                      <span className="text-xl font-bold">
                        {Number(attempt.score_percent).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}

            {!loading && attempts.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                No completed exams yet.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
