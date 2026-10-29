const mongoose = require('mongoose');
const config = require('./env');

const connectDB = async (customUri) => {
  const uri = customUri || config.mongodbUri;
  try {
    const conn = await mongoose.connect(uri);
    if (config.nodeEnv !== 'test') {
      console.log(`[Database] Connected to MongoDB: ${conn.connection.host}/${conn.connection.name}`);
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

module.exports = {
  connectDB,
  disconnectDB
};

