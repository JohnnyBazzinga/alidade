// Time of day and age in words, by integer arithmetic and without `Date` (Req 1.2, design §7.1,
// D22). The Math layer reads no clock: every time is an argument. `utcMsFromCivil` comes with the
// hotspot Overlay (second release) and is not here.

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 1440;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;
/** From this age on, an age is told in days and not in hours: 48 hours. */
const DAYS_FROM_MS = 2 * MS_PER_DAY;

function twoDigits(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/**
 * `HH:MM UTC`, the clock of the UTC day of `timeUtcMs` (a time before 1970 gives the clock of its
 * own day). A time that is not finite gives `--:-- UTC`: no sentence relies on it, callers pass
 * finite times.
 */
export function clockTextUtc(timeUtcMs: number): string {
  if (!Number.isFinite(timeUtcMs)) return '--:-- UTC';
  const minutesOfEpoch = Math.floor(timeUtcMs / MS_PER_MINUTE);
  const minuteOfDay = ((minutesOfEpoch % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hour = Math.floor(minuteOfDay / MINUTES_PER_HOUR);
  const minute = minuteOfDay % MINUTES_PER_HOUR;
  return `${twoDigits(hour)}:${twoDigits(minute)} UTC`;
}

/**
 * An age in words: `less than a minute ago` below one minute (and for an age below zero),
 * `N min ago` below an hour, `H h ago` or `H h M min ago` below 48 hours, `D days ago` after. An
 * age that is not finite is `age unknown`.
 */
export function ageText(ageMs: number): string {
  if (!Number.isFinite(ageMs)) return 'age unknown';
  if (ageMs < MS_PER_MINUTE) return 'less than a minute ago';
  if (ageMs < MS_PER_HOUR) return `${Math.floor(ageMs / MS_PER_MINUTE)} min ago`;
  if (ageMs < DAYS_FROM_MS) {
    const hours = Math.floor(ageMs / MS_PER_HOUR);
    const minutes = Math.floor((ageMs - hours * MS_PER_HOUR) / MS_PER_MINUTE);
    return minutes === 0 ? `${hours} h ago` : `${hours} h ${minutes} min ago`;
  }
  return `${Math.floor(ageMs / MS_PER_DAY)} days ago`;
}
