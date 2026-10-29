const mongoose = require('mongoose');
const { isValidCalendarDate } = require('../utils/dates');

const claimSchema = new mongoose.Schema(
  {
    claimId: {
      type: String,
      required: [true, 'Claim ID is required'],
      unique: true,
      trim: true,
      uppercase: true
    },
    policy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Policy',
      required: [true, 'Policy reference is required'],
      index: true
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Customer reference is required'],
      index: true
    },
    incidentDate: {
      type: String,
      required: [true, 'Incident date is required'],
      validate: {
        validator: isValidCalendarDate,
        message: 'Incident date must be a valid calendar date in YYYY-MM-DD format'
      }
    },
    amountPaise: {
      type: Number,
      required: [true, 'Claim amount in paise is required'],
      min: [1, 'Claim amount must be greater than zero'],
      validate: {
        validator: Number.isInteger,
        message: 'Claim amount in paise must be an integer'
      }
    },
    status: {
      type: String,
      enum: {
        values: ['SUBMITTED', 'APPROVED', 'REJECTED'],
        message: '{VALUE} is not a valid claim status'
      },
      default: 'SUBMITTED',
      required: true
    },
    decidedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    decidedAt: {
      type: Date
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

// Compound index on { policy, status } for fast SI aggregation
claimSchema.index({ policy: 1, status: 1 });

const Claim = mongoose.model('Claim', claimSchema);

module.exports = Claim;

