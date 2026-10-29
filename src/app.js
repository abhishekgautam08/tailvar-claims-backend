const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const config = require('./config/env');
const routes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();

// Enable trust proxy for correct client IP detection and rate limiting behind reverse proxies (e.g. Render)
app.set('trust proxy', 1);

// Security headers
app.use(helmet());

// CORS configuration supporting comma-separated origins, Authorization header, and OPTIONS preflight
const allowedOrigins = config.getAllowedOrigins();
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. curl, tests, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      return callback(null, true);
    }
    const err = new Error(`Origin ${origin} not allowed by CORS`);
    err.statusCode = 403;
    err.code = 'CORS_ERROR';
    return callback(err);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// HTTP request logging (disabled during test runs)
if (config.nodeEnv !== 'test') {
  app.use(morgan('dev'));
}

// Body parsers with 10kb limit
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// API routes
app.use('/api', routes);

// 404 handler for unknown routes
app.use(notFoundHandler);

// Central error handler
app.use(errorHandler);

module.exports = app;
