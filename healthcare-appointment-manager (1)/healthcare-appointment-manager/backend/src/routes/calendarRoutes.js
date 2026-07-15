const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const { protect } = require('../middleware/auth');
const calendarService = require('../services/calendarService');
const User = require('../models/User');

// @route GET /api/calendar/google/auth-url
// Frontend redirects the logged-in user's browser to this URL to start OAuth consent.
router.get(
  '/google/auth-url',
  protect,
  asyncHandler(async (req, res) => {
    const url = calendarService.getAuthUrl();
    // state carries the userId through the OAuth redirect so callback knows who to attach tokens to
    res.json({ success: true, url: `${url}&state=${req.user._id}` });
  })
);

// @route GET /api/calendar/google/callback?code=...&state=<userId>
router.get(
  '/google/callback',
  asyncHandler(async (req, res) => {
    const { code, state } = req.query;
    if (!code || !state) {
      return res.status(400).send('Missing code or state');
    }
    const tokens = await calendarService.exchangeCodeForTokens(code);
    await User.findByIdAndUpdate(state, { googleTokens: tokens });
    res.redirect(`${process.env.CLIENT_URL}/calendar-connected`);
  })
);

module.exports = router;
