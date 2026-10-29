const { ValidationError } = require('../utils/errors');

const validateLoginInput = (req, res, next) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return next(new ValidationError('Request body must be a valid JSON object', 'VALIDATION_ERROR'));
  }

  const { username, password } = req.body;

  if (username === undefined || password === undefined) {
    return next(new ValidationError('Username and password are required', 'VALIDATION_ERROR'));
  }

  // Strictly check that both username and password are strings to prevent NoSQL injection
  if (typeof username !== 'string' || typeof password !== 'string') {
    return next(new ValidationError('Username and password must be strings', 'VALIDATION_ERROR'));
  }

  const trimmedUsername = username.trim();
  if (trimmedUsername.length === 0 || password.length === 0) {
    return next(new ValidationError('Username and password cannot be empty', 'VALIDATION_ERROR'));
  }

  // Normalize username to lowercase
  req.body.username = trimmedUsername.toLowerCase();
  req.body.password = password;

  next();
};

const validateCreatePolicyInput = (req, res, next) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return next(new ValidationError('Request body must be a valid JSON object', 'VALIDATION_ERROR'));
  }

  const allowedKeys = ['customerId', 'startDate', 'endDate', 'sumInsured'];
  const bodyKeys = Object.keys(req.body);
  const extraKeys = bodyKeys.filter((k) => !allowedKeys.includes(k));
  if (extraKeys.length > 0) {
    return next(
      new ValidationError(
        `Unexpected field(s) in request body: ${extraKeys.join(', ')}`,
        'UNEXPECTED_FIELDS'
      )
    );
  }

  const { customerId, startDate, endDate, sumInsured } = req.body;

  if (!customerId || typeof customerId !== 'string') {
    return next(new ValidationError('customerId is required and must be a string', 'VALIDATION_ERROR'));
  }

  if (!startDate || typeof startDate !== 'string') {
    return next(new ValidationError('startDate is required and must be a string', 'VALIDATION_ERROR'));
  }

  if (!endDate || typeof endDate !== 'string') {
    return next(new ValidationError('endDate is required and must be a string', 'VALIDATION_ERROR'));
  }

  if (sumInsured === undefined || sumInsured === null) {
    return next(new ValidationError('sumInsured is required', 'VALIDATION_ERROR'));
  }

  next();
};

module.exports = {
  validateLoginInput,
  validateCreatePolicyInput
};
