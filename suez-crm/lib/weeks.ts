/** Monday of the week containing an ISO date. Timesheets are always keyed to a Monday. */
export function mondayOf(iso: string) {
  const d = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) throw new Error(`Not a date: ${iso}`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // Mon=0 … Sun=6
  return d.toISOString().slice(0, 10);
}

export function shiftWeeks(iso: string, weeks: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

/** A day cannot hold more than 24 hours; anything else is a typo, not a long shift. */
export const MAX_HOURS_PER_DAY = 24;
export const hoursAreSane = (hours: number[]) => hours.every((h) => h >= 0 && h <= MAX_HOURS_PER_DAY);
