const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const DoctorProfile = require('../models/DoctorProfile');
const Appointment = require('../models/Appointment');
const emailService = require('../services/emailService');
const calendarService = require('../services/calendarService');

// @route POST /api/admin/doctors
// Creates a User (role=doctor) + DoctorProfile in one step
const createDoctor = asyncHandler(async (req, res) => {
  const { name, email, password, phone, specialisation, qualifications, slotDurationMinutes, workingHours, consultationFee } = req.body;

  if (!name || !email || !password || !specialisation) {
    res.status(400);
    throw new Error('name, email, password, and specialisation are required');
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    res.status(409);
    throw new Error('An account with this email already exists');
  }

  const user = await User.create({ name, email, password, phone, role: 'doctor' });
  const profile = await DoctorProfile.create({
    user: user._id,
    specialisation,
    qualifications,
    slotDurationMinutes: slotDurationMinutes || 30,
    workingHours: workingHours || [],
    consultationFee: consultationFee || 0,
  });
  user.doctorProfile = profile._id;
  await user.save();

  res.status(201).json({ success: true, doctor: user.toSafeObject(), profile });
});

// @route GET /api/admin/doctors
const listDoctors = asyncHandler(async (req, res) => {
  const profiles = await DoctorProfile.find().populate('user', 'name email phone isActive');
  res.json({ success: true, doctors: profiles });
});

// @route PUT /api/admin/doctors/:profileId
const updateDoctor = asyncHandler(async (req, res) => {
  const { specialisation, qualifications, slotDurationMinutes, workingHours, consultationFee, isActive } = req.body;
  const profile = await DoctorProfile.findById(req.params.profileId);
  if (!profile) {
    res.status(404);
    throw new Error('Doctor profile not found');
  }

  if (specialisation !== undefined) profile.specialisation = specialisation;
  if (qualifications !== undefined) profile.qualifications = qualifications;
  if (slotDurationMinutes !== undefined) profile.slotDurationMinutes = slotDurationMinutes;
  if (workingHours !== undefined) profile.workingHours = workingHours;
  if (consultationFee !== undefined) profile.consultationFee = consultationFee;
  if (isActive !== undefined) profile.isActive = isActive;

  await profile.save();
  res.json({ success: true, profile });
});

// @route POST /api/admin/doctors/:profileId/leave
// Marks a doctor on leave for a date. If bookings already exist for that
// date, they are cancelled and affected patients are notified by email
// (and their calendar event removed) — this is the "leave conflict" flow
// called out explicitly in the assignment.
const addLeaveDay = asyncHandler(async (req, res) => {
  const { date, reason } = req.body;
  if (!date) {
    res.status(400);
    throw new Error('date (YYYY-MM-DD) is required');
  }

  const profile = await DoctorProfile.findById(req.params.profileId).populate('user');
  if (!profile) {
    res.status(404);
    throw new Error('Doctor profile not found');
  }

  const alreadyOnLeave = profile.leaveDays.some((l) => l.date === date);
  if (!alreadyOnLeave) {
    profile.leaveDays.push({ date, reason });
    await profile.save();
  }

  // Find and cancel all existing bookings for this doctor on this date
  const affectedAppointments = await Appointment.find({
    doctor: profile.user._id,
    date,
    status: 'booked',
  }).populate('patient');

  const notifiedPatients = [];
  for (const appt of affectedAppointments) {
    appt.status = 'cancelled_by_leave';
    appt.cancellationReason = `Doctor on leave: ${reason || 'unspecified'}`;
    await appt.save();

    // Remove calendar events for both sides (best-effort, never blocks)
    await calendarService.deleteEvent({ userId: appt.patient._id, eventId: appt.calendarEvents?.patientEventId });
    await calendarService.deleteEvent({ userId: profile.user._id, eventId: appt.calendarEvents?.doctorEventId });

    const { subject, body } = emailService.leaveConflictEmail(appt, profile.user.name);
    await emailService.queueNotification({
      type: 'leave_conflict',
      recipientUser: appt.patient._id,
      recipientEmail: appt.patient.email,
      subject,
      body,
      relatedAppointment: appt._id,
    });
    notifiedPatients.push(appt.patient.email);
  }

  res.json({
    success: true,
    message: `Leave day added. ${affectedAppointments.length} affected appointment(s) cancelled and patients notified.`,
    notifiedPatients,
  });
});

// @route DELETE /api/admin/doctors/:profileId/leave/:date
const removeLeaveDay = asyncHandler(async (req, res) => {
  const profile = await DoctorProfile.findById(req.params.profileId);
  if (!profile) {
    res.status(404);
    throw new Error('Doctor profile not found');
  }
  profile.leaveDays = profile.leaveDays.filter((l) => l.date !== req.params.date);
  await profile.save();
  res.json({ success: true, profile });
});

// @route PATCH /api/admin/doctors/:profileId/deactivate
const setDoctorActive = asyncHandler(async (req, res) => {
  const { isActive } = req.body;
  const profile = await DoctorProfile.findById(req.params.profileId);
  if (!profile) {
    res.status(404);
    throw new Error('Doctor profile not found');
  }
  profile.isActive = isActive;
  await profile.save();
  await User.findByIdAndUpdate(profile.user, { isActive });
  res.json({ success: true, profile });
});

module.exports = { createDoctor, listDoctors, updateDoctor, addLeaveDay, removeLeaveDay, setDoctorActive };
