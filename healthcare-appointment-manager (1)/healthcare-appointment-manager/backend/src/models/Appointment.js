const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    doctorProfile: { type: mongoose.Schema.Types.ObjectId, ref: 'DoctorProfile', required: true },

    date: { type: String, required: true }, // "YYYY-MM-DD"
    startTime: { type: String, required: true }, // "HH:mm"
    endTime: { type: String, required: true },

    status: {
      type: String,
      enum: ['booked', 'completed', 'cancelled', 'cancelled_by_leave', 'no_show'],
      default: 'booked',
      index: true,
    },

    // Pre-visit symptom form + LLM output
    symptomForm: {
      rawSymptoms: { type: String },
      submittedAt: { type: Date },
      llmSummary: {
        urgencyLevel: { type: String, enum: ['Low', 'Medium', 'High'] },
        chiefComplaint: { type: String },
        suggestedQuestions: [{ type: String }],
        generatedAt: { type: Date },
        status: { type: String, enum: ['success', 'failed', 'pending'], default: 'pending' },
        errorMessage: { type: String },
      },
    },

    // Post-visit notes + LLM patient-friendly summary
    postVisit: {
      clinicalNotes: { type: String },
      prescription: [
        {
          medicationName: { type: String, required: true },
          dosage: { type: String }, // e.g. "500mg"
          frequencyPerDay: { type: Number }, // e.g. 3 = three times a day
          durationDays: { type: Number },
          instructions: { type: String }, // e.g. "after food"
        },
      ],
      followUp: { type: String },
      submittedAt: { type: Date },
      llmPatientSummary: {
        summaryText: { type: String },
        medicationSchedule: { type: String },
        followUpSteps: { type: String },
        generatedAt: { type: Date },
        status: { type: String, enum: ['success', 'failed', 'pending'], default: 'pending' },
        errorMessage: { type: String },
      },
    },

    // Google Calendar linkage
    calendarEvents: {
      patientEventId: { type: String },
      doctorEventId: { type: String },
    },

    // Notification audit trail (also see Notification collection for retry queue)
    notifications: {
      bookingConfirmationSent: { type: Boolean, default: false },
      reminderSent: { type: Boolean, default: false },
      cancellationSent: { type: Boolean, default: false },
    },

    cancellationReason: { type: String },
  },
  { timestamps: true }
);

// CRITICAL: This unique index is the source of truth for double-booking prevention.
// Two documents cannot exist for the same doctor+date+startTime while status is
// 'booked' or 'completed'. MongoDB enforces this atomically at the storage layer,
// so even concurrent requests that both pass an application-level availability
// check will have one fail at insert time with a duplicate key error (E11000).
appointmentSchema.index(
  { doctor: 1, date: 1, startTime: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['booked', 'completed'] } },
  }
);

appointmentSchema.index({ patient: 1, date: 1 });

module.exports = mongoose.model('Appointment', appointmentSchema);
