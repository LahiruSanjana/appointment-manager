import { useEffect, useState, useCallback } from 'react';
import { api } from './api.js';
import { TYPES, STATUSES, fmt } from './constants.js';
import AppointmentForm from './AppointmentForm.jsx';
import { QuickBook, SummaryModal, PrepModal } from './AiPanels.jsx';

function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      const data = await api(mode === 'login' ? '/auth/login' : '/auth/register', {
        method: 'POST',
        body: mode === 'login' ? { email: f.email, password: f.password } : f,
      });
      onAuth(data);
    } catch (err) { setError(err.message); }
  }

  return (
    <main className="auth">
      <h1>Appointment Desk</h1>
      <p className="muted">Book, review and manage clinic appointments.</p>
      <form onSubmit={submit}>
        {mode === 'register' && (
          <label>Full name<input required minLength={2} value={f.name} onChange={set('name')} /></label>
        )}
        <label>Email<input type="email" required value={f.email} onChange={set('email')} /></label>
        <label>Password<input type="password" required minLength={mode === 'register' ? 8 : 1} value={f.password} onChange={set('password')} /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary">{mode === 'login' ? 'Log in' : 'Create account'}</button>
      </form>
      <button className="link" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
        {mode === 'login' ? 'New patient? Create an account' : 'Have an account? Log in'}
      </button>
    </main>
  );
}

export default function App() {
  const [session, setSession] = useState(() => JSON.parse(localStorage.getItem('session') || 'null'));
  const [items, setItems] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [filters, setFilters] = useState({ q: '', status: '', doctor: '', type: '' });
  const [editing, setEditing] = useState(null); // null | 'new' | appointment
  const [prefill, setPrefill] = useState(null);
  const [summaryFor, setSummaryFor] = useState(null);
  const [prepFor, setPrepFor] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const token = session?.token;
  const role = session?.user.role;
  const isStaff = role !== 'patient';

  const logout = useCallback(() => { localStorage.removeItem('session'); setSession(null); }, []);
  const onAuth = (data) => { localStorage.setItem('session', JSON.stringify(data)); setSession(data); };
  const guard = useCallback((err) => { if (err.status === 401) logout(); else setError(err.message); }, [logout]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
    try { setItems(await api('/appointments?' + qs, { token })); setError(''); }
    catch (err) { guard(err); }
    finally { setLoading(false); }
  }, [token, filters, guard]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  useEffect(() => { if (token) api('/doctors', { token }).then(setDoctors).catch(guard); }, [token, guard]);

  if (!session) return <AuthScreen onAuth={onAuth} />;

  async function save(payload) {
    const isNew = editing === 'new';
    const saved = await api(isNew ? '/appointments' : '/appointments/' + editing._id, { method: isNew ? 'POST' : 'PUT', body: payload, token });
    setEditing(null); setPrefill(null);
    const i = payload.intake || {};
    if ((i.symptoms || i.medications || i.allergies) && !saved.aiSummary?.data)
      api(`/appointments/${saved._id}/intake-summary`, { method: 'POST', token }).then(load).catch(() => {}); // AI is optional
    load();
  }
  async function remove(a) {
    if (!window.confirm(`Delete the appointment for ${a.patientName} on ${fmt(a.dateTime)}?`)) return;
    try { await api('/appointments/' + a._id, { method: 'DELETE', token }); load(); } catch (err) { guard(err); }
  }
  async function cancel(a) {
    try { await api('/appointments/' + a._id, { method: 'PUT', body: { status: 'Cancelled' }, token }); load(); } catch (err) { guard(err); }
  }
  const setFilter = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <>
      <header className="bar">
        <strong>Appointment Desk</strong>
        <span className="muted">{session.user.name} ({role})</span>
        <button onClick={logout}>Log out</button>
      </header>
      <main className="page">
        <div className="row">
          <h1>{role === 'patient' ? 'My appointments' : role === 'doctor' ? 'My schedule' : 'All appointments'}</h1>
          <button className="primary" onClick={() => { setPrefill(null); setEditing('new'); }} disabled={!doctors.length}>New appointment</button>
        </div>

        <QuickBook token={token} onResult={(r) => { setPrefill(r); setEditing('new'); }} />

        <div className="filters">
          <input type="search" placeholder="Search by patient name" value={filters.q} onChange={setFilter('q')} />
          <select value={filters.status} onChange={setFilter('status')}>
            <option value="">All statuses</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select value={filters.type} onChange={setFilter('type')}>
            <option value="">All types</option>{TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
          {role !== 'doctor' && (
            <select value={filters.doctor} onChange={setFilter('doctor')}>
              <option value="">All doctors</option>{doctors.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
            </select>
          )}
          {hasFilters && <button onClick={() => setFilters({ q: '', status: '', doctor: '', type: '' })}>Clear</button>}
        </div>

        {error && <p className="error" role="alert">{error}</p>}
        {!loading && items.length === 0 ? (
          <p className="empty">{hasFilters ? 'No appointments match these filters.' : 'No appointments yet. Choose New appointment to book one.'}</p>
        ) : (
          <div className="scroll">
            <table>
              <thead><tr><th>Patient</th><th>Date and time</th><th>Doctor</th><th>Type</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a._id}>
                    <td>{a.patientName}</td>
                    <td>{fmt(a.dateTime)}</td>
                    <td>{a.doctor?.name}</td>
                    <td>{a.type}</td>
                    <td><span className={'chip ' + a.status.toLowerCase()}>{a.status}</span></td>
                    <td className="actions">
                      {(a.aiSummary?.data || a.intake?.symptoms || a.intake?.medications || a.intake?.allergies) && <button onClick={() => setSummaryFor(a)}>Summary</button>}
                      {!isStaff && a.status === 'Scheduled' && <button onClick={() => setPrepFor(a._id)}>Prepare</button>}
                      {(isStaff || a.status === 'Scheduled') && <button onClick={() => { setPrefill(null); setEditing(a); }}>Edit</button>}
                      {!isStaff && a.status === 'Scheduled' && <button onClick={() => cancel(a)}>Cancel</button>}
                      <button className="danger" onClick={() => remove(a)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
      {editing && (
        <AppointmentForm initial={editing === 'new' ? null : editing} prefill={prefill} doctors={doctors} isStaff={isStaff}
          onSave={save} onClose={() => { setEditing(null); setPrefill(null); }} />
      )}
      {summaryFor && <SummaryModal appt={summaryFor} token={token} onChanged={load} onClose={() => setSummaryFor(null)} />}
      {prepFor && <PrepModal apptId={prepFor} token={token} onClose={() => setPrepFor(null)} />}
    </>
  );
}
