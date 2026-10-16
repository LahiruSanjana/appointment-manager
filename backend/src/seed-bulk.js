// Fictional demo data only. Usage: npm run seed:bulk [count]   (default 1000)
// Safe to re-run: it only replaces its own data (patients @bulk.example.test), not your other records.
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const Appointment = require('./models/Appointment');
const { makePatients, generate } = require('./bulkData');

const COUNT = Math.min(Number(process.argv[2]) || 1000, 5000);
const STAFF = [
  ['Admin User', 'admin@example.test', 'admin'], ['Dr. Silva', 'silva@example.test', 'doctor'],
  ['Dr. Perera', 'perera@example.test', 'doctor'], ['Dr. Jayasinghe', 'jayasinghe@example.test', 'doctor'],
  ['Dr. Wickrama', 'wickrama@example.test', 'doctor'], ['Dr. Nanayakkara', 'nanayakkara@example.test', 'doctor'],
  ['Test Patient A', 'patient@example.test', 'patient'],
];

(async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/appointments');
  const passwordHash = await bcrypt.hash('Password123!', 10);

  const old = await User.find({ email: /@bulk\.example\.test$/ }).select('_id');
  await Appointment.deleteMany({ patient: { $in: old.map((u) => u._id) } });
  await User.deleteMany({ _id: { $in: old.map((u) => u._id) } });

  const staff = [];
  for (const [name, email, role] of STAFF)
    staff.push(await User.findOneAndUpdate({ email }, { $setOnInsert: { name, email, role, passwordHash } }, { upsert: true, new: true }));
  const doctors = staff.filter((u) => u.role === 'doctor');

  const specs = makePatients(60);
  const patients = (await User.insertMany(specs.map((p) => ({ name: p.name, email: p.email, passwordHash, role: 'patient' }))))
    .map((u, i) => ({ ...specs[i], _id: u._id }));

  const docs = generate({ count: COUNT, doctorIds: doctors.map((d) => d._id), patients });
  for (let i = 0; i < docs.length; i += 500) await Appointment.insertMany(docs.slice(i, i + 500));

  const tally = docs.reduce((m, a) => ((m[a.status] = (m[a.status] || 0) + 1), m), {});
  console.log(`Created ${patients.length} patients and ${docs.length} appointments`, tally);
  console.log('Logins (password Password123!): admin@, silva@, patient@example.test, patient001@bulk.example.test');
  await mongoose.disconnect();
})();
