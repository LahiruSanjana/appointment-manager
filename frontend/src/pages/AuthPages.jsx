import { useDispatch } from 'react-redux';
import { AuthScreen } from '../components/index.js';
import { setCredentials } from '../store/authSlice.js';

export function LoginPage() {
  const dispatch = useDispatch();
  return <AuthScreen onAuth={(data) => dispatch(setCredentials(data))} />;
}

export function UnauthorizedPage() {
  return (
    <main className="auth">
      <h1>Access denied</h1>
      <p className="muted">You do not have permission to view this page.</p>
      <a href="/">Return to the appointment desk</a>
    </main>
  );
}

export function NotFoundPage() {
  return (
    <main className="auth">
      <h1>Page not found</h1>
      <a href="/">Return to the appointment desk</a>
    </main>
  );
}
