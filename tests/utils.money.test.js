const { parseRupeesToPaise, paiseToRupees } = require('../src/utils/money');

describe('Money Utilities (src/utils/money.js)', () => {
  describe('parseRupeesToPaise', () => {
    it('should parse simple integers to paise', () => {
      expect(parseRupeesToPaise(100)).toBe(10000);
      expect(parseRupeesToPaise('100')).toBe(10000);
      expect(parseRupeesToPaise(1)).toBe(100);
      expect(parseRupeesToPaise('1')).toBe(100);
    });

    it('should parse single decimal places correctly (e.g. "0.1" -> 10 paise, not 1 paise)', () => {
      expect(parseRupeesToPaise('0.1')).toBe(10);
      expect(parseRupeesToPaise(0.1)).toBe(10);
      expect(parseRupeesToPaise('5.5')).toBe(550);
      expect(parseRupeesToPaise(5.5)).toBe(550);
    });

    it('should parse two decimal places accurately', () => {
      expect(parseRupeesToPaise('0.01')).toBe(1);
      expect(parseRupeesToPaise('0.99')).toBe(99);
      expect(parseRupeesToPaise('10.25')).toBe(1025);
      expect(parseRupeesToPaise(10.25)).toBe(1025);
    });

    it('should handle large amounts like "1000000.50" accurately without float errors', () => {
      expect(parseRupeesToPaise('1000000.50')).toBe(100000050);
      expect(parseRupeesToPaise(1000000.5)).toBe(100000050);
    });

    it('should avoid float multiplication bugs like 1.14 * 100 which equals 113.99999999999999 in JS', () => {
      expect(parseRupeesToPaise('1.14')).toBe(114);
      expect(parseRupeesToPaise(1.14)).toBe(114);
    });

    it('should reject 0.1 + 0.2 when passed as raw JS float because binary float math produces 0.30000000000000004 (>2 decimal places)', () => {
      // In JS, 0.1 + 0.2 === 0.30000000000000004
      expect(() => parseRupeesToPaise(0.1 + 0.2)).toThrow(/decimal/i);

      // But when formatted/fixed to 2 decimal places, it parses cleanly to 30 paise
      expect(parseRupeesToPaise((0.1 + 0.2).toFixed(2))).toBe(30);
      expect(parseRupeesToPaise('0.30')).toBe(30);
    });

    it('should reject scientific notation like "1e5" and 1e25', () => {
      expect(() => parseRupeesToPaise('1e5')).toThrow(/scientific/i);
      expect(() => parseRupeesToPaise('1E5')).toThrow(/scientific/i);
      expect(() => parseRupeesToPaise('1e-2')).toThrow(/scientific/i);
      expect(() => parseRupeesToPaise(1e25)).toThrow(/scientific/i);
    });

    it('should reject more than 2 decimal places', () => {
      expect(() => parseRupeesToPaise('10.123')).toThrow(/more than 2 decimal places/i);
      expect(() => parseRupeesToPaise(10.125)).toThrow(/more than 2 decimal places/i);
      expect(() => parseRupeesToPaise('0.001')).toThrow(/more than 2 decimal places/i);
    });

    it('should reject zero and negative values', () => {
      expect(() => parseRupeesToPaise(0)).toThrow(/greater than zero/i);
      expect(() => parseRupeesToPaise('0')).toThrow(/greater than zero/i);
      expect(() => parseRupeesToPaise('0.00')).toThrow(/greater than zero/i);
      expect(() => parseRupeesToPaise(-100)).toThrow(/greater than zero/i);
      expect(() => parseRupeesToPaise('-50.25')).toThrow(/greater than zero/i);
    });

    it('should reject non-numeric inputs (null, boolean, object, array, NaN, Infinity, empty string, non-numeric strings)', () => {
      expect(() => parseRupeesToPaise(null)).toThrow();
      expect(() => parseRupeesToPaise(undefined)).toThrow();
      expect(() => parseRupeesToPaise(true)).toThrow();
      expect(() => parseRupeesToPaise(false)).toThrow();
      expect(() => parseRupeesToPaise({})).toThrow();
      expect(() => parseRupeesToPaise([])).toThrow();
      expect(() => parseRupeesToPaise(NaN)).toThrow();
      expect(() => parseRupeesToPaise(Infinity)).toThrow();
      expect(() => parseRupeesToPaise(-Infinity)).toThrow();
      expect(() => parseRupeesToPaise('')).toThrow();
      expect(() => parseRupeesToPaise('   ')).toThrow();
      expect(() => parseRupeesToPaise('abc')).toThrow();
      expect(() => parseRupeesToPaise('100abc')).toThrow();
    });

    it('should reject amounts above maximum limit (100 billion rupees)', () => {
      expect(() => parseRupeesToPaise('100000000001')).toThrow(/exceeds maximum allowed limit/i);
    });
  });

  describe('paiseToRupees', () => {
    it('should convert paise to rupees with 2-decimal precision', () => {
      expect(paiseToRupees(10000)).toBe(100);
      expect(paiseToRupees(10)).toBe(0.1);
      expect(paiseToRupees(1)).toBe(0.01);
      expect(paiseToRupees(100000050)).toBe(1000000.5);
      expect(paiseToRupees(0)).toBe(0);
    });

    it('should return 0 for non-numeric or NaN inputs', () => {
      expect(paiseToRupees(NaN)).toBe(0);
      expect(paiseToRupees('invalid')).toBe(0);
      expect(paiseToRupees(null)).toBe(0);
    });
  });
});

