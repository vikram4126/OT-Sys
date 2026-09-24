# CSRF Token Explanation & Verification Report

## Summary / निष्कर्ष
Request Header में जो `Cookie: csrftoken=K9Fo-QfkTp...` दिखाई दे रहा है, वह **100% Backend Server द्वारा जनरेट और भेजा गया है**। यह Frontend Code (React / JavaScript) ने नहीं भेजा है।

---

## Technical Proof (तकनीकी प्रमाण)

### 1. Direct Browser Navigation (पेज पर कोई React कोड नहीं चल रहा)
Network tab और Browser Address Bar में:
- **Request URL**: `https://arc.customappsteam.co.uk/api/health`
- **Request Method**: `GET`
- **Sec-Fetch-Mode**: `navigate`
- **Sec-Fetch-Dest**: `document`
- **Page Response**: Raw JSON data (`{"status":"ok", "version":"1.0.0", ...}`)

> **महत्वपूर्ण बात:** यह request सीधे Browser के Address bar में URL type करके खोली गई है। इस समय browser में हमारा React Frontend Load ही नहीं था, इसलिए Frontend JavaScript code द्वारा कोई Header या Cookie भेजने का सवाल ही नहीं उठता।

---

## 2. Request Header में `Cookie: csrftoken=...` क्यों दिखाई दे रहा है?

HTTP Cookies का Standard Architecture इस तरह काम करता है:

```mermaid
sequenceDiagram
    participant UserBrowser as Browser (Chrome)
    participant Backend as Backend Server (arc.customappsteam.co.uk)

    Note over UserBrowser,Backend: Step 1: Initial Request (Backend sets cookie)
    UserBrowser->>Backend: GET /api/health (or any endpoint)
    Backend-->>UserBrowser: 200 OK + Response Header: Set-Cookie: csrftoken=K9Fo...; Domain=...
    Note over UserBrowser: Browser automatically stores "csrftoken" cookie for this domain

    Note over UserBrowser,Backend: Step 2: Any Subsequent Request (Browser automatically attaches cookie)
    UserBrowser->>Backend: GET /api/health
    Note over UserBrowser: Browser automatically adds Request Header:<br/>Cookie: csrftoken=K9Fo...
    Backend-->>UserBrowser: 200 OK (Response with JSON)
```

1. **Step 1 (Backend Set-Cookie)**: 
   जब आपने पहली बार `arc.customappsteam.co.uk` की कोई भी API/URL खोली थी, तो Backend Server (Django/Python backend) ने Response Headers में यह भेजा था:
   ```http
   Set-Cookie: csrftoken=K9Fo-QfkTp...; Path=/; SameSite=Lax
   ```
2. **Step 2 (Browser Storage)**:
   Google Chrome Browser ने इस cookie को domain `arc.customappsteam.co.uk` के internal storage में save कर लिया।
3. **Step 3 (Automatic Inclusion by Browser)**:
   Browser का वैश्विक नियम (Global Spec) है कि जब भी उस domain पर कोई नई request भेजी जाएगी, Browser **स्वयं** (बिना किसी JS code के) `Cookie` Request Header में वह वैल्यू जोड़ देता है:
   ```http
   Cookie: csrftoken=K9Fo-QfkTp...
   ```

---

## 3. यह नाम `csrftoken` क्यों है?
- Django Framework में default CSRF cookie का नाम **`csrftoken`** ही होता है (`CSRF_COOKIE_NAME = 'csrftoken'`).
- Django का `CsrfViewMiddleware` backend पर incoming requests को protect करने के लिए यह cookie generate करता है।

---

## 4. खुद कैसे Verify करें (DevTools Steps)

1. **Response Headers चेक करें:**
   - Chrome DevTools Network Tab में उसी request (`health`) पर क्लिक करें।
   - **Response Headers** सेक्शन को expand करें।
   - यदि यह पहली session request थी, तो आपको `Set-Cookie: csrftoken=...` दिखेगा।

2. **Application Tab (Cookies Storage) चेक करें:**
   - DevTools में ऊपर **Application** टैब खोलें।
   - Left Sidebar में **Storage** ➔ **Cookies** ➔ `https://arc.customappsteam.co.uk` पर क्लिक करें।
   - वहाँ आपको table में Name: `csrftoken`, Value: `K9Fo-QfkTp...`, Domain: `arc.customappsteam.co.uk` साफ दिखाई देगा।

---

## 5. Frontend का क्या Role होता है? (For Reference)

Frontend (React App) केवल State-Changing requests (`POST`, `PUT`, `DELETE`) के समय इस cookie को read करके Request Header में भेजता है:
```http
X-CSRFToken: K9Fo-QfkTp...
```
GET requests (जैसे `/api/health`) में Frontend कोई CSRF Header नहीं लगाता, और जो `Cookie` header में दिख रहा है, वह Browser का native behavior है।
