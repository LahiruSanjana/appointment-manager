import { TYPES, STATUSES } from '../constants.js';

export default function AppointmentFilters({ filters, doctors, role, onChange, onClear }) {
  const hasFilters = Object.values(filters).some(Boolean);
  const setFilter = (key) => (event) => onChange({ ...filters, [key]: event.target.value });

  return (
    <div className="filters">
      <input type="search" placeholder="Search by patient name" value={filters.q} onChange={setFilter('q')} />
      <select value={filters.status} onChange={setFilter('status')}>
        <option value="">All statuses</option>{STATUSES.map((status) => <option key={status}>{status}</option>)}
      </select>
      <select value={filters.type} onChange={setFilter('type')}>
        <option value="">All types</option>{TYPES.map((type) => <option key={type}>{type}</option>)}
      </select>
      {role !== 'doctor' && (
        <select value={filters.doctor} onChange={setFilter('doctor')}>
          <option value="">All doctors</option>{doctors.map((doctor) => <option key={doctor._id} value={doctor._id}>{doctor.name}</option>)}
        </select>
      )}
      {hasFilters && <button onClick={onClear}>Clear</button>}
    </div>
  );
}
