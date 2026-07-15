/**
 * Medication Reminder Job
 * ------------------------
 * Runs on MEDICATION_REMINDER_CRON (default every 30 min). For every
 * completed appointment with an active prescription, computes which doses
 * are due in the current window based on frequencyPerDay and durationDays
 * (counted from postVisit.submittedAt), and queues a reminder email for
 * each due dose exactly once (tracked via Notification records so we don't
 * duplicate-send on the next tick).
 */

const cron = require('node-cron');
const Appointment = require('../models/Appointment');
const Notification = require('../models/Notification');
const emailService = require('../services/emailService');

function dosesPerDayToIntervalHours(freq) {
  if (!freq || freq <= 0) return 24;
  return Math.floor(24 / freq);
}

async function runMedicationReminderSweep() {
  const now = new Date();
  const activeAppointments = await Appointment.find({
    status: 'completed',
    'postVisit.prescription.0': { $exists: true },
  }).populate('patient');

  let queued = 0;

  for (const appt of activeAppointments) {
    const startedAt = appt.postVisit.submittedAt;
    if (!startedAt) continue;

    for (const med of appt.postVisit.prescription) {
      const durationMs = (med.durationDays || 1) * 24 * 60 * 60 * 1000;
      const courseEndsAt = new Date(startedAt.getTime() + durationMs);
      if (now > courseEndsAt) continue; // course finished, no more reminders

      const intervalHours = dosesPerDayToIntervalHours(med.frequencyPerDay);
      const dedupeKey = `${appt._id}-${med.medicationName}-${now.toISOString().slice(0, 13)}`; // hour-bucket dedupe

      // Only queue if we haven't already sent a medication_reminder for this
      // appointment+medication in this hour bucket (cheap idempotency check).
      const alreadySent = await Notification.findOne({
        type: 'medication_reminder',
        relatedAppointment: appt._id,
        subject: { $regex: med.medicationName },
        createdAt: { $gte: new Date(now.getTime() - intervalHours * 60 * 60 * 1000) },
      });
      if (alreadySent) continue;

      const { subject, body } = emailService.medicationReminderEmail(med.medicationName, med.dosage, med.instructions);
      await emailService.queueNotification({
        type: 'medication_reminder',
        recipientUser: appt.patient._id,
        recipientEmail: appt.patient.email,
        subject,
        body,
        relatedAppointment: appt._id,
      });
      queued++;
    }
  }

  if (queued > 0) console.log(`[Job] Medication reminders: queued ${queued} email(s)`);
}

function startMedicationReminderJob() {
  const schedule = process.env.MEDICATION_REMINDER_CRON || '*/30 * * * *';
  cron.schedule(schedule, () => {
    runMedicationReminderSweep().catch((err) => console.error('[Job] Medication reminder sweep failed:', err.message));
  });
  console.log(`[Job] Medication reminder job scheduled: ${schedule}`);
}

module.exports = { startMedicationReminderJob, runMedicationReminderSweep };
