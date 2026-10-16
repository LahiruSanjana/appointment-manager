// Fictional demo data only.
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const Appointment = require('./models/Appointment');

(async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/appointments');
  await Promise.all([User.deleteMany({}), Appointment.deleteMany({})]);
  const passwordHash = await bcrypt.hash('Password123!', 10);
  const [admin, silva, perera, patient] = await User.create([
    { name: 'Admin User', email: 'admin@example.test', passwordHash, role: 'admin' },
    { name: 'Dr. Silva', email: 'silva@example.test', passwordHash, role: 'doctor' },
    { name: 'Dr. Perera', email: 'perera@example.test', passwordHash, role: 'doctor' },
    { name: 'Test Patient A', email: 'patient@example.test', passwordHash, role: 'patient' },
  ]);
  const at = (days, h) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(h, 0, 0, 0); return d; };
  await Appointment.create([
    { patient: patient._id, patientName: patient.name, doctor: silva._id, dateTime: at(2, 10), type: 'Checkup',
      intake: { symptoms: 'Mild headache for 3 days, trouble sleeping', medications: 'Metformin 500mg, Ibuprofen as needed', allergies: 'Penicillin' } },
    { patient: patient._id, patientName: patient.name, doctor: perera._id, dateTime: at(5, 14), type: 'Follow-up' },
    { patient: patient._id, patientName: patient.name, doctor: perera._id, dateTime: at(-20, 9), type: 'Consultation', status: 'Completed',
      notes: 'Fictional: blood sugar review', intake: { medications: 'Metformin 500mg, Ibuprofen as needed' } },
    { patientName: 'Test Patient B', doctor: silva._id, dateTime: at(3, 11), type: 'Consultation' },
    { patientName: 'Test Patient C', doctor: perera._id, dateTime: at(-3, 9), type: 'Vaccination', status: 'Completed' },
  ]);
  console.log('Seeded. Logins (password Password123!): admin@, silva@, perera@, patient@example.test', admin.email);
  await mongoose.disconnect();
})();
