const request = require('supertest');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const app = require('../src/app');
const User = require('../src/models/User');
const Policy = require('../src/models/Policy');
const Claim = require('../src/models/Claim');
const { Counter } = require('../src/models/Counter');
const { generateToken } = require('../src/services/authService');
const { connect, closeDatabase, clearDatabase } = require('./dbHandler');

describe('Policy Domain & Endpoints', () => {
  let adminUser;
  let customer1;
  let customer2;
  let adminToken;
  let customer1Token;
  let customer2Token;

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
  });

  describe('POST /api/policies (ADMIN only)', () => {
    it('should allow ADMIN to create a policy successfully with 201 and computed amounts', async () => {
      const payload = {
        customerId: customer1._id.toString(),
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        sumInsured: 500000.5
      };

      const res = await request(app)
        .post('/api/policies')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.policyId).toBe('POL-0001');
      expect(res.body.startDate).toBe('2026-01-01');
      expect(res.body.endDate).toBe('2026-12-31');
      expect(res.body.sumInsured).toBe(500000.5);
      expect(res.body.blockedAmount).toBe(0);
      expect(res.body.remainingClaimableSi).toBe(500000.5);
      expect(res.body.customer).toEqual({
        id: customer1._id.toString(),
        username: 'customer1',
        displayName: 'Customer One'
      });
    });

    it('should reject CUSTOMER with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/policies')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          customerId: customer1._id.toString(),
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          sumInsured: 100000
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should reject unauthenticated request with 401 Unauthorized', async () => {
      const res = await request(app)
        .post('/api/policies')
        .send({
          customerId: customer1._id.toString(),
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          sumInsured: 100000
        });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject when endDate is before startDate', async () => {
      const res = await request(app)
        .post('/api/policies')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customerId: customer1._id.toString(),
          startDate: '2026-05-10',
          endDate: '2026-05-09',
          sumInsured: 100000
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_DATE_RANGE');
    });

    it('should accept same-day start and end dates (decision: equal dates allowed)', async () => {
      const res = await request(app)
        .post('/api/policies')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customerId: customer1._id.toString(),
          startDate: '2026-06-15',
          endDate: '2026-06-15',
          sumInsured: 100000
        });

      expect(res.status).toBe(201);
      expect(res.body.startDate).toBe('2026-06-15');
      expect(res.body.endDate).toBe('2026-06-15');
    });

    it('should reject impossible calendar dates (e.g. 2026-02-30, 2026-13-01)', async () => {
      const res1 = await request(app)
        .post('/api/policies')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customerId: customer1._id.toString(),
          startDate: '2026-02-30',
          endDate: '2026-12-31',
          sumInsured: 100000
        });

      expect(res1.status).toBe(400);
      expect(res1.body.error.code).toBe('INVALID_DATE_FORMAT');

      const res2 = await request(app)
        .post('/api/policies')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customerId: customer1._id.toString(),
          startDate: '2026-01-01',
          endDate: '2026-13-01',
          sumInsured: 100000
        });

      expect(res2.status).toBe(400);
      expect(res2.body.error.code).toBe('INVALID_DATE_FORMAT');
    });

    it('should reject invalid sumInsured values (0, negative, string "abc", 3-decimals, null)', async () => {
      const invalidValues = [0, -100, 'abc', '100.555', 100.125, null];

      for (const val of invalidValues) {
        const res = await request(app)
          .post('/api/policies')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            customerId: customer1._id.toString(),
            startDate: '2026-01-01',
            endDate: '2026-12-31',
            sumInsured: val
          });

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('should reject customerId pointing at an ADMIN user', async () => {
      const res = await request(app)
        .post('/api/policies')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customerId: adminUser._id.toString(),
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          sumInsured: 100000
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_CUSTOMER_ROLE');
    });

    it('should reject unknown customerId with 404', async () => {
      const nonExistentId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .post('/api/policies')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customerId: nonExistentId,
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          sumInsured: 100000
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('CUSTOMER_NOT_FOUND');
    });

    it('should reject invalid customerId format with 400', async () => {
      const res = await request(app)
        .post('/api/policies')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customerId: 'not-a-valid-object-id',
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          sumInsured: 100000
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_CUSTOMER_ID');
    });

    it('should reject unexpected body fields like policyId, createdBy', async () => {
      const res = await request(app)
        .post('/api/policies')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customerId: customer1._id.toString(),
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          sumInsured: 100000,
          policyId: 'POL-9999',
          createdBy: customer1._id.toString()
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('UNEXPECTED_FIELDS');
    });
  });

  describe('Concurrency & Unique ID Generation', () => {
    it('IDs are sequential and unique when 10 policies are created concurrently (Promise.all)', async () => {
      const promises = Array.from({ length: 10 }).map((_, index) =>
        request(app)
          .post('/api/policies')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            customerId: customer1._id.toString(),
            startDate: '2026-01-01',
            endDate: '2026-12-31',
            sumInsured: 100000 + index * 1000
          })
      );

      const responses = await Promise.all(promises);

      // Verify all succeeded
      responses.forEach((res) => {
        expect(res.status).toBe(201);
      });

      const policyIds = responses.map((r) => r.body.policyId);
      // All 10 must be unique
      const uniqueIds = new Set(policyIds);
      expect(uniqueIds.size).toBe(10);

      // All 10 must match POL-0001 through POL-0010
      const sortedIds = [...policyIds].sort();
      const expectedIds = Array.from({ length: 10 }, (_, i) => `POL-${String(i + 1).padStart(4, '0')}`);
      expect(sortedIds).toEqual(expectedIds);
    });
  });

  describe('GET /api/policies', () => {
    let polCust1;
    let polCust2;

    beforeEach(async () => {
      const p1 = await request(app)
        .post('/api/policies')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customerId: customer1._id.toString(),
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          sumInsured: 300000
        });
      polCust1 = p1.body;

      const p2 = await request(app)
        .post('/api/policies')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customerId: customer2._id.toString(),
          startDate: '2026-02-01',
          endDate: '2026-12-31',
          sumInsured: 600000
        });
      polCust2 = p2.body;
    });

    it('ADMIN sees all policies (sorted newest first)', async () => {
      const res = await request(app)
        .get('/api/policies')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].policyId).toBe(polCust2.policyId); // newest first
      expect(res.body[1].policyId).toBe(polCust1.policyId);
    });

    it('customer1 list contains only customer1 policies', async () => {
      const res = await request(app)
        .get('/api/policies')
        .set('Authorization', `Bearer ${customer1Token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].policyId).toBe(polCust1.policyId);
      expect(res.body[0].customer.id).toBe(customer1._id.toString());
    });

    it('customer cannot override filter with another customerId in query', async () => {
      const res = await request(app)
        .get(`/api/policies?customerId=${customer2._id.toString()}`)
        .set('Authorization', `Bearer ${customer1Token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].policyId).toBe(polCust1.policyId);
    });
  });

  describe('GET /api/policies/:id', () => {
    let polCust1;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/policies')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customerId: customer1._id.toString(),
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          sumInsured: 500000
        });
      polCust1 = res.body;
    });

    it('ADMIN can read any policy by Mongo _id or policyId', async () => {
      // By Mongo _id
      const resById = await request(app)
        .get(`/api/policies/${polCust1.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(resById.status).toBe(200);
      expect(resById.body.policyId).toBe(polCust1.policyId);

      // By human readable policyId
      const resByPolicyId = await request(app)
        .get(`/api/policies/${polCust1.policyId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(resByPolicyId.status).toBe(200);
      expect(resByPolicyId.body.id).toBe(polCust1.id);
    });

    it('CUSTOMER can fetch their own policy', async () => {
      const res = await request(app)
        .get(`/api/policies/${polCust1.id}`)
        .set('Authorization', `Bearer ${customer1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.policyId).toBe(polCust1.policyId);
    });

    it('customer2 cannot fetch customer1 policy by id (returns 404 to avoid leaking existence)', async () => {
      const res = await request(app)
        .get(`/api/policies/${polCust1.id}`)
        .set('Authorization', `Bearer ${customer2Token}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('POLICY_NOT_FOUND');
    });

    it('should return 400 for invalid id format', async () => {
      const res = await request(app)
        .get('/api/policies/not-a-valid-id-123')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_POLICY_ID');
    });
  });

  describe('Remaining SI Computation & Claims Aggregation', () => {
    it('remainingClaimableSi equals sumInsured when there are no claims', async () => {
      const policyRes = await request(app)
        .post('/api/policies')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customerId: customer1._id.toString(),
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          sumInsured: 500000
        });

      expect(policyRes.status).toBe(201);
      expect(policyRes.body.sumInsured).toBe(500000);
      expect(policyRes.body.blockedAmount).toBe(0);
      expect(policyRes.body.remainingClaimableSi).toBe(500000);
    });

    it('remainingClaimableSi correctly reflects SUBMITTED and APPROVED claims while ignoring REJECTED claims', async () => {
      const policyRes = await request(app)
        .post('/api/policies')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customerId: customer1._id.toString(),
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          sumInsured: 500000 // 5 Lakhs
        });

      const policyId = policyRes.body.id;

      // Create dummy claims directly in DB using Claim model
      await Claim.create([
        {
          claimId: 'CLM-0001',
          policy: policyId,
          customer: customer1._id,
          incidentDate: '2026-03-01',
          amountPaise: 10000000, // 1 Lakh (SUBMITTED - blocks SI)
          status: 'SUBMITTED'
        },
        {
          claimId: 'CLM-0002',
          policy: policyId,
          customer: customer1._id,
          incidentDate: '2026-04-01',
          amountPaise: 15000000, // 1.5 Lakh (APPROVED - blocks SI)
          status: 'APPROVED'
        },
        {
          claimId: 'CLM-0003',
          policy: policyId,
          customer: customer1._id,
          incidentDate: '2026-05-01',
          amountPaise: 20000000, // 2 Lakhs (REJECTED - does NOT block SI)
          status: 'REJECTED'
        }
      ]);

      const fetchRes = await request(app)
        .get(`/api/policies/${policyId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(fetchRes.status).toBe(200);
      expect(fetchRes.body.sumInsured).toBe(500000);
      // Blocked amount = 1,00,000 + 1,50,000 = 2,50,000
      expect(fetchRes.body.blockedAmount).toBe(250000);
      // Remaining = 5,00,000 - 2,50,000 = 2,50,000
      expect(fetchRes.body.remainingClaimableSi).toBe(250000);
    });
  });

  describe('GET /api/customers (ADMIN only)', () => {
    it('ADMIN gets list of users with role CUSTOMER', async () => {
      const res = await request(app)
        .get('/api/customers')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);

      const usernames = res.body.map((c) => c.username);
      expect(usernames).toEqual(['customer1', 'customer2']);
      expect(res.body[0]).toHaveProperty('id');
      expect(res.body[0]).toHaveProperty('displayName');
      expect(res.body[0]).not.toHaveProperty('passwordHash');
    });

    it('CUSTOMER gets 403 Forbidden on /api/customers', async () => {
      const res = await request(app)
        .get('/api/customers')
        .set('Authorization', `Bearer ${customer1Token}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });
});

