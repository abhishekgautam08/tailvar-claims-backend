const User = require('../models/User');

const getCustomers = async (req, res, next) => {
  try {
    const customers = await User.find({ role: 'CUSTOMER' })
      .sort({ username: 1 })
      .select('_id username displayName role');

    const formatted = customers.map((c) => ({
      id: c._id.toString(),
      username: c.username,
      displayName: c.displayName
    }));

    res.status(200).json(formatted);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCustomers
};

