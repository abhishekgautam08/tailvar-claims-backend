const app = require('./app');
const config = require('./config/env');
const { validateEnv } = require('./config/env');
const { connectDB, disconnectDB, verifyTransactionSupport } = require('./config/db');

const startServer = async () => {
  try {
    // 1. Validate mandatory environment variables at startup
    try {
      validateEnv(process.env);
    } catch (envError) {
      console.error(`[Startup Error] ${envError.message}`);
      process.exit(1);
    }

    // 2. Connect to MongoDB
    const conn = await connectDB();

    // 3. Verify the connection supports multi-document transactions (replica set or mongos)
    const supportsTx = await verifyTransactionSupport(conn.connection);
    if (!supportsTx) {
      console.error(
        '[Database Error] MongoDB must be a replica set, e.g. Atlas; transactions are required'
      );
      await disconnectDB();
      process.exit(1);
    }

    // 4. Start HTTP server
    const port = process.env.PORT || config.port;
    const host = '0.0.0.0';
    const server = app.listen(port, host, () => {
      console.log(`[Server] Tailvar Claims backend listening on ${host}:${port} (${config.nodeEnv})`);
      console.log(`[Server] Health check available at http://localhost:${port}/api/health`);
      const origins = config.getAllowedOrigins();
      console.log(`[CORS] Allowed origins: ${origins.length > 0 ? origins.join(', ') : '(none)'}`);
    });

    // 5. Graceful shutdown handler
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
