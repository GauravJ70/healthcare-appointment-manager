/**
 * Email Retry Job
 * ----------------
 * Sweeps the Notification collection for anything 'pending' or 'failed'
 * (but under maxAttempts) whose nextRetryAt has passed, and retries the send.
 * This is what makes email delivery reliable in the face of transient SMTP
 * outages, without ever blocking the request that originally triggered it.
 */

const cron = require('node-cron');
const Notification = require('../models/Notification');
const Appointment = require('../models/Appointment');
const emailService = require('../services/emailService');

async function runEmailRetrySweep() {
  const due = await Notification.find({
    status: { $in: ['pending', 'failed'] },
    nextRetryAt: { $lte: new Date() },
    $expr: { $lt: ['$attempts', '$maxAttempts'] },
  }).limit(100);

  for (const notification of due) {
    await emailService.attemptSend(notification);
  }
  if (due.length > 0) console.log(`[Job] Email retry sweep: retried ${due.length} notification(s)`);
}

// Sends a reminder email ~24h before appointments that haven't been reminded yet.
async function runAppointmentReminderSweep() {
  const now = new Date();
  const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);

  const dateStrings = [windowStart, windowEnd].map((d) => d.toISOString().slice(0, 10));
  const candidateDates = [...new Set(dateStrings)];

  const appointments = await Appointment.find({
    status: 'booked',
    date: { $in: candidateDates },
    'notifications.reminderSent': false,
  })
    .populate('patient')
    .populate('doctor');

  let sent = 0;
  for (const appt of appointments) {
    const apptDateTime = new Date(`${appt.date}T${appt.startTime}:00`);
    if (apptDateTime < windowStart || apptDateTime > windowEnd) continue;

    const { subject, body } = emailService.reminderEmail(appt, appt.doctor.name);
    await emailService.queueNotification({
      type: 'appointment_reminder',
      recipientUser: appt.patient._id,
      recipientEmail: appt.patient.email,
      subject,
      body,
      relatedAppointment: appt._id,
    });
    appt.notifications.reminderSent = true;
    await appt.save();
    sent++;
  }
  if (sent > 0) console.log(`[Job] Appointment reminders: sent ${sent}`);
}

function startEmailRetryJob() {
  const schedule = process.env.EMAIL_RETRY_CRON || '*/5 * * * *';
  cron.schedule(schedule, () => {
    runEmailRetrySweep().catch((err) => console.error('[Job] Email retry sweep failed:', err.message));
    runAppointmentReminderSweep().catch((err) => console.error('[Job] Appointment reminder sweep failed:', err.message));
  });
  console.log(`[Job] Email retry + reminder job scheduled: ${schedule}`);
}

module.exports = { startEmailRetryJob, runEmailRetrySweep, runAppointmentReminderSweep };
