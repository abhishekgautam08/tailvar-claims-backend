const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env if present
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

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
  }
};

module.exports = config;

