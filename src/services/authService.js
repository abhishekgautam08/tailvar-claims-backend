const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const User = require('../models/User');
const { UnauthorizedError } = require('../utils/errors');

const generateToken = (user) => {
  const userId = user._id ? user._id.toString() : user.id;
  return jwt.sign(
    {
      id: userId,
      username: user.username,
      role: user.role
    },
    config.jwtSecret,
    {
      expiresIn: config.jwtExpiresIn
    }
  );
};

const login = async (username, password) => {
  // Use the exact same generic error message for unknown user or wrong password
  const genericError = new UnauthorizedError('Invalid username or password', 'UNAUTHORIZED');

  const normalizedUsername = username.toLowerCase().trim();
  const user = await User.findOne({ username: normalizedUsername });
  if (!user) {
    throw genericError;
  }

  const isPasswordMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordMatch) {
    throw genericError;
  }

  const token = generateToken(user);
  const safeUser = user.toSafeObject();

  return {
    token,
    user: safeUser
  };
};

module.exports = {
  generateToken,
  login
};

