// All network access lives here. Paths are relative: in development Vite proxies /api and /ws to the
// FastAPI server (see vite.config.js); in production the API is served from the same origin.
// Set VITE_API_BASE_URL only if the API lives on a different origin.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export const getApiUrl = (endpoint) => `${API_BASE_URL}${endpoint}`;

// ---------------------------------------------------------------- session
const TOKEN_KEY = 'smartqueue_token';
const USER_KEY = 'smartqueue_user';
const AUTH_EVENT = 'smartqueue:auth';

const emitAuthChange = () => window.dispatchEvent(new Event(AUTH_EVENT));

export const getStoredToken = () => localStorage.getItem(TOKEN_KEY);
export const getStoredUser = () => {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const setAuthSession = (token, user) => {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  emitAuthChange();
};

export const updateStoredUser = (user) => {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  emitAuthChange();
};

export const clearAuthSession = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  emitAuthChange();
};

/** Subscribe to sign-in / sign-out / expiry (also fires for changes made in other tabs). Returns an unsubscribe fn. */
export const onAuthChange = (callback) => {
  const handler = () => callback(getStoredUser());
  window.addEventListener(AUTH_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(AUTH_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
};

// ---------------------------------------------------------------- request core
const errorMessage = (data, fallback) => (typeof data?.detail === 'string' ? data.detail : fallback);

async function request(path, { method = 'GET', body, auth = true, fallback = 'Request failed' } = {}) {
  const token = getStoredToken();
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  // The token is sent whenever we have one: public endpoints return richer data to signed-in staff.
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(getApiUrl(path), { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  } catch {
    throw new Error('Cannot reach the server. Check your connection and try again.');
  }
  const data = await res.json().catch(() => ({}));

  if (res.status === 401 && token && !path.startsWith('/api/auth/login')) {
    clearAuthSession(); // expired or revoked session: drop it so the UI returns to sign-in
    throw new Error('Your session has expired. Please sign in again.');
  }
  if (!res.ok) throw new Error(errorMessage(data, fallback));
  return data;
}

// ---------------------------------------------------------------- auth
export const loginApi = async (username, password, role = null) => {
  const data = await request('/api/auth/login', {
    method: 'POST', body: { username, password, ...(role ? { role } : {}) }, auth: false, fallback: 'Authentication failed',
  });
  setAuthSession(data.access_token, data.user);
  return data;
};

export const registerCustomerApi = async (payload) => {
  const data = await request('/api/auth/customer/register', { method: 'POST', body: payload, auth: false, fallback: 'Could not create account' });
  setAuthSession(data.access_token, data.user);
  return data;
};

export const fetchMe = () => request('/api/auth/me');

// ---------------------------------------------------------------- public
export const fetchServices = () => request('/api/services', { fallback: 'Failed to fetch services' });
export const fetchCounters = () => request('/api/counters', { fallback: 'Failed to fetch counters' });
export const fetchLiveQueue = () => request('/api/queue/live', { fallback: 'Failed to fetch live queue data' });
export const fetchTicketDetails = (tokenNumber) =>
  request(`/api/tokens/ticket/${encodeURIComponent(tokenNumber)}`, { fallback: 'Ticket not found' });
export const generateToken = (payload) => request('/api/tokens/generate', { method: 'POST', body: payload, fallback: 'Failed to generate token' });

// ---------------------------------------------------------------- staff
export const callNextToken = (counterId) => request('/api/counter/call-next', { method: 'POST', body: { counter_id: counterId }, fallback: 'Failed to call next token' });
export const performCounterAction = (payload) => request('/api/counter/action', { method: 'POST', body: payload, fallback: 'Failed to perform action' });
export const updateCounterStatus = (counterId, status) => request(`/api/counters/${counterId}/status`, { method: 'POST', body: { status }, fallback: 'Failed to update counter status' });

// ---------------------------------------------------------------- admin / analytics
export const fetchAnalyticsSummary = () => request('/api/analytics/summary', { fallback: 'Failed to fetch analytics' });
export const fetchSympyFormula = () => request('/api/analytics/sympy-formula', { fallback: 'Failed to fetch formula details' });
export const fetchNotificationLogs = () => request('/api/notifications/logs', { fallback: 'Failed to fetch notification logs' });
export const fetchAdminAuditLogs = () => request('/api/admin/audit-logs', { fallback: 'Unauthorized access to audit logs' });
export const fetchAdminStaff = () => request('/api/admin/staff', { fallback: 'Failed to fetch staff accounts' });
export const createAdminStaff = (data) => request('/api/admin/staff', { method: 'POST', body: data, fallback: 'Could not create staff account' });
export const createAdminService = (data) => request('/api/admin/services', { method: 'POST', body: data, fallback: 'Failed to create service' });
export const assignStaffToCounter = (counterId, staffId) =>
  request(`/api/admin/counters/${counterId}/assign-staff`, { method: 'POST', body: { staff_id: staffId }, fallback: 'Failed to assign staff' });

// ---------------------------------------------------------------- customer
export const fetchCustomerQueue = () => request('/api/customer/queue');
export const joinCustomerQueue = (service_id) => request('/api/customer/queue/join', { method: 'POST', body: { service_id } });
export const updateCustomerProfile = (payload) => request('/api/customer/profile', { method: 'PUT', body: payload });
export const changeCustomerPassword = (payload) => request('/api/customer/password', { method: 'POST', body: payload });
export const deleteCustomerAccount = (password) => request('/api/customer/account', { method: 'DELETE', body: { password } });
export const updateCustomerPriority = (tokenId, priority_level) => request(`/api/customer/queue/${tokenId}/priority`, { method: 'POST', body: { priority_level } });
export const exitCustomerQueue = (tokenId) => request(`/api/customer/queue/${tokenId}/exit`, { method: 'POST' });
export const moveCustomerBack = (tokenId) => request(`/api/customer/queue/${tokenId}/move-back`, { method: 'POST' });

// ---------------------------------------------------------------- realtime
/** Opens the live-update socket and reconnects with backoff. Returns { close }. Polling in App.jsx is the fallback. */
export const createWebSocketConnection = (onMessage) => {
  let ws = null;
  let closed = false;
  let attempt = 0;
  let timer = null;

  const url = () => {
    if (API_BASE_URL) return `${API_BASE_URL.replace(/^http/, 'ws')}/ws/queue`;
    return `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws/queue`;
  };

  const connect = () => {
    if (closed) return;
    try {
      ws = new WebSocket(url());
    } catch {
      return;
    }
    ws.onopen = () => { attempt = 0; };
    ws.onmessage = (event) => {
      try { onMessage(JSON.parse(event.data)); } catch { /* ignore non-JSON frames such as "pong" */ }
    };
    ws.onclose = () => {
      if (closed) return;
      attempt += 1;
      timer = setTimeout(connect, Math.min(30000, 1000 * 2 ** Math.min(attempt, 5)));
    };
  };
  connect();

  return { close: () => { closed = true; clearTimeout(timer); if (ws) ws.close(); } };
};
