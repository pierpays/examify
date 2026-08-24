import Link from "next/link";
import ExamifyLogo from "@/components/branding/examify-logo";
import {
  CURRENT_POLICY_VERSION,
  POLICY_LAST_UPDATED,
} from "@/lib/policy";

const prohibited = [
  "Bullying, cyberbullying, harassment, intimidation, stalking, hazing, or threats.",
  "Sexual, romantic, exploitative, grooming, or otherwise inappropriate conduct involving students or minors.",
  "Discriminatory abuse or targeting based on protected or personal characteristics.",
  "Violence, credible threats of violence, coercion, extortion, blackmail, or encouragement of dangerous conduct.",
  "Impersonation, fraud, deceptive accounts, or misrepresentation of academic or institutional affiliation.",
  "Sharing another person's private information, images, records, or communications without authorization.",
  "Spam, commercial solicitation unrelated to education, scams, or use of Examify primarily for non-academic purposes.",
  "Malware, illegal material, attempts to compromise accounts, or other activity that threatens platform security.",
];

export default function SafetyLegalPage() {
  return (
    <main className="min-h-screen bg-[#F8FAFC] text-slate-900">
      <header className="border-b border-white/10 bg-gradient-to-r from-[#071A46] via-[#0B2F78] to-[#123FA0] text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <ExamifyLogo inverse />
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold hover:bg-white/10">
              Log in
            </Link>
            <Link href="/signup" className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-[#1E3A8A]">
              Create account
            </Link>
          </div>
        </div>
      </header>

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
          <p className="text-sm font-bold text-[#2563EB]">EXAMIFY SAFETY & LEGAL</p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight sm:text-5xl">
            Safety, Community Rules & Legal Notice
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-slate-600">
            Examify is an academic social network. These rules apply to accounts,
            posts, comments, files, exams, reports, and messages, and explain how
            Examify may moderate the platform to protect its academic community.
          </p>
          <div className="mt-6 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-blue-50 px-3 py-1 font-semibold text-[#2563EB]">
              Policy version {CURRENT_POLICY_VERSION}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-600">
              Last updated {POLICY_LAST_UPDATED}
            </span>
          </div>
          <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
            <strong>Important:</strong> Examify is not an emergency service.
            If someone is in immediate danger, use the appropriate local
            emergency, law-enforcement, school-safety, or child-protection
            process. Platform reports can be used in addition to those channels.
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[220px_1fr]">
        <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-6">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">On this page</p>
          <nav className="mt-3 space-y-1 text-sm font-semibold">
            {[
              ["#terms", "Terms of Use"],
              ["#community-standards", "Community Standards"],
              ["#messaging", "Messaging"],
              ["#student-safety", "Student Safety"],
              ["#reporting", "Reporting"],
              ["#moderation", "Moderation"],
              ["#enforcement", "Enforcement"],
              ["#authorities", "Authorities"],
              ["#privacy", "Privacy"],
              ["#institutions-parents", "Institutions & Parents"],
              ["#policy-updates", "Policy Updates"],
            ].map(([href, label]) => (
              <a key={href} href={href} className="block rounded-lg px-3 py-2 text-slate-600 hover:bg-blue-50 hover:text-[#2563EB]">
                {label}
              </a>
            ))}
          </nav>
        </aside>

        <article className="space-y-8">
          <section id="terms" className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-bold">1. Terms of Use</h2>
            <div className="mt-4 space-y-4 text-sm leading-7 text-slate-700">
              <p>
                By creating or using an Examify account, you agree to use the service
                for legitimate academic, educational, school-community, certification,
                professional-development, and closely related purposes. Access is
                conditional on compliance with these rules.
              </p>
              <p>
                You are responsible for activity performed through your account,
                keeping credentials secure, and providing accurate information where
                Examify requires identity, role, parent, teacher, or institution details.
              </p>
              <p>
                You may not use Examify to violate applicable law, infringe another
                person&apos;s rights, interfere with the service, or evade account
                restrictions or moderation actions.
              </p>
            </div>
          </section>

          <section id="community-standards" className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-bold">2. Academic Community Standards</h2>
            <p className="mt-4 text-sm leading-7 text-slate-700">
              Examify is not intended to be a general-purpose social network. Posts,
              comments, documents, links, images, exams, achievements, and messages
              must have a legitimate academic, educational, school-community, or
              professional-learning purpose.
            </p>
            <h3 className="mt-6 font-bold">Prohibited conduct includes:</h3>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
              {prohibited.map((item) => (
                <li key={item} className="flex gap-3">
                  <span className="mt-1 text-red-500">●</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>

          <section id="messaging" className="scroll-mt-6 rounded-2xl border border-blue-200 bg-blue-50/50 p-6">
            <h2 className="text-2xl font-bold">3. Messaging & Communications</h2>
            <div className="mt-4 space-y-4 text-sm leading-7 text-slate-700">
              <p>
                Examify messaging is for academic and educational communication.
                Users should not treat Examify messages as communications that are
                inaccessible to the platform operator.
              </p>
              <p>
                Authorized Examify personnel may access and review messages when
                reasonably necessary for safety, moderation, abuse prevention,
                investigation of reports, enforcement of these rules, platform
                security, or legal compliance.
              </p>
              <p>
                Teachers, institutions, administrators, and other adults must not use
                Examify to pursue inappropriate personal, romantic, sexual,
                exploitative, or coercive relationships with students, or to move a
                student to another channel for an improper purpose.
              </p>
            </div>
          </section>

          <section id="student-safety" className="scroll-mt-6 rounded-2xl border border-violet-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-bold">4. Student & Child Safety</h2>
            <div className="mt-4 space-y-4 text-sm leading-7 text-slate-700">
              <p>
                Student safety takes priority over engagement or growth. Examify may
                apply enhanced safeguards to accounts associated with minors and may
                restrict features when necessary for safety or compliance.
              </p>
              <p>
                Parents or guardians who create a child account represent that they
                are authorized to do so. Examify records the parent or guardian&apos;s
                acceptance separately instead of falsely recording that the child
                personally clicked the agreement.
              </p>
              <p>
                Different jurisdictions may impose additional age, notice, or
                parental-consent requirements. Examify may require additional
                verification, consent, or restrictions where applicable.
              </p>
            </div>
          </section>

          <section id="reporting" className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-bold">5. Reporting Misconduct</h2>
            <div className="mt-4 space-y-4 text-sm leading-7 text-slate-700">
              <p>
                Every authenticated account can report bullying, cyberbullying,
                harassment, sexual harassment, threats, stalking, hazing,
                discrimination, inappropriate content, privacy violations,
                impersonation, coercion, and other inappropriate behavior.
              </p>
              <p>
                Depending on the people involved and safety context, a report may also
                be routed to an affiliated institution or linked parent or guardian.
                A report is information for review and is not automatically proof of
                misconduct.
              </p>
              <p>
                Knowingly false, retaliatory, or malicious reports may themselves
                violate Examify&apos;s rules.
              </p>
            </div>
            <Link href="/reports/new" className="mt-5 inline-flex rounded-xl bg-gradient-to-r from-[#2563EB] to-[#7C3AED] px-5 py-3 text-sm font-bold text-white">
              Report inappropriate behavior
            </Link>
          </section>

          <section id="moderation" className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-bold">6. Moderation & Administrative Review</h2>
            <p className="mt-4 text-sm leading-7 text-slate-700">
              Examify may review posts, comments, uploaded files, account information,
              reports, and messages when reasonably necessary to operate and protect
              the service, investigate a complaint, enforce these standards, prevent
              abuse or fraud, or comply with legal obligations.
            </p>
          </section>

          <section id="enforcement" className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-bold">7. Enforcement & Account Removal</h2>
            <p className="mt-4 text-sm leading-7 text-slate-700">
              Examify reserves the right, consistent with applicable law and platform
              procedures, to remove or restrict content, disable features, limit
              contact between accounts, suspend an account, revoke institution
              verification, or permanently terminate access when a user violates
              these rules, threatens safety, abuses the service, or creates
              unacceptable platform risk. Severe conduct may result in immediate action.
            </p>
          </section>

          <section id="authorities" className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-bold">8. Authorities, Legal Process & Record Preservation</h2>
            <div className="mt-4 space-y-4 text-sm leading-7 text-slate-700">
              <p>
                Examify may preserve information relevant to a serious safety incident,
                investigation, dispute, fraud matter, or legal obligation when legally
                permitted or required.
              </p>
              <p>
                Examify may disclose information to competent authorities when
                required by applicable law or valid legal process, or when otherwise
                legally permitted in connection with serious safety concerns. Examify
                does not promise unrestricted disclosure of user information.
              </p>
            </div>
          </section>

          <section id="privacy" className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-bold">9. Privacy Notice</h2>
            <div className="mt-4 space-y-4 text-sm leading-7 text-slate-700">
              <p>
                Examify processes information needed to provide accounts, academic
                profiles, exams, analytics, follows, posts, messages, notifications,
                parent/child and institution relationships, moderation, reporting,
                security, and support.
              </p>
              <p>
                Information should be collected and used for defined, legitimate
                purposes. Users should be informed about the nature and purpose of
                processing, and applicable rights may include access, correction,
                deletion, or other rights provided by law.
              </p>
              <p>
                Public profile information is visible according to Examify&apos;s
                features and privacy controls. Other information is limited to
                authorized users, affiliated parents or institutions where the
                platform expressly provides access, Examify personnel with an
                operational need, and parties to whom disclosure is legally permitted
                or required.
              </p>
            </div>
          </section>

          <section id="institutions-parents" className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-bold">10. Institutions, Teachers & Parents</h2>
            <div className="mt-4 space-y-4 text-sm leading-7 text-slate-700">
              <p>
                Institution verification is an Examify platform review and is not a
                guarantee, accreditation, endorsement, or substitute for a user&apos;s
                own due diligence.
              </p>
              <p>
                Institutions and teachers must use student information only for
                appropriate educational and safety purposes. Parents and guardians
                must use child-monitoring tools responsibly and only for students
                they are authorized to supervise.
              </p>
            </div>
          </section>

          <section id="policy-updates" className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-bold">11. Policy Acceptance & Updates</h2>
            <div className="mt-4 space-y-4 text-sm leading-7 text-slate-700">
              <p>
                New users must affirmatively accept the current Terms of Use, Privacy
                Notice, and Academic Community Standards before an account can be
                created through Examify&apos;s signup flow. Examify records the policy
                version and acceptance time.
              </p>
              <p>
                When a parent creates a child account, Examify separately records that
                the parent accepted the current policy in connection with that child
                account.
              </p>
              <p>
                Examify may update these rules. Material changes may require users to
                review and accept a newer policy version before continuing to use
                affected features.
              </p>
            </div>
          </section>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
            <strong>Legal review recommended before public launch.</strong>{" "}
            These standards are designed to align Examify&apos;s product behavior
            with clear user notice and safety practices. They should be reviewed by
            qualified counsel for the jurisdictions where Examify operates or targets
            users, especially where minors, educational records, or cross-border data
            are involved.
          </div>
        </article>
      </div>
    </main>
  );
}
