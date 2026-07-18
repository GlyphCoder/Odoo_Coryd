import axios from 'axios';

const baseURL = (import.meta.env.VITE_API_URL || '') + '/api';

const api = axios.create({ baseURL });

// Attach JWT from localStorage on every request.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On 401, clear session and bounce to login.
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && !location.pathname.startsWith('/login')) {
      localStorage.removeItem('token');
      if (location.pathname !== '/' && !location.pathname.startsWith('/signup')) {
        location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export const apiError = (err) => err?.response?.data?.error || err?.message || 'Something went wrong';

export default api;
