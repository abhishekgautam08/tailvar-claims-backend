const express = require('express');
const {
  createClaim,
  getClaims,
  getClaimById,
  decideClaim
} = require('../controllers/claimController');
const { authenticate, requireRole } = require('../middleware/auth');
const {
  validateCreateClaimInput,
  validateClaimDecisionInput
} = require('../middleware/validate');

const router = express.Router();

router.post(
  '/',
  authenticate,
  requireRole('CUSTOMER'),
  validateCreateClaimInput,
  createClaim
);

router.get('/', authenticate, getClaims);

router.get('/:id', authenticate, getClaimById);

router.patch(
  '/:id/decision',
  authenticate,
  requireRole('ADMIN'),
  validateClaimDecisionInput,
  decideClaim
);

module.exports = router;

