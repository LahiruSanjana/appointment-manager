const mongoose = require('mongoose');
const { TYPES, STATUSES } = require('../constants');

const appointmentSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    patientName: { type: String, required: true, trim: true, maxlength: 100 },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    dateTime: { type: Date, required: true },
    type: { type: String, enum: TYPES, required: true },
    status: { type: String, enum: STATUSES, default: 'Scheduled' },
    notes: { type: String, maxlength: 500, default: '' },
    intake: {
      symptoms: { type: String, maxlength: 1000, default: '' },
      medications: { type: String, maxlength: 1000, default: '' },
      allergies: { type: String, maxlength: 1000, default: '' },
    },
    aiSummary: { data: mongoose.Schema.Types.Mixed, generatedAt: Date },
  },
  { timestamps: true }
);

appointmentSchema.index({ doctor: 1, dateTime: 1 });
appointmentSchema.index({ patient: 1, dateTime: 1 });

module.exports = mongoose.model('Appointment', appointmentSchema);
