// Mobile button styles (DESIGN.md: 48px touch targets, one accent).
import { cn } from "@/lib/utils";

export const BTN_BASE =
  "flex min-h-12 items-center justify-center gap-2 rounded-lg px-4 py-2 text-center text-[15px] leading-snug font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 [&_svg]:size-[18px] [&_svg]:shrink-0";
export const BTN_PRIMARY = cn(BTN_BASE, "bg-primary text-primary-foreground hover:bg-primary/90");
export const BTN_OUTLINE = cn(BTN_BASE, "border border-border bg-background text-foreground hover:bg-muted");
