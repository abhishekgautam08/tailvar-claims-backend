const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { connectDB, disconnectDB } = require('../src/config/db');
const { resetDemo } = require('../scripts/reset-demo');
const User = require('../src/models/User');
const Policy = require('../src/models/Policy');
const Claim = require('../src/models/Claim');
const { Counter, getNextFormattedId } = require('../src/models/Counter');
const { parseRupeesToPaise } = require('../src/utils/money');

describe('Database Reset Tool (scripts/reset-demo.js)', () => {
  let replSet;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' }
    });
    const uri = replSet.getUri();
    await connectDB(uri);
  });

  afterAll(async () => {
    await disconnectDB();
    if (replSet) {
      await replSet.stop();
    }
  });

  it('refuses to reset when confirmation flag is absent', async () => {
    await expect(resetDemo({ yes: false })).rejects.toThrow(
      "Refusing to reset database without '--yes' confirmation flag."
    );
  });

  it('resets claims, policies, and counters while preserving demo baseline data', async () => {
    // 1. Setup mock existing data
    const nonDemoUser = await User.create({
      username: 'agent_smith',
      passwordHash: 'dummyhash123',
      role: 'ADMIN',
      displayName: 'Agent Smith'
    });

    // Advance counters to POL-0010 and CLM-0005
    await Counter.create({ name: 'policy', seq: 10 });
    await Counter.create({ name: 'claim', seq: 5 });

    // Create a policy
    const dummyPolicy = await Policy.create({
      policyId: 'POL-0010',
      customer: nonDemoUser._id,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      sumInsuredPaise: parseRupeesToPaise(200000),
      createdBy: nonDemoUser._id
    });

    // Create a claim
    await Claim.create({
      claimId: 'CLM-0005',
      policy: dummyPolicy._id,
      customer: nonDemoUser._id,
      incidentDate: '2026-05-01',
      amountPaise: parseRupeesToPaise(50000),
      status: 'SUBMITTED'
    });

    expect(await Policy.countDocuments()).toBe(1);
    expect(await Claim.countDocuments()).toBe(1);

    // 2. Execute reset with confirmation
    const result = await resetDemo({ yes: true });
    expect(result.success).toBe(true);

    // 3. Verify non-demo user was NOT deleted
    const stillExists = await User.findOne({ username: 'agent_smith' });
    expect(stillExists).not.toBeNull();
    expect(stillExists.username).toBe('agent_smith');

    // 4. Verify all claims were deleted
    const claimCount = await Claim.countDocuments();
    expect(claimCount).toBe(0);

    // 5. Verify exactly 2 demo policies were created: POL-0001 and POL-0002
    const policies = await Policy.find().sort({ policyId: 1 }).populate('customer');
    expect(policies.length).toBe(2);

    expect(policies[0].policyId).toBe('POL-0001');
    expect(policies[0].customer.username).toBe('customer1');
    expect(policies[0].sumInsuredPaise).toBe(100000000); // 10L in paise
    expect(policies[0].startDate).toBe('2026-01-01');
    expect(policies[0].endDate).toBe('2026-12-31');

    expect(policies[1].policyId).toBe('POL-0002');
    expect(policies[1].customer.username).toBe('customer2');
    expect(policies[1].sumInsuredPaise).toBe(50000000); // 5L in paise

    // 6. Verify ID sequences: next policy must be POL-0003 and next claim must be CLM-0001
    const nextPolicyId = await getNextFormattedId('policy', 'POL-', 4);
    expect(nextPolicyId).toBe('POL-0003');

    const nextClaimId = await getNextFormattedId('claim', 'CLM-', 4);
    expect(nextClaimId).toBe('CLM-0001');
  });
});

