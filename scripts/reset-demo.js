const mongoose = require('mongoose');
const { connectDB, disconnectDB } = require('../src/config/db');
const Claim = require('../src/models/Claim');
const Policy = require('../src/models/Policy');
const { Counter } = require('../src/models/Counter');
const { seedUsers } = require('./seed');

/**
 * Resets the demo database:
 * 1. Requires explicit '--yes' flag to prevent accidental execution.
 * 2. Deletes all claims and policies.
 * 3. Clears sequence counters so policy and claim sequences start at 0001.
 * 4. Re-runs idempotent user seed and creates the 2 demo policies.
 * 5. Preserves existing non-demo users if any.
 *
 * @param {Object} options
 * @param {boolean} options.yes - Confirmation flag
 * @param {string} [options.customUri] - Optional MongoDB URI
 * @returns {Promise<Object>} Summary of reset operations
 */
const resetDemo = async (options = {}) => {
  const isConfirmed = Boolean(options.yes || process.argv.includes('--yes'));

  if (!isConfirmed) {
    const errorMsg = "Refusing to reset database without '--yes' confirmation flag.";
    console.error(`\n[Reset Demo] Aborted: ${errorMsg}`);
    console.error('Usage: npm run reset-demo -- --yes\n');
    const err = new Error(errorMsg);
    err.code = 'CONFIRMATION_REQUIRED';
    throw err;
  }

  const shouldManageConnection = mongoose.connection.readyState === 0;
  if (shouldManageConnection) {
    await connectDB(options.customUri);
  }

  const dbName = mongoose.connection.name;
  const dbHost = mongoose.connection.host;

  console.log(`\n======================================================`);
  console.log(`[Reset Demo] Connected to database '${dbName}' on host '${dbHost}'`);
  console.log(`[Reset Demo] Starting database reset:`);
  console.log(`  - Deleting all claims`);
  console.log(`  - Deleting all policies`);
  console.log(`  - Resetting ID sequence counters (POL-0001, CLM-0001)`);
  console.log(`  - Idempotently upserting demo accounts (customer1, customer2, admin)`);
  console.log(`  - Recreating 2 demo policies (POL-0001 SI ₹10L, POL-0002 SI ₹5L)`);
  console.log(`======================================================\n`);

  try {
    // 1. Delete all claims
    const deletedClaims = await Claim.deleteMany({});
    console.log(`[Reset Demo] Deleted ${deletedClaims.deletedCount} claim(s).`);

    // 2. Delete all policies
    const deletedPolicies = await Policy.deleteMany({});
    console.log(`[Reset Demo] Deleted ${deletedPolicies.deletedCount} policy(ies).`);

    // 3. Clear counters so next sequence begins at 1
    const deletedCounters = await Counter.deleteMany({});
    console.log(`[Reset Demo] Reset ${deletedCounters.deletedCount} sequence counter(s).`);

    // 4. Re-seed demo users & demo policies
    await seedUsers(undefined, { demo: true });

    console.log(`\n[Reset Demo] Reset completed successfully.`);

    return {
      success: true,
      deletedClaimsCount: deletedClaims.deletedCount,
      deletedPoliciesCount: deletedPolicies.deletedCount,
      deletedCountersCount: deletedCounters.deletedCount
    };
  } finally {
    if (shouldManageConnection) {
      await disconnectDB();
    }
  }
};

if (require.main === module) {
  resetDemo()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error(`[Reset Demo Error] ${err.message}`);
      process.exit(1);
    });
}

module.exports = {
  resetDemo
};

