const express = require('express');
const { login, getMe, logout } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { validateLoginInput } = require('../middleware/validate');
const { loginLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.post('/login', loginLimiter, validateLoginInput, login);
router.get('/me', authenticate, getMe);
router.post('/logout', authenticate, logout);

module.exports = router;

