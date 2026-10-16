import { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { logout, selectAuth } from '../store/authSlice.js';
import { authApi } from '../services/authApi.js';

const ROLES = ['patient', 'doctor', 'admin'];

export default function AdminPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { token } = useSelector(selectAuth);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState(null);

  const handleError = useCallback((err) => {
    if (err.status === 401) {
      dispatch(logout());
      dispatch(authApi.util.resetApiState());
      navigate('/login', { replace: true });
    } else {
      setError(err.message);
    }
  }, [dispatch, navigate]);

  const loadUsers = useCallback(async () => {
    try {
      setUsers(await api('/users', { token }));
      setError('');
    } catch (err) {
      handleError(err);
    }
  }, [token, handleError]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  async function changeRole(id, role) {
    setSavingId(id);
    try {
      const result = await api(`/users/${id}/role`, { method: 'PATCH', body: { role }, token });
      setUsers((current) => current.map((user) => user.id === id ? result.user : user));
      setError('');
    } catch (err) {
      handleError(err);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <main className="page">
      <div className="row">
        <h1>Administration</h1>
        <Link to="/">Back to appointments</Link>
      </div>
      <p className="muted">Assign patient, doctor, or administrator access to each account.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="scroll">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.name}</td>
                <td>{user.email}</td>
                <td>
                  <select value={user.role} onChange={(event) => changeRole(user.id, event.target.value)} disabled={savingId === user.id}>
                    {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
