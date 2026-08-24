import Link from "next/link";

export function ExamifyMark({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="examify-e" x1="12" y1="8" x2="50" y2="55" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2563EB" />
          <stop offset="1" stopColor="#7C3AED" />
        </linearGradient>
      </defs>
      <path d="M13 45c8-5 15-5 19 0v9c-6-5-12-5-19-1V45Z" fill="#1E3A8A" />
      <path d="M51 45c-8-5-15-5-19 0v9c6-5 12-5 19-1V45Z" fill="#7C3AED" />
      <path d="M15 49c7-3 12-2 17 2M49 49c-7-3-12-2-17 2" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity=".9" />
      <path d="M39 13H23l-5 27h20l2-8H28l1-4h11l2-7H30l1-3h13l-5-5Z" fill="url(#examify-e)" />
      <path d="M11 27A22 22 0 0 1 18 13M46 13a22 22 0 0 1 7 14" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="10" cy="31" r="4" fill="#0EA5E9" />
      <circle cx="21" cy="10" r="4" fill="#7C3AED" />
      <circle cx="54" cy="31" r="4" fill="#F59E0B" />
    </svg>
  );
}

export default function ExamifyLogo({ href = "/", compact = false, inverse = false, className = "" }: { href?: string; compact?: boolean; inverse?: boolean; className?: string }) {
  return (
    <Link href={href} className={`inline-flex items-center gap-2.5 ${className}`} aria-label="Examify home">
      <ExamifyMark className={compact ? "h-8 w-8" : "h-10 w-10"} />
      {!compact && (
        <span className="leading-none">
          <span className={`block text-xl font-extrabold tracking-tight ${inverse ? "text-white" : "text-[#0F172A]"}`}>Examify</span>
          <span className="mt-1 block text-[8px] font-bold uppercase tracking-[0.18em]">
            <span className="text-[#2563EB]">Learn.</span>{" "}
            <span className="text-[#7C3AED]">Connect.</span>{" "}
            <span className="text-[#F59E0B]">Achieve.</span>
          </span>
        </span>
      )}
    </Link>
  );
}
