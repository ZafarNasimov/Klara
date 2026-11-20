// Plan vs actual (SPEC §7). Pure.
//   daily_rate          = today's actual / planned per day (0.375 = 38 %)
//   forecast_delay_days = remaining_qty / avg_actual_per_day − remaining_planned_days
// A positive forecast is a deviation; the trades that depend on the item get an
// "Information an Folgegewerk" suggestion.
import type { ScheduleItem } from "@/lib/types";

export type PlanActual = {
  daily_rate: number;
  today_qty: number;
  done_qty: number;
  remaining_qty: number;
  avg_actual_per_day: number;
  remaining_planned_days: number;
  forecast_delay_days: number;
  deviation: boolean;
};

/**
 * @param actuals quantities per working day so far (including today), oldest first
 * @param remainingPlannedDays planned working days left after today
 */
export function planVsActual(
  item: Pick<ScheduleItem, "planned_qty" | "planned_per_day">,
  actuals: number[],
  remainingPlannedDays: number,
): PlanActual | null {
  if (!item.planned_qty || !item.planned_per_day || actuals.length === 0) return null;
  const today = actuals[actuals.length - 1];
  const done = actuals.reduce((a, b) => a + b, 0);
  const remaining = Math.max(0, item.planned_qty - done);
  const avg = done / actuals.length;
  const needed = remaining === 0 ? 0 : avg > 0 ? remaining / avg : Number.POSITIVE_INFINITY;
  const delay = needed - remainingPlannedDays;
  return {
    daily_rate: today / item.planned_per_day,
    today_qty: today,
    done_qty: done,
    remaining_qty: remaining,
    avg_actual_per_day: avg,
    remaining_planned_days: remainingPlannedDays,
    forecast_delay_days: Number.isFinite(delay) ? Math.round(delay * 10) / 10 : Number.POSITIVE_INFINITY,
    deviation: delay > 0,
  };
}

/** Schedule items that depend on `itemId` (follow-up trades to inform). */
export function dependents(itemId: string, schedule: ScheduleItem[]): ScheduleItem[] {
  return schedule.filter((s) => s.depends_on.includes(itemId));
}
