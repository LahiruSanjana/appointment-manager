const router = require('express').Router();
const { z } = require('zod');
const User = require('../models/User');
const Appointment = require('../models/Appointment');
const { auth, requireRole } = require('../middleware/auth');
const { TYPES } = require('../constants');
const { callAI, validateAI, prepSchema, parseSchema } = require('../services/ai');

router.use(auth);

// "Book a checkup with Dr. Silva next Tuesday 3pm" -> form pre-fill. Nothing is saved here.
router.post('/parse-booking', async (req, res, next) => {
  try {
    const { text } = z.object({ text: z.string().trim().min(3).max(300) }).parse(req.body);
    const doctors = await User.find({ role: 'doctor' }).select('name');
    const raw = await callAI('/parse-booking', { text, doctors: doctors.map((d) => d.name), types: TYPES });
    const out = validateAI(parseSchema, raw);
    const doctor = doctors.find((d) => d.name === out.doctor_name);
    const missing = [...out.missing];
    let dateTime = out.date_time;
    if (dateTime && dateTime.getTime() <= Date.now()) {
      dateTime = null;
      if (!missing.includes('a future date and time')) missing.push('a future date and time');
    }
    res.json({ doctor: doctor ? doctor._id : null, doctorName: doctor ? doctor.name : null, type: out.type, dateTime, missing });
  } catch (e) { next(e); }
});

const splitList = (s) => String(s || '').split(/[\n,;]+/).map((x) => x.trim().slice(0, 100)).filter(Boolean);

router.post('/patient-prep', requireRole('patient'), async (req, res, next) => {
  try {
    const { appointmentId } = z.object({ appointmentId: z.string().regex(/^[a-f\d]{24}$/i).optional() }).parse(req.body || {});
    const mine = { patient: req.user.id };
    const history = await Appointment.find({ ...mine, status: 'Completed' }).sort({ dateTime: -1 }).limit(5);
    const withMeds = await Appointment.find(mine).select('intake.medications');
    const medications = [...new Set(withMeds.flatMap((a) => splitList(a.intake && a.intake.medications)))].slice(0, 30);

    let upcoming = null;
    if (appointmentId) {
      const a = await Appointment.findOne({ _id: appointmentId, ...mine }).populate('doctor', 'name');
      if (!a) return res.status(404).json({ error: 'Appointment not found' });
      upcoming = { doctor: a.doctor ? a.doctor.name : '', type: a.type, date_time: a.dateTime.toISOString(), symptoms: (a.intake && a.intake.symptoms) || '' };
    }
    if (!history.length && !medications.length && !(upcoming && upcoming.symptoms))
      return res.status(400).json({ error: 'Add medications or symptoms to an appointment first, then try again' });

    // Data minimisation: dates, types, notes and medications only. No name, email or ids.
    const raw = await callAI('/patient-prep', {
      upcoming,
      history: history.map((h) => ({ date: h.dateTime.toISOString().slice(0, 10), type: h.type, status: h.status, notes: (h.notes || '').slice(0, 500) })),
      medications,
    });
    res.json(validateAI(prepSchema, raw));
  } catch (e) { next(e); }
});

module.exports = router;
