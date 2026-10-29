const mongoose = require('mongoose');
const config = require('./env');

const connectDB = async (customUri) => {
  const uri = customUri || config.mongodbUri;
  try {
    const conn = await mongoose.connect(uri);
    if (config.nodeEnv !== 'test') {
      console.log(`[Database] Connected to database: ${conn.connection.name} on host: ${conn.connection.host}`);
    }
    return conn;
  } catch (error) {
    if (config.nodeEnv !== 'test') {
      console.error(`[Database] MongoDB connection error: ${error.message}`);
    }
    throw error;
  }
};

const disconnectDB = async () => {
  try {
    await mongoose.disconnect();
    if (config.nodeEnv !== 'test') {
      console.log('[Database] Disconnected from MongoDB');
    }
  } catch (error) {
    if (config.nodeEnv !== 'test') {
      console.error(`[Database] MongoDB disconnection error: ${error.message}`);
    }
    throw error;
  }
};

/**
 * Checks whether the connected MongoDB instance supports multi-document transactions.
 * Requires a replica set (e.g. MongoDB Atlas) or mongos (sharded cluster).
 *
 * @param {mongoose.Connection} [connection=mongoose.connection]
 * @returns {Promise<boolean>}
 */
const verifyTransactionSupport = async (connection = mongoose.connection) => {
  try {
    if (!connection || connection.readyState !== 1) {
      return false;
    }
    const adminDb = connection.db.admin();
    const hello = await adminDb.command({ hello: 1 });
    const isReplicaSet = Boolean(hello.setName || hello.msg === 'isdbgrid' || hello.hosts);
    return isReplicaSet;
  } catch (error) {
    return false;
  }
};

module.exports = {
  connectDB,
  disconnectDB,
  verifyTransactionSupport
};
