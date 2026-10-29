const mongoose = require('mongoose');

const getHealth = (req, res) => {
  const isDbConnected = mongoose.connection.readyState === 1;

  if (isDbConnected) {
    return res.status(200).json({
      status: 'ok',
      db: 'connected'
    });
  }

  return res.status(503).json({
    status: 'degraded',
    db: 'disconnected',
    error: {
      code: 'SERVICE_UNAVAILABLE',
      message: 'Database is not connected'
    }
  });
};

module.exports = {
  getHealth
};
