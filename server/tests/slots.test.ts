import { describe, expect, it } from 'vitest';
import { generateSlots, isSlotAvailable, type SlotEngineInput } from '../src/modules/appointments/slots';
import { dateWeekday, wallToUtc } from '../src/utils/time';

const TZ = 'Asia/Karachi';
const DATE = '2026-06-15';
const WEEKDAY = dateWeekday(DATE);

/** "Now" = previous day noon local, so all slots on DATE are in the future. */
function now(): Date {
  return new Date(Date.parse(`${DATE}T00:00:00Z`) - 12 * 3600 * 1000);
}

function base(overrides: Partial<SlotEngineInput> = {}): SlotEngineInput {
  return {
    windows: [
      {
        dayOfWeek: WEEKDAY,
        startTime: '09:00',
        endTime: '10:00',
        slotDurationMinutes: 20,
        bufferMinutes: 0,
        isActive: true,
      },
    ],
    busy: [],
    timeOff: [],
    dateISO: DATE,
    clinicTz: TZ,
    now: now(),
    minLeadMinutes: 30,
    ...overrides,
  };
}

const at = (time: string) => wallToUtc(DATE, time, TZ).getTime();

describe('generateSlots', () => {
  it('fills a working window with back-to-back slots', () => {
    const slots = generateSlots(base());
    expect(slots.map((s) => s.getTime())).toEqual([at('09:00'), at('09:20'), at('09:40')]);
  });

  it('accounts for buffer minutes between slots', () => {
    const slots = generateSlots(
      base({
        windows: [
          {
            dayOfWeek: WEEKDAY,
            startTime: '09:00',
            endTime: '10:00',
            slotDurationMinutes: 20,
            bufferMinutes: 5,
            isActive: true,
          },
        ],
      })
    );
    // 09:00 + 20 + 5 → 09:25; 09:25 + 20 + 5 → 09:50 would end 10:10 → excluded
    expect(slots.map((s) => s.getTime())).toEqual([at('09:00'), at('09:25')]);
  });

  it('only generates slots for the matching weekday', () => {
    const slots = generateSlots(
      base({
        windows: [
          {
            dayOfWeek: (WEEKDAY + 1) % 7,
            startTime: '09:00',
            endTime: '13:00',
            slotDurationMinutes: 20,
            bufferMinutes: 0,
            isActive: true,
          },
        ],
      })
    );
    expect(slots).toHaveLength(0);
  });

  it('skips inactive windows', () => {
    const slots = generateSlots(
      base({
        windows: [
          {
            dayOfWeek: WEEKDAY,
            startTime: '09:00',
            endTime: '13:00',
            slotDurationMinutes: 20,
            bufferMinutes: 0,
            isActive: false,
          },
        ],
      })
    );
    expect(slots).toHaveLength(0);
  });

  it('removes slots that overlap an existing appointment', () => {
    const slots = generateSlots(
      base({
        windows: [
          {
            dayOfWeek: WEEKDAY,
            startTime: '09:00',
            endTime: '11:00',
            slotDurationMinutes: 20,
            bufferMinutes: 0,
            isActive: true,
          },
        ],
        busy: [{ startsAt: wallToUtc(DATE, '09:40', TZ), durationMinutes: 20 }],
      })
    );
    const times = slots.map((s) => s.getTime());
    expect(times).not.toContain(at('09:40'));
    expect(times).toContain(at('09:00'));
    expect(times).toContain(at('10:00'));
  });

  it('blocks the whole day on full-day time off', () => {
    const slots = generateSlots(
      base({ timeOff: [{ date: new Date(`${DATE}T00:00:00Z`), startTime: null, endTime: null }] })
    );
    expect(slots).toHaveLength(0);
  });

  it('blocks only the covered range on partial time off', () => {
    const slots = generateSlots(
      base({
        windows: [
          {
            dayOfWeek: WEEKDAY,
            startTime: '09:00',
            endTime: '12:00',
            slotDurationMinutes: 20,
            bufferMinutes: 0,
            isActive: true,
          },
        ],
        timeOff: [
          { date: new Date(`${DATE}T00:00:00Z`), startTime: '09:00', endTime: '10:00' },
        ],
      })
    );
    const times = slots.map((s) => s.getTime());
    expect(times).not.toContain(at('09:00'));
    expect(times).not.toContain(at('09:40'));
    expect(times).toContain(at('10:00'));
  });

  it('ignores time off on other dates', () => {
    const slots = generateSlots(
      base({ timeOff: [{ date: new Date('2026-06-20T00:00:00Z') }] })
    );
    expect(slots.length).toBeGreaterThan(0);
  });

  it('respects the minimum lead time', () => {
    // now = 09:00 local minus 10 minutes → the 09:00 slot is too soon
    const slots = generateSlots(
      base({ now: new Date(at('09:00') - 10 * 60_000) })
    );
    const times = slots.map((s) => s.getTime());
    expect(times).not.toContain(at('09:00'));
    expect(times).toContain(at('09:20'));
  });

  it('drops slots in the past', () => {
    const slots = generateSlots(base({ now: new Date(at('10:00') + 1), minLeadMinutes: 0 }));
    expect(slots).toHaveLength(0);
  });
});

describe('isSlotAvailable', () => {
  it('accepts a generated slot and rejects an unknown one', () => {
    const input = base({
      windows: [
        {
          dayOfWeek: WEEKDAY,
          startTime: '09:00',
          endTime: '11:00',
          slotDurationMinutes: 20,
          bufferMinutes: 0,
          isActive: true,
        },
      ],
    });
    expect(isSlotAvailable(input, wallToUtc(DATE, '09:00', TZ))).toBe(true);
    // Between-slot time (09:10) is never bookable
    expect(isSlotAvailable(input, wallToUtc(DATE, '09:10', TZ))).toBe(false);
    // Outside the window
    expect(isSlotAvailable(input, wallToUtc(DATE, '08:00', TZ))).toBe(false);
  });
});
