process.env.JWT_SECRET = 'test-secret';
process.env.AI_SERVICE_URL = 'http://ai.test';
process.env.AI_INTERNAL_KEY = 'k';
const request = require('supertest');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/app');
const User = require('../src/models/User');
const Appointment = require('../src/models/Appointment');

let mongod, doctor, patient, admin;
const future = (days, hour = 10) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(hour, 0, 0, 0); return d.toISOString(); };
const authed = (m, url, t) => request(app)[m](url).set('Authorization', 'Bearer ' + t);
const aiOk = (json) => global.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => json });
const sentBody = (i = 0) => JSON.parse(global.fetch.mock.calls[i][1].body);

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const passwordHash = await bcrypt.hash('Password123!', 4);
  doctor = await User.create({ name: 'Dr. Silva', email: 'silva@example.test', passwordHash, role: 'doctor' });
  await User.create({ name: 'Admin', email: 'admin@example.test', passwordHash, role: 'admin' });
  const reg = await request(app).post('/api/auth/register').send({ name: 'Test Patient A', email: 'a@example.test', password: 'Password123!' });
  patient = { token: reg.body.token, id: reg.body.user.id };
  admin = (await request(app).post('/api/auth/login').send({ email: 'admin@example.test', password: 'Password123!' })).body.token;
});
afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); });
beforeEach(() => { global.fetch = jest.fn(); });

const summary = { summary: 'Headache for 3 days.', key_symptoms: ['headache'], medications: [], allergies: [], red_flags: [] };

describe('natural language booking', () => {
  test('maps the doctor name to an id and returns a pre-fill only (nothing saved)', async () => {
    aiOk({ doctor_name: 'Dr. Silva', type: 'Checkup', date_time: future(5, 15), missing: [] });
    const r = await authed('post', '/api/ai/parse-booking', patient.token).send({ text: 'Book a checkup with Dr. Silva next Tuesday 3pm' });
    expect(r.status).toBe(200);
    expect(r.body.doctor).toBe(String(doctor._id));
    expect(r.body.type).toBe('Checkup');
    expect(await Appointment.countDocuments()).toBe(0);
    expect(global.fetch.mock.calls[0][1].headers['X-Internal-Key']).toBe('k');
    expect(sentBody().doctors).toEqual(['Dr. Silva']);
  });
  test('rejects an AI answer with an invalid appointment type', async () => {
    aiOk({ doctor_name: 'Dr. Silva', type: 'Magic', date_time: future(5), missing: [] });
    expect((await authed('post', '/api/ai/parse-booking', patient.token).send({ text: 'magic with Dr. Silva' })).status).toBe(502);
  });
  test('drops a past date returned by the AI', async () => {
    aiOk({ doctor_name: 'Dr. Silva', type: 'Checkup', date_time: '2020-01-01T10:00:00Z', missing: [] });
    const r = await authed('post', '/api/ai/parse-booking', patient.token).send({ text: 'checkup with Dr. Silva in 2020' });
    expect(r.body.dateTime).toBeNull();
    expect(r.body.missing).toContain('a future date and time');
  });
  test('works without AI: service down returns 502, normal booking still works', async () => {
    global.fetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    expect((await authed('post', '/api/ai/parse-booking', patient.token).send({ text: 'checkup tomorrow' })).status).toBe(502);
    const r = await authed('post', '/api/appointments', patient.token).send({ doctor: String(doctor._id), dateTime: future(9), type: 'Checkup' });
    expect(r.status).toBe(201);
    await Appointment.deleteMany({});
  });
});

describe('pre-visit summary', () => {
  let id;
  test('generates and stores a summary without sending patient identity', async () => {
    const c = await authed('post', '/api/appointments', patient.token).send({
      doctor: String(doctor._id), dateTime: future(3), type: 'Consultation',
      intake: { symptoms: 'Headache for 3 days', medications: 'Metformin 500mg', allergies: 'Penicillin' },
    });
    expect(c.status).toBe(201);
    id = c.body._id;
    aiOk(summary);
    const r = await authed('post', `/api/appointments/${id}/intake-summary`, patient.token);
    expect(r.status).toBe(200);
    expect(r.body.aiSummary.data.summary).toBe('Headache for 3 days.');
    const payload = JSON.stringify(sentBody());
    expect(payload).toContain('Headache');
    expect(payload).not.toContain('Test Patient A');
    expect(payload).not.toContain('a@example.test');
  });
  test('rejects malformed AI output and keeps the appointment', async () => {
    aiOk({ summary: 123 });
    expect((await authed('post', `/api/appointments/${id}/intake-summary`, patient.token)).status).toBe(502);
    expect((await authed('get', `/api/appointments/${id}`, patient.token)).status).toBe(200);
  });
  test('editing intake clears the stale summary', async () => {
    const r = await authed('put', `/api/appointments/${id}`, patient.token).send({ intake: { symptoms: 'Headache and fever', medications: 'Metformin 500mg', allergies: 'Penicillin' } });
    expect(r.status).toBe(200);
    expect(r.body.aiSummary && r.body.aiSummary.data).toBeUndefined();
  });
  test('other users cannot generate a summary for it (404)', async () => {
    const other = await request(app).post('/api/auth/register').send({ name: 'Test Patient B', email: 'b@example.test', password: 'Password123!' });
    expect((await authed('post', `/api/appointments/${id}/intake-summary`, other.body.token)).status).toBe(404);
  });
});

describe('patient preparation', () => {
  const prep = { things_to_tell_doctor: ['Headache'], questions_to_ask: ['Is it related to sleep?'], medication_flags: [{ medication: 'Ibuprofen', concern: 'Long-term use may be worth reviewing.', action: 'Confirm with your doctor or pharmacist' }] };
  test('patients only; admins get 403', async () => {
    expect((await authed('post', '/api/ai/patient-prep', admin).send({})).status).toBe(403);
  });
  test('sends history and medications but no identity', async () => {
    await Appointment.create({ patient: patient.id, patientName: 'Test Patient A', doctor: doctor._id, dateTime: new Date(Date.now() - 864e5 * 20), type: 'Checkup', status: 'Completed', notes: 'Fictional BP check', intake: { medications: 'Ibuprofen, Metformin 500mg' } });
    aiOk(prep);
    const r = await authed('post', '/api/ai/patient-prep', patient.token).send({});
    expect(r.status).toBe(200);
    expect(r.body.medication_flags[0].action).toBe('Confirm with your doctor or pharmacist');
    const sent = sentBody();
    expect(sent.medications).toEqual(expect.arrayContaining(['Ibuprofen', 'Metformin 500mg']));
    expect(JSON.stringify(sent)).not.toContain('Test Patient A');
  });
  test('asks for data first when there is nothing to work with', async () => {
    await Appointment.deleteMany({});
    expect((await authed('post', '/api/ai/patient-prep', patient.token).send({})).status).toBe(400);
  });
});
