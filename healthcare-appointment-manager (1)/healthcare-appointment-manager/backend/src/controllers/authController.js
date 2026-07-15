const asyncHandler = require('express-async-handler');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const DoctorProfile = require('../models/DoctorProfile');

function signToken(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

// @route POST /api/auth/register  (patients self-register; doctors/admins are created by admin)
const registerPatient = asyncHandler(async (req, res) => {
  const { name, email, password, phone, dateOfBirth } = req.body;

  if (!name || !email || !password) {
    res.status(400);
    throw new Error('Name, email, and password are required');
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    res.status(409);
    throw new Error('An account with this email already exists');
  }

  const user = await User.create({ name, email, password, phone, dateOfBirth, role: 'patient' });
  res.status(201).json({ success: true, token: signToken(user), user: user.toSafeObject() });
});

// @route POST /api/auth/login
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400);
    throw new Error('Email and password are required');
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user || !(await user.comparePassword(password))) {
    res.status(401);
    throw new Error('Invalid email or password');
  }
  if (!user.isActive) {
    res.status(403);
    throw new Error('This account has been deactivated');
  }

  res.json({ success: true, token: signToken(user), user: user.toSafeObject() });
});

// @route GET /api/auth/me
const getMe = asyncHandler(async (req, res) => {
  let profile = null;
  if (req.user.role === 'doctor') {
    profile = await DoctorProfile.findOne({ user: req.user._id });
  }
  res.json({ success: true, user: req.user.toSafeObject ? req.user.toSafeObject() : req.user, doctorProfile: profile });
});

module.exports = { registerPatient, login, getMe };
