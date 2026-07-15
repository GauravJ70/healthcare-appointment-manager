const express = require('express');
const router = express.Router();
const { searchDoctors, getDoctor, getAvailability } = require('../controllers/doctorController');
const { protect } = require('../middleware/auth');

router.get('/', protect, searchDoctors);
router.get('/:profileId', protect, getDoctor);
router.get('/:profileId/availability', protect, getAvailability);

module.exports = router;
