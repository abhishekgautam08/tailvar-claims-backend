const express = require('express');
const { getCustomers } = require('../controllers/customerController');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, requireRole('ADMIN'), getCustomers);

module.exports = router;

