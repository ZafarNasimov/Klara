// Klara, the site assistant robot (DESIGN.md mascot): friendly, not childish.
// Pure SVG so it stays crisp on a projector and costs nothing to load.
import { cn } from "@/lib/utils";

export type KlaraMood = "idle" | "listening" | "thinking" | "speaking";

export function KlaraAvatar({
  size = 40,
  mood = "idle",
  className,
  title,
  talking = false,
}: {
  size?: number;
  mood?: KlaraMood;
  /** Speaking mouth moves (call screen while Klara's voice plays). */
  talking?: boolean;
  className?: string;
  /** Accessible name; omit when the avatar is decorative next to Klara's name. */
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      data-mood={mood}
    >
      {title ? <title>{title}</title> : null}
      {/* antenna */}
      <line x1="32" y1="7" x2="32" y2="15" stroke="#1d4ed8" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="32" cy="6.5" r="3.5" fill={mood === "listening" ? "#16a34a" : "#2563eb"} />
      {/* ears */}
      <rect x="5" y="29" width="6" height="12" rx="3" fill="#1d4ed8" />
      <rect x="53" y="29" width="6" height="12" rx="3" fill="#1d4ed8" />
      {/* head */}
      <rect x="9" y="14" width="46" height="41" rx="15" fill="#2563eb" />
      {/* face plate */}
      <rect x="15" y="21" width="34" height="25" rx="10" fill="#ffffff" />
      {/* eyes */}
      {mood === "thinking" ? (
        <>
          <path d="M23.5 32.5h5" stroke="#18181b" strokeWidth="2.6" strokeLinecap="round" />
          <path d="M35.5 32.5h5" stroke="#18181b" strokeWidth="2.6" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="26" cy="32" r="3.2" fill="#18181b" />
          <circle cx="38" cy="32" r="3.2" fill="#18181b" />
          <circle cx="27" cy="31" r="0.9" fill="#ffffff" />
          <circle cx="39" cy="31" r="0.9" fill="#ffffff" />
        </>
      )}
      {/* mouth */}
      {mood === "speaking" ? (
        <ellipse
          cx="32"
          cy="40"
          rx="4"
          ry="2.4"
          fill="#18181b"
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
          className={talking ? "animate-[klara-talk_320ms_ease-in-out_infinite]" : undefined}
        />
      ) : (
        <path d="M27.5 39.2q4.5 3.6 9 0" fill="none" stroke="#18181b" strokeWidth="2.2" strokeLinecap="round" />
      )}
      {/* cheeks */}
      <circle cx="20.5" cy="38.5" r="1.8" fill="#bfdbfe" />
      <circle cx="43.5" cy="38.5" r="1.8" fill="#bfdbfe" />
    </svg>
  );
}
