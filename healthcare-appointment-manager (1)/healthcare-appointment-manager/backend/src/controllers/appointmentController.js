const asyncHandler = require('express-async-handler');
const Appointment = require('../models/Appointment');
const DoctorProfile = require('../models/DoctorProfile');
const User = require('../models/User');
const slotService = require('../services/slotService');
const llmService = require('../services/llmService');
const emailService = require('../services/emailService');
const calendarService = require('../services/calendarService');
const { minutesToTime, timeToMinutes } = require('../utils/generateSlots');

// @route POST /api/appointments/hold
// Step 1 of booking: patient picks a slot before filling the symptom form.
const holdSlot = asyncHandler(async (req, res) => {
  const { doctorProfileId, date, startTime } = req.body;
  if (!doctorProfileId || !date || !startTime) {
    res.status(400);
    throw new Error('doctorProfileId, date, and startTime are required');
  }

  const doctorProfile = await DoctorProfile.findById(doctorProfileId);
  if (!doctorProfile || !doctorProfile.isActive) {
    res.status(404);
    throw new Error('Doctor not found or inactive');
  }
  const onLeave = doctorProfile.leaveDays.some((l) => l.date === date);
  if (onLeave) {
    res.status(409);
    throw new Error('Doctor is on leave on this date');
  }

  const hold = await slotService.holdSlot({
    doctorId: doctorProfile.user,
    date,
    startTime,
    patientId: req.user._id,
  });

  res.status(201).json({
    success: true,
    holdId: hold._id,
    expiresAt: hold.expiresAt,
    holdTtlSeconds: slotService.HOLD_TTL_SECONDS,
  });
});

// @route DELETE /api/appointments/hold/:holdId
const releaseHold = asyncHandler(async (req, res) => {
  await slotService.releaseHold({ holdId: req.params.holdId, patientId: req.user._id });
  res.json({ success: true });
});

// @route POST /api/appointments/confirm
// Step 2 of booking: patient submits symptom form, we generate the LLM
// pre-visit summary, create the appointment, send confirmations, and
// create calendar events for both patient and doctor.
const confirmBooking = asyncHandler(async (req, res) => {
  const { holdId, doctorProfileId, date, startTime, symptoms } = req.body;
  if (!holdId || !doctorProfileId || !date || !startTime || !symptoms) {
    res.status(400);
    throw new Error('holdId, doctorProfileId, date, startTime, and symptoms are required');
  }

  const doctorProfile = await DoctorProfile.findById(doctorProfileId).populate('user');
  if (!doctorProfile) {
    res.status(404);
    throw new Error('Doctor not found');
  }

  const endTime = minutesToTime(timeToMinutes(startTime) + doctorProfile.slotDurationMinutes);

  // LLM call happens before DB write, but its failure never blocks booking
  // (llmService.generatePreVisitSummary always resolves, never rejects).
  const llmSummary = await llmService.generatePreVisitSummary(symptoms);

  const appointment = await slotService.confirmSlot({
    holdId,
    patientId: req.user._id,
    doctorId: doctorProfile.user._id,
    doctorProfileId: doctorProfile._id,
    date,
    startTime,
    endTime,
    symptomForm: {
      rawSymptoms: symptoms,
      submittedAt: new Date(),
      llmSummary,
    },
  });

  // Calendar events (best-effort, never blocks the response)
  const patientEventId = await calendarService.createEvent({
    userId: req.user._id,
    summary: `Appointment with Dr. ${doctorProfile.user.name}`,
    description: `Specialisation: ${doctorProfile.specialisation}`,
    date,
    startTime,
    endTime,
  });
  const doctorEventId = await calendarService.createEvent({
    userId: doctorProfile.user._id,
    summary: `Appointment with ${req.user.name}`,
    description: `Chief complaint: ${llmSummary.chiefComplaint || 'See symptom form'}`,
    date,
    startTime,
    endTime,
  });
  appointment.calendarEvents = { patientEventId, doctorEventId };
  await appointment.save();

  // Email confirmations to both sides
  const patientMail = emailService.bookingConfirmationEmail(appointment, doctorProfile.user.name, req.user.name);
  await emailService.queueNotification({
    type: 'booking_confirmation',
    recipientUser: req.user._id,
    recipientEmail: req.user.email,
    subject: patientMail.subject,
    body: patientMail.body,
    relatedAppointment: appointment._id,
  });
  const doctorMail = emailService.bookingConfirmationEmail(appointment, doctorProfile.user.name, req.user.name);
  await emailService.queueNotification({
    type: 'booking_confirmation',
    recipientUser: doctorProfile.user._id,
    recipientEmail: doctorProfile.user.email,
    subject: `New booking: ${req.user.name} on ${date} at ${startTime}`,
    body: doctorMail.body,
    relatedAppointment: appointment._id,
  });

  appointment.notifications.bookingConfirmationSent = true;
  await appointment.save();

  res.status(201).json({ success: true, appointment });
});

// @route GET /api/appointments/mine  (patient) or /api/appointments/schedule (doctor)
const getMyAppointments = asyncHandler(async (req, res) => {
  const filter = req.user.role === 'doctor' ? { doctor: req.user._id } : { patient: req.user._id };
  if (req.query.date) filter.date = req.query.date;
  if (req.query.status) filter.status = req.query.status;

  const appointments = await Appointment.find(filter)
    .populate('patient', 'name email phone')
    .populate('doctor', 'name email')
    .populate('doctorProfile', 'specialisation')
    .sort({ date: 1, startTime: 1 });

  res.json({ success: true, appointments });
});

// @route GET /api/appointments/:id
const getAppointment = asyncHandler(async (req, res) => {
  const appointment = await Appointment.findById(req.params.id)
    .populate('patient', 'name email phone')
    .populate('doctor', 'name email')
    .populate('doctorProfile', 'specialisation');
  if (!appointment) {
    res.status(404);
    throw new Error('Appointment not found');
  }
  const isOwner =
    appointment.patient._id.equals(req.user._id) || appointment.doctor._id.equals(req.user._id) || req.user.role === 'admin';
  if (!isOwner) {
    res.status(403);
    throw new Error('Not authorized to view this appointment');
  }
  res.json({ success: true, appointment });
});

// @route PATCH /api/appointments/:id/cancel
const cancelAppointment = asyncHandler(async (req, res) => {
  const appointment = await Appointment.findById(req.params.id).populate('patient').populate('doctor');
  if (!appointment) {
    res.status(404);
    throw new Error('Appointment not found');
  }
  const isOwner = appointment.patient._id.equals(req.user._id) || appointment.doctor._id.equals(req.user._id) || req.user.role === 'admin';
  if (!isOwner) {
    res.status(403);
    throw new Error('Not authorized to cancel this appointment');
  }
  if (appointment.status !== 'booked') {
    res.status(400);
    throw new Error(`Cannot cancel an appointment with status '${appointment.status}'`);
  }

  appointment.status = 'cancelled';
  appointment.cancellationReason = req.body.reason || 'Cancelled by user';
  await appointment.save();

  await calendarService.deleteEvent({ userId: appointment.patient._id, eventId: appointment.calendarEvents?.patientEventId });
  await calendarService.deleteEvent({ userId: appointment.doctor._id, eventId: appointment.calendarEvents?.doctorEventId });

  const { subject, body } = emailService.cancellationEmail(appointment, appointment.doctor.name, appointment.cancellationReason);
  await emailService.queueNotification({
    type: 'cancellation',
    recipientUser: appointment.patient._id,
    recipientEmail: appointment.patient.email,
    subject,
    body,
    relatedAppointment: appointment._id,
  });
  await emailService.queueNotification({
    type: 'cancellation',
    recipientUser: appointment.doctor._id,
    recipientEmail: appointment.doctor.email,
    subject: `Appointment cancelled: ${appointment.date} at ${appointment.startTime}`,
    body,
    relatedAppointment: appointment._id,
  });

  appointment.notifications.cancellationSent = true;
  await appointment.save();

  res.json({ success: true, appointment });
});

// @route POST /api/appointments/:id/post-visit  (doctor only)
const submitPostVisit = asyncHandler(async (req, res) => {
  const { clinicalNotes, prescription, followUp } = req.body;
  if (!clinicalNotes) {
    res.status(400);
    throw new Error('clinicalNotes is required');
  }

  const appointment = await Appointment.findById(req.params.id).populate('patient').populate('doctor');
  if (!appointment) {
    res.status(404);
    throw new Error('Appointment not found');
  }
  if (!appointment.doctor._id.equals(req.user._id)) {
    res.status(403);
    throw new Error('Only the treating doctor can submit post-visit notes');
  }

  const llmPatientSummary = await llmService.generatePostVisitSummary(clinicalNotes);

  appointment.postVisit = {
    clinicalNotes,
    prescription: prescription || [],
    followUp,
    submittedAt: new Date(),
    llmPatientSummary,
  };
  appointment.status = 'completed';
  await appointment.save();

  res.json({ success: true, appointment });
});

module.exports = {
  holdSlot,
  releaseHold,
  confirmBooking,
  getMyAppointments,
  getAppointment,
  cancelAppointment,
  submitPostVisit,
};
