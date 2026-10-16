require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./app');

if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not set. Copy .env.example to .env');

mongoose
  .connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/appointments')
  .then(() => app.listen(process.env.PORT || 5002, () => console.log('API running on port ' + (process.env.PORT || 5002))))
  .catch((e) => { console.error('DB connection failed:', e.message); process.exit(1); });
