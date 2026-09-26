/** Date/time formatting — always rendered in the clinic's timezone when given. */

function safeDate(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDateTime(iso: string, tz?: string): string {
  const d = safeDate(iso);
  if (!d) return '—';
  return new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function formatTime(iso: string, tz?: string): string {
  const d = safeDate(iso);
  if (!d) return '—';
  return new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function formatDayShort(iso: string, tz?: string): string {
  const d = safeDate(iso);
  if (!d) return '—';
  return new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(d);
}

/** Calendar date (YYYY-MM-DD) of an instant, in the given timezone. */
export function dayISO(iso: string, tz?: string): string {
  const d = safeDate(iso);
  if (!d) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** "Today" / "Tomorrow" / "Yesterday" / formatted date. */
export function relativeDayLabel(iso: string, tz?: string): string {
  const d = safeDate(iso);
  if (!d) return '—';
  const target = dayISO(d.toISOString(), tz);
  const today = dayISO(new Date().toISOString(), tz);
  const tomorrow = dayISO(new Date(Date.now() + 86_400_000).toISOString(), tz);
  const yesterday = dayISO(new Date(Date.now() - 86_400_000).toISOString(), tz);
  if (target === today) return 'Today';
  if (target === tomorrow) return 'Tomorrow';
  if (target === yesterday) return 'Yesterday';
  return formatDayShort(iso, tz);
}

/** "09:00" → "9:00 AM" (wall-clock strings from availability windows). */
export function formatWallTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return time;
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

export function formatFee(amount: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(amount);
}

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAY_FULL = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/** Next 14 clinic bookable days as YYYY-MM-DD, starting today. */
export function upcomingDays(count = 14, tz?: string): { dateISO: string; label: string }[] {
  const days: { dateISO: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getTime() + i * 86_400_000);
    const dateISO = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
    const weekday = new Intl.DateTimeFormat(undefined, { timeZone: tz, weekday: 'short' }).format(d);
    const dayNum = new Intl.DateTimeFormat(undefined, { timeZone: tz, day: 'numeric' }).format(d);
    days.push({ dateISO, label: `${weekday} ${dayNum}` });
  }
  return days;
}
