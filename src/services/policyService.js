const mongoose = require('mongoose');
const Policy = require('../models/Policy');
const Claim = require('../models/Claim');
const User = require('../models/User');
const { getNextFormattedId } = require('../models/Counter');
const { parseRupeesToPaise, paiseToRupees } = require('../utils/money');
const { isValidCalendarDate } = require('../utils/dates');
const {
  BadRequestError,
  ValidationError,
  NotFoundError,
  ForbiddenError
} = require('../utils/errors');

/**
 * Aggregates claims over given policy IDs where status is SUBMITTED or APPROVED.
 * Returns a Map of policyId (string) -> blockedPaise (integer).
 *
 * @param {Array<string|mongoose.Types.ObjectId>} policyIds
 * @returns {Promise<Map<string, number>>}
 */
const getRemainingSiMap = async (policyIds) => {
  const map = new Map();
  if (!policyIds || policyIds.length === 0) {
    return map;
  }

  const objectIds = policyIds.map((id) =>
    typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id
  );

  const results = await Claim.aggregate([
    {
      $match: {
        policy: { $in: objectIds },
        status: { $in: ['SUBMITTED', 'APPROVED'] }
      }
    },
    {
      $group: {
        _id: '$policy',
        blockedPaise: { $sum: '$amountPaise' }
      }
    }
  ]);

  for (const item of results) {
    map.set(item._id.toString(), item.blockedPaise);
  }

  return map;
};

/**
 * Formats a policy document with rupee amounts and remaining SI.
 *
 * @param {Object} policy
 * @param {number} blockedPaise
 * @returns {Object}
 */
const formatPolicy = (policy, blockedPaise = 0) => {
  const sumInsured = paiseToRupees(policy.sumInsuredPaise);
  const blockedAmount = paiseToRupees(blockedPaise);
  const remainingClaimableSi = paiseToRupees(
    Math.max(0, policy.sumInsuredPaise - blockedPaise)
  );

  const customerObj =
    policy.customer && policy.customer.username
      ? {
          id: policy.customer._id ? policy.customer._id.toString() : policy.customer.id,
          username: policy.customer.username,
          displayName: policy.customer.displayName
        }
      : policy.customer;

  return {
    id: policy._id.toString(),
    policyId: policy.policyId,
    customer: customerObj,
    startDate: policy.startDate,
    endDate: policy.endDate,
    sumInsured,
    blockedAmount,
    remainingClaimableSi,
    createdBy: policy.createdBy ? policy.createdBy.toString() : undefined,
    createdAt: policy.createdAt,
    updatedAt: policy.updatedAt
  };
};

/**
 * Creates a new policy (ADMIN only).
 */
const createPolicy = async ({ customerId, startDate, endDate, sumInsured }, adminUserId) => {
  // Validate customerId format
  if (!customerId || typeof customerId !== 'string' || !mongoose.Types.ObjectId.isValid(customerId)) {
    throw new BadRequestError('Invalid customer ID format', 'INVALID_CUSTOMER_ID');
  }

  // Verify customer exists and has role CUSTOMER
  const customerUser = await User.findById(customerId);
  if (!customerUser) {
    throw new NotFoundError('Customer not found', 'CUSTOMER_NOT_FOUND');
  }
  if (customerUser.role !== 'CUSTOMER') {
    throw new BadRequestError('Target user is not a customer', 'INVALID_CUSTOMER_ROLE');
  }

  // Validate dates
  if (!isValidCalendarDate(startDate) || !isValidCalendarDate(endDate)) {
    throw new ValidationError(
      'Start date and end date must be valid calendar dates in YYYY-MM-DD format',
      'INVALID_DATE_FORMAT'
    );
  }

  if (endDate < startDate) {
    throw new ValidationError(
      'End date must be on or after start date',
      'INVALID_DATE_RANGE'
    );
  }

  // Parse sum insured into paise
  const sumInsuredPaise = parseRupeesToPaise(sumInsured);

  // Generate atomic sequential human-readable ID: POL-0001
  const policyId = await getNextFormattedId('policy', 'POL-', 4);

  const policy = await Policy.create({
    policyId,
    customer: customerUser._id,
    startDate,
    endDate,
    sumInsuredPaise,
    createdBy: adminUserId
  });

  // Attach customer details
  policy.customer = customerUser;

  return formatPolicy(policy, 0);
};

/**
 * Retrieves policies based on user role:
 * ADMIN gets all (newest first).
 * CUSTOMER gets only their own.
 */
const getPolicies = async (user) => {
  const query = {};

  if (user.role === 'CUSTOMER') {
    // Strictly restrict to token user id; never accept any query override
    query.customer = user.id;
  }

  const policies = await Policy.find(query)
    .sort({ createdAt: -1 })
    .populate('customer', 'username displayName role');

  const policyIds = policies.map((p) => p._id);
  const siMap = await getRemainingSiMap(policyIds);

  return policies.map((policy) => {
    const blockedPaise = siMap.get(policy._id.toString()) || 0;
    return formatPolicy(policy, blockedPaise);
  });
};

/**
 * Resolves a policy query object from either a MongoDB _id or human-readable policyId.
 *
 * @param {string} id
 * @returns {Object} { _id } or { policyId }
 */
const resolvePolicyQuery = (id) => {
  if (!id || typeof id !== 'string') {
    throw new BadRequestError('Invalid policy ID format', 'INVALID_POLICY_ID');
  }

  if (mongoose.Types.ObjectId.isValid(id)) {
    return { _id: id };
  } else if (/^POL-\d+$/i.test(id)) {
    return { policyId: id.toUpperCase() };
  } else {
    throw new BadRequestError('Invalid policy ID format', 'INVALID_POLICY_ID');
  }
};

/**
 * Retrieves a single policy by MongoDB _id or human-readable policyId.
 * Admin can read any policy. Customer can only read their own.
 * If customer requests another user's policy, returns 404 to avoid leaking existence.
 */
const getPolicyById = async (id, user) => {
  const query = resolvePolicyQuery(id);

  const policy = await Policy.findOne(query).populate('customer', 'username displayName role');

  if (!policy) {
    throw new NotFoundError('Policy not found', 'POLICY_NOT_FOUND');
  }

  // Customer access check: must own the policy
  if (user.role === 'CUSTOMER') {
    const policyCustomerId = policy.customer._id
      ? policy.customer._id.toString()
      : policy.customer.toString();

    if (policyCustomerId !== user.id) {
      // Return 404 instead of 403 so existence is not leaked
      throw new NotFoundError('Policy not found', 'POLICY_NOT_FOUND');
    }
  }

  const siMap = await getRemainingSiMap([policy._id]);
  const blockedPaise = siMap.get(policy._id.toString()) || 0;

  return formatPolicy(policy, blockedPaise);
};

module.exports = {
  resolvePolicyQuery,
  getRemainingSiMap,
  formatPolicy,
  createPolicy,
  getPolicies,
  getPolicyById
};

