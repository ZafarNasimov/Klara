// Demo clock (SPEC §7). "Now" = server clock (or DEMO_NOW, which then keeps
// running from that instant) plus the project's demo offset, so the stage demo
// can jump to 07:00 or 16:00 and deadline countdowns stay coherent.
const bootReal = Date.now();

export function clockBase(): Date {
  const fixed = process.env.DEMO_NOW;
  if (fixed) {
    const start = new Date(fixed);
    if (!Number.isNaN(start.getTime())) return new Date(start.getTime() + (Date.now() - bootReal));
  }
  return new Date();
}

export function withOffset(base: Date, offsetMs: number | undefined | null): Date {
  return new Date(base.getTime() + (offsetMs ?? 0));
}
