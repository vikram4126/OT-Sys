/**
 * apiDiagnostics.js — Diagnostic probe for testing Backend APIs
 * Logs data returned by developer endpoints in browser console.
 */
import api from './client';

export async function runApiDiagnostics() {
  console.group('[API Diagnostics] Probing Developer Endpoints');

  const endpoints = [
    { label: 'Zones (Section 7.2)', url: '/zones/', method: 'get' },
    { label: 'Conduits (Section 7.13)', url: '/conduits/', method: 'get' },
    { label: 'Assets (Section 10.2)', url: '/assets/', method: 'get' },
    { label: 'Evidence Checklist (Section 8.2)', url: '/model/evidence/', method: 'get' },
    { label: 'Evidence Findings (Section 8.3)', url: '/model/evidence/findings/', method: 'get' },
    { label: 'Compliance Summary (Section 9.6)', url: '/compliance/summary', method: 'get' },
    { label: 'Compliance Status (Section 9.4)', url: '/compliance/status', method: 'get' }
  ];

  const results = [];

  for (const ep of endpoints) {
    try {
      const res = await api[ep.method](ep.url);
      const data = res.data;
      const count = Array.isArray(data) ? data.length : (typeof data === 'object' && data ? Object.keys(data).length : 'N/A');
      results.push({
        'Feature': ep.label,
        'Endpoint': ep.url,
        'Status': '200 OK',
        'Count': count
      });
      console.log(`[OK] ${ep.label}:`, data);
    } catch (err) {
      const status = err.response ? `${err.response.status} ${err.response.statusText}` : err.message;
      results.push({
        'Feature': ep.label,
        'Endpoint': ep.url,
        'Status': status,
        'Count': 'N/A'
      });
      console.warn(`[Failed] ${ep.label} (${ep.url}):`, status);
    }
  }

  console.table(results);
  console.groupEnd();
  return results;
}

if (typeof window !== 'undefined') {
  window.probeApis = runApiDiagnostics;
}
