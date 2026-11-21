"use client";

import {
  BellRing,
  Camera,
  FileText,
  LayoutDashboard,
  Mail,
  NotebookPen,
  Phone,
  Scale,
  SunMoon,
  Users,
  type LucideIcon,
} from "lucide-react";
import { motion } from "motion/react";
import { KlaraAvatar } from "@/components/klara/klara-avatar";
import { ECOSYSTEM } from "../pitch-story";
import { EASE_IN_OUT, EASE_OUT, u } from "../stage";
import { LightScene, RevealWords, useBeat, type SceneProps } from "./scene-parts";

const INPUT_ICONS: LucideIcon[] = [Phone, SunMoon, Users, Mail, Camera];
const OUTPUT_ICONS: LucideIcon[] = [FileText, Scale, NotebookPen, BellRing, LayoutDashboard];

/** Hub geometry in design px (the SVG uses the same 1920×1080 grid). */
const HUB = { x: 960, y: 610, r: 92 };
const ROWS = [430, 520, 610, 700, 790];
const PILL = { w: 440, h: 64, inLeft: 160, outLeft: 1320 };
const PEOPLE_Y = 930;

/**
 * Scene 6a – the ecosystem. Line 1 on enter; then strike-through, line 2,
 * inputs flow into Klara, outputs flow out, the people row.
 */
export function EcosystemScene({ phase, step, revealMode }: SceneProps) {
  const beat = useBeat(phase, step, revealMode, [1200, 2000, 3600, 5000, 6400]);

  return (
    <LightScene label="Scene 6 – one operating system" phase={phase}>
      <p className="absolute text-zinc-500" style={{ left: u(160), top: u(96), fontSize: u(40), lineHeight: 1.2 }}>
        <span className="relative">
          Not an assistant for the site manager.
          <motion.span
            aria-hidden
            className="absolute top-[55%] right-0 left-0 origin-left bg-zinc-500"
            style={{ height: u(3) }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: beat >= 1 ? 1 : 0 }}
            transition={{ duration: 0.45, ease: EASE_IN_OUT }}
          />
        </span>
      </p>
      <h2
        className="absolute font-semibold tracking-[-0.03em] text-zinc-900"
        style={{ left: u(160), top: u(160), fontSize: u(64), lineHeight: 1.1 }}
      >
        <RevealWords text="An operating system for the construction company." show={beat >= 2} stagger={0.035} duration={0.7} />
      </h2>

      {/* Connections */}
      <svg aria-hidden className="absolute inset-0 size-full" viewBox="0 0 1920 1080" fill="none">
        {ROWS.map((y, i) => (
          <motion.path
            key={`in-${y}`}
            d={`M ${PILL.inLeft + PILL.w} ${y} C ${HUB.x - 260} ${y}, ${HUB.x - 200} ${HUB.y}, ${HUB.x - HUB.r} ${HUB.y}`}
            stroke="#d4d4d8"
            strokeWidth={2}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: beat >= 3 ? 1 : 0 }}
            transition={{ duration: 0.6, ease: EASE_IN_OUT, delay: beat >= 3 ? 0.25 + i * 0.06 : 0 }}
          />
        ))}
        {ROWS.map((y, i) => (
          <motion.path
            key={`out-${y}`}
            d={`M ${HUB.x + HUB.r} ${HUB.y} C ${HUB.x + 200} ${HUB.y}, ${HUB.x + 260} ${y}, ${PILL.outLeft} ${y}`}
            stroke="var(--primary)"
            strokeOpacity={0.45}
            strokeWidth={2}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: beat >= 4 ? 1 : 0 }}
            transition={{ duration: 0.6, ease: EASE_IN_OUT, delay: beat >= 4 ? i * 0.06 : 0 }}
          />
        ))}
        <motion.path
          d={`M ${HUB.x} ${HUB.y + HUB.r} L ${HUB.x} ${PEOPLE_Y - 52} M ${HUB.x - 470} ${PEOPLE_Y - 52} L ${HUB.x + 470} ${PEOPLE_Y - 52}`}
          stroke="#d4d4d8"
          strokeWidth={2}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: beat >= 5 ? 1 : 0 }}
          transition={{ duration: 0.35, ease: EASE_IN_OUT }}
        />
      </svg>

      {/* Klara */}
      <motion.div
        className="absolute flex flex-col items-center justify-center rounded-full border border-zinc-200 bg-white shadow-[0_12px_32px_-16px_rgb(0_0_0/0.25)]"
        style={{ left: u(HUB.x - HUB.r), top: u(HUB.y - HUB.r), width: u(HUB.r * 2), height: u(HUB.r * 2), gap: u(4) }}
        initial={{ opacity: 0, scale: 0.92 }}
        animate={beat >= 3 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.92 }}
        transition={{ duration: 0.45, ease: EASE_OUT }}
      >
        <div style={{ width: u(88), height: u(88) }}>
          <KlaraAvatar size={88} className="size-full" />
        </div>
        <span className="font-semibold text-zinc-900" style={{ fontSize: u(24) }}>Klara</span>
      </motion.div>

      <PillColumn items={ECOSYSTEM.inputs} icons={INPUT_ICONS} left={PILL.inLeft} show={beat >= 3} label="Inputs" />
      <PillColumn items={ECOSYSTEM.outputs} icons={OUTPUT_ICONS} left={PILL.outLeft} show={beat >= 4} label="Outputs" delay={0.45} accent />

      <motion.ul
        aria-label="People"
        className="absolute flex justify-center"
        style={{ left: u(160), width: u(1600), top: u(PEOPLE_Y - 30), gap: u(16) }}
        initial={{ opacity: 0, y: 10 }}
        animate={beat >= 5 ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
        transition={{ duration: 0.45, ease: EASE_OUT, delay: beat >= 5 ? 0.2 : 0 }}
      >
        {ECOSYSTEM.people.map((p) => (
          <li
            key={p}
            className="rounded-full border border-zinc-200 bg-white text-zinc-800"
            style={{ fontSize: u(24), padding: `${u(10)} ${u(24)}` }}
          >
            {p}
          </li>
        ))}
      </motion.ul>
    </LightScene>
  );
}

function PillColumn({
  items,
  icons,
  left,
  show,
  label,
  delay = 0,
  accent = false,
}: {
  items: string[];
  icons: LucideIcon[];
  left: number;
  show: boolean;
  label: string;
  delay?: number;
  accent?: boolean;
}) {
  return (
    <ul aria-label={label}>
      {items.map((text, i) => {
        const Icon = icons[i];
        return (
          <motion.li
            key={text}
            className="absolute flex items-center rounded-full border border-zinc-200 bg-white text-zinc-900"
            style={{
              left: u(left),
              top: u(ROWS[i] - PILL.h / 2),
              width: u(PILL.w),
              height: u(PILL.h),
              gap: u(14),
              paddingInline: u(22),
              fontSize: u(24),
            }}
            initial={{ opacity: 0, x: accent ? -10 : 10 }}
            animate={show ? { opacity: 1, x: 0 } : { opacity: 0, x: accent ? -10 : 10 }}
            transition={{ duration: 0.4, ease: EASE_OUT, delay: show ? delay + i * 0.06 : 0 }}
          >
            <Icon aria-hidden className={accent ? "text-primary" : "text-zinc-400"} style={{ width: u(24), height: u(24) }} />
            {text}
          </motion.li>
        );
      })}
    </ul>
  );
}
