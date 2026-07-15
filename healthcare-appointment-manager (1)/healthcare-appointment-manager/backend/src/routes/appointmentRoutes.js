const express = require('express');
const router = express.Router();
const {
  holdSlot,
  releaseHold,
  confirmBooking,
  getMyAppointments,
  getAppointment,
  cancelAppointment,
  submitPostVisit,
} = require('../controllers/appointmentController');
const { protect, authorize } = require('../middleware/auth');

router.post('/hold', protect, authorize('patient'), holdSlot);
router.delete('/hold/:holdId', protect, authorize('patient'), releaseHold);
router.post('/confirm', protect, authorize('patient'), confirmBooking);

router.get('/mine', protect, getMyAppointments); // works for both patient (own bookings) and doctor (their schedule)

router.get('/:id', protect, getAppointment);
router.patch('/:id/cancel', protect, cancelAppointment);
router.post('/:id/post-visit', protect, authorize('doctor'), submitPostVisit);

module.exports = router;
