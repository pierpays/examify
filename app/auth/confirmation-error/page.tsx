import Link from "next/link";

export default function EmailConfirmationErrorPage() {
  return (
    <main className="min-h-screen bg-white px-4 py-16 text-slate-900">
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-xl font-bold text-red-700">
          !
        </div>
        <h1 className="mt-5 text-3xl font-bold">Verification link problem</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          This email verification link is invalid or has expired. Try signing up again or request a new verification email before contacting support.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex w-full items-center justify-center rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700"
        >
          Back to login
        </Link>
      </div>
    </main>
  );
}
