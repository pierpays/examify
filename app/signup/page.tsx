import Link from "next/link";
import ExamifyLogo from "@/components/branding/examify-logo";

export default function SignupPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-violet-50 px-4 py-12 text-slate-900">
      <div className="mx-auto max-w-md">
        <div className="mb-8 flex justify-center"><ExamifyLogo /></div>
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold">Create your Examify account</h1>

          <p className="mt-2 text-sm text-slate-600">
            Choose how you want to use Examify.
          </p>
        </div>

        <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-slate-700">
          Creating an account requires acceptance of Examify&apos;s{" "}
          <Link
            href="/safety"
            className="font-semibold text-[#2563EB] underline underline-offset-2"
          >
            Terms, Privacy Notice, and Academic Community Standards
          </Link>
          . Examify is for academic use.
        </div>

        <div className="space-y-4">
          <Link
            href="/signup/student"
            className="block w-full rounded-2xl border border-slate-200 p-5 text-left transition hover:border-[#2563EB] hover:bg-blue-50/50"
          >
            <div className="text-lg font-semibold">Study for exams</div>
            <div className="mt-1 text-sm text-slate-600">
              I’m a student.
            </div>
          </Link>

          <Link
            href="/signup/teacher"
            className="block w-full rounded-2xl border border-slate-200 p-5 text-left transition hover:border-[#2563EB] hover:bg-blue-50/50"
          >
            <div className="text-lg font-semibold">Create exams</div>
            <div className="mt-1 text-sm text-slate-600">
              I’m a teacher.
            </div>
          </Link>

          <Link href="/signup/parent" className="block w-full rounded-2xl border border-slate-200 p-5 text-left transition hover:border-[#2563EB] hover:bg-blue-50/50"><div className="text-lg font-semibold">Parent</div><div className="mt-1 text-sm text-slate-600">Follow your family’s learning connections.</div></Link>
          <Link href="/signup/institution" className="block w-full rounded-2xl border border-slate-200 p-5 text-left transition hover:border-[#2563EB] hover:bg-blue-50/50"><div className="text-lg font-semibold">Institution</div><div className="mt-1 text-sm text-slate-600">Connect teachers, students, and parents. Institution accounts require admin verification.</div></Link>
        </div>
      </div>
    </main>
  );
}
