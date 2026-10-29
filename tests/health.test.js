const request = require('supertest');
const app = require('../src/app');

describe('Health and System Endpoints', () => {
  describe('GET /api/health', () => {
    it('should return 200 and status ok', async () => {
      const res = await request(app).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
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

  describe('Malformed JSON body', () => {
    it('should return 400 when invalid JSON is sent', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"invalidJson": ');

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error.code).toBe('INVALID_JSON');
    });
  });
});

