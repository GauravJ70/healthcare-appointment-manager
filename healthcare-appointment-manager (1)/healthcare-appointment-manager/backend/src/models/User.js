const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6 },
    phone: { type: String, trim: true },
    role: { type: String, enum: ['patient', 'doctor', 'admin'], required: true, default: 'patient' },

    // Patient-specific
    dateOfBirth: { type: Date },

    // Doctor-specific pointer (populated doctor profile lives in DoctorProfile collection)
    doctorProfile: { type: mongoose.Schema.Types.ObjectId, ref: 'DoctorProfile' },

    // Google Calendar OAuth tokens (per-user, since each patient/doctor authorizes independently)
    googleTokens: {
      access_token: { type: String },
      refresh_token: { type: String },
      expiry_date: { type: Number },
    },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.googleTokens;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
