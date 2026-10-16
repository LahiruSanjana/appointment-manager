import { createSlice } from '@reduxjs/toolkit';

export const STORAGE_KEY = 'appointment-auth';

function readStoredAuth() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

const storedAuth = readStoredAuth();

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: storedAuth?.user || null,
    token: storedAuth?.token || null,
  },
  reducers: {
    setCredentials(state, action) {
      const { user, token } = action.payload;
      if (token) state.token = token;
      if (user) state.user = user;
    },
    logout(state) {
      state.user = null;
      state.token = null;
    },
  },
});

export const { setCredentials, logout } = authSlice.actions;
export const selectAuth = (state) => state.auth;
export const selectToken = (state) => state.auth.token;
export default authSlice.reducer;
