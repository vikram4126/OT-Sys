import axios from 'axios';
import { VULN_SEED } from '../services/vulnSeed';
import { scoreVulnerability } from '../services/scoringEngine';
import { getAcceptedComplementaryVulns, getManuallyAddedVulns, getDeletedVulnIds, applyVulnOverride } from '../services/assessmentStore';
import { getFreshBearerToken } from '../authConfig';

// CSRF Token Management
// Can be received from response body, response headers (x-csrftoken), or cookies
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

// Absolute URL — overridable via REACT_APP_API_BASE (.env)
// Normalizes URL so both http://127.0.0.1:8000 and http://127.0.0.1:8000/api work seamlessly
const rawBase = process.env.REACT_APP_API_BASE || 'http://127.0.0.1:8000/api';
const baseURL = (rawBase.endsWith('/api') || rawBase.endsWith('/api/'))
  ? rawBase.replace(/\/+$/, '')
  : rawBase.replace(/\/+$/, '') + '/api';

const api = axios.create({
  baseURL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT/Bearer token and CSRF token to requests
api.interceptors.request.use(async (config) => {
  // 1. Attach Bearer token from MSAL (or fallback localStorage)
  try {
    const token = await getFreshBearerToken();
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
  } catch {}

  // 2. Attach CSRF token on mutating methods (POST, PUT, PATCH, DELETE)
  const method = (config.method || '').toLowerCase();
  if (['post', 'put', 'patch', 'delete'].includes(method)) {
    const csrf = getCsrfToken();
    if (csrf) {
      // Set both standard headers for 100% backend compatibility
      config.headers['X-CSRFToken'] = csrf;
      config.headers['X-CSRF-Token'] = csrf;
    }
  }

  // Ensure withCredentials is always true so cookies are sent/received
  config.withCredentials = true;

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
      const cookieToken = getCsrfToken();
      if (cookieToken) {
        setCsrfToken(cookieToken);
      }
    } catch {}
    return res;
  },
  err => {
    // Capture CSRF token even on error response if present
    try {
      const headerToken = err.response?.headers?.['x-csrftoken'] || err.response?.headers?.['x-csrf-token'];
      if (headerToken) setCsrfToken(headerToken);
    } catch {}

    const status = err.response?.status;
    const detail = err.response?.data?.detail || err.response?.data?.message || err.message || 'Request failed';
    const error = new Error(detail);
    error.status = status;
    error.response = err.response;
    return Promise.reject(error);
  }
);

/**
 * Initializes and fetches the initial CSRF token by pinging /health on first page view
 * As backend team confirmed: "jaise hi hum first time page view karenge to wo token hume mil jayega by api"
 */
export async function initCsrfToken() {
  try {
    const existing = getCsrfToken();
    if (existing) return existing;

    // Ping health endpoint to trigger initial Set-Cookie: csrftoken
    const res = await api.get('/health');
    const token = res.headers?.['x-csrftoken'] || res.headers?.['x-csrf-token'] || getCsrfToken();
    if (token) setCsrfToken(token);
    return token;
  } catch {
    return getCsrfToken();
  }
}

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
export const getVulnerabilities    = (params)  => api.get('/vulnerabilities/', { params })
  .then(r => ({ ...r, data: resolveVulns(r.data) }))
  .catch(() => ({ data: resolveVulns(VULN_SEED) }));

// Report generation
export const generateReportDocx    = (data)    => api.post('/report/docx/', data, { responseType: 'blob' });
export const generateZoneModelPdf  = (data)    => api.post('/report/zone-model/pdf/', data, { responseType: 'blob' });
export const generateZoneModelDocx = (data)    => api.post('/report/zone-model/docx/', data, { responseType: 'blob' });

// Direct endpoints for Zones, Assets, Dashboard Stats, and Compliance
export const getZonesApi           = ()        => api.get('/zones/');
export const getAssetsApi          = ()        => api.get('/assets/');
export const getDashboardStats     = ()        => api.get('/dashboard/stats');
export const getComplianceStatus   = ()        => api.get('/compliance/status').then(r => r.data);
export const updateComplianceStatus = (data)   => api.post('/compliance/status', data).then(r => r.data).catch(() => null);

// Health check endpoint
export const checkBackendHealth    = ()        => api.get('/health');

export default api;
