import { fmt } from '../constants.js';

export default function AppointmentTable({ items, isStaff, onSummary, onPrepare, onEdit, onCancel, onDelete }) {
  return (
    <div className="scroll">
      <table>
        <thead><tr><th>Patient</th><th>Date and time</th><th>Doctor</th><th>Type</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {items.map((appointment) => (
            <tr key={appointment._id}>
              <td>{appointment.patientName}</td>
              <td>{fmt(appointment.dateTime)}</td>
              <td>{appointment.doctor?.name}</td>
              <td>{appointment.type}</td>
              <td><span className={'chip ' + appointment.status.toLowerCase()}>{appointment.status}</span></td>
              <td className="actions">
                {(appointment.aiSummary?.data || appointment.intake?.symptoms || appointment.intake?.medications || appointment.intake?.allergies)
                  && <button onClick={() => onSummary(appointment)}>Summary</button>}
                {!isStaff && appointment.status === 'Scheduled' && <button onClick={() => onPrepare(appointment._id)}>Prepare</button>}
                {(isStaff || appointment.status === 'Scheduled')
                  && <button onClick={() => onEdit(appointment)}>Edit</button>}
                {!isStaff && appointment.status === 'Scheduled'
                  && <button onClick={() => onCancel(appointment)}>Cancel</button>}
                <button className="danger" onClick={() => onDelete(appointment)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
