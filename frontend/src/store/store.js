import { configureStore } from '@reduxjs/toolkit';
import authReducer, { STORAGE_KEY } from './authSlice.js';
import { authApi } from '../services/authApi.js';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    [authApi.reducerPath]: authApi.reducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(authApi.middleware),
});

store.subscribe(() => {
  const { user, token } = store.getState().auth;
  if (token) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ user, token }));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
});
