/**
 * Google Calendar Service
 * ------------------------
 * CALENDAR_PROVIDER=mock (default): no real Google calls, returns fake event
 * IDs so the rest of the flow (storing calendarEvents on the Appointment) is
 * exercised identically to production. Switch to CALENDAR_PROVIDER=google
 * and provide OAuth credentials to hit the real API.
 *
 * OAuth flow: each user (patient/doctor) authorizes once via
 * GET /api/calendar/google/auth-url -> redirect -> GET /api/calendar/google/callback
 * which stores { access_token, refresh_token, expiry_date } on their User doc.
 */

const { google } = require('googleapis');
const User = require('../models/User');

const PROVIDER = process.env.CALENDAR_PROVIDER || 'mock';

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

function getAuthUrl() {
  const oauth2Client = getOAuthClient();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar.events'],
  });
}

async function exchangeCodeForTokens(code) {
  const oauth2Client = getOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens; // { access_token, refresh_token, expiry_date, ... }
}

async function getCalendarClientForUser(userId) {
  const user = await User.findById(userId);
  if (!user?.googleTokens?.access_token) return null;

  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials(user.googleTokens);

  oauth2Client.on('tokens', async (tokens) => {
    // Persist refreshed access token
    user.googleTokens = { ...user.googleTokens.toObject?.() || user.googleTokens, ...tokens };
    await user.save();
  });

  return google.calendar({ version: 'v3', auth: oauth2Client });
}

function toISO(date, time) {
  // date: "YYYY-MM-DD", time: "HH:mm" -> ISO datetime string (local clinic time zone assumed)
  return `${date}T${time}:00`;
}

/**
 * Creates a calendar event for a given user. Returns eventId, or null if the
 * user hasn't connected Google Calendar, or if provider is 'mock'.
 * Never throws — calendar failures must not block appointment booking.
 */
async function createEvent({ userId, summary, description, date, startTime, endTime }) {
  try {
    if (PROVIDER === 'mock') {
      return `mock-event-${userId}-${date}-${startTime}`.replace(/[^a-zA-Z0-9-]/g, '');
    }

    const calendar = await getCalendarClientForUser(userId);
    if (!calendar) return null; // user hasn't linked Google Calendar; skip silently

    const event = {
      summary,
      description,
      start: { dateTime: toISO(date, startTime) },
      end: { dateTime: toISO(date, endTime) },
    };
    const res = await calendar.events.insert({ calendarId: 'primary', requestBody: event });
    return res.data.id;
  } catch (err) {
    console.error('[Calendar] createEvent failed:', err.message);
    return null;
  }
}

async function updateEvent({ userId, eventId, date, startTime, endTime, summary, description }) {
  try {
    if (!eventId) return null;
    if (PROVIDER === 'mock') return eventId;

    const calendar = await getCalendarClientForUser(userId);
    if (!calendar) return null;

    const res = await calendar.events.patch({
      calendarId: 'primary',
      eventId,
      requestBody: {
        summary,
        description,
        start: { dateTime: toISO(date, startTime) },
        end: { dateTime: toISO(date, endTime) },
      },
    });
    return res.data.id;
  } catch (err) {
    console.error('[Calendar] updateEvent failed:', err.message);
    return null;
  }
}

async function deleteEvent({ userId, eventId }) {
  try {
    if (!eventId) return;
    if (PROVIDER === 'mock') return;

    const calendar = await getCalendarClientForUser(userId);
    if (!calendar) return;

    await calendar.events.delete({ calendarId: 'primary', eventId });
  } catch (err) {
    console.error('[Calendar] deleteEvent failed:', err.message);
  }
}

module.exports = { getAuthUrl, exchangeCodeForTokens, createEvent, updateEvent, deleteEvent };
