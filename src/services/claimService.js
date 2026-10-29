const mongoose = require('mongoose');
const Claim = require('../models/Claim');
const Policy = require('../models/Policy');
const User = require('../models/User');
const { getNextFormattedId } = require('../models/Counter');
const { resolvePolicyQuery, getRemainingSiMap } = require('./policyService');
const { paiseToRupees, parseRupeesToPaise } = require('../utils/money');
const { isWithinInclusive } = require('../utils/dates');
const {
  BadRequestError,
  ValidationError,
  NotFoundError,
  ConflictError,
  UnprocessableEntityError
} = require('../utils/errors');

/**
 * Resolves a claim query from MongoDB _id or human-readable claimId.
 *
 * @param {string} id
 * @returns {Object} query object
 */
const resolveClaimQuery = (id) => {
  if (!id || typeof id !== 'string') {
    throw new BadRequestError('Invalid claim ID format', 'INVALID_CLAIM_ID');
  }

  if (mongoose.Types.ObjectId.isValid(id)) {
    return { _id: id };
  } else if (/^CLM-\d+$/i.test(id)) {
    return { claimId: id.toUpperCase() };
  } else {
    throw new BadRequestError('Invalid claim ID format', 'INVALID_CLAIM_ID');
  }
};

/**
 * Formats a claim document for API responses.
 *
 * @param {Object} claim
 * @param {Object} policy
 * @param {Object} customer
 * @returns {Object}
 */
const formatClaim = (claim, policy, customer) => {
  const policyObj = policy
    ? {
        id: policy._id ? policy._id.toString() : policy.id,
        policyId: policy.policyId,
        startDate: policy.startDate,
        endDate: policy.endDate
      }
    : null;

  const customerObj = customer
    ? {
        id: customer._id ? customer._id.toString() : customer.id,
        username: customer.username,
        displayName: customer.displayName
      }
    : null;

  return {
    id: claim._id ? claim._id.toString() : claim.id,
    claimId: claim.claimId,
    policy: policyObj,
    customer: customerObj,
    incidentDate: claim.incidentDate,
    amount: paiseToRupees(claim.amountPaise),
    status: claim.status,
    decidedAt: claim.decidedAt || null,
    decidedBy: claim.decidedBy
      ? claim.decidedBy._id
        ? claim.decidedBy._id.toString()
        : claim.decidedBy.toString()
      : null,
    createdAt: claim.createdAt,
    updatedAt: claim.updatedAt
  };
};

/**
 * Submits a new claim (CUSTOMER only) with concurrency control.
 * Uses atomic policy locking and MongoDB transactions.
 *
 * @param {Object} data - { policyId, incidentDate, amount }
 * @param {number} amountPaise - pre-validated amount in paise
 * @param {Object} user - Authenticated customer user
 * @returns {Promise<Object>} Created claim + updated policy summary
 */
const createClaim = async ({ policyId, incidentDate }, amountPaise, user) => {
  const policyQuery = resolvePolicyQuery(policyId);

  // Generate atomic sequential human-readable claimId BEFORE transaction to avoid counter hotspot
  const claimId = await getNextFormattedId('claim', 'CLM-', 4);

  let session = null;
  let useTransactions = true;

  try {
    session = await mongoose.startSession();
  } catch (err) {
    useTransactions = false;
  }

  const executeClaimSubmission = async (activeSession) => {
    const sessionOpts = activeSession ? { session: activeSession } : {};

    // (a) First perform a write on policy document to acquire lock / serialize concurrent requests on this policy
    const policy = await Policy.findOneAndUpdate(
      policyQuery,
      { $inc: { claimLockVersion: 1 } },
      { new: true, ...sessionOpts }
    ).populate('customer', 'username displayName role');

    if (!policy) {
      throw new NotFoundError('Policy not found', 'POLICY_NOT_FOUND');
    }

    // Verify ownership: customer can only submit against their OWN policy
    const policyCustomerId = policy.customer._id
      ? policy.customer._id.toString()
      : policy.customer.toString();

    if (policyCustomerId !== user.id) {
      // Return 404 to never leak policy existence
      throw new NotFoundError('Policy not found', 'POLICY_NOT_FOUND');
    }

    // Validate incident date is within [startDate, endDate] inclusive
    if (!isWithinInclusive(incidentDate, policy.startDate, policy.endDate)) {
      throw new UnprocessableEntityError(
        `Incident date ${incidentDate} is outside policy coverage period (${policy.startDate} to ${policy.endDate})`,
        'INCIDENT_DATE_OUT_OF_RANGE'
      );
    }

    // (b) Compute blocked sum via aggregation WITH the session
    const matchCriteria = {
      policy: policy._id,
      status: { $in: ['SUBMITTED', 'APPROVED'] }
    };

    let agg = Claim.aggregate([
      { $match: matchCriteria },
      {
        $group: {
          _id: '$policy',
          totalBlockedPaise: { $sum: '$amountPaise' }
        }
      }
    ]);

    if (activeSession) {
      agg = agg.session(activeSession);
    }

    const aggResults = await agg;
    const currentBlockedPaise = aggResults.length > 0 ? aggResults[0].totalBlockedPaise : 0;
    const remainingPaise = Math.max(0, policy.sumInsuredPaise - currentBlockedPaise);
    const remainingClaimableSi = paiseToRupees(remainingPaise);

    // (c) Validate amount <= remaining claimable SI
    if (amountPaise > remainingPaise) {
      throw new UnprocessableEntityError(
        `Claim amount exceeds remaining claimable sum insured (remaining: ₹${remainingClaimableSi})`,
        'AMOUNT_EXCEEDS_REMAINING_SI'
      );
    }

    // (d) Insert the claim with session
    const createArgs = [
      {
        claimId,
        policy: policy._id,
        customer: user.id,
        incidentDate,
        amountPaise,
        status: 'SUBMITTED'
      }
    ];

    const [newClaim] = await Claim.create(createArgs, sessionOpts);

    const newBlockedPaise = currentBlockedPaise + amountPaise;
    const newRemainingPaise = policy.sumInsuredPaise - newBlockedPaise;

    const policySummary = {
      id: policy._id.toString(),
      policyId: policy.policyId,
      sumInsured: paiseToRupees(policy.sumInsuredPaise),
      blockedAmount: paiseToRupees(newBlockedPaise),
      remainingClaimableSi: paiseToRupees(Math.max(0, newRemainingPaise))
    };

    const formattedClaim = formatClaim(newClaim, policy, policy.customer);

    return {
      ...formattedClaim,
      claim: formattedClaim,
      policy: policySummary
    };
  };

  if (session && useTransactions) {
    try {
      let result;
      await session.withTransaction(async () => {
        result = await executeClaimSubmission(session);
      });
      return result;
    } catch (err) {
      // If transactions are not supported by the underlying standalone MongoDB server, fallback gracefully
      if (err.message && err.message.includes('replica set member')) {
        return await executeClaimSubmission(null);
      }
      throw err;
    } finally {
      await session.endSession();
    }
  } else {
    return await executeClaimSubmission(null);
  }
};

/**
 * Retrieves claims based on user role and optional filters.
 * ADMIN gets all claims, CUSTOMER only their own.
 *
 * @param {Object} user
 * @param {Object} query - { status, policyId }
 * @returns {Promise<Array>} List of formatted claims
 */
const getClaims = async (user, query = {}) => {
  const filter = {};

  if (user.role === 'CUSTOMER') {
    filter.customer = user.id;
  }

  // Status filter validation
  if (query.status) {
    const upperStatus = query.status.toUpperCase();
    if (!['SUBMITTED', 'APPROVED', 'REJECTED'].includes(upperStatus)) {
      throw new ValidationError(
        `Invalid status filter: ${query.status}. Allowed values: SUBMITTED, APPROVED, REJECTED`,
        'VALIDATION_ERROR'
      );
    }
    filter.status = upperStatus;
  }

  // Policy filter
  if (query.policyId) {
    const policyQuery = resolvePolicyQuery(query.policyId);
    const policy = await Policy.findOne(policyQuery);
    if (!policy) {
      return [];
    }
    filter.policy = policy._id;
  }

  const claims = await Claim.find(filter)
    .sort({ createdAt: -1 })
    .populate('policy', 'policyId startDate endDate sumInsuredPaise')
    .populate('customer', 'username displayName role')
    .populate('decidedBy', 'username displayName');

  return claims.map((claim) => formatClaim(claim, claim.policy, claim.customer));
};

/**
 * Retrieves a single claim by _id or claimId.
 * Admin can read any. Customer only their own (404 otherwise).
 *
 * @param {string} id
 * @param {Object} user
 * @returns {Promise<Object>} Formatted claim
 */
const getClaimById = async (id, user) => {
  const query = resolveClaimQuery(id);

  const claim = await Claim.findOne(query)
    .populate('policy', 'policyId startDate endDate sumInsuredPaise')
    .populate('customer', 'username displayName role')
    .populate('decidedBy', 'username displayName');

  if (!claim) {
    throw new NotFoundError('Claim not found', 'CLAIM_NOT_FOUND');
  }

  if (user.role === 'CUSTOMER') {
    const claimCustomerId = claim.customer._id
      ? claim.customer._id.toString()
      : claim.customer.toString();

    if (claimCustomerId !== user.id) {
      throw new NotFoundError('Claim not found', 'CLAIM_NOT_FOUND');
    }
  }

  return formatClaim(claim, claim.policy, claim.customer);
};

/**
 * Decides a claim (APPROVED or REJECTED) via atomic compare-and-set.
 *
 * @param {string} id
 * @param {string} decision - 'APPROVED' | 'REJECTED'
 * @param {string} adminUserId
 * @returns {Promise<Object>} Updated claim + updated policy summary
 */
const decideClaim = async (id, decision, adminUserId) => {
  const query = resolveClaimQuery(id);

  // Atomic compare-and-set: update only if status is currently SUBMITTED
  const updatedClaim = await Claim.findOneAndUpdate(
    { ...query, status: 'SUBMITTED' },
    {
      status: decision,
      decidedBy: adminUserId,
      decidedAt: new Date()
    },
    { new: true }
  )
    .populate('policy', 'policyId startDate endDate sumInsuredPaise')
    .populate('customer', 'username displayName role')
    .populate('decidedBy', 'username displayName');

  if (!updatedClaim) {
    // Check if the claim exists at all
    const existing = await Claim.findOne(query);
    if (!existing) {
      throw new NotFoundError('Claim not found', 'CLAIM_NOT_FOUND');
    }
    // Document exists but was not SUBMITTED -> already decided!
    throw new ConflictError('Claim has already been decided', 'CLAIM_ALREADY_DECIDED');
  }

  // Compute updated policy remaining SI
  const siMap = await getRemainingSiMap([updatedClaim.policy._id]);
  const blockedPaise = siMap.get(updatedClaim.policy._id.toString()) || 0;
  const sumInsured = paiseToRupees(updatedClaim.policy.sumInsuredPaise);
  const blockedAmount = paiseToRupees(blockedPaise);
  const remainingClaimableSi = paiseToRupees(
    Math.max(0, updatedClaim.policy.sumInsuredPaise - blockedPaise)
  );

  const policySummary = {
    id: updatedClaim.policy._id.toString(),
    policyId: updatedClaim.policy.policyId,
    sumInsured,
    blockedAmount,
    remainingClaimableSi
  };

  const formattedClaim = formatClaim(updatedClaim, updatedClaim.policy, updatedClaim.customer);

  return {
    ...formattedClaim,
    claim: formattedClaim,
    policy: policySummary
  };
};

module.exports = {
  createClaim,
  getClaims,
  getClaimById,
  decideClaim,
  formatClaim
};

