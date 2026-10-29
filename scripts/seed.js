const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { connectDB, disconnectDB } = require('../src/config/db');
const User = require('../src/models/User');
const Policy = require('../src/models/Policy');
const { getNextFormattedId } = require('../src/models/Counter');
const { parseRupeesToPaise } = require('../src/utils/money');

const demoAccounts = [
  {
    username: 'customer1',
    password: 'Customer1@Demo26',
    role: 'CUSTOMER',
    displayName: 'Customer One'
  },
  {
    username: 'customer2',
    password: 'Customer2@Demo26',
    role: 'CUSTOMER',
    displayName: 'Customer Two'
  },
  {
    username: 'admin',
    password: 'Admin@Demo26',
    role: 'ADMIN',
    displayName: 'Admin User'
  }
];

const seedUsers = async (customUri, options = {}) => {
  const shouldManageConnection = mongoose.connection.readyState === 0;
  try {
    if (shouldManageConnection) {
      console.log('[Seed] Connecting to database...');
      await connectDB(customUri);
    }

    console.log('[Seed] Seeding demo accounts (idempotent upsert)...');
    const saltRounds = 10;

    for (const account of demoAccounts) {
      const passwordHash = await bcrypt.hash(account.password, saltRounds);

      const user = await User.findOneAndUpdate(
        { username: account.username.toLowerCase() },
        {
          username: account.username.toLowerCase(),
          passwordHash,
          role: account.role,
          displayName: account.displayName
        },
        {
          upsert: true,
          new: true,
          runValidators: true,
          setDefaultsOnInsert: true
        }
      );

      console.log(`[Seed] Seeded user '${user.username}' with role '${user.role}' (id: ${user._id})`);
    }

    // Check for optional --demo flag
    const isDemo = Boolean(options.demo || process.argv.includes('--demo'));
    if (isDemo) {
      const policyCount = await Policy.countDocuments();
      if (policyCount === 0) {
        console.log('[Seed] Seeding sample demo policies (--demo flag present)...');
        const adminUser = await User.findOne({ username: 'admin' });
        const customer1User = await User.findOne({ username: 'customer1' });
        const customer2User = await User.findOne({ username: 'customer2' });

        if (adminUser && customer1User && customer2User) {
          // customer1: start 2026-01-01, end 2026-12-31, SI 10,00,000
          const p1Id = await getNextFormattedId('policy', 'POL-', 4);
          await Policy.create({
            policyId: p1Id,
            customer: customer1User._id,
            startDate: '2026-01-01',
            endDate: '2026-12-31',
            sumInsuredPaise: parseRupeesToPaise(1000000),
            createdBy: adminUser._id
          });
          console.log(`[Seed] Seeded demo policy ${p1Id} for customer1 (SI: ₹10,00,000)`);

          // customer2: start 2026-01-01, end 2026-12-31, SI 5,00,000
          const p2Id = await getNextFormattedId('policy', 'POL-', 4);
          await Policy.create({
            policyId: p2Id,
            customer: customer2User._id,
            startDate: '2026-01-01',
            endDate: '2026-12-31',
            sumInsuredPaise: parseRupeesToPaise(500000),
            createdBy: adminUser._id
          });
          console.log(`[Seed] Seeded demo policy ${p2Id} for customer2 (SI: ₹5,00,000)`);
        }
      } else {
        console.log(`[Seed] Policies already exist (${policyCount} found); skipping demo policy creation.`);
      }
    }

    console.log('[Seed] Seeding completed successfully.');
  } catch (error) {
    console.error(`[Seed] Seeding failed: ${error.message}`);
    process.exitCode = 1;
    throw error;
  } finally {
    if (shouldManageConnection) {
      await disconnectDB();
    }
  }
};

if (require.main === module) {
  seedUsers()
    .then(() => {
      if (process.exitCode === 1) {
        process.exit(1);
      }
    })
    .catch(() => {
      process.exit(1);
    });
}

module.exports = {
  demoAccounts,
  seedUsers
};
