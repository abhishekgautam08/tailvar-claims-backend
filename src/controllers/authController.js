const authService = require('../services/authService');

const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const result = await authService.login(username, password);
    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('tailvar_auth_token', result.token, {
      path: '/',
      sameSite: isProd ? 'none' : 'lax',
      secure: isProd,
      maxAge: 24 * 60 * 60 * 1000
    });
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
    const isProd = process.env.NODE_ENV === 'production';
    res.clearCookie('tailvar_auth_token', {
      path: '/',
      sameSite: isProd ? 'none' : 'lax',
      secure: isProd
    });
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

