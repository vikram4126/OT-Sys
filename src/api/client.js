import axios from 'axios';
import { VULN_SEED } from '../services/vulnSeed';
import { scoreVulnerability } from '../services/scoringEngine';
import {
  getAcceptedComplementaryVulns,
  getManuallyAddedVulns,
  getDeletedVulnIds,
  applyVulnOverride,
} from '../services/assessmentStore';
import { getFreshBearerToken } from '../authConfig';

// Helper to read a cookie by name
export function getCookie(name) {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(
    new RegExp('(?:^|;\\s*)' + name + '=([^;]+)', 'i')
  );
  return match ? decodeURIComponent(match[1].trim()) : '';
}

// CSRF Token Management
// Double Submit Cookie pattern: Header value MUST match the server-issued cookie.
// Live document.cookie has 1st priority; localStorage is only a fallback.
export function getCsrfToken() {
  // 1. Live document.cookie (Primary source of truth matching backend Set-Cookie)
  try {
    const cookieToken =
      getCookie('csrftoken') ||
      getCookie('csrf_token') ||
      getCookie('fastapi-csrf-token') ||
      getCookie('XSRF-TOKEN');
    if (cookieToken) {
      try {
        localStorage.setItem('ot_csrf_token', cookieToken);
      } catch { }
      return cookieToken;
    }
  } catch { }

  // 2. Fallback to localStorage if cookie is inaccessible
  try {
    const stored = localStorage.getItem('ot_csrf_token');
    if (stored) return stored;
  } catch { }

  return '';
}

export function setCsrfToken(token) {
  if (!token) return;
  try {
    localStorage.setItem('ot_csrf_token', token);
  } catch { }
}

// Absolute URL — overridable via REACT_APP_API_BASE (.env)
// Normalizes URL so both http://localhost:8000 and http://localhost:8000/api work seamlessly
const rawBase = process.env.REACT_APP_API_BASE || 'http://localhost:8000/api';
const baseURL =
  rawBase.endsWith('/api') || rawBase.endsWith('/api/')
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
  } catch { }

  // 2. Attach CSRF token on mutating methods (POST, PUT, PATCH, DELETE)
  const method = (config.method || '').toLowerCase();
  if (['post', 'put', 'patch', 'delete'].includes(method)) {
    let csrf = getCsrfToken();
    if (!csrf) {
      // Auto-fetch fresh token via /health if none present
      try {
        csrf = await initCsrfToken();
      } catch { }
    }
    if (csrf) {
      // Backend CORS whitelist only allows lowercase 'x-csrftoken' without hyphens
      config.headers['x-csrftoken'] = csrf;
    }
  }

  // Ensure withCredentials is always true so cookies are sent/received
  config.withCredentials = true;

  return config;
});

// Intercept responses: automatically extract CSRF token if returned in header or body
api.interceptors.response.use(
  (res) => {
    try {
      const headerToken =
        res.headers?.['x-csrftoken'] || res.headers?.['x-csrf-token'];
      if (headerToken) {
        setCsrfToken(headerToken);
      }
      if (res.data && typeof res.data === 'object') {
        const bodyToken =
          res.data.csrf_token || res.data.csrfToken || res.data.csrf;
        if (bodyToken) {
          setCsrfToken(bodyToken);
        }
      }
      const cookieToken = getCsrfToken();
      if (cookieToken) {
        setCsrfToken(cookieToken);
      }
    } catch { }
    return res;
  },
  (err) => {
    // If CSRF validation failed (403), remove stale token so next request re-fetches
    const detail =
      err.response?.data?.detail ||
      err.response?.data?.message ||
      err.message ||
      '';
    const isCsrfError =
      err.response?.status === 403 &&
      typeof detail === 'string' &&
      detail.toLowerCase().includes('csrf');

    if (isCsrfError) {
      try {
        localStorage.removeItem('ot_csrf_token');
      } catch { }
    }

    // Capture fresh CSRF token even on error response if present
    try {
      const headerToken =
        err.response?.headers?.['x-csrftoken'] ||
        err.response?.headers?.['x-csrf-token'];
      if (headerToken) setCsrfToken(headerToken);
    } catch { }

    const status = err.response?.status;
    const rawDetail = detail || 'Request failed';
    const formattedDetail = Array.isArray(rawDetail)
      ? rawDetail.map((d) => d.msg || JSON.stringify(d)).join('; ')
      : rawDetail;
    const error = new Error(formattedDetail);
    error.status = status;
    error.response = err.response;
    return Promise.reject(error);
  }
);

/**
 * Initializes and fetches the initial CSRF token by pinging /health on first page view
 */
export async function initCsrfToken() {
  try {
    // Check if live cookie already exists
    const liveCookie =
      getCookie('csrftoken') ||
      getCookie('csrf_token') ||
      getCookie('fastapi-csrf-token') ||
      getCookie('XSRF-TOKEN');
    if (liveCookie) {
      setCsrfToken(liveCookie);
      return liveCookie;
    }

    // Ping health endpoint to trigger initial Set-Cookie: csrftoken
    const res = await api.get('/health');
    const token =
      res.headers?.['x-csrftoken'] ||
      res.headers?.['x-csrf-token'] ||
      getCsrfToken();
    if (token) setCsrfToken(token);
    return token;
  } catch {
    return getCsrfToken();
  }
}

// Every mutation a consultant makes to a finding — overrides, manually-added
// findings, deletions, accepted complementary-CVE-lookup suggestions — lives
// entirely client-side (see assessmentStore.js).
function resolveVulns(list) {
  const deleted = new Set(getDeletedVulnIds());
  const rawList = Array.isArray(list)
    ? list
    : list?.items || list?.vulnerabilities || [];
  const normalized = rawList.map((v) => {
    const item = {
      ...v,
      vuln_id: v.vuln_id || v.id,
      id: v.id || v.vuln_id,
      asset_label:
        v.asset_label ||
        v.asset_name ||
        (Array.isArray(v.assets) ? v.assets[0] : '') ||
        '',
      assets: v.assets || (v.asset_label ? [v.asset_label] : []),
      zones: v.zones || (v.zone_id ? [v.zone_id] : []),
    };
    if (item.risk_score == null) {
      return scoreVulnerability(item);
    }
    return item;
  });
  const withExtra = [
    ...normalized,
    ...getAcceptedComplementaryVulns().map(scoreVulnerability),
    ...getManuallyAddedVulns().map(scoreVulnerability),
  ];
  return withExtra
    .filter((v) => !deleted.has(v.vuln_id))
    .map(applyVulnOverride);
}

// Falls back to a local seed when the backend is unreachable
export const getVulnerabilities = (params) =>
  api
    .get('/vulnerabilities/', { params })
    .then((r) => ({ ...r, data: resolveVulns(r.data) }))
    .catch(() => ({ data: resolveVulns(VULN_SEED) }));

// Report generation
export const generateReportDocx = (data) =>
  api.post('/report/docx/', data, { responseType: 'blob' });
export const generateZoneModelPdf = (data) =>
  api.post('/report/zone-model/pdf/', data, { responseType: 'blob' });
export const generateZoneModelDocx = (data) =>
  api.post('/report/zone-model/docx/', data, { responseType: 'blob' });

// Direct endpoints for Zones, Assets, Dashboard Stats, and Compliance
export const getZonesApi = () => api.get('/zones/');
export const getAssetsApi = () => api.get('/assets/');
export const getDashboardStats = () => api.get('/dashboard/stats');
export const getComplianceStatus = () =>
  api.get('/compliance/status').then((r) => r.data);
export const updateComplianceStatus = (data) =>
  api
    .post('/compliance/status', data)
    .then((r) => r.data)
    .catch(() => null);

// Health check endpoint
export const checkBackendHealth = () => api.get('/health');

export default api;

export const mirrorZ = (key, value) => {
  try {
    const next = JSON.stringify(value);
    if (localStorage.getItem(key) !== next) {
      localStorage.setItem(key, next);
      window.dispatchEvent(new Event('assessment-change'));
    }
  } catch { }
};

const mapZoneRow = (r) => ({
  id: r.id,
  name: r.name,
  slT: r.target_sl,
  desc: r.desc,
  airGapped: r.air_gapped,
  conf: 0,
});

export const getZones = () =>
  api.get('/zones/').then((r) => {
    mirrorZ('ot_assess_zones_v2', r.data.map(mapZoneRow));
    return r.data;
  });

export const postZone = (z) =>
  api.post('/zones/', {
    name: z.name,
    target_sl: z.slT ?? 2,
    desc: z.desc || '',
    air_gapped: !!z.air_gapped,
  });

// Optimized parallel fetching of all zone subnet rules
export const getAllZoneRules = async () => {
  try {
    const res = await api.get('/zones/');
    const zones = res.data || [];
    const results = await Promise.all(
      zones.map(async (z) => {
        try {
          const ruleRes = await api.get(`/zones/${z.id}/rules`);
          const rules = ruleRes.data || [];
          return rules.map((r) => ({
            id: r.id,
            cidr: r.cidr,
            zone: r.zone_id || z.id,
            name: r.name || '',
          }));
        } catch {
          return [];
        }
      })
    );
    const all = results.flat();
    mirrorZ('ot_zone_rules_v1', all);
    return all;
  } catch {
    return [];
  }
};

export const postZoneRule = (zoneId, body) =>
  api.post(`/zones/${zoneId}/rules`, body);

export const apiDeleteZoneRule = (ruleId) =>
  api.delete(`/zone-rules/${ruleId}`);

export const getConduits = async () => {
  try {
    const res = await api.get('/conduits/');
    const raw = res.data;
    const list = Array.isArray(raw) ? raw : raw?.items || raw?.conduits || [];
    const mapped = list.map((c) => ({
      id: c.id,
      from: c.from || c.from_zone_id,
      to: c.to || c.to_zone_id,
      name: c.name || 'Conduit',
      protocols: c.protocols || [],
    }));
    mirrorZ('ot_assess_conduits_v2', mapped);
    return mapped;
  } catch {
    return [];
  }
};

const mapAssetRowZ = (r) => ({
  id: r.id,
  zone: r.zone_id,
  shadow: r.shadow,
  name: r.hostname,
  level: r.purdue_level,
  confidence: r.confidence,
  source: r.source,
  deviceType: r.device_type,
  kind: r.kind,
  ip: r.ip,
  mac: r.mac,
  os: r.os,
  version: r.version,
  internetFacing: r.internet_facing,
  observed: r.observed,
});

export const getAssets = async () => {
  try {
    const res = await api.get('/assets/', { params: { limit: 200 } });
    const data = res.data;
    let items = [];
    if (Array.isArray(data)) {
      items = data;
    } else if (data && Array.isArray(data.items)) {
      items = [...data.items];
      let guard = 0;
      const total = data.total || items.length;
      while (items.length < total && guard < 50) {
        const pageRes = await api.get('/assets/', {
          params: { limit: 200, offset: items.length },
        });
        const pageData = pageRes.data;
        const pageItems = Array.isArray(pageData) ? pageData : pageData?.items || [];
        if (!pageItems.length) break;
        items.push(...pageItems);
        guard += 1;
      }
    }
    mirrorZ(
      'ot_assess_assets_v2',
      items.map(mapAssetRowZ).filter((a) => !a.shadow)
    );
    return items;
  } catch {
    return [];
  }
};
