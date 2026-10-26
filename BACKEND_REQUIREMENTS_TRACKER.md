# Backend Developer Requirements & Bug Tracker
> **Project:** OT-Synapse / KPMG OT Security Platform  
> **Status:** Active Tracking Document  
> **Last Updated:** 22-Oct-2026

This document lists all backend API bug fixes, missing endpoints, and feature requirements discovered during frontend integration. Share this consolidated list with the backend developer.

---

## 🔴 Priority 1: Critical Bug Fixes

### 1. Fix `500 Internal Server Error` on `PUT /api/compliance/status/{zone_id}/{sr_id}`
- **Endpoint:** `PUT /api/compliance/status/{zone_id}/{sr_id}`
- **Observed Behavior:** 
  - Request stays **pending for 15–20 seconds**, then crashes with `500 Internal Server Error` (Server: Uvicorn).
  - Frontend request details:
    - URL: `PUT http://localhost:8000/api/compliance/status/Z-ENT/SR1.1`
    - Headers: `x-csrftoken`, `Content-Type: application/json`
    - Payload: `{"status": "partial", "evidence_refs": []}`
- **Likely Root Causes:**
  1. **SQLite Database Lock:** The database connection is blocked by an uncommitted transaction or busy connection, timing out after ~15s (`sqlite3.OperationalError: database is locked`).
  2. **Python Exception:** Unhandled exception in the route handler when updating or inserting the row for that `zone_id` and `sr_id`.
- **Expected Resolution:**
  - Update the record in the database and return `200 OK` with the updated JSON object:
    ```json
    {
      "client_id": "dev-client-001",
      "zone_id": "Z-ENT",
      "sr_id": "SR1.1",
      "status": "partial",
      "evidence_refs": [],
      "assessed_at": "2026-10-22T...",
      "assessed_by": "consultant"
    }
    ```

### 1.2. Fix `403 Forbidden` on `POST /api/report/zone-model/pdf/` and `docx/`
- **Endpoints:** `POST /api/report/zone-model/pdf/` and `POST /api/report/zone-model/docx/`
- **Observed Behavior:**
  - When clicking "Download PDF" or "Download DOCX" on Workshop Confirmation, the request fails with `403 Forbidden`.
  - Content-Length: 36 (`{"detail":"CSRF validation failed"}` or permission check).
- **Root Cause & Resolution:**
  1. On localhost (`http://localhost:3000` to `http://localhost:8000`), cross-origin cookie security prevents reading `csrftoken` cookie directly via JS.
  2. Backend should expose the CSRF token in CORS headers (`Access-Control-Expose-Headers: x-csrftoken`) or include `csrf_token` in `GET /api/health` response body.
  3. Alternatively, exempt report generation endpoints from CSRF on development environments.

---

## 🟡 Priority 2: Missing Backend Endpoints & Data Persistence

### 2. Consultant Actions & Notes Persistence
- **Current Limitation:** 
  - In the 62443 Requirement modal, consultants select action tags (*"Request further evidence"*, *"Include in workshop"*, *"Schedule site visit"*, *"Evidence unavailable"*) and write custom investigation notes.
  - Currently, this is only saved in browser `localStorage`. If another consultant logs in from another laptop, they cannot see these notes.
- **Requirement:**
  - Allow storing actions and notes in the database.
  - Option A: Add an `actions` array to `PUT /api/compliance/status/{zone_id}/{sr_id}`:
    ```json
    {
      "status": "partial",
      "evidence_refs": [],
      "actions": [
        { "kind": "request", "note": "Request evidence demonstrating unmet rubric points." },
        { "kind": "workshop", "note": "Walk through SR1.1 in the client workshop." }
      ]
    }
    ```
  - Option B: Provide a dedicated endpoint `POST/PUT /api/compliance/actions/{zone_id}/{sr_id}`.

### 3. Evidence File Upload Endpoint (PDF / Documents)
- **Current Limitation:**
  - Users can select or drag & drop evidence PDFs in the modal, but the binary file is not uploaded to the backend server.
- **Requirement:**
  - Provide a multipart file upload endpoint:
    `POST /api/compliance/evidence/upload/` (multipart/form-data)
    - Form fields: `file`, `zone_id`, `sr_id`
    - Response: `{ "id": "EV-123", "filename": "Network_Architecture.pdf", "url": "/media/evidence/..." }`
  - This will allow real client PDFs to be viewed by all users in the left preview viewer.

### 4. Company Scope & Context API (`GET`, `POST` / `PUT /api/model/scope/` or `/api/company/`)
- **Current Limitation:**
  - In Model Tab (Step 1: Scope & Context), users fill in:
    - Company Name (e.g., "Testing Model page")
    - Site Name (e.g., "North Plant Testing")
    - Industry (e.g., "Water & Wastewater")
    - Site Size (Small / Medium / Large)
    - Tooling selections & intake portal link
  - Currently, this form is stored only in browser `localStorage` (`ot_assess_company_v2`).
- **Requirement:**
  - Provide backend persistence endpoints:
    - `GET /api/model/scope/` -> Returns current client's saved scope & site profile.
    - `POST` or `PUT /api/model/scope/` (Upsert logic recommended):
      - If scope doesn't exist yet for this tenant/client, it creates it.
      - If it already exists, it updates it.
      - (Alternatively, `POST` for initial creation and `PUT/PATCH` for update).

---

## 🟢 Priority 3: Enhancements & Confirmations

### 5. Assets Limit Support (`GET /api/assets/`)
- **Status:** Frontend now requests `GET /api/assets/?limit=500` to fetch all 286 assets.
- **Verification Needed:** Ensure backend pagination supports `limit=500` efficiently without performance degradation.

### 6. Rubric Checklist Ticks State in Database (Optional / Good to Have)
- **Description:** 
  - Each requirement has 4–5 testing criteria checkboxes. Right now, database only stores the final rolled-up status (`met`, `partial`, `missing`).
  - If collaborative multi-user live auditing is needed where team members see each other's individual checkbox ticks, backend can optionally accept `rubric_ticks: [0, 1]` in the status payload.

---

## 📋 Summary of Items for Developer
1. [ ] Fix 15s timeout / 500 error on `PUT /api/compliance/status/{zone_id}/{sr_id}`.
2. [ ] Add support to save Consultant Actions & Notes to the database.
3. [ ] Add `POST /api/compliance/evidence/upload` for real PDF evidence files.
4. [x] Add `GET` and `PUT /api/model/scope/` for Company Name, Site Name, Industry, and Site Size persistence. *(Completed & integrated)*
5. [ ] Verify `limit=500` query parameter on `GET /api/assets/`.
