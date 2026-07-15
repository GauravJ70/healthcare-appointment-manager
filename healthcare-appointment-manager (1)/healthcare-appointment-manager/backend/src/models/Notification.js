const mongoose = require('mongoose');

// Every outbound email is recorded here first, then attempted. This gives us
// a durable retry queue: a background job periodically resends anything
// still 'pending' or 'failed' (below max attempts), so a transient SMTP
// outage never silently drops a booking confirmation or reminder.
const notificationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        'booking_confirmation',
        'appointment_reminder',
        'cancellation',
        'leave_conflict',
        'medication_reminder',
      ],
      required: true,
    },
    channel: { type: String, enum: ['email', 'calendar'], default: 'email' },
    recipientUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    recipientEmail: { type: String, required: true },
    subject: { type: String, required: true },
    body: { type: String, required: true },
    relatedAppointment: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },

    status: { type: String, enum: ['pending', 'sent', 'failed'], default: 'pending', index: true },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 5 },
    lastError: { type: String },
    lastAttemptAt: { type: Date },
    sentAt: { type: Date },
    // Exponential backoff: don't retry again until this time
    nextRetryAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

notificationSchema.index({ status: 1, nextRetryAt: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
