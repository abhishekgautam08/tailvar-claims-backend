const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const User = require('../src/models/User');
const config = require('../src/config/env');
const { connect, closeDatabase, clearDatabase } = require('./dbHandler');

describe('Authentication API', () => {
  beforeAll(async () => {
    await connect();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  beforeEach(async () => {
    await clearDatabase();

    // Seed test users
    const saltRounds = 8;
    const customerPasswordHash = await bcrypt.hash('Customer1@Demo26', saltRounds);
    const adminPasswordHash = await bcrypt.hash('Admin@Demo26', saltRounds);

    await User.create([
      {
        username: 'customer1',
        passwordHash: customerPasswordHash,
        role: 'CUSTOMER',
        displayName: 'Customer One'
      },
      {
        username: 'admin',
        passwordHash: adminPasswordHash,
        role: 'ADMIN',
        displayName: 'Admin User'
      }
    ]);
  });

  describe('POST /api/auth/login', () => {
    it('should return 200, JWT token and user info on valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'customer1',
          password: 'Customer1@Demo26'
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(typeof res.body.token).toBe('string');
      expect(res.body).toHaveProperty('user');
      expect(res.body.user).toEqual({
        id: expect.any(String),
        username: 'customer1',
        role: 'CUSTOMER',
        displayName: 'Customer One'
      });

      // Crucial: ensure no passwords or hashes are returned
      expect(res.body.user).not.toHaveProperty('password');
      expect(res.body.user).not.toHaveProperty('passwordHash');
      expect(res.body).not.toHaveProperty('password');
      expect(res.body).not.toHaveProperty('passwordHash');
    });

    it('should be case-insensitive for username during login', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'CuStOmEr1',
          password: 'Customer1@Demo26'
        });

      expect(res.status).toBe(200);
      expect(res.body.user.username).toBe('customer1');
    });

    it('should return 401 with generic error on wrong password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'customer1',
          password: 'WrongPassword123!'
        });

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toEqual({
        code: 'UNAUTHORIZED',
        message: 'Invalid username or password'
      });
      expect(res.body).not.toHaveProperty('token');
    });

    it('should return 401 with the exact same generic error for unknown user', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'unknown_user_999',
          password: 'Customer1@Demo26'
        });

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toEqual({
        code: 'UNAUTHORIZED',
        message: 'Invalid username or password'
      });
    });

    it('should return 400 when username or password is not a string (NoSQL injection prevention)', async () => {
      // Test object payload ($gt operator injection attempt)
      const resObj = await request(app)
        .post('/api/auth/login')
        .send({
          username: { $gt: '' },
          password: 'Customer1@Demo26'
        });

      expect(resObj.status).toBe(400);
      expect(resObj.body.error.code).toBe('VALIDATION_ERROR');

      // Test numeric payload
      const resNum = await request(app)
        .post('/api/auth/login')
        .send({
          username: 12345,
          password: 'Customer1@Demo26'
        });

      expect(resNum.status).toBe(400);
      expect(resNum.body.error.code).toBe('VALIDATION_ERROR');

      // Test boolean payload
      const resBool = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'customer1',
          password: true
        });

      expect(resBool.status).toBe(400);
      expect(resBool.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when username or password is missing or empty', async () => {
      const resEmpty = await request(app)
        .post('/api/auth/login')
        .send({
          username: '   ',
          password: ''
        });

      expect(resEmpty.status).toBe(400);
      expect(resEmpty.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/auth/me', () => {
    let validCustomerToken;
    let validAdminToken;

    beforeEach(async () => {
      const customerLogin = await request(app)
        .post('/api/auth/login')
        .send({ username: 'customer1', password: 'Customer1@Demo26' });
      validCustomerToken = customerLogin.body.token;

      const adminLogin = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'Admin@Demo26' });
      validAdminToken = adminLogin.body.token;
    });

    it('should return 200 and the current user profile when valid token is provided', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${validCustomerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.username).toBe('customer1');
      expect(res.body.role).toBe('CUSTOMER');
      expect(res.body.displayName).toBe('Customer One');
      expect(res.body).toHaveProperty('id');
      expect(res.body).not.toHaveProperty('passwordHash');
    });

    it('should return 401 when Authorization header is missing', async () => {
      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 when token format is invalid (missing Bearer prefix)', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', validCustomerToken);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 when token is malformed or invalid', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer totally.invalid.token');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 when token is expired', async () => {
      const customer = await User.findOne({ username: 'customer1' });
      // Create an immediately expired token
      const expiredToken = jwt.sign(
        { id: customer._id.toString(), username: customer.username, role: customer.role },
        config.jwtSecret,
        { expiresIn: '-1s' }
      );

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
      expect(res.body.error.message).toMatch(/expired/i);
    });

    it('should return 401 if user from token no longer exists in DB', async () => {
      // Create token for non-existent user id
      const fakeToken = jwt.sign(
        { id: '507f1f77bcf86cd799439011', username: 'ghost', role: 'CUSTOMER' },
        config.jwtSecret,
        { expiresIn: '1h' }
      );

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${fakeToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should return 204 No Content for authenticated request', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ username: 'customer1', password: 'Customer1@Demo26' });

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${loginRes.body.token}`);

      expect(res.status).toBe(204);
      expect(res.text).toBe('');
    });

    it('should return 401 if unauthenticated', async () => {
      const res = await request(app).post('/api/auth/logout');
      expect(res.status).toBe(401);
    });
  });
});

