const bcrypt = require('bcryptjs');
const { connect, closeDatabase, clearDatabase } = require('./dbHandler');
const User = require('../src/models/User');
const Policy = require('../src/models/Policy');
const { seedUsers, demoAccounts } = require('../scripts/seed');

describe('Seed Script (scripts/seed.js)', () => {
  beforeAll(async () => {
    await connect();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  it('should seed exactly the demo accounts with hashed passwords', async () => {
    // Run seed without demo flag
    await seedUsers();

    const users = await User.find().sort({ username: 1 });
    expect(users).toHaveLength(3);

    const usernames = users.map((u) => u.username);
    expect(usernames).toEqual(['admin', 'customer1', 'customer2']);

    const admin = users.find((u) => u.username === 'admin');
    expect(admin.role).toBe('ADMIN');
    expect(admin.displayName).toBe('Admin User');
    expect(await bcrypt.compare('Admin@Demo26', admin.passwordHash)).toBe(true);

    const cust1 = users.find((u) => u.username === 'customer1');
    expect(cust1.role).toBe('CUSTOMER');
    expect(cust1.displayName).toBe('Customer One');
    expect(await bcrypt.compare('Customer1@Demo26', cust1.passwordHash)).toBe(true);

    const cust2 = users.find((u) => u.username === 'customer2');
    expect(cust2.role).toBe('CUSTOMER');
    expect(cust2.displayName).toBe('Customer Two');
    expect(await bcrypt.compare('Customer2@Demo26', cust2.passwordHash)).toBe(true);

    // No policies should be created when demo flag is false
    const policies = await Policy.find();
    expect(policies).toHaveLength(0);
  });

  it('should be idempotent: running multiple times does not duplicate users or throw errors', async () => {
    // Run 1
    await seedUsers();
    const countAfterFirstRun = await User.countDocuments();
    expect(countAfterFirstRun).toBe(3);

    // Run 2
    await seedUsers();
    const countAfterSecondRun = await User.countDocuments();
    expect(countAfterSecondRun).toBe(3);

    // Run 3
    await seedUsers();
    const countAfterThirdRun = await User.countDocuments();
    expect(countAfterThirdRun).toBe(3);
  });

  it('should seed sample policies for customer1 and customer2 when demo option is true and no policies exist', async () => {
    await seedUsers(null, { demo: true });

    const policies = await Policy.find().populate('customer', 'username');
    expect(policies).toHaveLength(2);

    const p1 = policies.find((p) => p.customer.username === 'customer1');
    expect(p1).toBeDefined();
    expect(p1.policyId).toBe('POL-0001');
    expect(p1.startDate).toBe('2026-01-01');
    expect(p1.endDate).toBe('2026-12-31');
    expect(p1.sumInsuredPaise).toBe(100000000); // 10,00,000 rupees

    const p2 = policies.find((p) => p.customer.username === 'customer2');
    expect(p2).toBeDefined();
    expect(p2.policyId).toBe('POL-0002');
    expect(p2.startDate).toBe('2026-01-01');
    expect(p2.endDate).toBe('2026-12-31');
    expect(p2.sumInsuredPaise).toBe(50000000); // 5,00,000 rupees
  });

  it('should be idempotent with demo flag: does not re-create or duplicate policies if any exist', async () => {
    // First run with demo creates 2 policies
    await seedUsers(null, { demo: true });
    expect(await Policy.countDocuments()).toBe(2);

    // Second run with demo skips policy creation
    await seedUsers(null, { demo: true });
    expect(await Policy.countDocuments()).toBe(2);
  });
});
