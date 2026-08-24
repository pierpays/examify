import Link from "next/link";

export default function EmailConfirmedPage() {
  return (
    <main className="min-h-screen bg-white px-4 py-16 text-slate-900">
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-2xl text-green-700">
          ✓
        </div>
        <h1 className="mt-5 text-3xl font-bold">Email verified</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Your Examtify email address has been confirmed successfully. You can now sign in to your account.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white"
        >
          Go to login
        </Link>
      </div>
    </main>
  );
}
