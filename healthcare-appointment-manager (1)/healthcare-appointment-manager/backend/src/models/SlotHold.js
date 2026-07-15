const mongoose = require('mongoose');

// Slot hold mechanism: when a patient selects a slot and proceeds to fill the
// symptom form, we place a short-lived "hold" on that slot so no one else can
// grab it mid-flow. The hold auto-expires via MongoDB's TTL index if the
// patient abandons the flow, without needing a cron job to clean it up.
const slotHoldSchema = new mongoose.Schema({
  doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true },
  startTime: { type: String, required: true },
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
});

// Same uniqueness guarantee as Appointment: only one active hold per doctor/date/slot.
slotHoldSchema.index({ doctor: 1, date: 1, startTime: 1 }, { unique: true });
// TTL index: MongoDB background task deletes documents once expiresAt is in the past.
slotHoldSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('SlotHold', slotHoldSchema);
