/**
 * modelApi.js — Central API Connector matching ARC REST API Documentation (api-docx.md)
 *
 * Base URL: http://localhost:8000/api (or as configured in .env REACT_APP_API_BASE)
 *
 * CSRF Protection (as per Developer Docx Section 3 & 4):
 * - State-changing requests (POST, PATCH, PUT, DELETE) automatically send:
 *   Cookie: csrftoken={csrf-token}
 *   x-csrftoken: {csrf-token}
 * - GET requests do not require CSRF headers.
 * - Managed automatically by src/api/client.js interceptors.
 */

import api from './client';

// ── Scope, Baseline & Model Context Helpers ────────────────────────────────────
export const getModelScope = () =>
  api
    .get('/model/scope/')
    .then((r) => r.data)
    .catch(() => null);
export const saveModelScope = (data) =>
  api
    .put('/model/scope/', data)
    .then((r) => r.data)
    .catch(() => null);
export const getModelBaseline = () =>
  api
    .get('/model/baseline/')
    .then((r) => r.data)
    .catch(() => null);
export const captureModelBaseline = (data) =>
  api
    .post('/model/baseline/', data)
    .then((r) => r.data)
    .catch(() => null);
export const getEvidencePlan = () =>
  api
    .get('/model/evidence/plan/')
    .then((r) => r.data)
    .catch(() => null);
export const overrideAssetZone = (zoneId, assetId, data) =>
  api
    .post(`/zones/${zoneId}/override/`, { asset_id: assetId, ...data })
    .then((r) => r.data)
    .catch(() => null);

// ═══════════════════════════════════════════════════════════════════════════════
// 6. MODELS (/api/model) — backend/app/features/model/router.py
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 6.2 POST /api/model/parse-connections/
 * Parses network-discovery export files (.json, .pcap, .raw, etc.) stored in Azure Blob Storage.
 * @param {{ files: string[] }} data - Array of 1-50 blob file-name strings
 */
export const startParseConnections = (data) =>
  api.post('/model/parse-connections/', data).then((r) => r.data);

/**
 * 6.3 GET /api/model/parse-connections/jobs/{job_id}
 * Polls the progress and results of a parse job.
 */
export const getParseConnectionsJob = (jobId) =>
  api.get(`/model/parse-connections/jobs/${jobId}`).then((r) => r.data);

/**
 * 6.4 POST /api/model/reconcile/
 * Starts a shadow-asset reconciliation run for the authenticated client.
 */
export const startReconcile = (data = {}) =>
  api.post('/model/reconcile/', data).then((r) => r.data);

/**
 * 6.5 GET /api/model/reconcile/jobs/{job_id}
 * Polls the reconciliation job status (verdicts, findings, queue items).
 */
export const getReconcileJob = (jobId) =>
  api.get(`/model/reconcile/jobs/${jobId}`).then((r) => r.data);

/**
 * 6.6 POST /api/model/uploaded-seeds/load
 * Parses Azure Blob Storage seed files and loads them into seed tables.
 * @param {{ files?: string[] }} [data] - Optional array of up to 20 seed file names
 */
export const loadUploadedSeeds = (data = {}) =>
  api.post('/model/uploaded-seeds/load', data).then((r) => r.data);

// ═══════════════════════════════════════════════════════════════════════════════
// 7. ZONES, SUBSETS (ZONE RULES) & CONDUITS (/api/zones, /api/zone-rules, /api/conduits)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 7.2 GET /api/zones/
 * Returns all zones for the authenticated client.
 */
export const getZones = () => api.get('/zones/').then((r) => r.data);
export const getModelZones = getZones; // Alias

/**
 * 7.3 GET /api/zones/{zone_id}
 * Returns one zone for the authenticated client.
 */
export const getZone = (zoneId) =>
  api.get(`/zones/${zoneId}`).then((r) => r.data);
export const getModelZone = getZone; // Alias

/**
 * 7.4 POST /api/zones/
 * Creates a new zone.
 * Body: { name, desc, purdue_level, target_sl, criticality, exposure, air_gapped }
 */
export const createZone = (data) =>
  api.post('/zones/', data).then((r) => r.data);
export const createModelZone = createZone; // Alias

/**
 * 7.5 PATCH /api/zones/{zone_id}
 * Updates an existing zone (e.g. target_sl, air_gapped, name, desc).
 */
export const patchZone = (zoneId, data) =>
  api.patch(`/zones/${zoneId}`, data).then((r) => r.data);
export const patchModelZone = patchZone; // Alias

/**
 * 7.6 PATCH /api/zones/batch
 * Atomically updates 1-100 zones.
 * Body: { updates: [{ zone_id, changes: { target_sl, ... } }] }
 */
export const batchUpdateZones = (updates) =>
  api.patch('/zones/batch', { updates }).then((r) => r.data);

/**
 * 7.7 POST /api/zones/{zone_id}/override/
 * Applies an override with reason.
 */
export const applyZoneOverride = (zoneId, reason) =>
  api.post(`/zones/${zoneId}/override/`, { reason }).then((r) => r.data);

/**
 * 7.7 DELETE /api/zones/{zone_id}/override/
 * Clears an override on a zone.
 */
export const clearZoneOverride = (zoneId) =>
  api.delete(`/zones/${zoneId}/override/`).then((r) => r.data);

/**
 * 7.8 GET /api/zones/{zone_id}/delete-preview
 * Previews zone deletion impact (asset_count, conduit_count).
 */
export const previewDeleteZone = (zoneId) =>
  api.get(`/zones/${zoneId}/delete-preview`).then((r) => r.data);

/**
 * 7.8 DELETE /api/zones/{zone_id}
 * Deletes the zone. Associated conduits are removed and mapped assets detached.
 */
export const deleteZone = (zoneId) =>
  api.delete(`/zones/${zoneId}`).then((r) => r.data);
export const deleteModelZone = deleteZone; // Alias

/**
 * 7.9 GET /api/zones/{zone_id}/air-gap-check
 * Checks air-gap consistency and returns detected contradictions.
 */
export const checkZoneAirGap = (zoneId) =>
  api.get(`/zones/${zoneId}/air-gap-check`).then((r) => r.data);

// ── Subnet Segmentation (Zone Rules) ──────────────────────────────────────────

/**
 * 7.10 GET /api/zones/{zone_id}/rules
 * Returns all mapped subnet/CIDR rules for a specific zone.
 */
export const getZoneRules = (zoneId) =>
  api.get(`/zones/${zoneId}/rules`).then((r) => r.data);
export const getZoneSubnetRules = getZoneRules; // Alias

/**
 * 7.11 POST /api/zones/{zone_id}/rules
 * Creates a normalized CIDR rule mapped to a zone.
 * Body: { cidr: "10.20.0.0/24", name?: "Control VLAN" }
 */
export const createZoneRule = (zoneId, data) =>
  api.post(`/zones/${zoneId}/rules`, data).then((r) => r.data);
export const addZoneSubnetRule = createZoneRule; // Alias

/**
 * 7.12 DELETE /api/zone-rules/{rule_id}
 * Deletes a subnet rule by its rule_id.
 */
export const deleteZoneRule = (ruleId) =>
  api.delete(`/zone-rules/${ruleId}`).then((r) => r.data);
export const deleteZoneSubnetRule = deleteZoneRule; // Alias

// ── Conduits ──────────────────────────────────────────────────────────────────

/**
 * 7.13 GET /api/conduits/
 * Returns all conduits for the authenticated client.
 */
export const getConduits = () => api.get('/conduits/').then((r) => r.data);

/**
 * 7.14 POST /api/conduits/
 * Creates a conduit connecting two zones.
 * Body: { from_zone_id, to_zone_id, name, protocols }
 */
export const createConduit = (data) =>
  api.post('/conduits/', data).then((r) => r.data);

/**
 * 7.15 DELETE /api/conduits/{conduit_id}
 * Deletes a conduit by ID.
 */
export const deleteConduit = (conduitId) =>
  api.delete(`/conduits/${conduitId}`).then((r) => r.data);

// ═══════════════════════════════════════════════════════════════════════════════
// 8. EVIDENCE (/api/model/evidence)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 8.2 GET /api/model/evidence/
 * Returns the evidence checklist divided into received and missing items with progress.
 */
export const getEvidenceList = () =>
  api.get('/model/evidence/').then((r) => r.data);
export const getEvidenceItems = getEvidenceList; // Alias

/**
 * 8.3 GET /api/model/evidence/findings/
 * Returns evidence findings and blind spots.
 */
export const getEvidenceFindings = () =>
  api.get('/model/evidence/findings/').then((r) => r.data);

/**
 * 8.4 PUT /api/model/evidence/{item_id}/
 * Updates the status or quality of an evidence item.
 * Body: { status?: "received"|"pending"|"unavailable"|"na", quality?: "complete"|"partial" }
 */
export const updateEvidenceItem = (itemId, data) =>
  api.put(`/model/evidence/${itemId}/`, data).then((r) => r.data);

/**
 * 8.5 GET /api/model/evidence/groups/
 * Returns the 6 evidence group tiles with progress and scan states.
 */
export const getEvidenceGroups = () =>
  api.get('/model/evidence/groups/').then((r) => r.data);

/**
 * 8.6 POST /api/model/evidence/scan/
 * Starts a background scan for all evidence groups.
 */
export const scanAllEvidence = () =>
  api.post('/model/evidence/scan/').then((r) => r.data);

/**
 * 8.7 POST /api/model/evidence/scan/{group_id}/
 * Starts a background scan for one evidence group (docs, inv, network, access, ops, people).
 */
export const scanEvidenceGroup = (groupId) =>
  api.post(`/model/evidence/scan/${groupId}/`).then((r) => r.data);

// ═══════════════════════════════════════════════════════════════════════════════
// 9. COMPLIANCE (/api/compliance)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 9.2 GET /api/compliance/fr
 * Returns the IEC 62443 functional-requirement catalogue.
 */
export const getComplianceFR = () =>
  api.get('/compliance/fr').then((r) => r.data);

/**
 * 9.3 GET /api/compliance/sr
 * Returns the system-requirement catalogue, optionally filtered by FR.
 */
export const getComplianceSR = (fr) =>
  api.get('/compliance/sr', { params: fr ? { fr } : {} }).then((r) => r.data);

/**
 * 9.4 GET /api/compliance/status
 * Returns SR assessment statuses, optionally filtered by zone_id.
 */
export const getComplianceStatus = (zoneId) =>
  api
    .get('/compliance/status', { params: zoneId ? { zone_id: zoneId } : {} })
    .then((r) => r.data);

/**
 * 9.5 PUT /api/compliance/status/{zone_id}/{sr_id}
 * Sets an SR assessment status (met, partial, missing, blocked).
 * Body: { status: "met"|"partial"|"missing"|"blocked", evidence_refs?: string[] }
 */
export const setComplianceStatus = (zoneId, srId, data) =>
  api.put(`/compliance/status/${zoneId}/${srId}`, data).then((r) => r.data);

/**
 * 9.6 GET /api/compliance/summary
 * Returns one compliance summary per zone.
 */
export const getComplianceSummary = () =>
  api.get('/compliance/summary').then((r) => r.data);

/**
 * 9.7 GET /api/compliance/diagram
 * Returns zones, conduits, and current SR statuses for diagram rendering.
 */
export const getComplianceDiagram = () =>
  api.get('/compliance/diagram').then((r) => r.data);

/**
 * 9.8 GET /api/compliance/zones/{zone_id}/requirements
 * Returns the applicable requirements for a zone grouped by FR theme.
 */
export const getZoneRequirements = (zoneId) =>
  api.get(`/compliance/zones/${zoneId}/requirements`).then((r) => r.data);

/**
 * 9.9 GET /api/compliance/conduits/{conduit_id}/requirements
 * Returns the applicable requirements for a conduit.
 */
export const getConduitRequirements = (conduitId) =>
  api.get(`/compliance/conduits/${conduitId}/requirements`).then((r) => r.data);

// ═══════════════════════════════════════════════════════════════════════════════
// 10. ASSETS (/api/assets)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 10.2 GET /api/assets/
 * Lists assets, optionally filtered by zone_id.
 */
export const getAssets = (zoneId) =>
  api
    .get('/assets/', { params: zoneId ? { zone_id: zoneId } : {} })
    .then((r) => r.data);

/**
 * 10.3 GET /api/assets/{asset_id}
 * Gets a single asset by ID.
 */
export const getAsset = (assetId) =>
  api.get(`/assets/${assetId}`).then((r) => r.data);

/**
 * 10.4 POST /api/assets/
 * Creates a new asset.
 */
export const createAsset = (data) =>
  api.post('/assets/', data).then((r) => r.data);

/**
 * 10.5 PATCH /api/assets/{asset_id}
 * Updates an asset (purdue_level, confidence, zone_id, internet_facing, etc.).
 */
export const patchAsset = (assetId, data) =>
  api.patch(`/assets/${assetId}`, data).then((r) => r.data);

/**
 * 10.6 DELETE /api/assets/{asset_id}
 * Deletes an asset.
 */
export const deleteAsset = (assetId) =>
  api.delete(`/assets/${assetId}`).then((r) => r.data);

/**
 * 10.7 GET /api/assets/internet-facing-suggestions/
 * Returns asset suggestions that may be internet-facing.
 */
export const getInternetFacingSuggestions = () =>
  api.get('/assets/internet-facing-suggestions/').then((r) => r.data);

/**
 * 10.8 POST /api/assets/internet-facing-suggestions/{asset_id}/confirm/
 * Confirms an internet-facing suggestion.
 */
export const confirmInternetFacingSuggestion = (assetId) =>
  api
    .post(`/assets/internet-facing-suggestions/${assetId}/confirm/`)
    .then((r) => r.data);

/**
 * 10.9 POST /api/assets/internet-facing-suggestions/{asset_id}/dismiss/
 * Dismisses an internet-facing suggestion.
 */
export const dismissInternetFacingSuggestion = (assetId) =>
  api
    .post(`/assets/internet-facing-suggestions/${assetId}/dismiss/`)
    .then((r) => r.data);
