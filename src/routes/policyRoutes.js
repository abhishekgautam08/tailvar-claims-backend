const express = require('express');
const {
  createPolicy,
  getPolicies,
  getPolicyById
} = require('../controllers/policyController');
const { authenticate, requireRole } = require('../middleware/auth');
const { validateCreatePolicyInput } = require('../middleware/validate');

const router = express.Router();

router.post('/', authenticate, requireRole('ADMIN'), validateCreatePolicyInput, createPolicy);
router.get('/', authenticate, getPolicies);
router.get('/:id', authenticate, getPolicyById);

module.exports = router;

