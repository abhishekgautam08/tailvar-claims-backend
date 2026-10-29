const express = require('express');
const healthRoutes = require('./healthRoutes');
const authRoutes = require('./authRoutes');
const policyRoutes = require('./policyRoutes');
const customerRoutes = require('./customerRoutes');
const claimRoutes = require('./claimRoutes');

const router = express.Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/policies', policyRoutes);
router.use('/customers', customerRoutes);
router.use('/claims', claimRoutes);

module.exports = router;
