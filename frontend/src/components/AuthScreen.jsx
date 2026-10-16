import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';

export default function AuthScreen({ onAuth }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  async function submit(event) {
    event.preventDefault();
    setError('');
    try {
      const data = await api(mode === 'login' ? '/auth/login' : '/auth/register', {
        method: 'POST',
        body: mode === 'login' ? { email: form.email, password: form.password } : form,
      });
      onAuth(data);
      navigate(location.state?.from?.pathname || '/', { replace: true });
    } catch (err) {
      setError(err.message);
    }
  }

  const toggleMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    setError('');
  };

  return (
    <main className="auth">
      <h1>Appointment Desk</h1>
      <p className="muted">Book, review and manage clinic appointments.</p>
      <form onSubmit={submit}>
        {mode === 'register' && (
          <label>Full name<input required minLength={2} value={form.name} onChange={set('name')} /></label>
        )}
        <label>Email<input type="email" required value={form.email} onChange={set('email')} /></label>
        <label>Password<input type="password" required minLength={mode === 'register' ? 8 : 1} value={form.password} onChange={set('password')} /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary">{mode === 'login' ? 'Log in' : 'Create account'}</button>
      </form>
      <button className="link" onClick={toggleMode}>
        {mode === 'login' ? 'New patient? Create an account' : 'Have an account? Log in'}
      </button>
    </main>
  );
}
