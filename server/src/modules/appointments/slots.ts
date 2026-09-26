import { addMinutes, dateWeekday, hhmmToMinutes, wallToUtc } from '../../utils/time';

/**
 * Slot engine — pure functions, no I/O.
 *
 * Display and validation use the SAME code path: `generateSlots` computes what
 * the frontend is allowed to show, and booking re-runs it at commit time to
 * decide whether a requested start time is bookable. The DB's partial unique
 * index on (doctorId, startsAt) WHERE status <> 'CANCELLED' is the final,
 * race-proof backstop for concurrent clicks.
 */

export interface WindowInput {
  dayOfWeek: number; // 0 = Sunday
  startTime: string; // "HH:mm" clinic-local
  endTime: string; // "HH:mm" clinic-local
  slotDurationMinutes: number;
  bufferMinutes: number;
  isActive: boolean;
}

export interface BusyAppointment {
  startsAt: Date;
  durationMinutes: number;
}

export interface TimeOffInput {
  date: Date; // calendar date (UTC midnight)
  startTime?: string | null; // null/undefined = whole day
  endTime?: string | null;
}

export interface SlotEngineInput {
  windows: WindowInput[];
  busy: BusyAppointment[];
  timeOff: TimeOffInput[];
  dateISO: string; // clinic-local calendar date "YYYY-MM-DD"
  clinicTz: string;
  now: Date;
  minLeadMinutes: number;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * All genuinely open start times (UTC) for one doctor on one clinic-local date.
 * Filters: working windows, slot duration + buffer, existing active
 * appointments, time off (full-day and partial), past times, minimum lead time.
 */
export function generateSlots(input: SlotEngineInput): Date[] {
  const weekday = dateWeekday(input.dateISO);
  const earliest = input.now.getTime() + input.minLeadMinutes * 60_000;

  // Busy blocks from active appointments
  const busyRanges = input.busy.map((b) => {
    const start = b.startsAt.getTime();
    return [start, start + b.durationMinutes * 60_000] as const;
  });

  // Time off covering this calendar date
  const timeOffRanges: (readonly [number, number])[] = [];
  for (const off of input.timeOff) {
    if (toISODate(off.date) !== input.dateISO) continue;
    if (!off.startTime || !off.endTime) {
      // Full-day block: covers every slot on this date
      timeOffRanges.push([Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]);
      break;
    }
    const s = wallToUtc(input.dateISO, off.startTime, input.clinicTz).getTime();
    const e = wallToUtc(input.dateISO, off.endTime, input.clinicTz).getTime();
    timeOffRanges.push([s, e]);
  }

  const slots = new Map<number, Date>();

  for (const w of input.windows) {
    if (!w.isActive || w.dayOfWeek !== weekday) continue;
    const startMin = hhmmToMinutes(w.startTime);
    const endMin = hhmmToMinutes(w.endTime);
    const duration = w.slotDurationMinutes;
    const buffer = Math.max(0, w.bufferMinutes || 0);
    if (duration <= 0 || endMin - startMin < duration) continue;

    for (let m = startMin; m + duration <= endMin; m += duration + buffer) {
      const timeStr = `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
      const start = wallToUtc(input.dateISO, timeStr, input.clinicTz);
      const startMs = start.getTime();
      const endMs = startMs + duration * 60_000;

      if (startMs < earliest) continue;
      if (busyRanges.some(([s, e]) => overlaps(startMs, endMs, s, e))) continue;
      if (timeOffRanges.some(([s, e]) => overlaps(startMs, endMs, s, e))) continue;

      slots.set(startMs, start);
    }
  }

  return [...slots.values()].sort((a, b) => a.getTime() - b.getTime());
}

/**
 * Booking-time validation: is `candidate` (UTC) one of the slots this engine
 * would generate right now? Uses identical logic to the display path.
 */
export function isSlotAvailable(input: SlotEngineInput, candidate: Date): boolean {
  const candidateMs = candidate.getTime();
  return generateSlots(input).some((s) => s.getTime() === candidateMs);
}

/** Convenience loader-shape builder used by routes and tests. */
export function buildInput(params: {
  windows: WindowInput[];
  busy: BusyAppointment[];
  timeOff: TimeOffInput[];
  dateISO: string;
  clinicTz: string;
  now?: Date;
  minLeadMinutes: number;
}): SlotEngineInput {
  return { ...params, now: params.now ?? new Date() };
}

export { addMinutes };
