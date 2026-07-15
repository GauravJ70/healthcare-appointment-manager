/**
 * Email Service
 * -------------
 * All emails go through queueNotification() which writes a Notification
 * document first (status: pending), then attempts an immediate send.
 * If the immediate send fails (SMTP down, network blip, rate limit), the
 * document stays 'pending'/'failed' with a nextRetryAt, and the
 * emailRetryJob background job will pick it up later. This means a booking
 * is never lost even if the email provider is temporarily unreachable.
 */

const nodemailer = require('nodemailer');
const Notification = require('../models/Notification');

const PROVIDER = process.env.EMAIL_PROVIDER || 'mock';

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (PROVIDER === 'smtp') {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

async function actuallySend({ to, subject, body }) {
  if (PROVIDER === 'mock') {
    // In dev/demo mode we just log. Swap EMAIL_PROVIDER=smtp + fill SMTP_* to go live.
    console.log(`\n[MOCK EMAIL] To: ${to}\nSubject: ${subject}\n${body}\n`);
    return;
  }

  const t = getTransporter();
  await t.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject,
    html: body,
  });
}

/**
 * Create a notification record and attempt to send it immediately.
 * Always returns without throwing — failure is recorded on the document,
 * not surfaced as an exception, so callers (e.g. booking flow) are never
 * broken by an email outage.
 */
async function queueNotification({ type, recipientUser, recipientEmail, subject, body, relatedAppointment }) {
  const notification = await Notification.create({
    type,
    recipientUser,
    recipientEmail,
    subject,
    body,
    relatedAppointment,
  });

  await attemptSend(notification);
  return notification;
}

async function attemptSend(notification) {
  notification.attempts += 1;
  notification.lastAttemptAt = new Date();
  try {
    await actuallySend({ to: notification.recipientEmail, subject: notification.subject, body: notification.body });
    notification.status = 'sent';
    notification.sentAt = new Date();
  } catch (err) {
    notification.lastError = err.message;
    const backoffMinutes = Math.min(60, 2 ** notification.attempts); // exponential backoff, capped at 60 min
    notification.nextRetryAt = new Date(Date.now() + backoffMinutes * 60 * 1000);
    notification.status = notification.attempts >= notification.maxAttempts ? 'failed' : 'pending';
    console.error(`[Email] Send failed (attempt ${notification.attempts}) for ${notification.recipientEmail}: ${err.message}`);
  }
  await notification.save();
  return notification;
}

// ---------- Templated helpers used by controllers ----------

function bookingConfirmationEmail(appt, doctorName, patientName) {
  return {
    subject: `Appointment Confirmed: ${appt.date} at ${appt.startTime}`,
    body: `<p>Hi,</p><p>Your appointment with Dr. ${doctorName} is confirmed for <b>${appt.date} at ${appt.startTime}</b>.</p><p>Patient: ${patientName}</p><p>You will receive a reminder before your visit.</p>`,
  };
}

function reminderEmail(appt, doctorName) {
  return {
    subject: `Reminder: Appointment tomorrow with Dr. ${doctorName}`,
    body: `<p>This is a reminder for your appointment with Dr. ${doctorName} on <b>${appt.date} at ${appt.startTime}</b>.</p>`,
  };
}

function cancellationEmail(appt, doctorName, reason) {
  return {
    subject: `Appointment Cancelled: ${appt.date} at ${appt.startTime}`,
    body: `<p>Your appointment with Dr. ${doctorName} on <b>${appt.date} at ${appt.startTime}</b> has been cancelled.</p><p>Reason: ${reason || 'Not specified'}</p><p>Please book a new slot at your convenience.</p>`,
  };
}

function leaveConflictEmail(appt, doctorName) {
  return {
    subject: `Your appointment on ${appt.date} needs to be rescheduled`,
    body: `<p>Dr. ${doctorName} is unavailable on <b>${appt.date}</b> due to leave. Your appointment at ${appt.startTime} has been cancelled.</p><p>We're sorry for the inconvenience — please rebook a new slot from the doctor's available times.</p>`,
  };
}

function medicationReminderEmail(medicationName, dosage, instructions) {
  return {
    subject: `Medication Reminder: ${medicationName}`,
    body: `<p>It's time to take <b>${medicationName}</b> (${dosage || ''}).</p><p>${instructions || ''}</p>`,
  };
}

module.exports = {
  queueNotification,
  attemptSend,
  bookingConfirmationEmail,
  reminderEmail,
  cancellationEmail,
  leaveConflictEmail,
  medicationReminderEmail,
};
