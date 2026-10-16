import { useState } from 'react';
import { TYPES, STATUSES, toLocalInput } from './constants.js';

export default function AppointmentForm({ initial, prefill, doctors, isStaff, onSave, onClose }) {
  const [f, setF] = useState(() =>
    initial
      ? {
          ...initial, doctor: initial.doctor._id, dateTime: toLocalInput(initial.dateTime),
          symptoms: initial.intake?.symptoms || '', medications: initial.intake?.medications || '', allergies: initial.intake?.allergies || '',
        }
      : {
          patientName: '', doctor: prefill?.doctor || doctors[0]?._id || '', dateTime: prefill?.dateTime ? toLocalInput(prefill.dateTime) : '',
          type: prefill?.type || TYPES[0], status: 'Scheduled', notes: '', symptoms: '', medications: '', allergies: '',
        }
  );
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError('');
    const payload = {
      doctor: f.doctor, dateTime: new Date(f.dateTime).toISOString(), type: f.type, notes: f.notes,
      intake: { symptoms: f.symptoms, medications: f.medications, allergies: f.allergies },
    };
    if (isStaff) { payload.patientName = f.patientName; payload.status = f.status; }
    try { await onSave(payload); } catch (err) { setError(err.message); }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>{initial ? 'Edit appointment' : 'New appointment'}</h2>
        {prefill?.missing?.length > 0 && (
          <p className="notice">Filled from your sentence. Please check the details and add: {prefill.missing.join(', ')}.</p>
        )}
        {isStaff && <label>Patient name<input required value={f.patientName} onChange={set('patientName')} /></label>}
        <label>Doctor
          <select required value={f.doctor} onChange={set('doctor')}>
            {doctors.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
          </select>
        </label>
        <label>Date and time<input type="datetime-local" required value={f.dateTime} onChange={set('dateTime')} /></label>
        <label>Appointment type
          <select value={f.type} onChange={set('type')}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
        </label>
        {isStaff && (
          <label>Status
            <select value={f.status} onChange={set('status')}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
          </label>
        )}
        <label>Notes<textarea maxLength={500} rows={2} value={f.notes} onChange={set('notes')} /></label>

        <fieldset>
          <legend>Before your visit (optional)</legend>
          <p className="muted small">An AI-written summary of this goes to your doctor. Demo only: use fictional details, not real health information.</p>
          <label>Symptoms<textarea maxLength={1000} rows={2} value={f.symptoms} onChange={set('symptoms')} /></label>
          <label>Current medications<textarea maxLength={1000} rows={2} value={f.medications} onChange={set('medications')} /></label>
          <label>Allergies<input maxLength={1000} value={f.allergies} onChange={set('allergies')} /></label>
          <p className="small">If you have severe symptoms such as chest pain or trouble breathing, don't wait for an appointment. Contact your local emergency number.</p>
        </fieldset>

        {error && <p className="error" role="alert">{error}</p>}
        <div className="row end">
          <button type="button" onClick={onClose}>Close</button>
          <button className="primary">Save appointment</button>
        </div>
      </form>
    </div>
  );
}
