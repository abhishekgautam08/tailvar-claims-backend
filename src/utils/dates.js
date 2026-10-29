/**
 * Checks if a string is a strictly valid calendar date formatted as YYYY-MM-DD.
 * Rejects non-strings, non-zero-padded dates, invalid months, invalid days,
 * leap-year inconsistencies (e.g. Feb 29 on non-leap year, Feb 30),
 * and ISO timestamps containing time components.
 *
 * @param {string} str - Date string to validate
 * @returns {boolean} True if valid calendar date in YYYY-MM-DD format
 */
const isValidCalendarDate = (str) => {
  if (typeof str !== 'string') {
    return false;
  }

  // Strict regex: exactly 4 digits, dash, 2 digits, dash, 2 digits
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return false;
  }

  const [yearStr, monthStr, dayStr] = str.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  // Month must be 1 to 12
  if (month < 1 || month > 12) {
    return false;
  }

  // Determine max days in the month
  let maxDays;
  if ([1, 3, 5, 7, 8, 10, 12].includes(month)) {
    maxDays = 31;
  } else if ([4, 6, 9, 11].includes(month)) {
    maxDays = 30;
  } else if (month === 2) {
    // Leap year: divisible by 4, except century years unless divisible by 400
    const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    maxDays = isLeapYear ? 29 : 28;
  }

  return day >= 1 && day <= maxDays;
};

/**
 * Checks whether a given calendar date string falls within [startDate, endDate] inclusive.
 * Valid because YYYY-MM-DD zero-padded format preserves lexicographical order.
 *
 * @param {string} date - Date in YYYY-MM-DD
 * @param {string} start - Start date in YYYY-MM-DD
 * @param {string} end - End date in YYYY-MM-DD
 * @returns {boolean}
 */
const isWithinInclusive = (date, start, end) => {
  return date >= start && date <= end;
};

module.exports = {
  isValidCalendarDate,
  isWithinInclusive
};

