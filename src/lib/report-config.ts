/**
 * The hour (0–23) when a "report day" starts.
 * E.g., 10 means the reporting day runs from 10:00 to 09:59 the next day.
 * This accounts for late-night shifts ending after midnight.
 */
export const REPORT_DAY_HOUR = 10;

/**
 * Returns the start of the "report day" for a given date.
 * If current time is before REPORT_DAY_HOUR, the report day starts the previous calendar day.
 */
export function getReportDayStart(date: Date = new Date()): Date {
  const d = new Date(date);
  if (d.getHours() < REPORT_DAY_HOUR) d.setDate(d.getDate() - 1);
  d.setHours(REPORT_DAY_HOUR, 0, 0, 0);
  return d;
}
