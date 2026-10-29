const notFoundHandler = (req, res, next) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Cannot ${req.method} ${req.originalUrl}`
    }
  });
};

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || err.status || 500;
  let code = err.code;
  let message = err.message || 'An unexpected error occurred';

  // Handle JSON parsing syntax error from body-parser
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    statusCode = 400;
    code = 'INVALID_JSON';
    message = 'Malformed JSON in request body';
  }

  // Handle oversized body from body-parser
  if (err.type === 'entity.too.large' || err.status === 413) {
    statusCode = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Request payload exceeds the 10kb limit';
  }

  // Handle Mongoose Validation Error
  if (err.name === 'ValidationError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    const messages = Object.values(err.errors).map((e) => e.message);
    message = messages.join(', ');
  }

  // Handle Mongoose Cast Error (e.g. invalid ObjectId)
  if (err.name === 'CastError') {
    statusCode = 400;
    code = 'INVALID_ID';
    message = `Invalid ${err.path}: ${err.value}`;
  }

  // Handle MongoDB duplicate key error (code 11000)
  if (err.code === 11000) {
    statusCode = 409;
    code = 'DUPLICATE_KEY';
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    message = `A record with that ${field} already exists`;
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    code = 'UNAUTHORIZED';
    message = 'Invalid authorization token';
  }
  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    code = 'UNAUTHORIZED';
    message = 'Token has expired';
  }

  // Log unexpected internal server errors (>= 500) with method and path
  if (statusCode >= 500) {
    const reqMethod = req.method || 'UNKNOWN';
    const reqPath = req.originalUrl || req.url || '';
    console.error(`[Server Error] [${reqMethod} ${reqPath}]: ${err.stack || err.message}`);
  }

  // Fallback string error code based on status code
  if (!code || typeof code !== 'string') {
    switch (statusCode) {
      case 400:
        code = 'BAD_REQUEST';
        break;
      case 401:
        code = 'UNAUTHORIZED';
        break;
      case 403:
        code = 'FORBIDDEN';
        break;
      case 404:
        code = 'NOT_FOUND';
        break;
      case 409:
        code = 'CONFLICT';
        break;
      case 413:
        code = 'PAYLOAD_TOO_LARGE';
        break;
      case 422:
        code = 'UNPROCESSABLE_ENTITY';
        break;
      case 429:
        code = 'TOO_MANY_REQUESTS';
        break;
      default:
        code = 'INTERNAL_SERVER_ERROR';
    }
  }

  // Never leak internal error details or stack traces to client in production
  if (statusCode >= 500 && process.env.NODE_ENV === 'production') {
    message = 'Internal server error';
  }

  res.status(statusCode).json({
    error: {
      code,
      message
    }
  });
};

module.exports = {
  notFoundHandler,
  errorHandler
};
