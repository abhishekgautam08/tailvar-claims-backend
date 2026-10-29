const app = require('./app');
const config = require('./config/env');
const { connectDB, disconnectDB } = require('./config/db');

const startServer = async () => {
  try {
    await connectDB();

    const server = app.listen(config.port, () => {
      console.log(`[Server] Tailvar Claims backend listening on port ${config.port} (${config.nodeEnv})`);
      console.log(`[Server] Health check available at http://localhost:${config.port}/api/health`);
      console.log('[Server] Note: MongoDB Atlas (replica set) supports multi-document transactions out of the box. Standalone local mongod without --replSet does not support transactions.');
    });

    const shutdown = async (signal) => {
      console.log(`\n[Server] Received ${signal}. Gracefully shutting down...`);
      server.close(async () => {
        console.log('[Server] HTTP server closed.');
        await disconnectDB();
        process.exit(0);
      });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    return server;
  } catch (error) {
    console.error(`[Server] Failed to start server: ${error.message}`);
    process.exit(1);
  }
};

if (require.main === module) {
  startServer();
}

module.exports = {
  startServer
};

