const asyncHandler = require('express-async-handler');
const DoctorProfile = require('../models/DoctorProfile');
const { getAvailableSlots } = require('../utils/generateSlots');

// @route GET /api/doctors?specialisation=Cardiology
const searchDoctors = asyncHandler(async (req, res) => {
  const { specialisation } = req.query;
  const filter = { isActive: true };
  if (specialisation) {
    filter.specialisation = { $regex: specialisation, $options: 'i' };
  }
  const doctors = await DoctorProfile.find(filter).populate('user', 'name email phone');
  res.json({ success: true, doctors });
});

// @route GET /api/doctors/:profileId
const getDoctor = asyncHandler(async (req, res) => {
  const doctor = await DoctorProfile.findById(req.params.profileId).populate('user', 'name email phone');
  if (!doctor) {
    res.status(404);
    throw new Error('Doctor not found');
  }
  res.json({ success: true, doctor });
});

// @route GET /api/doctors/:profileId/availability?date=YYYY-MM-DD
const getAvailability = asyncHandler(async (req, res) => {
  const { date } = req.query;
  if (!date) {
    res.status(400);
    throw new Error('date query parameter (YYYY-MM-DD) is required');
  }
  const doctor = await DoctorProfile.findById(req.params.profileId);
  if (!doctor) {
    res.status(404);
    throw new Error('Doctor not found');
  }
  const slots = await getAvailableSlots(doctor, doctor.user, date);
  res.json({ success: true, date, slots });
});

module.exports = { searchDoctors, getDoctor, getAvailability };
