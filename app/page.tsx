import Link from "next/link";
import ExamifyLogo, { ExamifyMark } from "@/components/branding/examify-logo";

const roles = [
  ["Students", "Practice, connect, follow educators, and celebrate real achievements.", "/signup/student", "Join as a student"],
  ["Teachers", "Publish exams, share resources, build your profile, and understand learner performance.", "/signup/teacher", "Join as a teacher"],
  ["Parents", "Stay connected to the academic community and your family's learning journey.", "/signup/parent", "Join as a parent"],
  ["Institutions", "Create a verified academic presence and connect teachers, students, and parents.", "/signup/institution", "Register an institution"],
];
const features = [
  ["Academic feed", "Posts, images, YouTube videos, links, documents, reactions and comments — centered on learning."],
  ["Practice exams", "Find exams by teacher, title, date or Examify code and track performance over time."],
  ["Verified institutions", "Institution accounts are reviewed by Examify before receiving full access."],
  ["Teacher analytics", "Understand engagement, scores, pass rates, trends and students who may need attention."],
  ["Academic connections", "Follow educators and institutions and build meaningful learning relationships."],
  ["Real achievements", "Students can choose to share achievements backed by completed Examify attempts."],
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <ExamifyLogo />
          <nav className="flex items-center gap-2">
            <Link href="/login" className="rounded-xl px-4 py-2 text-sm font-semibold text-[#1E3A8A] hover:bg-blue-50">Log in</Link>
            <Link href="/signup" className="rounded-xl bg-gradient-to-r from-[#2563EB] to-[#7C3AED] px-4 py-2 text-sm font-semibold text-white shadow-sm">Create account</Link>
          </nav>
        </div>
      </header>

      <section className="overflow-hidden border-b border-slate-200 bg-[radial-gradient(circle_at_top_right,_#ede9fe_0,_transparent_32%),radial-gradient(circle_at_top_left,_#dbeafe_0,_transparent_34%),linear-gradient(to_bottom,#ffffff,#f8fafc)]">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.05fr_.95fr] lg:items-center">
          <div>
            <div className="inline-flex rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-bold tracking-wide text-[#2563EB] shadow-sm">LEARN · CONNECT · ACHIEVE</div>
            <h1 className="mt-6 max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">More than just exams. <span className="bg-gradient-to-r from-[#2563EB] to-[#7C3AED] bg-clip-text text-transparent">Your academic social network.</span></h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">Examify brings students, teachers, parents and verified institutions together to practice, share knowledge, discover resources and celebrate progress.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/signup" className="rounded-xl bg-gradient-to-r from-[#2563EB] to-[#7C3AED] px-6 py-3 text-center font-bold text-white shadow-lg shadow-blue-200">Create your account</Link>
              <Link href="/login" className="rounded-xl border border-blue-200 bg-white px-6 py-3 text-center font-bold text-[#1E3A8A] hover:bg-blue-50">Log in</Link>
            </div>
            <p className="mt-4 text-sm text-slate-500">Institution accounts are verified by Examify before full access is granted.</p>
          </div>

          <div className="relative rounded-[2rem] bg-gradient-to-br from-[#1E3A8A] via-[#2563EB] to-[#7C3AED] p-6 text-white shadow-2xl shadow-blue-200 sm:p-8">
            <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-violet-400/30 blur-2xl" />
            <div className="relative flex items-center gap-4"><div className="rounded-2xl bg-white p-2"><ExamifyMark className="h-14 w-14" /></div><div><p className="text-sm font-bold text-blue-100">EXAMIFY COMMUNITY</p><h2 className="text-2xl font-extrabold">Your academic journey, together.</h2></div></div>
            <div className="relative mt-8 space-y-4">
              <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/20"><p className="text-xs font-bold text-blue-100">TEACHER UPDATE</p><p className="mt-2 font-semibold">New cloud architecture practice exam published.</p><div className="mt-3 rounded-xl bg-white p-3 text-sm font-semibold text-[#0F172A]">AWS Practice Exam · JEESQ-0004</div></div>
              <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/20"><p className="text-xs font-bold text-violet-100">STUDENT ACHIEVEMENT</p><p className="mt-2 font-semibold">Passed a practice exam with an 86% score. 🏆</p></div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20"><p className="text-sm font-bold text-[#2563EB]">FOR THE WHOLE ACADEMIC COMMUNITY</p><h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">Choose how you use Examify.</h2><div className="mt-8 grid gap-4 sm:grid-cols-2">{roles.map(([title,description,href,label])=><article key={title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"><h3 className="text-xl font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{description}</p><Link href={href} className="mt-5 inline-flex text-sm font-bold text-[#2563EB]">{label} →</Link></article>)}</div></section>

      <section className="border-y border-slate-200 bg-white"><div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20"><p className="text-sm font-bold text-[#7C3AED]">ACADEMIC + SOCIAL</p><h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">Built around learning, connection and achievement.</h2><div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{features.map(([title,description],i)=><div key={title} className="rounded-2xl border border-slate-200 bg-[#F8FAFC] p-5"><div className={`mb-4 h-2 w-12 rounded-full ${i%3===0?'bg-[#2563EB]':i%3===1?'bg-[#7C3AED]':'bg-[#F59E0B]'}`} /><h3 className="font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{description}</p></div>)}</div></div></section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6"><div className="rounded-3xl bg-gradient-to-r from-[#1E3A8A] via-[#2563EB] to-[#7C3AED] px-6 py-10 text-white sm:px-10 lg:flex lg:items-center lg:justify-between"><div><h2 className="text-3xl font-extrabold">Learn. Connect. Achieve.</h2><p className="mt-3 text-blue-100">Join an academic network designed around genuine progress.</p></div><div className="mt-6 flex gap-3 lg:mt-0"><Link href="/signup" className="rounded-xl bg-white px-6 py-3 font-bold text-[#1E3A8A]">Create account</Link><Link href="/login" className="rounded-xl border border-white/40 px-6 py-3 font-bold text-white">Log in</Link></div></div></section>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-7 sm:px-6 md:flex-row md:items-center md:justify-between">
          <ExamifyLogo />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-slate-500">
            <Link href="/safety#terms">Terms of Use</Link>
            <Link href="/safety#privacy">Privacy Notice</Link>
            <Link href="/safety#community-standards">Community Standards</Link>
            <Link href="/reports/new">Report behavior</Link>
            <span>© {new Date().getFullYear()} Examify</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
