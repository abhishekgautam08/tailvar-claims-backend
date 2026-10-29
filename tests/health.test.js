const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const { connect, closeDatabase } = require('./dbHandler');

describe('Health, System, and Deployment Endpoints', () => {
  let mongoUri;

  beforeAll(async () => {
    mongoUri = await connect();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  describe('GET /api/health', () => {
    it('should return 200 and status ok with db connected when DB is online', async () => {
      const res = await request(app).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.db).toBe('connected');
    });

    it('should return 503 and degraded status when database is disconnected', async () => {
      await mongoose.disconnect();

      const res = await request(app).get('/api/health');

      expect(res.status).toBe(503);
      expect(res.body.status).toBe('degraded');
      expect(res.body.db).toBe('disconnected');
      expect(res.body.error).toEqual({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Database is not connected'
      });

      // Restore connection
      await mongoose.connect(mongoUri);
    });
  });

  describe('Unknown Routes', () => {
    it('should return 404 with standard error structure for non-existent route', async () => {
      const res = await request(app).get('/api/unknown-endpoint');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toEqual({
        code: 'NOT_FOUND',
        message: 'Cannot GET /api/unknown-endpoint'
      });
    });
  });

  describe('Body Parser & JSON Hardening', () => {
    it('should return 400 INVALID_JSON when malformed JSON is sent', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"invalidJson": ');

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error.code).toBe('INVALID_JSON');
      expect(res.body.error.message).toMatch(/malformed json/i);
    });

    it('should return 413 PAYLOAD_TOO_LARGE when payload exceeds 10kb limit', async () => {
      const largePayload = {
        username: 'testuser',
        password: 'x'.repeat(12 * 1024) // 12 KB string
      };

      const res = await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify(largePayload));

      expect(res.status).toBe(413);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });
  });
});
