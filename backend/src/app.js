const express = require('express');
const cors = require('cors');
const { ZodError } = require('zod');
const User = require('./models/User');
const { auth } = require('./middleware/auth');

const app = express();
app.use(cors());
app.use(express.json({ limit: '100kb' }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/ai', require('./routes/ai'));
app.get('/api/doctors', auth, async (req, res, next) => {
  try {
    res.json(await User.find({ role: 'doctor' }).select('name').sort({ name: 1 }));
  } catch (e) { next(e); }
});

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof ZodError)
    return res.status(400).json({ error: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
  if (err.name === 'CastError') return res.status(400).json({ error: 'Invalid id' });
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

module.exports = app;
