// ═══════════════════════════════════════════════════════════════
// AkomaHealth — Frontend API Client (api.js)
// Include this script in your HTML before the main app script
// <script src="api.js"></script>
// ═══════════════════════════════════════════════════════════════

const AKOMAHEALTH_API = 'http://localhost:3001'; // Change to your deployed URL in production

// ── Token management ─────────────────────────────────────────
const Auth = {
  getToken:    ()  => localStorage.getItem('akoma_token'),
  setToken:    (t) => localStorage.setItem('akoma_token', t),
  setRefresh:  (t) => localStorage.setItem('akoma_refresh', t),
  getRefresh:  ()  => localStorage.getItem('akoma_refresh'),
  clearTokens: ()  => { localStorage.removeItem('akoma_token'); localStorage.removeItem('akoma_refresh'); },
  isLoggedIn:  ()  => !!localStorage.getItem('akoma_token'),
};

// ── Base fetch with auth header ───────────────────────────────
async function apiCall(path, options = {}) {
  const token = Auth.getToken();
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const res = await fetch(AKOMAHEALTH_API + path, { ...options, headers });

  if (res.status === 401) {
    // Try refresh
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers.Authorization = `Bearer ${Auth.getToken()}`;
      return fetch(AKOMAHEALTH_API + path, { ...options, headers });
    }
    Auth.clearTokens();
    showAuthModal();
    throw new Error('Session expired. Please sign in again.');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed (${res.status})`);
  }
  return res.json();
}

async function tryRefresh() {
  const refresh_token = Auth.getRefresh();
  if (!refresh_token) return false;
  try {
    const data = await fetch(AKOMAHEALTH_API + '/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token }),
    }).then(r => r.json());
    if (data.access_token) { Auth.setToken(data.access_token); Auth.setRefresh(data.refresh_token); return true; }
  } catch { return false; }
  return false;
}

// ── Auth ──────────────────────────────────────────────────────
const API = {
  auth: {
    async signup(email, password, full_name, phone, region, role) {
      return apiCall('/auth/signup', { method: 'POST', body: JSON.stringify({ email, password, full_name, phone, region, role }) });
    },
    async signin(email, password) {
      const data = await apiCall('/auth/signin', { method: 'POST', body: JSON.stringify({ email, password }) });
      Auth.setToken(data.access_token);
      Auth.setRefresh(data.refresh_token);
      return data;
    },
    signout() { Auth.clearTokens(); showAuthModal(); },
    isLoggedIn: Auth.isLoggedIn,
    async me() { return apiCall('/auth/me'); },
  },

  // ── AI ──────────────────────────────────────────────────────
  ai: {
    async malaria({ age, pregnant, region, duration, symptoms, language }) {
      return apiCall('/ai/malaria', { method: 'POST', body: JSON.stringify({ age, pregnant, region, duration, symptoms, language }) });
    },
    async maternal({ who, stage, signs, concern, language }) {
      return apiCall('/ai/maternal', { method: 'POST', body: JSON.stringify({ who, stage, signs, concern, language }) });
    },
    async chat({ messages, language, session_id }) {
      return apiCall('/ai/chat', { method: 'POST', body: JSON.stringify({ messages, language, session_id }) });
    },
  },

  // ── ANC Passport ────────────────────────────────────────────
  anc: {
    async getAll()       { return apiCall('/anc'); },
    async save(visitData) { return apiCall('/anc', { method: 'POST', body: JSON.stringify(visitData) }); },
  },

  // ── Growth Tracker ───────────────────────────────────────────
  growth: {
    async getChildren()       { return apiCall('/growth'); },
    async getHistory(name)    { return apiCall('/growth/' + encodeURIComponent(name)); },
    async save(record)        { return apiCall('/growth', { method: 'POST', body: JSON.stringify(record) }); },
  },

  // ── CHW Visits ───────────────────────────────────────────────
  chw: {
    async getVisits()    { return apiCall('/chw/visits'); },
    async logVisit(data) { return apiCall('/chw/visits', { method: 'POST', body: JSON.stringify(data) }); },
  },

  // ── Public data ──────────────────────────────────────────────
  outbreak:   () => apiCall('/outbreak'),
  facilities: (region) => apiCall('/facilities' + (region ? `?region=${encodeURIComponent(region)}` : '')),

  // ── Mama Circle ───────────────────────────────────────────────
  mamaCircle: {
    async circles()            { return apiCall('/mama-circle/circles'); },
    async stats(slug)          { return apiCall(`/mama-circle/${slug}/stats`); },

    async join(circle_slug, anon_name) {
      return apiCall('/mama-circle/join', {
        method: 'POST',
        body: JSON.stringify({ circle_slug, anon_name }),
      });
    },

    async messages(slug, { topic, before, limit } = {}) {
      const params = new URLSearchParams();
      if (topic)  params.set('topic',  topic);
      if (before) params.set('before', before);
      if (limit)  params.set('limit',  limit);
      const qs = params.toString();
      return apiCall(`/mama-circle/${slug}/messages${qs ? '?' + qs : ''}`);
    },

    async post(slug, { content, topic, message_type, milestone_data } = {}) {
      return apiCall(`/mama-circle/${slug}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content, topic, message_type, milestone_data }),
      });
    },

    async react(messageId, emoji) {
      return apiCall(`/mama-circle/messages/${messageId}/react`, {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      });
    },

    async pin(messageId) {
      return apiCall(`/mama-circle/messages/${messageId}/pin`, { method: 'PUT' });
    },

    async delete(messageId) {
      return apiCall(`/mama-circle/messages/${messageId}`, { method: 'DELETE' });
    },

    async members(slug) {
      return apiCall(`/mama-circle/${slug}/members`);
    },
  },

  // ── Profile ──────────────────────────────────────────────────
  profile: {
    async update(data) { return apiCall('/profile', { method: 'PUT', body: JSON.stringify(data) }); },
  },
};

// ── Auth Modal ───────────────────────────────────────────────
// Shows a sign-in / sign-up overlay when the user is not authenticated
function showAuthModal() {
  let modal = document.getElementById('auth-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'auth-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;font-family:Nunito,sans-serif';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:20px;padding:2rem;width:90%;max-width:380px;box-shadow:0 8px 40px rgba(0,0,0,0.2)">
        <div style="text-align:center;margin-bottom:1.25rem">
          <div style="width:48px;height:48px;background:#52B788;border-radius:14px;display:flex;align-items:center;justify-content:center;margin:0 auto 12px">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1B4332" stroke-width="2.5" stroke-linecap="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
          </div>
          <div style="font-family:Playfair Display,serif;font-size:20px;font-weight:700;color:#1B4332">AkomaHealth</div>
          <div style="font-size:12px;color:#888;margin-top:3px">Sign in to save your health records</div>
        </div>
        <div id="auth-error" style="display:none;background:#FFEBEE;border:1.5px solid #EF9A9A;border-radius:10px;padding:8px 12px;font-size:12.5px;color:#C62828;margin-bottom:10px;font-weight:600"></div>
        <div style="margin-bottom:10px">
          <label style="font-size:11px;font-weight:700;color:#1B4332;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:4px">Email</label>
          <input id="auth-email" type="email" placeholder="your@email.com" style="width:100%;border:1.5px solid #D4E6D9;border-radius:10px;padding:9px 12px;font-size:13.5px;font-family:Nunito,sans-serif;outline:none"/>
        </div>
        <div style="margin-bottom:10px">
          <label style="font-size:11px;font-weight:700;color:#1B4332;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:4px">Password</label>
          <input id="auth-password" type="password" placeholder="••••••••" style="width:100%;border:1.5px solid #D4E6D9;border-radius:10px;padding:9px 12px;font-size:13.5px;font-family:Nunito,sans-serif;outline:none"/>
        </div>
        <div id="signup-fields" style="display:none;margin-bottom:10px">
          <label style="font-size:11px;font-weight:700;color:#1B4332;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:4px">Full Name</label>
          <input id="auth-name" type="text" placeholder="e.g. Abena Mensah" style="width:100%;border:1.5px solid #D4E6D9;border-radius:10px;padding:9px 12px;font-size:13.5px;font-family:Nunito,sans-serif;outline:none;margin-bottom:8px"/>
          <label style="font-size:11px;font-weight:700;color:#1B4332;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:4px">Your Region</label>
          <select id="auth-region" style="width:100%;border:1.5px solid #D4E6D9;border-radius:10px;padding:9px 12px;font-size:13.5px;font-family:Nunito,sans-serif;outline:none">
            <option value="">Select region</option>
            <option>Northern Region</option><option>Upper East Region</option><option>Upper West Region</option>
            <option>Savannah Region</option><option>Greater Accra Region</option><option>Ashanti Region</option>
            <option>Eastern Region</option><option>Central Region</option><option>Western Region</option>
            <option>Volta Region</option><option>Bono Region</option><option>Bono East Region</option>
            <option>Ahafo Region</option><option>North East Region</option><option>Oti Region</option>
            <option>Western North Region</option>
          </select>
        </div>
        <button id="auth-submit-btn" onclick="submitAuth()" style="width:100%;padding:12px;background:#1B4332;border:none;border-radius:11px;color:#fff;font-size:14px;font-weight:700;font-family:Nunito,sans-serif;cursor:pointer;margin-bottom:10px">Sign In</button>
        <div style="text-align:center">
          <button id="auth-toggle" onclick="toggleAuthMode()" style="background:none;border:none;font-size:12.5px;color:#52B788;cursor:pointer;font-weight:700;font-family:Nunito,sans-serif">Don't have an account? Create one</button>
        </div>
        <div style="text-align:center;margin-top:8px">
          <button onclick="continueAsGuest()" style="background:none;border:none;font-size:11.5px;color:#999;cursor:pointer;font-family:Nunito,sans-serif;font-weight:600">Continue as guest (data won't be saved)</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }
  modal.style.display = 'flex';
}

let isSignUpMode = false;
function toggleAuthMode() {
  isSignUpMode = !isSignUpMode;
  document.getElementById('signup-fields').style.display = isSignUpMode ? 'block' : 'none';
  document.getElementById('auth-submit-btn').textContent = isSignUpMode ? 'Create Account' : 'Sign In';
  document.getElementById('auth-toggle').textContent = isSignUpMode ? 'Already have an account? Sign in' : "Don't have an account? Create one";
}

async function submitAuth() {
  const email    = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const errEl    = document.getElementById('auth-error');
  errEl.style.display = 'none';

  try {
    if (isSignUpMode) {
      const name   = document.getElementById('auth-name').value.trim();
      const region = document.getElementById('auth-region').value;
      await API.auth.signup(email, password, name, '', region, 'patient');
      // Auto sign in after signup
      await API.auth.signin(email, password);
    } else {
      await API.auth.signin(email, password);
    }
    document.getElementById('auth-modal').style.display = 'none';
    if (typeof onAuthSuccess === 'function') onAuthSuccess();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  }
}

function continueAsGuest() {
  document.getElementById('auth-modal').style.display = 'none';
}

// ── Auto-show auth on load if not signed in ───────────────────
window.addEventListener('DOMContentLoaded', () => {
  if (!Auth.isLoggedIn()) showAuthModal();
});
