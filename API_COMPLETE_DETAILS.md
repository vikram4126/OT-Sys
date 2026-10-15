# OT-Synapse: Complete API Integration, Mapping & Debugging Report

> **Document Summary:** Complete technical documentation of all Backend (FastAPI) API endpoints, exact code locations for POST/PUT/DELETE operations, data models and key comparisons from `src/screens`, error root causes, page-wise usage mappings, and the solution for repeated/looping API calls.

---

## 1. Exact Code Locations for POST, PUT/PATCH, and DELETE APIs

All CRUD operations are centralized in **`src/services/assessmentStore.js`** inside the custom hook `useAssessment()`. This ensures that any UI change triggered from any tab (Model, Assets, Compliance, etc.) automatically sends the required HTTP request to the backend with Bearer Token and CSRF headers attached.

| Module | Operation | HTTP Method | Endpoint URL | File & Line Number | Request Body / Payload |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Zones** | Add Zone | `POST` | `/api/zones/` | [`src/services/assessmentStore.js:1301`](file:///Users/vikram/Desktop/Antigravity/OT-synapse/src/services/assessmentStore.js#L1301) | `{ name, desc, purdue_level, target_sl, criticality, exposure, air_gapped }` |
| **Zones** | Edit Zone | `PATCH` | `/api/zones/{zone_id}` | [`src/services/assessmentStore.js:1339`](file:///Users/vikram/Desktop/Antigravity/OT-synapse/src/services/assessmentStore.js#L1339) | `{ name, desc, target_sl, purdue_level, air_gapped }` |
| **Zones** | Delete Zone | `DELETE` | `/api/zones/{zone_id}` | [`src/services/assessmentStore.js:1355`](file:///Users/vikram/Desktop/Antigravity/OT-synapse/src/services/assessmentStore.js#L1355) | None (Path ID only) |
| **Assets** | Add Asset | `POST` | `/api/assets/` | [`src/services/assessmentStore.js:1416`](file:///Users/vikram/Desktop/Antigravity/OT-synapse/src/services/assessmentStore.js#L1416) | `{ hostname, ip, vendor, model, device_type, purdue_level, confidence, zone_id }` |
| **Assets** | Edit Asset | `PATCH` | `/api/assets/{asset_id}` | [`src/services/assessmentStore.js:1451`](file:///Users/vikram/Desktop/Antigravity/OT-synapse/src/services/assessmentStore.js#L1451) | `{ purdue_level, confidence, hostname, ip, ... }` |
| **Assets** | Delete Asset | `DELETE` | `/api/assets/{asset_id}` | [`src/services/assessmentStore.js:1463`](file:///Users/vikram/Desktop/Antigravity/OT-synapse/src/services/assessmentStore.js#L1463) | None (Path ID only) |
| **Conduits** | Add Conduit | `POST` | `/api/conduits/` | [`src/services/assessmentStore.js:1258`](file:///Users/vikram/Desktop/Antigravity/OT-synapse/src/services/assessmentStore.js#L1258) | `{ from_zone_id, to_zone_id, name, protocols }` |
| **Conduits** | Delete Conduit | `DELETE` | `/api/conduits/{conduit_id}` | [`src/services/assessmentStore.js:1278`](file:///Users/vikram/Desktop/Antigravity/OT-synapse/src/services/assessmentStore.js#L1278) | None (Path ID only) |
| **Compliance** | Update Status | `PUT` | `/api/compliance/status/{zone_id}/{sr_id}` | [`src/services/assessmentStore.js:1472`](file:///Users/vikram/Desktop/Antigravity/OT-synapse/src/services/assessmentStore.js#L1472) | `{ status: "met"\|"partial"\|"blocked", evidence_refs: [] }` |

> In addition, all 36 granular API connectors are exported in [`src/api/modelApi.js`](file:///Users/vikram/Desktop/Antigravity/OT-synapse/src/api/modelApi.js).

### 1.1 How Dynamic IDs (`{zone_id}`, `{asset_id}`, `{conduit_id}`, `{sr_id}`) are Picked Automatically:
When a user interacts with the UI:
1. **Zones (`{zone_id}`)**:
   - When you click on a zone or its Edit/Delete button, the component (`ModelTab.jsx` or `ZoneDetailModal.jsx`) already holds the selected zone object `zone.id` (e.g. `"Z-CTRL"`).
   - Calling `updateZone(id, patch)` or `deleteZone(id)` automatically forwards this `id` directly into the path parameter: `/api/zones/${encodeURIComponent(id)}`.
2. **Assets (`{asset_id}`)**:
   - When opening an asset row or modal, `asset.id` is passed to `updateAsset(assetId, patch)` or `deleteAsset(assetId)`. It automatically resolves to `/api/assets/${encodeURIComponent(assetId)}`.
3. **Conduits (`{conduit_id}`)**:
   - When deleting or inspecting a link, the edge `conduit.id` (UUID generated on creation) is passed to `deleteConduit(id)`.
4. **Compliance Status (`{zone_id}/{sr_id}`)**:
   - In the compliance matrix, the user selects a zone filter (e.g., `"Z-OPS"`) and clicks a status button on an SR card (e.g., `"SR1.7"`). `setRequirementStatus(zoneId, srId, status)` automatically injects both IDs into `/api/compliance/status/${encodeURIComponent(zoneId)}/${encodeURIComponent(srId)}`.
   - **No manual ID typing is required anywhere in the application.**

---

## 2. API Response Data vs Frontend Keys Comparison (Screenshots Analysis)

Analysis based on live screenshots captured in `src/screens/` (1.jpeg to 8.jpeg):

### A. Zones API (`GET /api/zones/`) — (Screens 2 & 7)
* **Backend Returns:**
  ```json
  [
    {
      "id": "Z-ENT",
      "client_id": "dev-client-001",
      "name": "Enterprise",
      "desc": "Corporate IT, ERP, domain",
      "purdue_level": 3,
      "target_sl": 2,
      "criticality": 0.74,
      "exposure": 0.74,
      "air_gapped": false,
      "created_at": "2026-08-17T22:12:46.462832Z"
    }
  ]
  ```
* **Frontend Binding in `assessmentStore.js`:**
  * `id`: `z.id` ("Z-ENT", "Z-DMZ", "Z-OPS", "Z-CTRL", "Z-SAF") — **Exact Match**
  * `name`: `z.name` — **Exact Match**
  * `desc`: `z.desc` — **Exact Match**
  * `slT`: `z.slT ?? z.sl_t ?? z.target_sl ?? 2` — **Exact Match**
  * `purdue_level`, `criticality`, `exposure`, `air_gapped` — **Exact Match**

### B. Conduits API (`GET /api/conduits/`) — (Screen 3)
* **Backend Returns:**
  ```json
  [
    {
      "id": "818bb1d1-9e96-4768-ac4f-6323f314c587",
      "client_id": "dev-client-001",
      "from_zone_id": "Z-ENT",
      "to_zone_id": "Z-DMZ",
      "name": "OT Conduit",
      "protocols": ["UDP", "acl-rule"],
      "created_at": "2026-09-17T10:12:14.441507Z"
    }
  ]
  ```
* **Frontend Binding in `assessmentStore.js`:**
  * `from`: `c.from || c.from_zone_id` — **Exact Match**
  * `to`: `c.to || c.to_zone_id` — **Exact Match**
  * `name`: `c.name` — **Exact Match**
  * `protocols`: `c.protocols` — **Exact Match**

### C. Compliance Status API (`GET /api/compliance/status`) — (Screen 4)
* **Backend Returns (86 items):**
  ```json
  {
    "client_id": "dev-client-001",
    "zone_id": "Z-OPS",
    "sr_id": "SR1.7",
    "status": "partial",
    "evidence_refs": [],
    "assessed_at": "2026-09-28T09:56:24.784747Z",
    "assessed_by": ""
  }
  ```
* **Frontend Binding in `assessmentStore.js`:**
  * Maps `zone_id` + `sr_id` + `status` ("met", "partial", "blocked") to compliance categories. — **Exact Match**

### D. User Profile API (`GET /api/auth/me`) — (Screen 5)
* **Backend Returns:**
  ```json
  {
    "user_id": "d9141c5e-f39f-498c-9a54-0e1f95ee5cb2",
    "client_id": "dev-client-001",
    "name": "Vikram Kumar",
    "email": "vikramkumar4@kpmg.com",
    "is_admin": true,
    "role": "Lead Analyst",
    "status": "active",
    "permissions": ["view", "edit", "override", "report", "admin"]
  }
  ```
* **Frontend Binding in `authService.js`:**
  * Populates user profile, admin privileges, and initials avatar. — **Exact Match**

### E. Health API (`GET /health`) — (Screen 6)
* **Backend Returns:**
  * Overall health and status array of 7 microservices (`PostgreSQL Database`, `Neo4j Database`, `Azure Key Vault`, `PGVector`, `Audit Logging`).

### F. Vulnerabilities API (`GET /api/vulnerabilities/`) — (Screen 8)
* **Backend Returns:**
  ```json
  {
    "id": "V-1003",
    "client_id": "dev-client-001",
    "title": "Default vendor credentials on HMI",
    "cve_id": "CVE-2022-38765",
    "cvss": 9.4,
    "cwe": "CWE-798",
    "risk_score": null,
    "zones": ["Z-CTRL"],
    "asset_label": "HMI-OPS-01",
    "target_sl": 3,
    "status": "Open"
  }
  ```
* **Key Difference & Fix:**
  * Backend sends `id`, while frontend components expect `vuln_id`.
  * Backend sends `risk_score: null`.
  * **Fix Applied in [`src/api/client.js:132`](file:///Users/vikram/Desktop/Antigravity/OT-synapse/src/api/client.js#L132):**
    ```javascript
    vuln_id: v.vuln_id || v.id,
    id: v.id || v.vuln_id,
    asset_label: v.asset_label || (Array.isArray(v.assets) ? v.assets[0] : ''),
    // Automatically runs frontend scoringEngine when risk_score is null:
    if (item.risk_score == null) return scoreVulnerability(item);
    ```

---

## 3. Analysis of Errors in `src/screens`

### 1. `assets/` 500 Internal Server Error (Screens 1 & 2)
* **Error Message in Console:**
  ```text
  GET http://localhost:8000/api/assets/ net::ERR_FAILED 500 (Internal Server Error)
  assessmentStore.js:1132
  Live backend /assets/ not available, using store: Network Error
  ```
* **Root Cause:**
  This is a **backend-side database / FastAPI crash**. The server encountered an unhandled exception when processing the `/api/assets/` route. When FastAPI fails with 500, it also fails to append standard CORS headers on the error response.
* **Frontend Protection:**
  Our frontend wraps the call in a graceful `.catch()`, so the application never freezes or crashes when this 500 error occurs.

---

## 4. Why Were APIs Being Called Repeatedly? (Root Cause & Solution)

### The Problem:
`useAssessment()` is a custom React hook that was being called independently inside 7 different components:
1. `App.jsx`
2. `DashboardTab.jsx`
3. `ModelTab.jsx`
4. `AssetsTab.jsx`
5. `Compliance62443Tab.jsx`
6. `RiskLandscapeTab.jsx`
7. `ReportTab.jsx`

Because each component mounted its own instance of `useAssessment()`, every component ran its own `useEffect` and simultaneously fired calls to `/zones/`, `/assets/`, `/conduits/`, and `/compliance/status`, producing up to 28 duplicate requests in the Network tab.

### The Solution Implemented:
We added a **Module-level Synchronization Coordinator** (`syncBackendData`) in [`src/services/assessmentStore.js:1115`](file:///Users/vikram/Desktop/Antigravity/OT-synapse/src/services/assessmentStore.js#L1115):
```javascript
let inFlightSync = null;
let lastSyncTimestamp = 0;
const SYNC_COOLDOWN_MS = 60000; // 60-second cache window

export function syncBackendData() {
  const now = Date.now();
  if (inFlightSync) return inFlightSync; // Re-uses ongoing promise
  if (now - lastSyncTimestamp < SYNC_COOLDOWN_MS) {
    return Promise.resolve(); // Re-uses cached results within cooldown
  }
  ...
}
```
* **Result:** All tabs share a single in-flight Promise. Duplicate network calls are completely eliminated, and requests execute cleanly once on application mount.

---

## 5. Master Page-Wise API Mapping Table

| Page / Component | APIs Used | UI Trigger / Feature |
| :--- | :--- | :--- |
| **Model Tab** | `GET /api/zones/`<br>`POST /api/zones/`<br>`PATCH /api/zones/{id}`<br>`DELETE /api/zones/{id}`<br>`GET /api/conduits/`<br>`POST /api/conduits/`<br>`DELETE /api/conduits/{id}`<br>`POST /api/report/zone-model/pdf/` | • Renders visual zone architecture model<br>• "Add Zone" button creates a new zone<br>• Edit Zone drawer updates name, SL-T, air-gap<br>• "Delete Zone" button deletes zone and detaches assets<br>• Dragging conduit connects 2 zones<br>• "Export PDF/DOCX" buttons |
| **Assets Tab** | `GET /api/assets/`<br>`POST /api/assets/`<br>`PATCH /api/assets/{id}`<br>`DELETE /api/assets/{id}` | • Renders inventory table of OT devices (PLCs, HMIs)<br>• "Add Asset" button adds a new device<br>• Asset Modal overrides Purdue level or confidence<br>• "Remove this asset" deletes device record |
| **IEC 62443 Tab** | `GET /api/compliance/status`<br>`PUT /api/compliance/status/{z}/{sr}` | • Renders 86 system requirements compliance checklist<br>• Clicking "Met", "Partial", or "Blocked" status buttons |
| **Vulnerabilities Tab** | `GET /api/vulnerabilities/` | • Renders discovered CVE findings, CVSS scores, exploitability levels, and remediation filters |
| **Risk Landscape Tab** | `GET /api/zones/`<br>`GET /api/vulnerabilities/` | • Visualizes risk matrix per zone and attack paths across Purdue levels |
| **Dashboard Tab** | `GET /api/zones/`<br>`GET /api/assets/`<br>`GET /api/compliance/status` | • Computes executive summary, compliance score percentages, and asset totals |
| **Reports Tab** | `POST /api/report/docx/` | • Generates and downloads the complete OT Security Assessment Word report |
| **Header & Auth** | `GET /api/auth/me`<br>`GET /health` | • Microsoft SSO session validation, displays user name ("Vikram Kumar") and Admin Portal toggle |
