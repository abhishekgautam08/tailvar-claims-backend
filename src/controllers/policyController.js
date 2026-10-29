const policyService = require('../services/policyService');

const createPolicy = async (req, res, next) => {
  try {
    const policy = await policyService.createPolicy(req.body, req.user.id);
    res.status(201).json(policy);
  } catch (error) {
    next(error);
  }
};

const getPolicies = async (req, res, next) => {
  try {
    const policies = await policyService.getPolicies(req.user);
    res.status(200).json(policies);
  } catch (error) {
    next(error);
  }
};

const getPolicyById = async (req, res, next) => {
  try {
    const policy = await policyService.getPolicyById(req.params.id, req.user);
    res.status(200).json(policy);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createPolicy,
  getPolicies,
  getPolicyById
};

