require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const connectDB = require('./src/config/db');
const { errorHandler, notFound } = require('./src/middleware/errorHandler');

const authRoutes = require('./src/routes/authRoutes');
const doctorRoutes = require('./src/routes/doctorRoutes');
const appointmentRoutes = require('./src/routes/appointmentRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const calendarRoutes = require('./src/routes/calendarRoutes');

const { startMedicationReminderJob } = require('./src/jobs/medicationReminderJob');
const { startEmailRetryJob } = require('./src/jobs/emailRetryJob');

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL || '*', credentials: true }));
app.use(express.json({ limit: '1mb' }));

// Basic rate limiting on auth routes to slow down credential stuffing
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50 });
app.use('/api/auth', authLimiter);

app.get('/api/health', (req, res) => res.json({ success: true, status: 'ok', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/calendar', calendarRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

(async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`[Server] Listening on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
    startMedicationReminderJob();
    startEmailRetryJob();
  });
})();

module.exports = app;
