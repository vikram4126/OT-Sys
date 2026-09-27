/**
 * modelApi.js — API client connector for all 36 Model endpoints
 * Based on the backend specifications from public/api-links.html
 * 
 * Base URL: https://arc.customappsteam.co.uk/api
 * All requests automatically attach:
 * - Authorization: Bearer <msal_token>
 * - X-CSRFToken / X-CSRF-Token (on mutating requests)
 * - withCredentials: true
 */

import api from './client';

// ── 1. Scope & Context ────────────────────────────────────────────────────────
/** 1. GET /api/model/scope/ — Load company/site scope */
export const getModelScope = () => api.get('/model/scope/').then(r => r.data);

/** 2. PUT /api/model/scope/ — Save the scope form (upsert; audit-logged) */
export const saveModelScope = (data) => api.put('/model/scope/', data).then(r => r.data);

// ── 2. Baseline Snapshot ──────────────────────────────────────────────────────
/** 3. GET /api/model/baseline/ — Latest captured baseline snapshot */
export const getModelBaseline = () => api.get('/model/baseline/').then(r => r.data);

/** 4. POST /api/model/baseline/ — Capture a new baseline from current metrics */
export const captureModelBaseline = (data) => api.post('/model/baseline/', data).then(r => r.data);

// ── 3. Evidence & Drop Scans ──────────────────────────────────────────────────
/** 5. GET /api/model/evidence/groups/ — Evidence groups + per-group progress */
export const getEvidenceGroups = () => api.get('/model/evidence/groups/').then(r => r.data);

/** 6. GET /api/model/evidence/ — Evidence items with status/quality/notes */
export const getEvidenceItems = (params) => api.get('/model/evidence/', { params }).then(r => r.data);

/** 7. PUT /api/model/evidence/{item_id}/ — Update an evidence item */
export const updateEvidenceItem = (itemId, data) => api.put(`/model/evidence/${itemId}/`, data).then(r => r.data);

/** 8. GET /api/model/evidence/findings/ — Findings derived from evidence gaps */
export const getEvidenceFindings = () => api.get('/model/evidence/findings/').then(r => r.data);

/** 9. POST /api/model/evidence/scan/ — Trigger a full evidence-drop scan */
export const scanAllEvidence = () => api.post('/model/evidence/scan/').then(r => r.data);

/** 10. POST /api/model/evidence/scan/{group_id}/ — Scan a single evidence group */
export const scanEvidenceGroup = (groupId) => api.post(`/model/evidence/scan/${groupId}/`).then(r => r.data);

/** 30. GET /api/model/evidence/plan/ — Retrieve generated evidence collection plan */
export const getEvidencePlan = () => api.get('/model/evidence/plan/').then(r => r.data);

// ── 4. Async Jobs: Connections & Reconciliation ───────────────────────────────
/** 11. POST /api/model/parse-connections/ — Kick off async parse of pcap/log blobs */
export const startParseConnections = (data) => api.post('/model/parse-connections/', data).then(r => r.data);

/** 12. GET /api/model/parse-connections/jobs/{job_id} — Poll parse-job progress/results */
export const getParseConnectionsJob = (jobId) => api.get(`/model/parse-connections/jobs/${jobId}`).then(r => r.data);

/** 13. POST /api/model/reconcile/ — Kick off shadow-asset reconciliation */
export const startReconcile = (data) => api.post('/model/reconcile/', data).then(r => r.data);

/** 14. GET /api/model/reconcile/jobs/{job_id} — Poll reconcile-job progress/results */
export const getReconcileJob = (jobId) => api.get(`/model/reconcile/jobs/${jobId}`).then(r => r.data);

// ── 5. Zones Management ───────────────────────────────────────────────────────
/** 15. GET /api/model/zones/ — List zones for Zone modeller */
export const getModelZones = () => api.get('/model/zones/').then(r => r.data);

/** 16. GET /api/model/zones/{zone_id} — Fetch one zone for edit panel */
export const getModelZone = (zoneId) => api.get(`/model/zones/${zoneId}`).then(r => r.data);

/** 17. POST /api/model/zones/ — Create a zone */
export const createModelZone = (data) => api.post('/model/zones/', data).then(r => r.data);

/** 18. PATCH /api/model/zones/{zone_id} — Edit a zone (name, SL-T, purdue, desc) */
export const patchModelZone = (zoneId, data) => api.patch(`/model/zones/${zoneId}`, data).then(r => r.data);

/** 19. GET /api/model/zones/{zone_id}/delete-preview — Preview assets/rules impacted */
export const previewDeleteZone = (zoneId) => api.get(`/model/zones/${zoneId}/delete-preview`).then(r => r.data);

/** 20. DELETE /api/model/zones/{zone_id} — Delete a zone */
export const deleteModelZone = (zoneId) => api.delete(`/model/zones/${zoneId}`).then(r => r.data);

/** 21. GET /api/model/zones/{zone_id}/air-gap-check — Air-gap contradictions */
export const checkZoneAirGap = (zoneId) => api.get(`/model/zones/${zoneId}/air-gap-check`).then(r => r.data);

// ── 6. Subnets & Zone Rules ───────────────────────────────────────────────────
/** 22. GET /api/model/subnets/zones/{zone_id}/rules — List subnet rules for a zone */
export const getZoneSubnetRules = (zoneId) => api.get(`/model/subnets/zones/${zoneId}/rules`).then(r => r.data);

/** 23. POST /api/model/subnets/zones/{zone_id}/rules — Add a CIDR rule to a zone */
export const addZoneSubnetRule = (zoneId, data) => api.post(`/model/subnets/zones/${zoneId}/rules`, data).then(r => r.data);

/** 24. DELETE /api/model/subnets/zone-rules/{rule_id} — Remove a subnet rule */
export const deleteZoneSubnetRule = (ruleId) => api.delete(`/model/subnets/zone-rules/${ruleId}`).then(r => r.data);

/** 25. POST /api/model/zones/assets/auto-assign/ — Re-run auto-assignment */
export const autoAssignZoneAssets = () => api.post('/model/zones/assets/auto-assign/').then(r => r.data);

/** 26. POST /api/model/zones/{zone_id}/assets/{asset_id}/override/ — Pin asset to zone */
export const overrideAssetZone = (zoneId, assetId, data) =>
  api.post(`/model/zones/${zoneId}/assets/${assetId}/override/`, data).then(r => r.data);

// ── 7. Coverage & Asset Analysis ──────────────────────────────────────────────
/** 27. GET /api/model/coverage — Retrieve coverage calculations */
export const getModelCoverage = () => api.get('/model/coverage').then(r => r.data);

/** 28. GET /api/model/assets/unassigned/ — List unassigned assets */
export const getUnassignedAssets = () => api.get('/model/assets/unassigned/').then(r => r.data);

/** 29. GET /api/model/assets/internet-facing/ — Suggested internet-facing assets */
export const getInternetFacingAssets = () => api.get('/model/assets/internet-facing/').then(r => r.data);

// ── 8. IEC 62443 & Compliance ─────────────────────────────────────────────────
/** 31. GET /api/model/62443/evidence-summary/ — IEC 62443 evidence directory metrics */
export const get62443EvidenceSummary = () => api.get('/model/62443/evidence-summary/').then(r => r.data);

/** 32. POST /api/model/62443/prefill/ — Apply evidence-derived prefill recommendations */
export const apply62443Prefill = (data) => api.post('/model/62443/prefill/', data).then(r => r.data);

/** 33. GET /api/model/62443/folder-plan/ — IEC 62443 evidence folder plan */
export const get62443FolderPlan = () => api.get('/model/62443/folder-plan/').then(r => r.data);

/** 34. GET /api/model/workshop-confirmation/pdf/ — Download confirmation PDF */
export const downloadWorkshopConfirmationPdf = () =>
  api.get('/model/workshop-confirmation/pdf/', { responseType: 'blob' });

/** 35. GET /api/model/workshop-confirmation/docx/ — Download confirmation DOCX */
export const downloadWorkshopConfirmationDocx = () =>
  api.get('/model/workshop-confirmation/docx/', { responseType: 'blob' });

/** 36. GET /api/model/compliance-summary/ — Overall modelling/compliance progress */
export const getModelComplianceSummary = () => api.get('/model/compliance-summary/').then(r => r.data);
