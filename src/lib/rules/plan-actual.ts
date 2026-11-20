// Plan vs actual (SPEC §7). Pure.
import type { ScheduleItem } from "@/lib/types";

export type PlanActual = {
  daily_rate: number; // actual / planned per day (0.375 = 38 %)
  done_qty: number;
  remaining_qty: number;
  avg_actual_per_day: number;
  remaining_planned_days: number;
  forecast_delay_days: number;
  deviation: boolean;
};

/**
 * @param actuals daily quantities so far (including today), oldest first
 * @param remainingPlannedDays working days left in the plan after today
 */
export function planVsActual(item: Pick<ScheduleItem, "planned_qty" | "planned_per_day">, actuals: number[], remainingPlannedDays: number): PlanActual | null {
  if (!item.planned_qty || !item.planned_per_day || actuals.length === 0) return null;
  const today = actuals[actuals.length - 1];
  const done = actuals.reduce((a, b) => a + b, 0);
  const remaining = Math.max(0, item.planned_qty - done);
  const avg = done / actuals.length;
  const daysNeeded = avg > 0 ? remaining / avg : Infinity;
  const delay = daysNeeded - remainingPlannedDays;
  return {
    daily_rate: today / item.planned_per_day,
    done_qty: done,
    remaining_qty: remaining,
    avg_actual_per_day: avg,
    remaining_planned_days: remainingPlannedDays,
    forecast_delay_days: Number.isFinite(delay) ? Math.round(delay * 10) / 10 : Infinity,
    deviation: delay > 0,
  };
}
