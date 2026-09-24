# Microsoft Entra ID (MSAL) & CSRF Token Integration Plan

> **Project:** OT-Synapse Frontend  
> **Backend Host:** `https://arc.customappsteam.co.uk/api`  
> **Date:** September 2026  
> **Status:** Architecture Defined & Pre-Configured

---

## 1. Analysis of Backend Screenshot (`/api/health`)

Aapke provide kiye gaye screenshot se confirm hota hai:

- **Endpoint:** `GET https://arc.customappsteam.co.uk/api/health`
- **Response Status:** `200 OK`
- **Response Payload:**
  ```json
  {
    "status": "ok",
    "version": "1.0.0",
    "features": [
      "auth", "report", "compliance", "connections", "vulnerabilities",
      "zones", "assets", "model", "audit", "dashboard", "evidence",
      "graph", "mitigations", "subnets", "switch_ports", "coverage", "conduits"
    ],
    "worker": {
      "enabled": true,
      "running": true,
      "jobs_processed": 0,
      "jobs_failed": 0,
      "last_run_at": "2026-09-23T12:47:46.760097",
      "last_error": null
    }
  }
  ```
- **Cookie Found in Request Headers:**
  ```text
  Cookie: csrftoken=K9fo-QfkTpRzhrEQUC9WSv_15We1wCt7hw8Y1VZ8pR8
  ```

---

## 2. Yeh Cookie Wala Token Kya Hai? (CSRF Token Explained)

Aapke screenshot me jo cookie dikh rahi hai:
```
csrftoken = K9fo-QfkTpRzhrEQUC9WSv_15We1wCt7hw8Y1VZ8pR8
```
**Yeh wahi CSRF Token hai jiska backend developer ne zikr kiya tha!**

### Yeh Kaise Kaam Karta Hai?
1. **Initial GET Call:** Jab browser pehli baar backend ka koi bhi page/endpoint (`/api/health`) call karta hai, backend response headers me `Set-Cookie: csrftoken=...` bhejta hai.
2. **Browser Storage:** Browser is cookie ko automatically secure session me store kar leta hai.
3. **Double-Submit Protection:** Backend rules ke anusaar, jab bhi koi modifying request (`POST`, `PUT`, `DELETE`) jayegi, backend do cheezein verify karega:
   - Request ki cookie me `csrftoken` hona chahiye (browser automatically bhejta hai).
   - Request ke HTTP Header me `X-CSRFToken: <same_token_value>` hona chahiye.

### Hamare Frontend me Status:
File: `src/api/client.js` me yeh logic **pehle se configured hai**:
```javascript
// Automatically reads csrftoken cookie
export function getCsrfToken() {
  const match = document.cookie.match(/(?:csrftoken|csrf_token|XSRF-TOKEN)=([^;]+)/i);
  if (match) return decodeURIComponent(match[1]);
  return localStorage.getItem('ot_csrf_token') || '';
}

// Automatically attaches X-CSRFToken to POST/PUT/PATCH/DELETE
api.interceptors.request.use(config => {
  const method = (config.method || '').toLowerCase();
  if (['post', 'put', 'patch', 'delete'].includes(method)) {
    const csrf = getCsrfToken();
    if (csrf) {
      config.headers['X-CSRFToken'] = csrf;
      config.headers['X-CSRF-Token'] = csrf;
    }
  }
  return config;
});
```
> **Nateeja:** Jaise hi app load hokar `/api/health` call karega, cookie automatically set ho jayegi aur frontend har PUT/POST/DELETE ke saath `X-CSRFToken` header bhej dega!

---

## 3. Microsoft Entra ID (MSAL) Flow & User Details Retrieval

Backend developer ne bataya:
- Frontend me username/password fields nahi honge.
- Sirf ek **"Sign in with Microsoft"** button hoga.
- User Microsoft Entra ID ke zariye redirect hokar login karega.
- Login hone ke baad app `/api/auth/me` ko call karega with Bearer token taaki user details mil sakein.

### Architecture Flowchart:
```
                      ┌──────────────────────────────────────┐
                      │ User opens OT-Synapse Login Screen   │
                      │ (Single "Sign in with Microsoft" CTA)│
                      └──────────────────┬───────────────────┘
                                         │ Click
                                         ▼
                      ┌──────────────────────────────────────┐
                      │ Redirect to Microsoft Entra ID:      │
                      │ login.microsoftonline.com/{tenantId} │
                      └──────────────────┬───────────────────┘
                                         │ Authenticates (SSO/MFA)
                                         ▼
                      ┌──────────────────────────────────────┐
                      │ Microsoft redirects back to:         │
                      │ SPA Redirect URI:                    │
                      │ http://localhost:3000 (or prod URL)  │
                      └──────────────────┬───────────────────┘
                                         │
                                         ▼
                      ┌──────────────────────────────────────┐
                      │ MSAL (@azure/msal-browser) captures  │
                      │ Access Token (Bearer Token)          │
                      │ Saved to: localStorage(ot_auth_token)│
                      └──────────────────┬───────────────────┘
                                         │
                                         ▼
                      ┌──────────────────────────────────────┐
                      │ Call Backend User Profile:           │
                      │ GET /api/auth/me                     │
                      │ Header: Authorization: Bearer <token>│
                      └──────────────────┬───────────────────┘
                                         │
                                         ▼
                      ┌──────────────────────────────────────┐
                      │ Backend validates token with Entra ID│
                      │ & returns user record from DB:       │
                      │ { name, email, role, department... } │
                      └──────────────────┬───────────────────┘
                                         │
                                         ▼
                      ┌──────────────────────────────────────┐
                      │ Frontend sets user session           │
                      │ & opens Dashboard!                   │
                      └──────────────────────────────────────┘
```

---

## 4. Backend Team Se Jo Details Chahiye (Checklist)

Frontend integration start karne ke liye developer ko yeh 4 cheezein share karni hongi:

| # | Parameter | Description | Example |
|---|---|---|---|
| 1 | **Client ID (Application ID)** | Azure Portal me App Registration ka unique ID | `3fa85f64-5717-4562-b3fc-2c963f66afa6` |
| 2 | **Tenant ID (Authority)** | Directory Tenant ID ya `common` | `72f988bf-86f1-41af-91ab-2d7cd011db47` |
| 3 | **API Scope** | Token request ke liye scope | `api://<backend-app-id>/access_as_user` or `User.Read` |
| 4 | **SPA Redirect URI Configured** | Azure Portal me Redirect URIs me SPA URL add ho | `http://localhost:3000` (Local) & `https://your-domain` (Prod) |

---

## 5. Frontend Implementation Roadmap (Step-by-Step)

### Step 1: Install Official MSAL Package
```bash
npm install @azure/msal-browser
```

### Step 2: Configure Environment Variables (`.env`)
```env
REACT_APP_API_BASE=https://arc.customappsteam.co.uk/api
REACT_APP_AZURE_CLIENT_ID=<client_id_from_backend>
REACT_APP_AZURE_TENANT_ID=<tenant_id_from_backend>
REACT_APP_AZURE_REDIRECT_URI=http://localhost:3000
```

### Step 3: Create MSAL Config Helper (`src/services/msalConfig.js`)
```javascript
import { PublicClientApplication } from "@azure/msal-browser";

export const msalConfig = {
  auth: {
    clientId: process.env.REACT_APP_AZURE_CLIENT_ID || '',
    authority: `https://login.microsoftonline.com/${process.env.REACT_APP_AZURE_TENANT_ID || 'common'}`,
    redirectUri: process.env.REACT_APP_AZURE_REDIRECT_URI || window.location.origin,
  },
  cache: {
    cacheLocation: "localStorage",
    storeAuthStateInCookie: false,
  },
};

export const msalInstance = new PublicClientApplication(msalConfig);
```

### Step 4: Simplify Login Screen (`src/components/AuthScreen.jsx`)
- Username aur Password inputs hata diye jayenge.
- Microsoft brand guidelines ke anusaar **"Sign in with Microsoft"** branded button render hoga.
- Button click par `msalInstance.loginRedirect(...)` trigger hoga.

### Step 5: Handle Redirect & Fetch `/api/auth/me`
App load hote hi redirect response capture hoga:
```javascript
const response = await msalInstance.handleRedirectPromise();
if (response && response.accessToken) {
  localStorage.setItem('ot_auth_token', response.accessToken);
  
  // Call backend to get user details
  const meRes = await api.get('/auth/me');
  localStorage.setItem('ot_auth_user', JSON.stringify(meRes.data));
}
```

---

## 6. Message to Send to Backend Developer

Aap backend developer ko yeh exact message copy-paste karke bhej sakte hain:

```text
Hi,

Thanks for the details! We checked the /api/health endpoint and confirmed that the CSRF token is being issued via the 'csrftoken' cookie (e.g. csrftoken=K9fo-QfkTpRzhrEQUC9WSv_15We1wCt7hw8Y1VZ8pR8). 
Our frontend Axios interceptor is already set up to read this cookie and automatically send 'X-CSRFToken' on all POST, PUT, PATCH, and DELETE calls.

For setting up Microsoft Entra ID with MSAL on the frontend, please share:
1. Azure Client ID (Application ID)
2. Azure Tenant ID (Authority)
3. API Scope (e.g., api://<client_id>/access_as_user or User.Read)
4. Please ensure http://localhost:3000 is added under Single-Page Application (SPA) Redirect URIs in your Azure App Registration.

Once we have these, we will wire up the single "Sign in with Microsoft" redirect and the /api/auth/me profile fetch.
```
