const claimService = require('../services/claimService');

const createClaim = async (req, res, next) => {
  try {
    const result = await claimService.createClaim(req.body, req.amountPaise, req.user);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

const getClaims = async (req, res, next) => {
  try {
    const claims = await claimService.getClaims(req.user, req.query);
    res.status(200).json(claims);
  } catch (error) {
    next(error);
  }
};

const getClaimById = async (req, res, next) => {
  try {
    const claim = await claimService.getClaimById(req.params.id, req.user);
    res.status(200).json(claim);
  } catch (error) {
    next(error);
  }
};

const decideClaim = async (req, res, next) => {
  try {
    const result = await claimService.decideClaim(
      req.params.id,
      req.body.decision,
      req.user.id
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createClaim,
  getClaims,
  getClaimById,
  decideClaim
};

