/**
 * Timezone helpers — no external dependency.
 *
 * Rule: everything is stored in the database as UTC. Slot generation happens
 * against clinic-local wall-clock times (the times printed on the clinic door),
 * then converts to UTC for storage and comparison.
 */

function wallParts(date: Date, timeZone: string): { dateISO: string; time: string } {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  const hour = Number(parts.hour) % 24;
  return {
    dateISO: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${String(hour).padStart(2, '0')}:${parts.minute}:${parts.second}`,
  };
}

/** Offset (ms) of `timeZone` relative to UTC at the given instant. */
export function tzOffsetMs(at: Date, timeZone: string): number {
  const { dateISO, time } = wallParts(at, timeZone);
  const wallAsUtc = Date.parse(`${dateISO}T${time}Z`);
  const atSecond = Math.floor(at.getTime() / 1000) * 1000;
  return wallAsUtc - atSecond;
}

/**
 * Convert a clinic-local calendar date + wall-clock time to a UTC Date.
 * Runs a second offset pass so DST transitions resolve correctly.
 */
export function wallToUtc(dateISO: string, time: string, timeZone: string): Date {
  const naive = Date.parse(`${dateISO}T${time}:00.000Z`);
  if (Number.isNaN(naive)) throw new Error(`Invalid date/time: ${dateISO} ${time}`);
  const firstGuess = naive - tzOffsetMs(new Date(naive), timeZone);
  const corrected = naive - tzOffsetMs(new Date(firstGuess), timeZone);
  return new Date(corrected);
}

export interface WallClock {
  dateISO: string;
  time: string; // HH:mm:ss
  dayOfWeek: number; // 0 = Sunday (calendar day in the target timezone)
}

export function utcToWall(date: Date, timeZone: string): WallClock {
  const { dateISO, time } = wallParts(date, timeZone);
  const [y, m, d] = dateISO.split('-').map(Number);
  return { dateISO, time, dayOfWeek: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

/** Day of week (0=Sunday) for a YYYY-MM-DD calendar date. */
export function dateWeekday(dateISO: string): number {
  const [y, m, d] = dateISO.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Minutes since midnight for an "HH:mm" string. */
export function hhmmToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export function isDateISO(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function isHHMM(value: string): boolean {
  if (!TIME_RE.test(value)) return false;
  const [h, m] = value.split(':').map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

/** True when `instant` falls inside the clinic-local calendar day `dateISO`. */
export function isSameWallDay(instant: Date, dateISO: string, timeZone: string): boolean {
  return utcToWall(instant, timeZone).dateISO === dateISO;
}
