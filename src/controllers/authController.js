const authService = require('../services/authService');

const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const result = await authService.login(username, password);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const getMe = async (req, res, next) => {
  try {
    // req.user was securely populated by the authenticate middleware
    res.status(200).json({
      user: req.user,
      ...req.user
    });
  } catch (error) {
    next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    // Client-side logout by token discard; server provides protected 204 endpoint
    res.status(204).end();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  login,
  getMe,
  logout
};

