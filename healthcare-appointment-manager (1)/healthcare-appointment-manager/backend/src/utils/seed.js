require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const DoctorProfile = require('../models/DoctorProfile');

async function seed() {
  await connectDB();

  await User.deleteMany({});
  await DoctorProfile.deleteMany({});

  const admin = await User.create({
    name: 'Clinic Admin',
    email: 'admin@clinic.test',
    password: 'admin123',
    role: 'admin',
  });

  const doctorUser = await User.create({
    name: 'Dr. Asha Mehta',
    email: 'asha.mehta@clinic.test',
    password: 'doctor123',
    role: 'doctor',
  });
  const doctorProfile = await DoctorProfile.create({
    user: doctorUser._id,
    specialisation: 'Cardiology',
    qualifications: 'MBBS, MD (Cardiology)',
    slotDurationMinutes: 30,
    workingHours: [
      { day: 1, startTime: '09:00', endTime: '13:00' }, // Monday
      { day: 3, startTime: '09:00', endTime: '13:00' }, // Wednesday
      { day: 5, startTime: '14:00', endTime: '17:00' }, // Friday
    ],
    consultationFee: 800,
  });
  doctorUser.doctorProfile = doctorProfile._id;
  await doctorUser.save();

  const doctorUser2 = await User.create({
    name: 'Dr. Rohan Iyer',
    email: 'rohan.iyer@clinic.test',
    password: 'doctor123',
    role: 'doctor',
  });
  const doctorProfile2 = await DoctorProfile.create({
    user: doctorUser2._id,
    specialisation: 'General Physician',
    qualifications: 'MBBS',
    slotDurationMinutes: 20,
    workingHours: [
      { day: 1, startTime: '10:00', endTime: '16:00' },
      { day: 2, startTime: '10:00', endTime: '16:00' },
      { day: 4, startTime: '10:00', endTime: '16:00' },
    ],
    consultationFee: 500,
  });
  doctorUser2.doctorProfile = doctorProfile2._id;
  await doctorUser2.save();

  const patient = await User.create({
    name: 'Priya Sharma',
    email: 'priya.sharma@example.test',
    password: 'patient123',
    role: 'patient',
    phone: '9876543210',
  });

  console.log('\nSeed complete. Demo accounts (all in .test domain, not real inboxes):');
  console.log('  Admin:    admin@clinic.test / admin123');
  console.log('  Doctor 1: asha.mehta@clinic.test / doctor123 (Cardiology)');
  console.log('  Doctor 2: rohan.iyer@clinic.test / doctor123 (General Physician)');
  console.log('  Patient:  priya.sharma@example.test / patient123');

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
