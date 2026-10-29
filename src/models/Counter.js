const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  seq: {
    type: Number,
    default: 0
  }
});

/**
 * Atomically increments and retrieves the next sequence number for a named counter.
 * Using findOneAndUpdate with $inc and upsert guarantees uniqueness under concurrency.
 *
 * @param {string} name - Identifier for the counter sequence
 * @returns {Promise<number>} Next sequence integer
 */
const getNextSequence = async (name) => {
  const counter = await Counter.findOneAndUpdate(
    { name },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return counter.seq;
};

/**
 * Helper to generate human-readable sequential IDs such as "POL-0001", "CLM-0001".
 *
 * @param {string} name - Counter identifier
 * @param {string} prefix - e.g. "POL-"
 * @param {number} padLength - e.g. 4
 * @returns {Promise<string>}
 */
const getNextFormattedId = async (name, prefix = '', padLength = 4) => {
  const seq = await getNextSequence(name);
  return `${prefix}${String(seq).padStart(padLength, '0')}`;
};

const Counter = mongoose.model('Counter', counterSchema);

module.exports = {
  Counter,
  getNextSequence,
  getNextFormattedId
};

