import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { logout, selectAuth, setCredentials } from '../store/authSlice.js';
import { authApi, useGetCurrentUserQuery } from '../services/authApi.js';

export default function ProtectedRoute({ allowedRoles }) {
  const dispatch = useDispatch();
  const location = useLocation();
  const { token, user } = useSelector(selectAuth);
  const { data, error, isLoading, isFetching } = useGetCurrentUserQuery(undefined, {
    skip: !token,
    refetchOnMountOrArgChange: true,
  });

  useEffect(() => {
    if (data?.user) dispatch(setCredentials({ user: data.user }));
  }, [data, dispatch]);

  useEffect(() => {
    if (error?.status === 401) {
      dispatch(logout());
      dispatch(authApi.util.resetApiState());
    }
  }, [dispatch, error]);

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (isLoading || isFetching || !user) {
    return <main className="auth"><p className="muted">Validating your session…</p></main>;
  }

  if (error) {
    return <main className="auth"><p className="error" role="alert">Unable to validate your session. Please sign in again.</p></main>;
  }

  if (allowedRoles?.length && !allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <Outlet />;
}
