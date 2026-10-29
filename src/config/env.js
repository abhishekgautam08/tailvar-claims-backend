const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env if present
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Validates mandatory environment variables.
 * - MONGODB_URI and JWT_SECRET are strictly required.
 * - In NODE_ENV === 'production', JWT_SECRET must be at least 32 characters long.
 *
 * @param {Object} env - Environment object (defaults to process.env)
 * @returns {boolean} True if valid
 * @throws {Error} If validation fails
 */
const validateEnv = (env = process.env) => {
  const errors = [];

  const mongodbUri = env.MONGODB_URI ? env.MONGODB_URI.trim() : '';
  if (!mongodbUri) {
    errors.push('MONGODB_URI environment variable is required');
  }

  const jwtSecret = env.JWT_SECRET ? env.JWT_SECRET.trim() : '';
  if (!jwtSecret) {
    errors.push('JWT_SECRET environment variable is required');
  } else if (env.NODE_ENV === 'production' && jwtSecret.length < 32) {
    errors.push('In production (NODE_ENV=production), JWT_SECRET must be at least 32 characters long');
  }

  if (errors.length > 0) {
    const errorMsg = `Environment configuration error:\n - ${errors.join('\n - ')}`;
    const err = new Error(errorMsg);
    err.errors = errors;
    throw err;
  }

  return true;
};

const config = {
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/tailvar_claims',
  jwtSecret: process.env.JWT_SECRET || 'tailvar_dev_jwt_secret_key_super_secure_2026',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:3000,http://localhost:5173',

  getAllowedOrigins() {
    return this.clientOrigin
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  },

  validateEnv
};

module.exports = config;
module.exports.config = config;
module.exports.validateEnv = validateEnv;
