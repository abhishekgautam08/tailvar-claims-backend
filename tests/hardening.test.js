const request = require('supertest');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const User = require('../src/models/User');
const Policy = require('../src/models/Policy');
const { validateEnv } = require('../src/config/env');
const { verifyTransactionSupport } = require('../src/config/db');
const { generateToken } = require('../src/services/authService');
const { connect, closeDatabase, clearDatabase } = require('./dbHandler');

describe('Deployment Hardening & Security Tests', () => {
  let customerUser;
  let adminUser;
  let customerToken;
  let adminToken;
  let samplePolicy;

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

    customerUser = await User.create({
      username: 'customer1',
      passwordHash: customerHash,
      role: 'CUSTOMER',
      displayName: 'Customer One'
    });

    adminToken = generateToken(adminUser);
    customerToken = generateToken(customerUser);

    samplePolicy = await Policy.create({
      policyId: 'POL-0001',
      customer: customerUser._id,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      sumInsuredPaise: 100000000,
      createdBy: adminUser._id
    });
  });

  describe('Environment Validation Helper (validateEnv)', () => {
    it('should throw an error when MONGODB_URI is missing', () => {
      expect(() => {
        validateEnv({ JWT_SECRET: 'a'.repeat(32), NODE_ENV: 'production' });
      }).toThrow(/MONGODB_URI environment variable is required/i);
    });

    it('should throw an error when JWT_SECRET is missing', () => {
      expect(() => {
        validateEnv({ MONGODB_URI: 'mongodb://localhost:27017/test', NODE_ENV: 'production' });
      }).toThrow(/JWT_SECRET environment variable is required/i);
    });

    it('should throw when NODE_ENV is production and JWT_SECRET has fewer than 32 characters', () => {
      expect(() => {
        validateEnv({
          MONGODB_URI: 'mongodb://localhost:27017/test',
          JWT_SECRET: 'short_secret_under_32_chars',
          NODE_ENV: 'production'
        });
      }).toThrow(/JWT_SECRET must be at least 32 characters long/i);
    });

    it('should pass in production when JWT_SECRET has at least 32 characters', () => {
      const valid = validateEnv({
        MONGODB_URI: 'mongodb://localhost:27017/test',
        JWT_SECRET: 'super_secure_production_jwt_secret_key_32_chars!',
        NODE_ENV: 'production'
      });
      expect(valid).toBe(true);
    });

    it('should pass in development with shorter JWT_SECRET', () => {
      const valid = validateEnv({
        MONGODB_URI: 'mongodb://localhost:27017/test',
        JWT_SECRET: 'dev_secret',
        NODE_ENV: 'development'
      });
      expect(valid).toBe(true);
    });
  });

  describe('Transaction Support Verification', () => {
    it('verifyTransactionSupport should return true on the in-memory replica set connection', async () => {
      const isReplicaSet = await verifyTransactionSupport(mongoose.connection);
      expect(isReplicaSet).toBe(true);
    });

    it('verifyTransactionSupport should return false if connection is disconnected', async () => {
      const fakeConnection = { readyState: 0 };
      const isReplicaSet = await verifyTransactionSupport(fakeConnection);
      expect(isReplicaSet).toBe(false);
    });
  });

  describe('Strict Admin-Only Endpoint Authorization Check', () => {
    it('asserts that a customer token gets 403 Forbidden on every admin-only endpoint', async () => {
      const adminEndpoints = [
        {
          method: 'post',
          url: '/api/policies',
          body: {
            customerId: customerUser._id.toString(),
            startDate: '2026-01-01',
            endDate: '2026-12-31',
            sumInsured: 100000
          }
        },
        {
          method: 'get',
          url: '/api/customers',
          body: null
        },
        {
          method: 'patch',
          url: '/api/claims/CLM-0001/decision',
          body: { decision: 'APPROVED' }
        },
        {
          method: 'patch',
          url: `/api/claims/${new mongoose.Types.ObjectId().toString()}/decision`,
          body: { decision: 'REJECTED' }
        }
      ];

      for (const endpoint of adminEndpoints) {
        const req = request(app)[endpoint.method](endpoint.url)
          .set('Authorization', `Bearer ${customerToken}`);

        if (endpoint.body) {
          req.send(endpoint.body);
        }

        const res = await req;
        expect(res.status).toBe(403);
        expect(res.body).toHaveProperty('error');
        expect(res.body.error.code).toBe('FORBIDDEN');
      }
    });
  });

  describe('CORS & Preflight Handling', () => {
    it('should accept OPTIONS preflight request with appropriate CORS headers', async () => {
      const res = await request(app)
        .options('/api/policies')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'Authorization,Content-Type');

      expect([200, 204]).toContain(res.status);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(res.headers['access-control-allow-methods']).toMatch(/POST/);
    });

    it('should reject request from origin not in allowlist with 403 CORS error', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'http://malicious-site.com');

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CORS_ERROR');
    });
  });
});

