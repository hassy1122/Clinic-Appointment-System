import { describe, expect, it } from 'vitest';
import { dateWeekday, hhmmToMinutes, tzOffsetMs, utcToWall, wallToUtc } from '../src/utils/time';

describe('timezone helpers', () => {
  it('converts clinic-local wall clock to UTC (UTC+5, no DST)', () => {
    const utc = wallToUtc('2026-01-15', '09:00', 'Asia/Karachi');
    expect(utc.toISOString()).toBe('2026-01-15T04:00:00.000Z');
    expect(tzOffsetMs(new Date('2026-01-15T00:00:00Z'), 'Asia/Karachi')).toBe(5 * 3600_000);
  });

  it('round-trips UTC → wall clock', () => {
    const utc = wallToUtc('2026-06-15', '14:30', 'Asia/Karachi');
    const wall = utcToWall(utc, 'Asia/Karachi');
    expect(wall.dateISO).toBe('2026-06-15');
    expect(wall.time.startsWith('14:30')).toBe(true);
  });

  it('handles DST transitions', () => {
    // New York: EST (-5) in winter, EDT (-4) in summer
    expect(wallToUtc('2026-01-15', '09:00', 'America/New_York').toISOString()).toBe(
      '2026-01-15T14:00:00.000Z'
    );
    expect(wallToUtc('2026-07-01', '09:00', 'America/New_York').toISOString()).toBe(
      '2026-07-01T13:00:00.000Z'
    );
  });

  it('computes the weekday of a calendar date (0=Sunday)', () => {
    expect(dateWeekday('2026-01-01')).toBe(4); // Thursday
    expect(dateWeekday('2026-06-15')).toBe(1); // Monday
  });

  it('parses HH:mm to minutes', () => {
    expect(hhmmToMinutes('09:05')).toBe(545);
    expect(hhmmToMinutes('00:00')).toBe(0);
    expect(hhmmToMinutes('23:59')).toBe(1439);
  });
});
