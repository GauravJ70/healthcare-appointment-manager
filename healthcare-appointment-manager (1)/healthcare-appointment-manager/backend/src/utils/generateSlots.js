const Appointment = require('../models/Appointment');
const SlotHold = require('../models/SlotHold');

function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function minutesToTime(mins) {
  const h = Math.floor(mins / 60)
    .toString()
    .padStart(2, '0');
  const m = (mins % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

function getWeekday(dateStr) {
  // dateStr "YYYY-MM-DD" -> 0=Sunday..6=Saturday, computed in UTC to stay deterministic
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

/**
 * Generate all candidate slots for a doctor on a given date from their
 * working hours + slot duration, then subtract slots that are already
 * booked, on hold, or that fall on a leave day.
 */
async function getAvailableSlots(doctorProfile, doctorUserId, dateStr) {
  // 1. Leave day check
  const onLeave = doctorProfile.leaveDays.some((l) => l.date === dateStr);
  if (onLeave) return [];

  // 2. Working hours for this weekday
  const weekday = getWeekday(dateStr);
  const hoursForDay = doctorProfile.workingHours.filter((wh) => wh.day === weekday);
  if (hoursForDay.length === 0) return [];

  const duration = doctorProfile.slotDurationMinutes;
  const candidateSlots = [];
  for (const wh of hoursForDay) {
    let start = timeToMinutes(wh.startTime);
    const end = timeToMinutes(wh.endTime);
    while (start + duration <= end) {
      candidateSlots.push(minutesToTime(start));
      start += duration;
    }
  }

  // 3. Remove slots that are already booked
  const booked = await Appointment.find({
    doctor: doctorUserId,
    date: dateStr,
    status: { $in: ['booked', 'completed'] },
  }).select('startTime');
  const bookedSet = new Set(booked.map((b) => b.startTime));

  // 4. Remove slots currently on hold by another booking-in-progress (TTL-bound)
  const held = await SlotHold.find({ doctor: doctorUserId, date: dateStr }).select('startTime');
  const heldSet = new Set(held.map((h) => h.startTime));

  return candidateSlots.filter((s) => !bookedSet.has(s) && !heldSet.has(s));
}

module.exports = { getAvailableSlots, timeToMinutes, minutesToTime, getWeekday };
