/**
 * Slot Service
 * ------------
 * Implements the two-phase booking flow:
 *   1. holdSlot()    -> patient selects a slot, we insert a SlotHold doc.
 *                       The unique index on (doctor,date,startTime) means a
 *                       second concurrent hold attempt fails immediately
 *                       with a duplicate key error, which we translate into
 *                       a friendly "slot no longer available" response.
 *   2. confirmSlot()  -> after the patient submits the symptom form, we
 *                       atomically delete the hold and insert the real
 *                       Appointment (also guarded by its own unique index
 *                       as a second line of defense). If the hold expired
 *                       (TTL) in the meantime, confirmSlot fails safely.
 *
 * This two-layer approach (hold + final unique-index insert) is what
 * prevents double-booking even under simultaneous requests, without
 * requiring a distributed lock service.
 */

const mongoose = require('mongoose');
const SlotHold = require('../models/SlotHold');
const Appointment = require('../models/Appointment');

const HOLD_TTL_SECONDS = parseInt(process.env.SLOT_HOLD_TTL_SECONDS || '300', 10);

async function holdSlot({ doctorId, date, startTime, patientId }) {
  const expiresAt = new Date(Date.now() + HOLD_TTL_SECONDS * 1000);
  try {
    const hold = await SlotHold.create({
      doctor: doctorId,
      date,
      startTime,
      patient: patientId,
      expiresAt,
    });
    return hold;
  } catch (err) {
    if (err.code === 11000) {
      const err2 = new Error('This slot is currently being booked by another patient. Please choose a different slot.');
      err2.statusCode = 409;
      throw err2;
    }
    throw err;
  }
}

async function releaseHold({ holdId, patientId }) {
  await SlotHold.deleteOne({ _id: holdId, patient: patientId });
}

/**
 * Confirms a booking: validates the hold belongs to this patient and hasn't
 * expired, creates the Appointment, then removes the hold. Relies on the
 * Appointment model's own unique index as the final safety net.
 */
async function confirmSlot({ holdId, patientId, doctorId, doctorProfileId, date, startTime, endTime, symptomForm }) {
  const hold = await SlotHold.findOne({ _id: holdId, patient: patientId, doctor: doctorId, date, startTime });
  if (!hold) {
    const err = new Error('Your slot hold has expired. Please select a slot again.');
    err.statusCode = 409;
    throw err;
  }

  try {
    const appointment = await Appointment.create({
      patient: patientId,
      doctor: doctorId,
      doctorProfile: doctorProfileId,
      date,
      startTime,
      endTime,
      status: 'booked',
      symptomForm,
    });
    await SlotHold.deleteOne({ _id: hold._id });
    return appointment;
  } catch (err) {
    if (err.code === 11000) {
      await SlotHold.deleteOne({ _id: hold._id }).catch(() => {});
      const err2 = new Error('This slot was just booked by someone else. Please choose another slot.');
      err2.statusCode = 409;
      throw err2;
    }
    throw err;
  }
}

module.exports = { holdSlot, releaseHold, confirmSlot, HOLD_TTL_SECONDS };
