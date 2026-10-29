const request = require('supertest');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const app = require('../src/app');
const User = require('../src/models/User');
const Policy = require('../src/models/Policy');
const Claim = require('../src/models/Claim');
const { generateToken } = require('../src/services/authService');
const { connect, closeDatabase, clearDatabase } = require('./dbHandler');

describe('Claims API & Concurrency Control', () => {
  let adminUser;
  let customer1;
  let customer2;
  let adminToken;
  let customer1Token;
  let customer2Token;
  let policyCust1;

  beforeAll(async () => {
    await connect();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  beforeEach(async () => {
    await clearDatabase();

    const saltRounds = 8;
    const adminHash = await bcrypt.hash('Admin@Demo26', saltRounds);
    const customerHash = await bcrypt.hash('Customer@Demo26', saltRounds);

    adminUser = await User.create({
      username: 'admin',
      passwordHash: adminHash,
      role: 'ADMIN',
      displayName: 'System Admin'
    });

    customer1 = await User.create({
      username: 'customer1',
      passwordHash: customerHash,
      role: 'CUSTOMER',
      displayName: 'Customer One'
    });

    customer2 = await User.create({
      username: 'customer2',
      passwordHash: customerHash,
      role: 'CUSTOMER',
      displayName: 'Customer Two'
    });

    adminToken = generateToken(adminUser);
    customer1Token = generateToken(customer1);
    customer2Token = generateToken(customer2);

    // Create policy for customer1: SI 10,00,000 (10 Lakhs), Jan 01 2026 to Dec 31 2026
    const policyRes = await request(app)
      .post('/api/policies')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        customerId: customer1._id.toString(),
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        sumInsured: 1000000
      });

    policyCust1 = policyRes.body;
  });

  describe('Business Rule Lifecycle (The Spec Example)', () => {
    it('SI 10,00,000 -> submit 6,00,000 -> submit 5,00,000 rejected (422) -> reject first claim -> 5,00,000 accepted', async () => {
      // 1. Submit 6,00,000 claim against 10,00,000 SI -> remaining becomes 4,00,000
      const claim1Res = await request(app)
        .post('/api/claims')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          policyId: policyCust1.policyId,
          incidentDate: '2026-04-10',
          amount: 600000
        });

      expect(claim1Res.status).toBe(201);
      expect(claim1Res.body.claim.claimId).toBe('CLM-0001');
      expect(claim1Res.body.claim.status).toBe('SUBMITTED');
      expect(claim1Res.body.policy.sumInsured).toBe(1000000);
      expect(claim1Res.body.policy.blockedAmount).toBe(600000);
      expect(claim1Res.body.policy.remainingClaimableSi).toBe(400000);

      // Verify GET /api/policies reflects updated remainingClaimableSi
      const policyCheck1 = await request(app)
        .get(`/api/policies/${policyCust1.policyId}`)
        .set('Authorization', `Bearer ${customer1Token}`);
      expect(policyCheck1.body.remainingClaimableSi).toBe(400000);
      expect(policyCheck1.body.blockedAmount).toBe(600000);

      // 2. Submit 5,00,000 claim -> rejected (422 AMOUNT_EXCEEDS_REMAINING_SI) because remaining is only 4,00,000
      const claim2RejectRes = await request(app)
        .post('/api/claims')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          policyId: policyCust1.policyId,
          incidentDate: '2026-05-15',
          amount: 500000
        });

      expect(claim2RejectRes.status).toBe(422);
      expect(claim2RejectRes.body.error.code).toBe('AMOUNT_EXCEEDS_REMAINING_SI');
      expect(claim2RejectRes.body.error.message).toMatch(/400000/);

      // 3. Admin rejects the first claim (releases the 6,00,000 blocked amount)
      const rejectClaim1 = await request(app)
        .patch(`/api/claims/${claim1Res.body.claim.id}/decision`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ decision: 'REJECTED' });

      expect(rejectClaim1.status).toBe(200);
      expect(rejectClaim1.body.claim.status).toBe('REJECTED');
      expect(rejectClaim1.body.policy.blockedAmount).toBe(0);
      expect(rejectClaim1.body.policy.remainingClaimableSi).toBe(1000000);

      // Verify GET /api/policies shows full SI restored
      const policyCheck2 = await request(app)
        .get(`/api/policies/${policyCust1.policyId}`)
        .set('Authorization', `Bearer ${customer1Token}`);
      expect(policyCheck2.body.remainingClaimableSi).toBe(1000000);
      expect(policyCheck2.body.blockedAmount).toBe(0);

      // 4. Submit 5,00,000 claim now -> accepted!
      const claim3Res = await request(app)
        .post('/api/claims')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          policyId: policyCust1.policyId,
          incidentDate: '2026-05-15',
          amount: 500000
        });

      expect(claim3Res.status).toBe(201);
      expect(claim3Res.body.claim.status).toBe('SUBMITTED');
      expect(claim3Res.body.policy.blockedAmount).toBe(500000);
      expect(claim3Res.body.policy.remainingClaimableSi).toBe(500000);
    });

    it('Separate scenario: approve the first claim -> remaining stays 4,00,000', async () => {
      // Submit 6,00,000 claim
      const claimRes = await request(app)
        .post('/api/claims')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          policyId: policyCust1.policyId,
          incidentDate: '2026-04-10',
          amount: 600000
        });

      expect(claimRes.status).toBe(201);

      // Approve claim
      const approveRes = await request(app)
        .patch(`/api/claims/${claimRes.body.claim.id}/decision`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ decision: 'APPROVED' });

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.claim.status).toBe('APPROVED');
      expect(approveRes.body.policy.blockedAmount).toBe(600000);
      expect(approveRes.body.policy.remainingClaimableSi).toBe(400000);

      // GET /api/policies also shows 4,00,000 remaining
      const policyCheck = await request(app)
        .get(`/api/policies/${policyCust1.policyId}`)
        .set('Authorization', `Bearer ${customer1Token}`);
      expect(policyCheck.body.remainingClaimableSi).toBe(400000);
      expect(policyCheck.body.blockedAmount).toBe(600000);
    });
  });

  describe('Boundaries & Validations', () => {
    it('accepts incident date equal to startDate and equal to endDate', async () => {
      // Equal to startDate: 2026-01-01
      const resStart = await request(app)
        .post('/api/claims')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          policyId: policyCust1.policyId,
          incidentDate: '2026-01-01',
          amount: 10000
        });

      expect(resStart.status).toBe(201);
      expect(resStart.body.claim.incidentDate).toBe('2026-01-01');

      // Equal to endDate: 2026-12-31
      const resEnd = await request(app)
        .post('/api/claims')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          policyId: policyCust1.policyId,
          incidentDate: '2026-12-31',
          amount: 10000
        });

      expect(resEnd.status).toBe(201);
      expect(resEnd.body.claim.incidentDate).toBe('2026-12-31');
    });

    it('rejects incident date one day before startDate or one day after endDate (422 INCIDENT_DATE_OUT_OF_RANGE)', async () => {
      // One day before start: 2025-12-31
      const resBefore = await request(app)
        .post('/api/claims')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          policyId: policyCust1.policyId,
          incidentDate: '2025-12-31',
          amount: 10000
        });

      expect(resBefore.status).toBe(422);
      expect(resBefore.body.error.code).toBe('INCIDENT_DATE_OUT_OF_RANGE');

      // One day after end: 2027-01-01
      const resAfter = await request(app)
        .post('/api/claims')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          policyId: policyCust1.policyId,
          incidentDate: '2027-01-01',
          amount: 10000
        });

      expect(resAfter.status).toBe(422);
      expect(resAfter.body.error.code).toBe('INCIDENT_DATE_OUT_OF_RANGE');
    });

    it('accepts amount exactly equal to remaining SI, but rejects remaining + 0.01', async () => {
      // First submit 9,99,900 against 10,00,000 -> remaining is 100
      await request(app)
        .post('/api/claims')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          policyId: policyCust1.policyId,
          incidentDate: '2026-06-01',
          amount: 999900
        });

      // Submit 100.01 -> exceeds remaining (100) -> 422
      const resExceed = await request(app)
        .post('/api/claims')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          policyId: policyCust1.policyId,
          incidentDate: '2026-06-02',
          amount: 100.01
        });

      expect(resExceed.status).toBe(422);
      expect(resExceed.body.error.code).toBe('AMOUNT_EXCEEDS_REMAINING_SI');

      // Submit exactly 100 -> accepted!
      const resExact = await request(app)
        .post('/api/claims')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          policyId: policyCust1.policyId,
          incidentDate: '2026-06-02',
          amount: 100
        });

      expect(resExact.status).toBe(201);
      expect(resExact.body.policy.remainingClaimableSi).toBe(0);
    });

    it('rejects invalid amounts: 0, negative, string "abc", null, 3 decimals', async () => {
      const invalidAmounts = [0, -500, 'abc', null, '100.555', 100.125];

      for (const amount of invalidAmounts) {
        const res = await request(app)
          .post('/api/claims')
          .set('Authorization', `Bearer ${customer1Token}`)
          .send({
            policyId: policyCust1.policyId,
            incidentDate: '2026-06-01',
            amount
          });

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('rejects unexpected body fields (status: "APPROVED", customer: otherId) with 400 UNEXPECTED_FIELDS', async () => {
      const res = await request(app)
        .post('/api/claims')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          policyId: policyCust1.policyId,
          incidentDate: '2026-06-01',
          amount: 10000,
          status: 'APPROVED',
          customer: customer2._id.toString()
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('UNEXPECTED_FIELDS');
    });
  });

  describe('Access Control & Isolation', () => {
    it('unauthenticated request gets 401', async () => {
      const res = await request(app)
        .post('/api/claims')
        .send({
          policyId: policyCust1.policyId,
          incidentDate: '2026-06-01',
          amount: 10000
        });

      expect(res.status).toBe(401);
    });

    it('ADMIN cannot submit claims (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/claims')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          policyId: policyCust1.policyId,
          incidentDate: '2026-06-01',
          amount: 10000
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('CUSTOMER cannot PATCH decision (403 Forbidden)', async () => {
      const claimRes = await request(app)
        .post('/api/claims')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          policyId: policyCust1.policyId,
          incidentDate: '2026-06-01',
          amount: 10000
        });

      const res = await request(app)
        .patch(`/api/claims/${claimRes.body.claim.id}/decision`)
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({ decision: 'APPROVED' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('customer2 submitting on customer1 policy gets 404 (does not leak existence)', async () => {
      const res = await request(app)
        .post('/api/claims')
        .set('Authorization', `Bearer ${customer2Token}`)
        .send({
          policyId: policyCust1.policyId,
          incidentDate: '2026-06-01',
          amount: 10000
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('POLICY_NOT_FOUND');
    });

    it('customer2 cannot GET customer1 claim by id (404) and does not see it in the list', async () => {
      const claimRes = await request(app)
        .post('/api/claims')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          policyId: policyCust1.policyId,
          incidentDate: '2026-06-01',
          amount: 10000
        });

      const claimId = claimRes.body.claim.id;

      // Customer2 GET by id -> 404
      const getRes = await request(app)
        .get(`/api/claims/${claimId}`)
        .set('Authorization', `Bearer ${customer2Token}`);

      expect(getRes.status).toBe(404);
      expect(getRes.body.error.code).toBe('CLAIM_NOT_FOUND');

      // Customer2 list -> empty
      const listRes = await request(app)
        .get('/api/claims')
        .set('Authorization', `Bearer ${customer2Token}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body).toHaveLength(0);
    });

    it('ADMIN sees all claims with customer and policy details', async () => {
      await request(app)
        .post('/api/claims')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          policyId: policyCust1.policyId,
          incidentDate: '2026-06-01',
          amount: 10000
        });

      const res = await request(app)
        .get('/api/claims')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].customer.username).toBe('customer1');
      expect(res.body[0].policy.policyId).toBe(policyCust1.policyId);
    });
  });

  describe('Decisions: Compare-and-Set & Conflict Handling', () => {
    let claimId;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/claims')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          policyId: policyCust1.policyId,
          incidentDate: '2026-06-01',
          amount: 25000
        });
      claimId = res.body.claim.id;
    });

    it('approve then reject -> returns 409 CLAIM_ALREADY_DECIDED', async () => {
      // 1. Approve
      const res1 = await request(app)
        .patch(`/api/claims/${claimId}/decision`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ decision: 'APPROVED' });
      expect(res1.status).toBe(200);

      // 2. Try to Reject
      const res2 = await request(app)
        .patch(`/api/claims/${claimId}/decision`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ decision: 'REJECTED' });

      expect(res2.status).toBe(409);
      expect(res2.body.error.code).toBe('CLAIM_ALREADY_DECIDED');
    });

    it('reject then approve -> returns 409 CLAIM_ALREADY_DECIDED', async () => {
      // 1. Reject
      const res1 = await request(app)
        .patch(`/api/claims/${claimId}/decision`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ decision: 'REJECTED' });
      expect(res1.status).toBe(200);

      // 2. Try to Approve
      const res2 = await request(app)
        .patch(`/api/claims/${claimId}/decision`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ decision: 'APPROVED' });

      expect(res2.status).toBe(409);
      expect(res2.body.error.code).toBe('CLAIM_ALREADY_DECIDED');
    });

    it('deciding a non-existent claim returns 404', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .patch(`/api/claims/${fakeId}/decision`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ decision: 'APPROVED' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('CLAIM_NOT_FOUND');
    });

    it('invalid decision value returns 400', async () => {
      const res = await request(app)
        .patch(`/api/claims/${claimId}/decision`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ decision: 'PENDING' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Concurrency & Simultaneous Operations', () => {
    it('5 simultaneous submissions of 4,00,000 on SI 10,00,000: exactly 2 succeed, 3 fail with 422, final blocked = 8,00,000', async () => {
      // Launch 5 concurrent claims of 4,00,000
      const requests = Array.from({ length: 5 }).map(() =>
        request(app)
          .post('/api/claims')
          .set('Authorization', `Bearer ${customer1Token}`)
          .send({
            policyId: policyCust1.policyId,
            incidentDate: '2026-06-15',
            amount: 400000
          })
      );

      const responses = await Promise.all(requests);

      const successes = responses.filter((r) => r.status === 201);
      const failures = responses.filter((r) => r.status === 422);

      // Exactly 2 succeed (2 * 4,00,000 = 8,00,000 <= 10,00,000)
      expect(successes).toHaveLength(2);

      // Exactly 3 fail because 8,00,000 + 4,00,000 = 12,00,000 > 10,00,000
      expect(failures).toHaveLength(3);
      failures.forEach((f) => {
        expect(f.body.error.code).toBe('AMOUNT_EXCEEDS_REMAINING_SI');
      });

      // Check policy state: blockedAmount is exactly 8,00,000 and remainingClaimableSi is 2,00,000
      const finalPolicyRes = await request(app)
        .get(`/api/policies/${policyCust1.policyId}`)
        .set('Authorization', `Bearer ${customer1Token}`);

      expect(finalPolicyRes.body.sumInsured).toBe(1000000);
      expect(finalPolicyRes.body.blockedAmount).toBe(800000);
      expect(finalPolicyRes.body.remainingClaimableSi).toBe(200000);
    });

    it('2 simultaneous decisions on the same claim: exactly one succeeds and the other gets 409', async () => {
      // Submit a single claim
      const claimRes = await request(app)
        .post('/api/claims')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          policyId: policyCust1.policyId,
          incidentDate: '2026-06-15',
          amount: 50000
        });

      const claimId = claimRes.body.claim.id;

      // Fire 2 concurrent decisions: one APPROVED, one REJECTED
      const [resA, resB] = await Promise.all([
        request(app)
          .patch(`/api/claims/${claimId}/decision`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ decision: 'APPROVED' }),
        request(app)
          .patch(`/api/claims/${claimId}/decision`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ decision: 'REJECTED' })
      ]);

      const statuses = [resA.status, resB.status].sort();
      // Exactly one 200, exactly one 409
      expect(statuses).toEqual([200, 409]);

      const conflictRes = resA.status === 409 ? resA : resB;
      expect(conflictRes.body.error.code).toBe('CLAIM_ALREADY_DECIDED');
    });
  });
});

