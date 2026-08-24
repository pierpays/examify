"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Year = {
  id: string;
  name: string;
  starts_on: string | null;
  ends_on: string | null;
  is_active: boolean;
};

type ClassRow = {
  id: string;
  name: string;
  academic_year_id: string;
  description: string | null;
};

type Teacher = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
};

type Assignment = {
  group_id: string;
  teacher_id: string;
};

type Student = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  membership_status: string | null;
};

export default function InstitutionClassesPage() {
  const supabase = useMemo(() => createClient(), []);

  const [years, setYears] = useState<Year[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  const [yearName, setYearName] = useState("");
  const [starts, setStarts] = useState("");
  const [ends, setEnds] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [className, setClassName] = useState("");
  const [description, setDescription] = useState("");
  const [teacherQuery, setTeacherQuery] = useState("");

  const [studentQueries, setStudentQueries] = useState<Record<string, string>>({});
  const [studentResults, setStudentResults] = useState<Record<string, Student[]>>({});
  const [studentSearchLoading, setStudentSearchLoading] = useState<Record<string, boolean>>({});
  const [studentSearchDone, setStudentSearchDone] = useState<Record<string, boolean>>({});

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function searchTeachers(query = teacherQuery) {
    const { data, error } = await supabase.rpc("search_institution_teachers", {
      p_query: query,
      p_limit: 100,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setTeachers((data ?? []) as Teacher[]);
  }

  async function load() {
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

    const [yearsResult, classesResult, assignmentsResult] = await Promise.all([
      supabase
        .from("institution_academic_years")
        .select("id,name,starts_on,ends_on,is_active")
        .eq("institution_id", user.id)
        .order("starts_on", { ascending: false }),
      supabase
        .from("academic_groups")
        .select("id,name,academic_year_id,description")
        .eq("institution_id", user.id)
        .eq("group_kind", "institution_class")
        .eq("is_archived", false)
        .order("name"),
      supabase
        .from("academic_group_teachers")
        .select("group_id,teacher_id"),
    ]);

    if (yearsResult.error) {
      setMessage(yearsResult.error.message);
      setLoading(false);
      return;
    }

    if (classesResult.error) {
      setMessage(classesResult.error.message);
      setLoading(false);
      return;
    }

    setYears((yearsResult.data ?? []) as Year[]);
    setClasses((classesResult.data ?? []) as ClassRow[]);
    setAssignments((assignmentsResult.data ?? []) as Assignment[]);

    if (!selectedYear && yearsResult.data?.[0]) {
      setSelectedYear(yearsResult.data[0].id);
    }

    await searchTeachers("");
    setLoading(false);
  }

  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createYear(event: FormEvent) {
    event.preventDefault();
    setMessage("");

    const { error } = await supabase.rpc("create_institution_academic_year", {
      p_name: yearName,
      p_starts_on: starts || null,
      p_ends_on: ends || null,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setYearName("");
    setStarts("");
    setEnds("");
    await load();
  }

  async function createClass(event: FormEvent) {
    event.preventDefault();
    setMessage("");

    const { error } = await supabase.rpc("create_institution_class", {
      p_year_id: selectedYear,
      p_name: className,
      p_description: description,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setClassName("");
    setDescription("");
    await load();
  }

  async function assignTeacher(groupId: string, teacherId: string) {
    const { error } = await supabase.rpc(
      "assign_teacher_to_institution_class",
      {
        p_group_id: groupId,
        p_teacher_id: teacherId,
      }
    );

    if (error) {
      setMessage(error.message);
      return;
    }

    await load();
  }

  async function removeTeacher(groupId: string, teacherId: string) {
    const { error } = await supabase.rpc(
      "remove_teacher_from_institution_class",
      {
        p_group_id: groupId,
        p_teacher_id: teacherId,
      }
    );

    if (error) {
      setMessage(error.message);
      return;
    }

    await load();
  }

  async function searchStudents(groupId: string) {
    setMessage("");
    setStudentSearchLoading((current) => ({
      ...current,
      [groupId]: true,
    }));

    const query = (studentQueries[groupId] ?? "").trim();

    const { data, error } = await supabase.rpc(
      "search_students_for_assigned_class",
      {
        p_group_id: groupId,
        p_query: query,
        p_limit: 100,
      }
    );

    setStudentSearchLoading((current) => ({
      ...current,
      [groupId]: false,
    }));
    setStudentSearchDone((current) => ({
      ...current,
      [groupId]: true,
    }));

    if (error) {
      setMessage(error.message);
      return;
    }

    setStudentResults((current) => ({
      ...current,
      [groupId]: (data ?? []) as Student[],
    }));
  }

  async function addStudent(groupId: string, studentId: string) {
    const { error } = await supabase.rpc(
      "add_student_to_institution_class",
      {
        p_group_id: groupId,
        p_student_id: studentId,
      }
    );

    if (error) {
      setMessage(error.message);
      return;
    }

    await searchStudents(groupId);
  }

  async function removeStudent(groupId: string, studentId: string) {
    const { error } = await supabase.rpc(
      "remove_student_from_institution_class",
      {
        p_group_id: groupId,
        p_student_id: studentId,
      }
    );

    if (error) {
      setMessage(error.message);
      return;
    }

    await searchStudents(groupId);
  }

  if (loading) {
    return <main className="p-6">Loading classes...</main>;
  }

  return (
    <main className="min-h-screen bg-[#F5F7FB] px-4 py-6 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-bold text-[#0F5FEA]">Institution</p>
            <h1 className="mt-1 text-3xl font-extrabold">
              Academic years & classes
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Create official classes, assign registered teachers, and manage each class roster.
            </p>
          </div>

          <Link
            href="/institution/dashboard"
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            ← Back to dashboard
          </Link>
        </div>

        {message && (
          <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {message}
          </p>
        )}

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <form
            onSubmit={createYear}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <h2 className="font-extrabold">Create academic year</h2>

            <input
              required
              value={yearName}
              onChange={(event) => setYearName(event.target.value)}
              placeholder="Example: 2026–2027"
              className="mt-4 w-full rounded-xl border px-4 py-3"
            />

            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="text-xs font-bold text-slate-600">
                Starts
                <input
                  type="date"
                  value={starts}
                  onChange={(event) => setStarts(event.target.value)}
                  className="mt-1 w-full rounded-xl border px-3 py-2.5 font-normal"
                />
              </label>

              <label className="text-xs font-bold text-slate-600">
                Ends
                <input
                  type="date"
                  value={ends}
                  onChange={(event) => setEnds(event.target.value)}
                  className="mt-1 w-full rounded-xl border px-3 py-2.5 font-normal"
                />
              </label>
            </div>

            <button className="mt-4 rounded-xl bg-[#0F5FEA] px-4 py-2.5 text-sm font-bold text-white">
              Create year
            </button>
          </form>

          <form
            onSubmit={createClass}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <h2 className="font-extrabold">Create institution class</h2>

            <select
              required
              value={selectedYear}
              onChange={(event) => setSelectedYear(event.target.value)}
              className="mt-4 w-full rounded-xl border px-4 py-3"
            >
              <option value="">Select academic year</option>
              {years.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.name}
                </option>
              ))}
            </select>

            <input
              required
              value={className}
              onChange={(event) => setClassName(event.target.value)}
              placeholder="Example: Grade 10 – Section A"
              className="mt-3 w-full rounded-xl border px-4 py-3"
            />

            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Class description (optional)"
              rows={2}
              className="mt-3 w-full rounded-xl border px-4 py-3"
            />

            <button
              disabled={!selectedYear}
              className="mt-3 rounded-xl bg-[#0F5FEA] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              Create class
            </button>
          </form>
        </div>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-extrabold">Official classes</h2>
              <p className="text-xs text-slate-500">
                Teachers and students must already be registered with your institution.
              </p>
            </div>

            <div className="flex gap-2">
              <input
                value={teacherQuery}
                onChange={(event) => setTeacherQuery(event.target.value)}
                placeholder="Search registered teachers"
                className="min-w-0 rounded-xl border px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => searchTeachers()}
                className="rounded-xl border px-3 py-2 text-sm font-bold"
              >
                Search
              </button>
            </div>
          </div>

          <div className="mt-5 space-y-5">
            {classes.map((classRow) => {
              const year = years.find(
                (item) => item.id === classRow.academic_year_id
              );

              const assignedTeachers = assignments.filter(
                (item) => item.group_id === classRow.id
              );

              const rosterResults = studentResults[classRow.id] ?? [];

              return (
                <article
                  key={classRow.id}
                  className="rounded-2xl border border-slate-200 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-extrabold uppercase tracking-wide text-[#0F5FEA]">
                        {year?.name ?? "Academic year"}
                      </p>
                      <Link
                        href={`/groups/${classRow.id}`}
                        className="mt-1 block text-lg font-extrabold hover:text-[#0F5FEA]"
                      >
                        {classRow.name}
                      </Link>
                    </div>

                    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                      {assignedTeachers.length} teacher
                      {assignedTeachers.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {assignedTeachers.map((assignment) => {
                      const teacher = teachers.find(
                        (item) => item.user_id === assignment.teacher_id
                      );

                      return (
                        <span
                          key={assignment.teacher_id}
                          className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-xs font-bold"
                        >
                          {teacher?.display_name ?? "Assigned teacher"}
                          <button
                            type="button"
                            onClick={() =>
                              removeTeacher(
                                classRow.id,
                                assignment.teacher_id
                              )
                            }
                            className="text-red-600"
                            aria-label="Remove teacher"
                          >
                            ×
                          </button>
                        </span>
                      );
                    })}
                  </div>

                  <div className="mt-4">
                    <p className="mb-2 text-xs font-bold text-slate-500">
                      Assign registered teacher
                    </p>

                    <div className="flex flex-wrap gap-2">
                      {teachers
                        .filter(
                          (teacher) =>
                            !assignedTeachers.some(
                              (assignment) =>
                                assignment.teacher_id === teacher.user_id
                            )
                        )
                        .map((teacher) => (
                          <button
                            key={teacher.user_id}
                            type="button"
                            onClick={() =>
                              assignTeacher(classRow.id, teacher.user_id)
                            }
                            className="rounded-xl border border-blue-200 px-3 py-2 text-xs font-bold text-[#0F5FEA] hover:bg-blue-50"
                          >
                            + {teacher.display_name}
                          </button>
                        ))}
                    </div>
                  </div>

                  <div className="mt-5 border-t border-slate-200 pt-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <h3 className="font-extrabold">Student roster</h3>
                        <p className="mt-1 text-xs text-slate-500">
                          Add students who are already registered with this institution.
                        </p>
                      </div>

                      <div className="flex gap-2">
                        <input
                          value={studentQueries[classRow.id] ?? ""}
                          onChange={(event) =>
                            setStudentQueries((current) => ({
                              ...current,
                              [classRow.id]: event.target.value,
                            }))
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              searchStudents(classRow.id);
                            }
                          }}
                          placeholder="Search students"
                          className="min-w-0 rounded-xl border px-3 py-2 text-sm"
                        />

                        <button
                          type="button"
                          disabled={studentSearchLoading[classRow.id]}
                          onClick={() => searchStudents(classRow.id)}
                          className="rounded-xl bg-[#0F5FEA] px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
                        >
                          {studentSearchLoading[classRow.id]
                            ? "Searching..."
                            : "Search"}
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 space-y-2">
                      {rosterResults.map((student) => (
                        <div
                          key={student.user_id}
                          className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3"
                        >
                          <div className="min-w-0">
                            <Link
                              href={`/people/${student.user_id}`}
                              className="block truncate font-bold hover:text-[#0F5FEA]"
                            >
                              {student.display_name}
                            </Link>
                            <p className="text-xs text-slate-500">
                              {student.membership_status === "active"
                                ? "Enrolled in this class"
                                : "Registered student"}
                            </p>
                          </div>

                          {student.membership_status === "active" ? (
                            <button
                              type="button"
                              onClick={() =>
                                removeStudent(
                                  classRow.id,
                                  student.user_id
                                )
                              }
                              className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-600"
                            >
                              Remove
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                addStudent(
                                  classRow.id,
                                  student.user_id
                                )
                              }
                              className="rounded-lg bg-[#0F5FEA] px-3 py-2 text-xs font-bold text-white"
                            >
                              Add to class
                            </button>
                          )}
                        </div>
                      ))}

                      {rosterResults.length === 0 && (
                        <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
                          {studentSearchDone[classRow.id]
                            ? "No registered students matched this search. Leave the search box empty and press Search to show all students registered with this institution."
                            : "Press Search with the box empty to show all students registered with this institution, or type a student's name."}
                        </p>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}

            {classes.length === 0 && (
              <p className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">
                Create an academic year and your first official class.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
