import { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { fmt } from '../constants.js';
import AppointmentForm from '../AppointmentForm.jsx';
import { QuickBook, SummaryModal, PrepModal } from '../AiPanels.jsx';
import AppointmentFilters from '../components/AppointmentFilters.jsx';
import AppointmentTable from '../components/AppointmentTable.jsx';
import { logout, selectAuth } from '../store/authSlice.js';

const EMPTY_FILTERS = { q: '', status: '', doctor: '', type: '' };

export default function Dashboard() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user, token } = useSelector(selectAuth);
  const [items, setItems] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [editing, setEditing] = useState(null);
  const [prefill, setPrefill] = useState(null);
  const [summaryFor, setSummaryFor] = useState(null);
  const [prepFor, setPrepFor] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const role = user.role;
  const isStaff = role !== 'patient';
  const canCreateAppointment = role === 'patient' || role === 'doctor';

  const handleLogout = useCallback(() => {
    dispatch(logout());
    navigate('/login', { replace: true });
  }, [dispatch, navigate]);

  const guard = useCallback((err) => {
    if (err.status === 401) handleLogout();
    else setError(err.message);
  }, [handleLogout]);

  const load = useCallback(async () => {
    setLoading(true);
    const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value)).toString();
    try {
      setItems(await api('/appointments?' + query, { token }));
      setError('');
    } catch (err) {
      guard(err);
    } finally {
      setLoading(false);
    }
  }, [token, filters, guard]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    api('/doctors', { token }).then(setDoctors).catch(guard);
  }, [token, guard]);

  async function save(payload) {
    const isNew = editing === 'new';
    const saved = await api(isNew ? '/appointments' : '/appointments/' + editing._id, {
      method: isNew ? 'POST' : 'PUT', body: payload, token,
    });
    setEditing(null);
    setPrefill(null);
    const intake = payload.intake || {};
    if ((intake.symptoms || intake.medications || intake.allergies) && !saved.aiSummary?.data) {
      api(`/appointments/${saved._id}/intake-summary`, { method: 'POST', token }).then(load).catch(() => {});
    }
    load();
  }

  async function remove(appointment) {
    if (!window.confirm(`Delete the appointment for ${appointment.patientName} on ${fmt(appointment.dateTime)}?`)) return;
    try {
      await api('/appointments/' + appointment._id, { method: 'DELETE', token });
      load();
    } catch (err) {
      guard(err);
    }
  }

  async function cancel(appointment) {
    try {
      await api('/appointments/' + appointment._id, { method: 'PUT', body: { status: 'Cancelled' }, token });
      load();
    } catch (err) {
      guard(err);
    }
  }

  const openNewAppointment = (result = null) => {
    setPrefill(result);
    setEditing('new');
  };
  const closeEditor = () => {
    setEditing(null);
    setPrefill(null);
  };
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <>
      <header className="bar">
        <strong>Appointment Desk</strong>
        <span className="muted">{user.name} ({role})</span>
        {role === 'admin' && <Link to="/admin">Manage users</Link>}
        <button onClick={handleLogout}>Log out</button>
      </header>
      <main className="page">
        <div className="row">
          <h1>{role === 'patient' ? 'My appointments' : role === 'doctor' ? 'My schedule' : 'All appointments'}</h1>
          {canCreateAppointment && (
            <button className="primary" onClick={() => openNewAppointment()} disabled={!doctors.length}>New appointment</button>
          )}
        </div>
        {canCreateAppointment && <QuickBook token={token} onResult={openNewAppointment} />}
        <AppointmentFilters filters={filters} doctors={doctors} role={role} onChange={setFilters} onClear={() => setFilters(EMPTY_FILTERS)} />
        {error && <p className="error" role="alert">{error}</p>}
        {!loading && items.length === 0
          ? <p className="empty">{hasFilters ? 'No appointments match these filters.' : 'No appointments yet. Choose New appointment to book one.'}</p>
          : <AppointmentTable items={items} isStaff={isStaff} onSummary={setSummaryFor} onPrepare={setPrepFor}
              onEdit={(appointment) => { setPrefill(null); setEditing(appointment); }} onCancel={cancel} onDelete={remove} />}
      </main>
      {editing && <AppointmentForm initial={editing === 'new' ? null : editing} prefill={prefill} doctors={doctors}
        isStaff={isStaff} onSave={save} onClose={closeEditor} />}
      {summaryFor && <SummaryModal appt={summaryFor} token={token} onChanged={load} onClose={() => setSummaryFor(null)} />}
      {prepFor && <PrepModal apptId={prepFor} token={token} onClose={() => setPrepFor(null)} />}
    </>
  );
}
