const bcrypt = require('bcryptjs');
const { connect, closeDatabase, clearDatabase } = require('./dbHandler');
const User = require('../src/models/User');
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
    // Run seed
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
});

