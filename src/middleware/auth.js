const jwt = require('jsonwebtoken');
const config = require('../config/env');
const User = require('../models/User');
const { UnauthorizedError, ForbiddenError } = require('../utils/errors');

const authenticate = async (req, res, next) => {
  try {
    let token;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.headers.cookie) {
      const match = req.headers.cookie.match(/(?:^|;\s*)tailvar_auth_token=([^;]+)/);
      if (match) {
        token = decodeURIComponent(match[1]);
      }
    }

    if (!token) {
      throw new UnauthorizedError('Authentication token required', 'UNAUTHORIZED');
    }

    let decoded;
    try {
      decoded = jwt.verify(token, config.jwtSecret);
    } catch (jwtErr) {
      if (jwtErr.name === 'TokenExpiredError') {
        throw new UnauthorizedError('Token has expired', 'UNAUTHORIZED');
      }
      throw new UnauthorizedError('Invalid authorization token', 'UNAUTHORIZED');
    }

    if (!decoded || !decoded.id) {
      throw new UnauthorizedError('Invalid token payload', 'UNAUTHORIZED');
    }

    // Always fetch user from database to ensure user is active and exists
    const user = await User.findById(decoded.id);
    if (!user) {
      throw new UnauthorizedError('User not found or no longer active', 'UNAUTHORIZED');
    }

    // Role and user id strictly come from verified token / DB record
    req.user = user.toSafeObject();
    req.currentUser = user;

    next();
  } catch (error) {
    next(error);
  }
};

const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required', 'UNAUTHORIZED'));
    }

    if (!roles.includes(req.user.role)) {
      return next(new ForbiddenError('Forbidden: insufficient permissions', 'FORBIDDEN'));
    }

    next();
  };
};

module.exports = {
  authenticate,
  requireRole
};

