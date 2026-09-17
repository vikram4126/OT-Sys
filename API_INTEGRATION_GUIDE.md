# OT-Synapse: Complete Real API Integration Guide & CRUD Cheatsheet
> **Guide:** Backend (FastAPI) se real API aane par sabhi pages ko kaise connect aur update karna hai.

---

## 1. Concept: API Ka URL Kahan Aur Kaise Kaam Karta Hai?

FastAPI ka link **2 hisson** me divide hota hai:

1. **Base URL (`baseURL`)** = Server ka main address (Sabhi pages ke liye **COMMON** hota hai).
   * **Kahan likhna hai:** `src/api/client.js` ki **Line 17** par.
   * *Example:* `http://127.0.0.1:8000/api`
2. **Endpoint Path** = Har feature/page ka alag rasta.
   * *Example:* `/zones/`, `/assets/`, `/vulnerabilities/`

Jab code run hota hai, toh dono aapas me jud kar pura URL ban jate hain:
> `http://127.0.0.1:8000/api` + `/zones/` = **`http://127.0.0.1:8000/api/zones/`**

---

## 2. Sabhi 10 Pages Ka Architecture (Kaise Connect Honge?)

Aapko har page ke liye alag-alag 10 files me nahi jaana padega! 

```
                          ┌─────────────────────────────┐
                          │     src/api/client.js       │
                          │ (Line 17: Base URL set karo)│
                          └──────────────┬──────────────┘
                                         │
                 ┌───────────────────────┴───────────────────────┐
                 ▼                                               ▼
   ┌───────────────────────────┐                   ┌───────────────────────────┐
   │ src/services/             │                   │ Standalone Services       │
   │ assessmentStore.js        │                   │ 1. logService.js (Logs)   │
   │ (Line 1074: useAssessment)│                   │ 2. userService.js (Admin) │
   └─────────────┬─────────────┘                   └───────────────────────────┘
                 │
                 ├──────────────────────────────────────────────────────┐
                 ▼                                                      ▼
   ┌───────────────────────────┐                          ┌───────────────────────────┐
   │ 1. Dashboard Tab          │                          │ 5. IEC 62443 Compliance   │
   │ 2. Model Tab (Scope/Zones)│                          │ 6. Risk Landscape Tab     │
   │ 3. Assets Tab             │                          │ 7. Mitigations Tab        │
   │ 4. Report Tab             │                          │ 8. Workspace Tasks        │
   └───────────────────────────┘                          └───────────────────────────┘
   (Yeh sabhi 8 pages assessmentStore me API lagte hi AUTOMATIC real data dikhane lagenge!)
```

* **8 Pages (Automatic):** Dashboard, Model, Assets, Report, IEC 62443, Risk Landscape, Mitigations, aur Workspace — yeh sabhi pehle se hi `useAssessment()` se jude hain. `assessmentStore.js` me API lagte hi yeh saare pages bina chhue real data se chalne lagenge.
* **1 Page (Logs):** `src/services/logService.js` se link hoga.
* **1 Page (Admin Portal):** `src/services/userService.js` se link hoga.

---

## 3. Master CRUD Cheatsheet (Show, Add, Edit, Delete)

Yahan har page aur action ke liye **Exact File**, **Line Number**, **Abhi Ka Code**, aur **Real API aane par kya likhna hai** diya gaya hai:

### Section A: Zones & Model Page
📍 **File:** `src/services/assessmentStore.js`

| Action | Line No. | Abhi Ka Code (Current LocalStorage) | Real API Code (FastAPI aane par ye likhein) | FastAPI Endpoint |
| :--- | :--- | :--- | :--- | :--- |
| **SHOW (Read Zones)** | Line 1075, 1082 | `const [zones, setZones] = useState(readZones);` | `useEffect(() => { api.get('/zones/').then(r => setZones(r.data)); }, []);` | `GET /api/zones/` |
| **ADD (Naya Zone)** | Line 1093-1098 | `const id = 'Z-' + Date.now(); write(ZKEY, next);` | `const res = await api.post('/zones/', z); setZones(prev => [...prev, res.data]);` | `POST /api/zones/` |
| **EDIT (Zone Edit)** | Line 1099-1102 | `write(ZKEY, next); setZones(next);` | `await api.put('/zones/' + id, patch); setZones(prev => prev.map(z => z.id === id ? { ...z, ...patch } : z));` | `PUT /api/zones/:id/` |
| **DELETE (Zone Remove)** | Line 1103-1108 | `write(ZKEY, readZones().filter(...));` | `await api.delete('/zones/' + id); setZones(prev => prev.filter(z => z.id !== id));` | `DELETE /api/zones/:id/` |

---

### Section B: Assets Page
📍 **File:** `src/services/assessmentStore.js`

| Action | Line No. | Abhi Ka Code (Current LocalStorage) | Real API Code (FastAPI aane par ye likhein) | FastAPI Endpoint |
| :--- | :--- | :--- | :--- | :--- |
| **SHOW (Read Assets)** | Line 1078, 1082 | `const [assets, setAssets] = useState(readAssets);` | `useEffect(() => { api.get('/assets/').then(r => setAssets(r.data)); }, []);` | `GET /api/assets/` |
| **ADD (Naya Asset)** | Line 1124-1130 | `const next = [...readAssets(), entry]; writeAssets(next);` | `const res = await api.post('/assets/', fields); setAssets(prev => [...prev, res.data]);` | `POST /api/assets/` |
| **EDIT (Asset Edit)** | Line 1120-1123 | `writeAssets(next); setAssets(next);` | `await api.put('/assets/' + id, patch); setAssets(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a));` | `PUT /api/assets/:id/` |
| **DELETE (Asset Remove)** | Line 1131-1135 | `writeAssets(next); setAssets(next);` | `await api.delete('/assets/' + id); setAssets(prev => prev.filter(a => a.id !== id));` | `DELETE /api/assets/:id/` |

---

### Section C: Scope / Company Context (Model Tab)
📍 **File:** `src/services/assessmentStore.js`

| Action | Line No. | Abhi Ka Code (Current LocalStorage) | Real API Code (FastAPI aane par ye likhein) | FastAPI Endpoint |
| :--- | :--- | :--- | :--- | :--- |
| **SHOW (Scope Data)** | Line 1079 | `useState(() => read(CKEY, COMPANY_SEED));` | `useEffect(() => { api.get('/model/scope/').then(r => setCompanyState(r.data)); }, []);` | `GET /api/model/scope/` |
| **EDIT (Scope Save)** | Line 1088 | `write(CKEY, next); setCompanyState(next);` | `await api.put('/model/scope/', patch); setCompanyState(patch);` | `PUT /api/model/scope/` |

---

### Section D: Vulnerabilities / Findings
📍 **Files:** `src/api/client.js` & `src/components/VulnerabilitiesTab.jsx`

| Action | File & Line | Abhi Ka Code (Current) | Real API Code (FastAPI aane par ye likhein) | FastAPI Endpoint |
| :--- | :--- | :--- | :--- | :--- |
| **SHOW (List)** | `client.js`<br>Line 57 | `export const getVulnerabilities = ...` | *(Already API ready hai! Backend connect hote hi chal padega)* | `GET /api/vulnerabilities/` |
| **ADD (Add Finding)** | `VulnerabilitiesTab.jsx`<br>Line 1139 | `addManualVuln({ ...form, cvss: cvssNum });` | `await api.post('/vulnerabilities/', { ...form, cvss: cvssNum });` | `POST /api/vulnerabilities/` |
| **EDIT (Override)** | `VulnerabilitiesTab.jsx`<br>Line 489 | `setVulnOverride(vuln.vuln_id, patch);` | `await api.put('/vulnerabilities/' + vuln.vuln_id + '/override/', patch);` | `PUT /api/vulnerabilities/:id/override/` |
| **DELETE (Remove)** | `VulnerabilitiesTab.jsx`<br>Line 122 | `deleteVulnLocal(vuln.vuln_id);` | `await api.delete('/vulnerabilities/' + vuln.vuln_id + '/', { data: { reason } });` | `DELETE /api/vulnerabilities/:id/` |

---

### Section E: Audit Logs & Admin Portal
📍 **Files:** `src/services/logService.js` & `src/services/userService.js`

| Page | Action | File & Line | Real API Replacement Code | FastAPI Endpoint |
| :--- | :--- | :--- | :--- | :--- |
| **Audit Logs** | **SHOW** | `logService.js`<br>Line 15 | `export const getLogs = () => api.get('/audit-logs/').then(r => r.data);` | `GET /api/audit-logs/` |
| **Audit Logs** | **ADD** | `logService.js`<br>Line 25 | `api.post('/audit-logs/', logEntry);` | `POST /api/audit-logs/` |
| **Admin Portal**| **SHOW** | `userService.js`<br>Line 35 | `export const getAdminUsers = () => api.get('/admin/users/').then(r => r.data);` | `GET /api/admin/users/` |
| **Admin Portal**| **ADD/EDIT** | `userService.js`<br>Line 42, 51 | `api.post('/admin/users/', userData);`<br>`api.put('/admin/users/' + id, patch);` | `POST /api/admin/users/`<br>`PUT /api/admin/users/:id/` |

---

## 4. Jab Backend Team Link Degi Toh Aapko Kya Karna Hai? (Quick 3 Steps)

1. **Step 1:** Backend team jo Server URL degi (jaise `http://192.168.1.50:8000/api`), usko `src/api/client.js` ki **Line 17** par `baseURL` me paste kar dein.
2. **Step 2:** Upar di gayi table me se jo bhi feature connect karna ho (jaise Zones ya Assets), uski **Line Number** kholein.
3. **Step 3:** Current Code ki jagah Table me diya gaya **Real API Code** paste kar dein!
