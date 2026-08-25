// Shared cron-expression helper for `schedules.cadence` — used both by the
// cadence UI (computing next_run_at when a schedule is created/edited) and
// the cron dispatcher (advancing next_run_at after each dispatch). Kept in
// `@repo/workflows` rather than duplicated in apps/app and apps/api.
import { CronExpressionParser } from "cron-parser";

export const computeNextRunAt = (
  cadence: string,
  timezone: string,
  from: Date = new Date()
): Date => {
  const interval = CronExpressionParser.parse(cadence, {
    currentDate: from,
    tz: timezone,
  });
  return interval.next().toDate();
};

// Cheap validation for the cadence UI's create/edit form — throws with a
// human-readable message on an invalid cron expression rather than letting
// a bad string sit silently in the DB until the dispatcher trips over it.
export const validateCadence = (cadence: string, timezone: string): void => {
  CronExpressionParser.parse(cadence, { tz: timezone });
};
