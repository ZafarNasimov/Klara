// Demo clock (SPEC §7): real time + offset from project settings, or a fixed DEMO_NOW.
export function clockNow(offsetMs = 0): Date {
  const base = process.env.DEMO_NOW ? new Date(process.env.DEMO_NOW).getTime() : Date.now();
  return new Date(base + offsetMs);
}
