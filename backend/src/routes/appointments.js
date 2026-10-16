const router = require('express').Router();
const { z } = require('zod');
const Appointment = require('../models/Appointment');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const { TYPES, STATUSES } = require('../constants');
const { callAI, validateAI, summarySchema } = require('../services/ai');

router.use(auth);

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const intakeSchema = z.object({ symptoms: z.string().max(1000), medications: z.string().max(1000), allergies: z.string().max(1000) }).partial();
const base = z.object({
  patientName: z.string().trim().min(1, 'Patient name is required').max(100),
  doctor: objectId,
  dateTime: z.coerce.date({ invalid_type_error: 'Invalid date and time' }),
  type: z.enum(TYPES),
  status: z.enum(STATUSES),
  notes: z.string().max(500),
  intake: intakeSchema,
});
const createSchema = base.partial({ patientName: true, status: true, notes: true, intake: true }).strict();
const staffUpdate = base.partial().strict();
const patientUpdate = base
  .pick({ doctor: true, dateTime: true, type: true, notes: true, intake: true })
  .extend({ status: z.literal('Cancelled') })
  .partial()
  .strict();

// What each role is allowed to see.
const scope = (u) => (u.role === 'admin' ? {} : u.role === 'doctor' ? { doctor: u.id } : { patient: u.id });
const populate = (q) => q.populate('doctor', 'name');
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function assertDoctor(id) {
  if (!(await User.exists({ _id: id, role: 'doctor' }))) {
    const err = new Error('Selected doctor does not exist');
    err.status = 400;
    throw err;
  }
}
async function assertNoConflict(doctor, dateTime, excludeId) {
  const clash = await Appointment.exists({
    doctor, dateTime, status: 'Scheduled', ...(excludeId && { _id: { $ne: excludeId } }),
  });
  if (clash) {
    const err = new Error('This doctor already has an appointment at that time');
    err.status = 409;
    throw err;
  }
}
function assertFuture(d) {
  if (d.getTime() <= Date.now()) {
    const err = new Error('Appointment must be in the future');
    err.status = 400;
    throw err;
  }
}

router.post('/', async (req, res, next) => {
  try {
    const data = createSchema.parse(req.body);
    const isPatient = req.user.role === 'patient';
    if (!isPatient && !data.patientName) return res.status(400).json({ error: 'patientName: Patient name is required' });
    await assertDoctor(data.doctor);
    assertFuture(data.dateTime);
    await assertNoConflict(data.doctor, data.dateTime);
    const appt = await Appointment.create({
      ...data,
      status: isPatient ? 'Scheduled' : data.status || 'Scheduled',
      patientName: isPatient ? req.user.name : data.patientName,
      patient: isPatient ? req.user.id : null,
    });
    res.status(201).json(await populate(Appointment.findById(appt._id)));
  } catch (e) { next(e); }
});

router.get('/', async (req, res, next) => {
  try {
    const { q, status, doctor, type, from, to } = req.query;
    const filter = scope(req.user);
    if (q) filter.patientName = { $regex: escapeRegex(String(q).trim()), $options: 'i' };
    if (status && STATUSES.includes(status)) filter.status = status;
    if (type && TYPES.includes(type)) filter.type = type;
    if (doctor && objectId.safeParse(doctor).success && req.user.role !== 'doctor') filter.doctor = doctor;
    if (from || to) {
      filter.dateTime = {};
      if (from && !isNaN(new Date(from))) filter.dateTime.$gte = new Date(from);
      if (to && !isNaN(new Date(to))) filter.dateTime.$lte = new Date(to);
    }
    res.json(await populate(Appointment.find(filter).sort({ dateTime: 1 })));
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const appt = await populate(Appointment.findOne({ _id: req.params.id, ...scope(req.user) }));
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });
    res.json(appt);
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const appt = await Appointment.findOne({ _id: req.params.id, ...scope(req.user) });
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });

    const isPatient = req.user.role === 'patient';
    if (isPatient && appt.status !== 'Scheduled')
      return res.status(403).json({ error: 'Only scheduled appointments can be changed' });
    const data = (isPatient ? patientUpdate : staffUpdate).parse(req.body);

    if (data.doctor && String(data.doctor) !== String(appt.doctor)) await assertDoctor(data.doctor);
    if (data.dateTime && data.dateTime.getTime() !== appt.dateTime.getTime()) assertFuture(data.dateTime);
    if (data.intake) {
      // Changed intake makes the old AI summary stale.
      const cur = appt.intake || {};
      const changed = ['symptoms', 'medications', 'allergies'].some((k) => (data.intake[k] ?? '') !== (cur[k] ?? ''));
      if (changed) appt.aiSummary = undefined;
    }
    Object.assign(appt, data);
    if (appt.status === 'Scheduled') await assertNoConflict(appt.doctor, appt.dateTime, appt._id);
    await appt.save();
    res.json(await populate(Appointment.findById(appt._id)));
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const appt = await Appointment.findOneAndDelete({ _id: req.params.id, ...scope(req.user) });
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });
    res.status(204).end();
  } catch (e) { next(e); }
});

// Generate (or regenerate) the pre-visit summary. The appointment itself never depends on AI.
router.post('/:id/intake-summary', async (req, res, next) => {
  try {
    const appt = await Appointment.findOne({ _id: req.params.id, ...scope(req.user) });
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });
    const i = appt.intake || {};
    if (!i.symptoms && !i.medications && !i.allergies)
      return res.status(400).json({ error: 'Add symptoms, medications or allergies first' });
    // Data minimisation: no patient name, email or ids leave this server.
    const raw = await callAI('/intake-summary', {
      symptoms: i.symptoms || '', medications: i.medications || '', allergies: i.allergies || '', appointment_type: appt.type,
    });
    appt.aiSummary = { data: validateAI(summarySchema, raw), generatedAt: new Date() };
    await appt.save();
    res.json(await populate(Appointment.findById(appt._id)));
  } catch (e) { next(e); }
});

module.exports = router;
