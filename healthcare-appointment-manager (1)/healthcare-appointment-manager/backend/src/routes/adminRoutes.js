const express = require('express');
const router = express.Router();
const {
  createDoctor,
  listDoctors,
  updateDoctor,
  addLeaveDay,
  removeLeaveDay,
  setDoctorActive,
} = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect, authorize('admin'));

router.post('/doctors', createDoctor);
router.get('/doctors', listDoctors);
router.put('/doctors/:profileId', updateDoctor);
router.post('/doctors/:profileId/leave', addLeaveDay);
router.delete('/doctors/:profileId/leave/:date', removeLeaveDay);
router.patch('/doctors/:profileId/deactivate', setDoctorActive);

module.exports = router;
