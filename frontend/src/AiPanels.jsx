import { useEffect, useState } from 'react';
import { api } from './api.js';
import { fmt } from './constants.js';

const Disclaimer = () => <p className="notice">AI-generated decision support, not medical advice. Check anything important with a doctor.</p>;
const List = ({ title, items }) => items?.length > 0 && (
  <><h3>{title}</h3><ul>{items.map((x, i) => <li key={i}>{x}</li>)}</ul></>
);

export function QuickBook({ token, onResult }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try { onResult(await api('/ai/parse-booking', { method: 'POST', body: { text }, token })); setText(''); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return (
    <form className="quick" onSubmit={submit}>
      <input value={text} onChange={(e) => setText(e.target.value)} minLength={3} maxLength={300} required
        placeholder="Describe it, e.g. Book a checkup with Dr. Silva next Tuesday 3pm" aria-label="Describe the appointment" />
      <button disabled={busy}>{busy ? 'Reading…' : 'Fill the form'}</button>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  );
}

export function SummaryModal({ appt: first, token, onClose, onChanged }) {
  const [appt, setAppt] = useState(first);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const s = appt.aiSummary?.data;
  const i = appt.intake || {};

  async function generate() {
    setBusy(true); setError('');
    try { setAppt(await api(`/appointments/${appt._id}/intake-summary`, { method: 'POST', token })); onChanged(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Pre-visit summary</h2>
        <p className="muted">{appt.patientName} · {fmt(appt.dateTime)} · {appt.doctor?.name}</p>
        {s?.red_flags?.length > 0 && <p className="alert"><strong>Mentioned symptoms that may need prompt attention:</strong> {s.red_flags.join(', ')}</p>}
        {s ? (
          <>
            <Disclaimer />
            <p>{s.summary}</p>
            <List title="Key symptoms" items={s.key_symptoms} />
            <List title="Medications" items={s.medications} />
            <List title="Allergies" items={s.allergies} />
          </>
        ) : (
          <p className="muted">No summary yet.</p>
        )}
        <h3>What the patient entered</h3>
        <dl>
          <dt>Symptoms</dt><dd>{i.symptoms || 'Not provided'}</dd>
          <dt>Medications</dt><dd>{i.medications || 'Not provided'}</dd>
          <dt>Allergies</dt><dd>{i.allergies || 'Not provided'}</dd>
        </dl>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row end">
          <button onClick={onClose}>Close</button>
          <button className="primary" onClick={generate} disabled={busy}>{busy ? 'Working…' : s ? 'Generate again' : 'Generate summary'}</button>
        </div>
      </div>
    </div>
  );
}

export function PrepModal({ apptId, token, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/ai/patient-prep', { method: 'POST', body: { appointmentId: apptId }, token }).then(setData).catch((e) => setError(e.message));
  }, [apptId, token]);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Prepare for your visit</h2>
        {!data && !error && <p className="muted">Reading your history…</p>}
        {error && <p className="error" role="alert">{error}</p>}
        {data && (
          <>
            <Disclaimer />
            <List title="Tell your doctor" items={data.things_to_tell_doctor} />
            <List title="Questions you could ask" items={data.questions_to_ask} />
            {data.medication_flags.length > 0 && <h3>Medicines worth checking</h3>}
            {data.medication_flags.map((m, k) => (
              <div className="flag" key={k}>
                <strong>{m.medication}</strong>
                <p>{m.concern}</p>
                <p className="small"><strong>{m.action}</strong></p>
              </div>
            ))}
          </>
        )}
        <div className="row end"><button onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}
