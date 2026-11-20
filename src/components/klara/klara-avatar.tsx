// Klara, the site robot. Friendly, not childish: a hard-hat-shaped head with a
// visor and two calm eyes. Pure SVG so it scales from 24px (chat) to 200px (call).
import { cn } from "@/lib/utils";

export function KlaraAvatar({
  size = 40,
  className,
  title = "Klara",
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={title}
      className={cn("shrink-0", className)}
    >
      {/* antenna */}
      <line x1="32" y1="4" x2="32" y2="12" stroke="#18181b" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="32" cy="4.5" r="3" fill="#2563eb" />
      {/* head */}
      <rect x="8" y="12" width="48" height="42" rx="14" fill="#ffffff" stroke="#18181b" strokeWidth="2.5" />
      {/* helmet brim */}
      <path d="M8 24 h48" stroke="#18181b" strokeWidth="2.5" />
      <path d="M16 12.6 Q32 6 48 12.6" fill="none" stroke="#18181b" strokeWidth="0" />
      {/* visor */}
      <rect x="14" y="29" width="36" height="17" rx="8.5" fill="#2563eb" />
      {/* eyes */}
      <circle cx="24.5" cy="37.5" r="3.4" fill="#ffffff" />
      <circle cx="39.5" cy="37.5" r="3.4" fill="#ffffff" />
      {/* ear bolts */}
      <rect x="4" y="32" width="4" height="10" rx="2" fill="#18181b" />
      <rect x="56" y="32" width="4" height="10" rx="2" fill="#18181b" />
    </svg>
  );
}
