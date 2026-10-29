const { ValidationError } = require('./errors');

const MAX_RUPEES = 100000000000; // 100 billion rupees (10,000 crore)

/**
 * Parses a rupee amount (number or numeric string) into integer paise.
 * Rejects non-numeric types, scientific notation, negative/zero values,
 * values with >2 decimal places, and values above maximum limit.
 * Uses string manipulation instead of float multiplication.
 *
 * @param {number|string} input - Amount in rupees
 * @returns {number} Integer paise
 */
const parseRupeesToPaise = (input) => {
  // Reject null, undefined, booleans, objects, arrays, functions, symbols
  if (input === null || input === undefined || typeof input === 'boolean' || typeof input === 'object') {
    throw new ValidationError('Amount must be a valid number or numeric string');
  }

  if (typeof input !== 'number' && typeof input !== 'string') {
    throw new ValidationError('Amount must be a valid number or numeric string');
  }

  // Handle number type
  if (typeof input === 'number') {
    if (Number.isNaN(input) || !Number.isFinite(input)) {
      throw new ValidationError('Amount must be a finite number');
    }
  }

  const rawStr = String(input).trim();
  if (rawStr.length === 0) {
    throw new ValidationError('Amount cannot be empty');
  }

  // Reject scientific notation (e.g., "1e5", "1E-2", 1e25)
  if (/[eE]/.test(rawStr)) {
    throw new ValidationError('Scientific notation is not supported for currency amounts');
  }

  // Reject negative values early
  if (rawStr.startsWith('-')) {
    throw new ValidationError('Amount must be greater than zero');
  }

  // Strict regex for positive numeric format with optional up to 2 decimal places
  // Matches: 100, 100.5, 100.50, 0.1, 0.05
  const numericPattern = /^\d+(\.\d+)?$/;
  if (!numericPattern.test(rawStr)) {
    throw new ValidationError('Amount must be a valid positive numeric value');
  }

  const parts = rawStr.split('.');
  const wholePart = parts[0];
  const fracPart = parts.length > 1 ? parts[1] : '';

  // Reject more than 2 decimal places
  if (fracPart.length > 2) {
    throw new ValidationError('Amount cannot have more than 2 decimal places');
  }

  // Parse whole rupees
  const wholeRupees = parseInt(wholePart, 10);
  if (wholeRupees > MAX_RUPEES) {
    throw new ValidationError(
      `Amount exceeds maximum allowed limit of ₹${MAX_RUPEES.toLocaleString('en-IN')} rupees`
    );
  }

  // Parse paise: pad with zero if 1 decimal place (e.g. "0.1" -> "10")
  const paddedFrac = fracPart.length === 1 ? fracPart + '0' : fracPart.length === 2 ? fracPart : '00';
  const paiseFrac = parseInt(paddedFrac, 10);

  const totalPaise = wholeRupees * 100 + paiseFrac;

  // Reject <= 0
  if (totalPaise <= 0) {
    throw new ValidationError('Amount must be greater than zero');
  }

  return totalPaise;
};

/**
 * Converts integer paise into rupees with 2-decimal precision.
 *
 * @param {number} paise - Amount in paise
 * @returns {number} Amount in rupees
 */
const paiseToRupees = (paise) => {
  if (typeof paise !== 'number' || Number.isNaN(paise)) {
    return 0;
  }
  return Number((paise / 100).toFixed(2));
};

module.exports = {
  parseRupeesToPaise,
  paiseToRupees,
  MAX_RUPEES
};

