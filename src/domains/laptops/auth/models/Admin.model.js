import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { getConnection, isConnected } from '../../../../shared/infrastructure/database/connections.js';


const adminSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false,
    },

   role: {
  type: String,
  default: 'ADMIN',
  enum: ['ADMIN'],
},


    isActive: {
      type: Boolean,
      default: true,
    },

    // 🔥 MULTIPLE LOGIN SUPPORT
    refreshTokens: [
      {
        token: String,
        createdAt: {
          type: Date,
          default: Date.now,
        },
        device: String,
        ip: String,
      }
    ],

    lastLogin: Date,

  },
  { timestamps: true }
);

// Hash password
adminSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

adminSchema.methods.comparePassword = function (password) {
  return bcrypt.compare(password, this.password);
};

let Admin = null;

const getAdminModel = () => {
  if (isConnected('laptops')) {
    const conn = getConnection('laptops');
    Admin = conn.models.Admin || conn.model('Admin', adminSchema);
  } else {
    Admin = mongoose.models.Admin || mongoose.model('Admin', adminSchema);
  }
  return Admin;
};

export default new Proxy(function () { }, {
  construct(target, args) {
    return new (getAdminModel())(...args);
  },
  get(target, prop) {
    const model = getAdminModel();
    const value = model[prop];
    if (typeof value === 'function') return value.bind(model);
    return value;
  }
});
