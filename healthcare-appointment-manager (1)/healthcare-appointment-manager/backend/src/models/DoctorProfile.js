const mongoose = require('mongoose');

// Working hours per weekday, e.g. { day: 1 (Mon), startTime: "09:00", endTime: "17:00" }
const workingHourSchema = new mongoose.Schema(
  {
    day: { type: Number, min: 0, max: 6, required: true }, // 0=Sunday ... 6=Saturday
    startTime: { type: String, required: true }, // "HH:mm" 24h
    endTime: { type: String, required: true },
  },
  { _id: false }
);

const doctorProfileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    specialisation: { type: String, required: true, trim: true, index: true },
    qualifications: { type: String, trim: true },
    slotDurationMinutes: { type: Number, required: true, default: 30, min: 5, max: 240 },
    workingHours: { type: [workingHourSchema], default: [] },
    // Specific leave days (single-day granularity). Recurring weekly off-days are
    // implicitly derived from the absence of a workingHours entry for that weekday.
    leaveDays: [
      {
        date: { type: String, required: true }, // "YYYY-MM-DD"
        reason: { type: String, trim: true },
        notifiedPatients: { type: Boolean, default: false },
      },
    ],
    consultationFee: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

doctorProfileSchema.index({ specialisation: 1, isActive: 1 });

module.exports = mongoose.model('DoctorProfile', doctorProfileSchema);
