// Time of day, date, age and wait in words, by integer arithmetic and without `Date` (Req 1.2).
// The Math layer reads no clock: every time is an argument.

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 1440;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;
/** From this age on, an age is told in days and not in hours: 48 hours. */
const DAYS_FROM_MS = 2 * MS_PER_DAY;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function twoDigits(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** `HH:MM UTC`; a time that is not finite gives `--:-- UTC`. */
export function utcClockText(timeUtcMs: number): string {
  if (!Number.isFinite(timeUtcMs)) return '--:-- UTC';
  const minutesOfEpoch = Math.floor(timeUtcMs / MS_PER_MINUTE);
  const minuteOfDay = ((minutesOfEpoch % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hour = Math.floor(minuteOfDay / MINUTES_PER_HOUR);
  const minute = minuteOfDay % MINUTES_PER_HOUR;
  return `${twoDigits(hour)}:${twoDigits(minute)} UTC`;
}

/**
 * `D Mon YYYY` for the UTC day of `timeUtcMs`, from the days since 1970-01-01 by the proleptic
 * Gregorian calendar (Hinnant's civil-from-days). `date unknown` for a time that is not finite
 * or too large to name a year.
 */
export function utcDateText(timeUtcMs: number): string {
  if (!Number.isFinite(timeUtcMs) || Math.abs(timeUtcMs) > 1e15) return 'date unknown';
  const days = Math.floor(timeUtcMs / MS_PER_DAY);
  const shifted = days + 719_468;
  const era = Math.floor(shifted / 146_097);
  const dayOfEra = shifted - era * 146_097;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36_524) -
      Math.floor(dayOfEra / 146_096)) /
      365,
  );
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const monthIndex = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthIndex + 2) / 5) + 1;
  const month = monthIndex < 10 ? monthIndex + 3 : monthIndex - 9;
  const year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0);
  return `${day} ${MONTHS[month - 1] ?? '???'} ${year}`;
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

/**
 * A wait in words, rounded up to a whole number of `stepMs` and never less than one step:
 * `40 min`, `1 h 40 min`, `2 h`. `a while` when either argument is not finite or the step is not
 * positive.
 */
export function waitText(waitMs: number, stepMs: number): string {
  if (!Number.isFinite(waitMs) || !Number.isFinite(stepMs) || stepMs <= 0) return 'a while';
  const steps = Math.max(1, Math.ceil(waitMs / stepMs));
  const totalMinutes = Math.max(1, Math.round((steps * stepMs) / MS_PER_MINUTE));
  if (!Number.isFinite(totalMinutes)) return 'a while';
  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
  const minutes = totalMinutes % MINUTES_PER_HOUR;
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}
