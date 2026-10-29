const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      lowercase: true,
      trim: true,
      minlength: [3, 'Username must be at least 3 characters long']
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
      select: true
    },
    role: {
      type: String,
      enum: {
        values: ['CUSTOMER', 'ADMIN'],
        message: '{VALUE} is not a valid role. Allowed roles: CUSTOMER, ADMIN'
      },
      default: 'CUSTOMER',
      required: [true, 'Role is required']
    },
    displayName: {
      type: String,
      required: [true, 'Display name is required'],
      trim: true
    }
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        ret.id = ret._id ? ret._id.toString() : undefined;
        delete ret._id;
        delete ret.__v;
        delete ret.passwordHash;
        return ret;
      }
    }
  }
);

// Method to format a clean and safe user representation
userSchema.methods.toSafeObject = function () {
  return {
    id: this._id ? this._id.toString() : undefined,
    username: this.username,
    role: this.role,
    displayName: this.displayName
  };
};

const User = mongoose.model('User', userSchema);

module.exports = User;

