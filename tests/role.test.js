const request = require('supertest');
const express = require('express');
const { authenticate, requireRole } = require('../src/middleware/auth');
const { errorHandler } = require('../src/middleware/errorHandler');
const { connect, closeDatabase, clearDatabase } = require('./dbHandler');
const User = require('../src/models/User');
const { generateToken } = require('../src/services/authService');

describe('Role-based Access Control (requireRole)', () => {
  let app;
  let customerUser;
  let adminUser;
  let customerToken;
  let adminToken;

  beforeAll(async () => {
    await connect();

    // Create a mini Express app to test protected role endpoints
    app = express();
    app.use(express.json());

    // Protected customer-or-admin endpoint
    app.get('/test/any-auth', authenticate, (req, res) => {
      res.json({ message: 'authenticated', user: req.user });
    });

    // Admin-only endpoint
    app.get('/test/admin-only', authenticate, requireRole('ADMIN'), (req, res) => {
      res.json({ message: 'admin access granted', user: req.user });
    });

    // Customer-only endpoint
    app.get('/test/customer-only', authenticate, requireRole('CUSTOMER'), (req, res) => {
      res.json({ message: 'customer access granted', user: req.user });
    });

    app.use(errorHandler);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  beforeEach(async () => {
    await clearDatabase();

    customerUser = await User.create({
      username: 'customer1',
      passwordHash: 'dummy_hash',
      role: 'CUSTOMER',
      displayName: 'Customer One'
    });

    adminUser = await User.create({
      username: 'admin',
      passwordHash: 'dummy_hash',
      role: 'ADMIN',
      displayName: 'Admin User'
    });

    customerToken = generateToken(customerUser);
    adminToken = generateToken(adminUser);
  });

  it('should allow ADMIN to access admin-only endpoint', async () => {
    const res = await request(app)
      .get('/test/admin-only')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('admin access granted');
    expect(res.body.user.role).toBe('ADMIN');
  });

  it('should reject CUSTOMER with 403 Forbidden on admin-only endpoint', async () => {
    const res = await request(app)
      .get('/test/admin-only')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: {
        code: 'FORBIDDEN',
        message: 'Forbidden: insufficient permissions'
      }
    });
  });

  it('should prevent role spoofing via request body or query string', async () => {
    // Attempt to spoof ADMIN role in body or query while presenting customer token
    const res = await request(app)
      .get('/test/admin-only?role=ADMIN')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ role: 'ADMIN', user: { role: 'ADMIN' } });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

