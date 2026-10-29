const http = require('http');
const { execFile } = require('child_process');
const path = require('path');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const app = require('../src/app');
const { connectDB, disconnectDB } = require('../src/config/db');
const { seedUsers } = require('../scripts/seed');

describe('Live Smoke Test Script (scripts/smoke-test.js)', () => {
  let replSet;
  let server;
  let serverPort;

  beforeAll(async () => {
    // 1. Start in-memory replica set
    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' }
    });
    const uri = replSet.getUri();

    // 2. Connect and seed base users
    await connectDB(uri);
    await seedUsers(undefined, { demo: true });

    // 3. Start express server on random available port
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        serverPort = server.address().port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await disconnectDB();
    if (replSet) {
      await replSet.stop();
    }
  });

  it('runs all checks successfully and exits with code 0', (done) => {
    const smokeScriptPath = path.resolve(__dirname, '../scripts/smoke-test.js');
    const targetUrl = `http://127.0.0.1:${serverPort}`;

    execFile('node', [smokeScriptPath, targetUrl], (error, stdout, stderr) => {
      if (error) {
        console.error('Smoke test stdout:\n', stdout);
        console.error('Smoke test stderr:\n', stderr);
      }
      expect(error).toBeNull();
      expect(stdout).toContain('ALL CHECKS PASSED ✅');
      expect(stdout).toContain('WARNING: This smoke test executed live operations');
      done();
    });
  }, 45000);
});

