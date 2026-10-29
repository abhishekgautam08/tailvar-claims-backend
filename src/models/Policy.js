const mongoose = require('mongoose');
const { isValidCalendarDate } = require('../utils/dates');

const policySchema = new mongoose.Schema(
  {
    policyId: {
      type: String,
      required: [true, 'Policy ID is required'],
      unique: true,
      trim: true,
      uppercase: true
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Customer reference is required'],
      index: true
    },
    startDate: {
      type: String,
      required: [true, 'Start date is required'],
      validate: {
        validator: isValidCalendarDate,
        message: 'Start date must be a valid calendar date in YYYY-MM-DD format'
      }
    },
    endDate: {
      type: String,
      required: [true, 'End date is required'],
      validate: {
        validator: isValidCalendarDate,
        message: 'End date must be a valid calendar date in YYYY-MM-DD format'
      }
    },
    sumInsuredPaise: {
      type: Number,
      required: [true, 'Sum insured in paise is required'],
      min: [1, 'Sum insured must be greater than zero'],
      validate: {
        validator: Number.isInteger,
        message: 'Sum insured in paise must be an integer'
      }
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Creator reference is required']
    }
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        ret.id = ret._id ? ret._id.toString() : undefined;
        delete ret._id;
        delete ret.__v;
        return ret;
      }
    }
  }
);

// Schema-level validation: endDate >= startDate
policySchema.pre('validate', function (next) {
  if (this.startDate && this.endDate) {
    if (this.endDate < this.startDate) {
      this.invalidate('endDate', 'End date must be on or after start date');
    }
  }
  next();
});

const Policy = mongoose.model('Policy', policySchema);

module.exports = Policy;

