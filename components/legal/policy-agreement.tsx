"use client";

import Link from "next/link";

export default function PolicyAgreement({
  checked,
  onChange,
  parentOnBehalf = false,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  parentOnBehalf?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="mt-1 h-5 w-5 shrink-0 rounded border-slate-300 accent-[#2563EB]"
        />
        <span className="text-sm leading-6 text-slate-700">
          {parentOnBehalf ? (
            <>
              I confirm that I am the child&apos;s parent, legal guardian,
              or otherwise authorized to create this student account. I have
              reviewed and agree, on the child&apos;s behalf where legally
              permitted, to Examify&apos;s{" "}
            </>
          ) : (
            <>I have read and agree to Examify&apos;s </>
          )}
          <Link href="/safety#terms" target="_blank" className="font-semibold text-[#2563EB] underline underline-offset-2">
            Terms of Use
          </Link>
          ,{" "}
          <Link href="/safety#privacy" target="_blank" className="font-semibold text-[#2563EB] underline underline-offset-2">
            Privacy Notice
          </Link>
          , and{" "}
          <Link href="/safety#community-standards" target="_blank" className="font-semibold text-[#2563EB] underline underline-offset-2">
            Academic Community Standards
          </Link>
          .
          <span className="mt-2 block text-xs leading-5 text-slate-600">
            I understand that Examify is an academic platform; content and
            communications must be academically appropriate; authorized
            Examify personnel may review content and messages when reasonably
            necessary for safety, moderation, abuse prevention, investigations,
            rule enforcement, or legal compliance; and violations may result
            in content removal, restrictions, suspension, or termination.
          </span>
        </span>
      </label>
    </div>
  );
}
