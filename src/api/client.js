import axios from 'axios';
import { VULN_SEED } from '../services/vulnSeed';
import { scoreVulnerability } from '../services/scoringEngine';
import { getAcceptedComplementaryVulns, getManuallyAddedVulns, getDeletedVulnIds, applyVulnOverride } from '../services/assessmentStore';

// CSRF token read from cookie set by Django on first response
function getCsrfToken() {
  const match = document.cookie.match(/csrftoken=([^;]+)/);
  return match ? match[1] : '';
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

// Attach CSRF token to every state-changing request
api.interceptors.request.use(config => {
  if (['post','put','patch','delete'].includes(config.method)) {
    config.headers['X-CSRFToken'] = getCsrfToken();
  }
  return config;
});

// Normalise errors — never expose raw server messages to the UI
api.interceptors.response.use(
  r => r,
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

export default api;
