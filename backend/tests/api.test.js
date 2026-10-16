process.env.JWT_SECRET = 'test-secret';
const request = require('supertest');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/app');
const User = require('../src/models/User');

let mongod, doctor, patientToken, otherToken, adminToken;
const future = (days, hour = 10) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(hour, 0, 0, 0); return d.toISOString(); };
const register = async (name, email) =>
  (await request(app).post('/api/auth/register').send({ name, email, password: 'Password123!' })).body.token;
const authed = (m, url, token) => request(app)[m](url).set('Authorization', 'Bearer ' + token);

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const passwordHash = await bcrypt.hash('Password123!', 4);
  doctor = await User.create({ name: 'Dr. Silva', email: 'silva@example.test', passwordHash, role: 'doctor' });
  await User.create({ name: 'Admin', email: 'admin@example.test', passwordHash, role: 'admin' });
  patientToken = await register('Test Patient A', 'a@example.test');
  otherToken = await register('Test Patient B', 'b@example.test');
  adminToken = (await request(app).post('/api/auth/login').send({ email: 'admin@example.test', password: 'Password123!' })).body.token;
});
afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); });

const body = (o = {}) => ({ doctor: String(doctor._id), dateTime: future(2), type: 'Checkup', ...o });

describe('auth', () => {
  test('rejects requests without a token', async () => {
    expect((await request(app).get('/api/appointments')).status).toBe(401);
  });
  test('rejects duplicate email and weak password', async () => {
    const dup = await request(app).post('/api/auth/register').send({ name: 'X Y', email: 'a@example.test', password: 'Password123!' });
    expect(dup.status).toBe(409);
    const weak = await request(app).post('/api/auth/register').send({ name: 'X Y', email: 'c@example.test', password: '123' });
    expect(weak.status).toBe(400);
  });
  test('rejects wrong password', async () => {
    const r = await request(app).post('/api/auth/login').send({ email: 'a@example.test', password: 'wrongpass1' });
    expect(r.status).toBe(401);
  });
});

describe('appointments CRUD', () => {
  let id;
  test('patient creates an appointment for themselves', async () => {
    const r = await authed('post', '/api/appointments', patientToken).send(body());
    expect(r.status).toBe(201);
    expect(r.body.patientName).toBe('Test Patient A');
    expect(r.body.status).toBe('Scheduled');
    id = r.body._id;
  });
  test('blocks double booking for the same doctor and time', async () => {
    const r = await authed('post', '/api/appointments', otherToken).send(body());
    expect(r.status).toBe(409);
  });
  test('rejects past dates, bad type, unknown doctor', async () => {
    expect((await authed('post', '/api/appointments', patientToken).send(body({ dateTime: '2020-01-01T10:00:00Z' }))).status).toBe(400);
    expect((await authed('post', '/api/appointments', patientToken).send(body({ type: 'Magic', dateTime: future(3) }))).status).toBe(400);
    expect((await authed('post', '/api/appointments', patientToken).send(body({ doctor: '64b7f0f0f0f0f0f0f0f0f0f0', dateTime: future(3) }))).status).toBe(400);
  });
  test('staff must supply a patient name', async () => {
    const r = await authed('post', '/api/appointments', adminToken).send(body({ dateTime: future(4) }));
    expect(r.status).toBe(400);
    const ok = await authed('post', '/api/appointments', adminToken).send(body({ dateTime: future(4), patientName: 'Test Patient C' }));
    expect(ok.status).toBe(201);
  });
  test('patients only see their own appointments', async () => {
    expect((await authed('get', '/api/appointments', patientToken)).body).toHaveLength(1);
    expect((await authed('get', '/api/appointments', otherToken)).body).toHaveLength(0);
    expect((await authed('get', '/api/appointments/' + id, otherToken)).status).toBe(404);
  });
  test('admin sees all and can search and filter', async () => {
    expect((await authed('get', '/api/appointments', adminToken)).body).toHaveLength(2);
    expect((await authed('get', '/api/appointments?q=patient c', adminToken)).body).toHaveLength(1);
    expect((await authed('get', '/api/appointments?status=Completed', adminToken)).body).toHaveLength(0);
  });
  test('search input is treated as text, not a regex', async () => {
    const r = await authed('get', '/api/appointments?q=.*', adminToken);
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(0);
  });
  test('patient edits time, but cannot set arbitrary status', async () => {
    const ok = await authed('put', '/api/appointments/' + id, patientToken).send({ type: 'Follow-up' });
    expect(ok.status).toBe(200);
    expect(ok.body.type).toBe('Follow-up');
    expect((await authed('put', '/api/appointments/' + id, patientToken).send({ status: 'Completed' })).status).toBe(400);
  });
  test('admin marks an appointment completed', async () => {
    const r = await authed('put', '/api/appointments/' + id, adminToken).send({ status: 'Completed' });
    expect(r.body.status).toBe('Completed');
    expect((await authed('put', '/api/appointments/' + id, patientToken).send({ type: 'Checkup' })).status).toBe(403);
  });
  test('invalid id returns 400, missing returns 404, delete works', async () => {
    expect((await authed('get', '/api/appointments/not-an-id', adminToken)).status).toBe(400);
    expect((await authed('delete', '/api/appointments/64b7f0f0f0f0f0f0f0f0f0f0', adminToken)).status).toBe(404);
    expect((await authed('delete', '/api/appointments/' + id, adminToken)).status).toBe(204);
    expect((await authed('get', '/api/appointments/' + id, adminToken)).status).toBe(404);
  });
});
