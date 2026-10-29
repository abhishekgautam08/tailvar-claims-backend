const { isValidCalendarDate, isWithinInclusive } = require('../src/utils/dates');

describe('Date Utilities (src/utils/dates.js)', () => {
  describe('isValidCalendarDate', () => {
    it('should accept valid calendar dates', () => {
      expect(isValidCalendarDate('2026-01-01')).toBe(true);
      expect(isValidCalendarDate('2026-02-28')).toBe(true);
      expect(isValidCalendarDate('2026-12-31')).toBe(true);
      expect(isValidCalendarDate('2024-02-29')).toBe(true); // 2024 is a leap year
      expect(isValidCalendarDate('2000-02-29')).toBe(true); // 2000 is a leap year (divisible by 400)
    });

    it('should reject impossible dates (e.g. Feb 30, Feb 29 on non-leap year, month 13)', () => {
      expect(isValidCalendarDate('2026-02-30')).toBe(false);
      expect(isValidCalendarDate('2026-02-29')).toBe(false); // 2026 is NOT a leap year
      expect(isValidCalendarDate('1900-02-29')).toBe(false); // 1900 is NOT a leap year (century not divisible by 400)
      expect(isValidCalendarDate('2026-13-01')).toBe(false);
      expect(isValidCalendarDate('2026-00-10')).toBe(false);
      expect(isValidCalendarDate('2026-04-31')).toBe(false); // April has 30 days
      expect(isValidCalendarDate('2026-06-31')).toBe(false); // June has 30 days
      expect(isValidCalendarDate('2026-09-31')).toBe(false); // Sept has 30 days
      expect(isValidCalendarDate('2026-11-31')).toBe(false); // Nov has 30 days
    });

    it('should reject non-zero-padded date strings and invalid formats', () => {
      expect(isValidCalendarDate('2026-1-5')).toBe(false);
      expect(isValidCalendarDate('2026-01-5')).toBe(false);
      expect(isValidCalendarDate('2026-1-05')).toBe(false);
      expect(isValidCalendarDate('26-01-05')).toBe(false);
      expect(isValidCalendarDate('01-05-2026')).toBe(false);
      expect(isValidCalendarDate('2026/01/05')).toBe(false);
    });

    it('should reject ISO timestamps containing time parts', () => {
      expect(isValidCalendarDate('2026-01-05T00:00:00Z')).toBe(false);
      expect(isValidCalendarDate('2026-01-05T12:30:00.000Z')).toBe(false);
    });

    it('should reject non-string inputs', () => {
      expect(isValidCalendarDate(null)).toBe(false);
      expect(isValidCalendarDate(undefined)).toBe(false);
      expect(isValidCalendarDate(12345)).toBe(false);
      expect(isValidCalendarDate(new Date())).toBe(false);
      expect(isValidCalendarDate({})).toBe(false);
    });
  });

  describe('isWithinInclusive', () => {
    it('should correctly determine if a date is within [start, end] inclusive', () => {
      expect(isWithinInclusive('2026-05-15', '2026-05-01', '2026-05-31')).toBe(true);
      expect(isWithinInclusive('2026-05-01', '2026-05-01', '2026-05-31')).toBe(true); // boundary start
      expect(isWithinInclusive('2026-05-31', '2026-05-01', '2026-05-31')).toBe(true); // boundary end
      expect(isWithinInclusive('2026-04-30', '2026-05-01', '2026-05-31')).toBe(false); // before
      expect(isWithinInclusive('2026-06-01', '2026-05-01', '2026-05-31')).toBe(false); // after
    });
  });
});

