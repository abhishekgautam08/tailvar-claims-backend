const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { connectDB, disconnectDB } = require('../src/config/db');
const User = require('../src/models/User');

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

const seedUsers = async (customUri) => {
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
