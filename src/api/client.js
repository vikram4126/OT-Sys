import axios from 'axios';
import { VULN_SEED } from '../services/vulnSeed';
import { scoreVulnerability } from '../services/scoringEngine';
import { getAcceptedComplementaryVulns, getManuallyAddedVulns, getDeletedVulnIds, applyVulnOverride } from '../services/assessmentStore';

// CSRF Token Management
// Can be received from login response body, response headers, or cookies
export function getCsrfToken() {
  try {
    const stored = localStorage.getItem('ot_csrf_token');
    if (stored) return stored;
  } catch {}

  try {
    const match = document.cookie.match(/(?:csrftoken|csrf_token|XSRF-TOKEN)=([^;]+)/i);
    if (match) return decodeURIComponent(match[1]);
  } catch {}

  return '';
}

export function setCsrfToken(token) {
  if (!token) return;
  try {
    localStorage.setItem('ot_csrf_token', token);
  } catch {}
}

// Absolute URL — required when serving the built app with `npx serve`
// (the proxy in package.json only works during `npm start`). Overridable via
// REACT_APP_API_BASE (see .env.example) so a production build can point at a
// real host without a source change — falls back to the local dev backend.
const api = axios.create({
  baseURL: process.env.REACT_APP_API_BASE || 'http://127.0.0.1:8000/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT/Bearer token and CSRF token to state-changing requests
api.interceptors.request.use(config => {
  try {
    const token = localStorage.getItem('ot_auth_token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
  } catch {}

  const method = (config.method || '').toLowerCase();
  if (['post', 'put', 'patch', 'delete'].includes(method)) {
    const csrf = getCsrfToken();
    if (csrf) {
      // Set both standard headers for 100% backend compatibility
      config.headers['X-CSRFToken'] = csrf;
      config.headers['X-CSRF-Token'] = csrf;
    }
  }
  return config;
});

// Intercept responses: automatically extract CSRF token if returned in header or body
api.interceptors.response.use(
  res => {
    try {
      const headerToken = res.headers?.['x-csrftoken'] || res.headers?.['x-csrf-token'];
      if (headerToken) {
        setCsrfToken(headerToken);
      }
      if (res.data && typeof res.data === 'object') {
        const bodyToken = res.data.csrf_token || res.data.csrfToken || res.data.csrf;
        if (bodyToken) {
          setCsrfToken(bodyToken);
        }
      }
    } catch {}
    return res;
  },
  err => {
    const msg = err.response?.data?.detail || err.message || 'Request failed';
    return Promise.reject(new Error(msg));
  }
);

// Every mutation a consultant makes to a finding — overrides, manually-added
// findings, deletions, accepted complementary-CVE-lookup suggestions — lives
// entirely client-side (see assessmentStore.js). This is the one funnel every
// caller already goes through, so resolving all of that here means every tab
// (Vulnerabilities, Business Risk, Report, Dashboard) sees the same result
// instead of only whichever screen happened to apply the edit.
function resolveVulns(list) {
  const deleted = new Set(getDeletedVulnIds());
  const withExtra = [
    ...(list || []),
    ...getAcceptedComplementaryVulns().map(scoreVulnerability),
    ...getManuallyAddedVulns().map(scoreVulnerability),
  ];
  return withExtra.filter(v => !deleted.has(v.vuln_id)).map(applyVulnOverride);
}
// Falls back to a local, frontend-only seed when the backend isn't reachable
// (e.g. only the frontend is deployed/copied, with no API behind it) — same
// response shape ({ data: [...] }) either way, so every caller works unchanged.
export const getVulnerabilities    = (params)  => api.get('/vulnerabilities/', { params })
  .then(r => ({ ...r, data: resolveVulns(r.data) }))
  .catch(() => ({ data: resolveVulns(VULN_SEED) }));

// Report generation is the one backend capability with no frontend
// equivalent (python-docx/matplotlib rendering) — stateless, so it works with
// no database behind it, just needs the FastAPI app running.
export const generateReportDocx    = (data)    => api.post('/report/docx/', data, { responseType: 'blob' });
export const generateZoneModelPdf  = (data)    => api.post('/report/zone-model/pdf/', data, { responseType: 'blob' });
export const generateZoneModelDocx = (data)    => api.post('/report/zone-model/docx/', data, { responseType: 'blob' });

// Health check endpoint
export const checkBackendHealth    = ()        => api.get('/health');

export default api;
