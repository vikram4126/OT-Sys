/**
 * authService.js — Authentication service for OT-Synapse.
 * 
 * Powered by Microsoft Entra ID (Azure AD) via MSAL:
 * - SSO via Microsoft ("Sign in with Microsoft")
 * - Access token retrieved and passed as Bearer token
 * - /api/auth/me called once on initial load to get profile & permissions
 * - is_admin flag controls access to User Management / Admin portal
 */

import { addLog, LOG_TYPES } from './logService';
import { msalInstance, ensureMsalInitialized, apiLoginRequest, getFreshBearerToken } from '../authConfig';
import { apiGetCurrentUser } from '../api/authApi';
import { initCsrfToken } from '../api/client';

const AUTH_USER_KEY = 'ot_auth_user';
const AUTH_TOKEN_KEY = 'ot_auth_token';
export const AUTH_CHANGE_EVENT = 'ot_auth_state_changed';

/**
 * Get active auth token from storage
 */
export const getAuthToken = () => {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY) || null;
  } catch {
    return null;
  }
};

/**
 * Get currently logged-in user object from storage.
 * Automatically purges legacy dummy/dev users so unauthenticated sessions always see the login screen.
 */
export const getCurrentUser = () => {
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    // Purge legacy dummy / dev user if present in localStorage
    const isLegacyDummy =
      parsed.id === 'u1' ||
      parsed.user_id === 'u1' ||
      parsed.email === 'analyst@acmeindustrial.com' ||
      parsed.email === 'dev@local.test' ||
      parsed.name === 'Local Dev Analyst' ||
      (parsed.name === 'Lead Analyst' && parsed.email?.includes('acmeindustrial'));

    if (isLegacyDummy) {
      localStorage.removeItem(AUTH_USER_KEY);
      localStorage.removeItem(AUTH_TOKEN_KEY);
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
};

/**
 * Check if a valid session exists
 */
export const isAuthenticated = () => {
  return !!getCurrentUser();
};

/**
 * Fetch profile from backend /api/auth/me endpoint.
 * Note from backend team:
 * - Call once when the app loads as each call gets logged as a sign in.
 * - Role is for info; use is_admin to decide who can use manage users.
 * - 403 if not added or suspended.
 * - 401 if token missing or expired.
 */
export const fetchUserProfileFromApi = async () => {
  try {
    const res = await apiGetCurrentUser();
    const data = res.data || {};

    const account = msalInstance.getActiveAccount() || msalInstance.getAllAccounts()[0];

    const initials = (data.name || account?.name || data.email || 'US')
      .split(' ')
      .filter(Boolean)
      .map(part => part[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();

    const user = {
      id: data.user_id || account?.homeAccountId || 'user_1',
      user_id: data.user_id || account?.homeAccountId || 'user_1',
      name: data.name || account?.name || 'Authenticated User',
      email: data.email || account?.username || '',
      role: data.role || 'Analyst',
      isAdmin: Boolean(data.is_admin),
      is_admin: Boolean(data.is_admin),
      status: data.status || 'active',
      lastLogin: data.last_login || new Date().toISOString(),
      clientId: data.client_id || null,
      permissions: Array.isArray(data.permissions) ? data.permissions : [],
      avatarInitials: initials || 'OT',
    };

    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
    return user;
  } catch (err) {
    if (err.status === 403 || err.response?.status === 403) {
      const error = new Error('Access Denied: Your account has not been authorized or has been suspended. Please contact your system administrator.');
      error.isForbidden = true;
      throw error;
    }
    if (err.status === 401 || err.response?.status === 401) {
      const error = new Error('Session expired or authentication failed. Please sign in again.');
      error.isUnauthorized = true;
      throw error;
    }
    throw err;
  }
};

/**
 * URL for server-initiated Microsoft Azure AD OAuth Login
 */
export const getAzureLoginUrl = () => {
  const base = process.env.REACT_APP_API_BASE || 'https://arc.customappsteam.co.uk/api';
  const clean = base.replace(/\/+$/, '');
  return `${clean}/auth/azure/login`;
};

/**
 * Direct redirect to backend Microsoft login endpoint
 */
export const redirectToAzureLogin = () => {
  window.location.href = getAzureLoginUrl();
};

/**
 * Login with Microsoft Entra ID via MSAL Popup or direct backend OAuth redirect
 */
export const loginWithMicrosoft = async () => {
  // If direct Azure AD backend endpoint is requested, redirect to it
  const loginUrl = getAzureLoginUrl();
  if (loginUrl) {
    redirectToAzureLogin();
    return { redirecting: true };
  }
  await ensureMsalInitialized();

  let loginResponse = null;
  try {
    // Attempt loginPopup first for best UX
    loginResponse = await msalInstance.loginPopup(apiLoginRequest);
  } catch (popupErr) {
    // If popup was blocked or failed, attempt loginRedirect
    if (popupErr.name === 'BrowserAuthError' && popupErr.errorCode === 'popup_window_error') {
      await msalInstance.loginRedirect(apiLoginRequest);
      return;
    }
    throw popupErr;
  }

  if (loginResponse && loginResponse.account) {
    msalInstance.setActiveAccount(loginResponse.account);
    if (loginResponse.accessToken) {
      localStorage.setItem(AUTH_TOKEN_KEY, loginResponse.accessToken);
    }
  }

  // Retrieve token if not in loginResponse
  const token = await getFreshBearerToken();
  if (token) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  }

  // Initialize CSRF token from backend
  await initCsrfToken().catch(() => {});

  // Call /api/auth/me once to retrieve backend user profile & is_admin status
  const user = await fetchUserProfileFromApi();

  addLog(LOG_TYPES.LOGIN || 'login', `Microsoft SSO login: ${user.email} (is_admin: ${user.is_admin})`);
  return { success: true, user };
};

/**
 * Logout function:
 * Completely clears all user and auth tokens from localStorage, sessionStorage, and MSAL
 * so the user is guaranteed to land back on the Microsoft Login screen.
 */
export const logout = async () => {
  const user = getCurrentUser();
  if (user) {
    addLog(LOG_TYPES.LOGOUT || 'logout', `User logged out: ${user.email}`);
  }

  // 1. Wipe all local application authentication tokens and caches
  try {
    localStorage.removeItem(AUTH_USER_KEY);
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem('ot_csrf_token');

    // Wipe any Azure AD / MSAL cached tokens in localStorage
    Object.keys(localStorage).forEach(key => {
      if (
        key.startsWith('msal.') ||
        key.includes('login.microsoftonline.com') ||
        key.startsWith('authority')
      ) {
        localStorage.removeItem(key);
      }
    });

    // Wipe sessionStorage
    sessionStorage.clear();
  } catch (storageErr) {
    console.warn('Storage wipe warning:', storageErr);
  }

  // 2. Dispatch event so UI state drops currentUser immediately
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));

  // 3. Clean query and hash params so OAuth tokens are not left in URL bar
  try {
    if (window.location.search || window.location.hash) {
      const cleanUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
    }
  } catch {}

  // 4. Perform MSAL popup logout if an active account is registered
  try {
    await ensureMsalInitialized();
    const accounts = msalInstance.getAllAccounts();
    if (accounts.length > 0) {
      const account = msalInstance.getActiveAccount() || accounts[0];
      await msalInstance.logoutPopup({ account }).catch(() => {});
    }
  } catch (err) {
    console.warn('MSAL logout error:', err.message);
  }
};

/**
 * Initialize session on app boot (call once when app mounts).
 * If user is not logged in, NO API calls are executed.
 */
export const initializeAuthSession = async () => {
  // 0. Extract token from URL query or hash if returning from Microsoft OAuth redirect
  let tokenFromUrl = false;
  try {
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const urlToken = searchParams.get('token') || searchParams.get('access_token') || searchParams.get('bearer') ||
                     hashParams.get('token') || hashParams.get('access_token');
    if (urlToken) {
      localStorage.setItem(AUTH_TOKEN_KEY, urlToken);
      tokenFromUrl = true;
      // Clean query params from URL so sensitive token is not left in browser history
      const cleanUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
    }
  } catch (err) {
    console.warn('URL token parsing failed:', err.message);
  }

  // 1. If valid cached user already exists, initialize CSRF and return user
  const cached = getCurrentUser();
  if (cached) {
    initCsrfToken().catch(() => {});
    return cached;
  }

  // 2. Check if Bearer token or MSAL accounts exist
  const token = getAuthToken();
  let hasMsalAccount = false;
  try {
    await ensureMsalInitialized();
    const accounts = msalInstance.getAllAccounts();
    if (accounts.length > 0) {
      hasMsalAccount = true;
      const active = msalInstance.getActiveAccount() || accounts[0];
      msalInstance.setActiveAccount(active);
    }
  } catch {}

  // CRITICAL: If no credentials exist, user is NOT logged in.
  // DO NOT call /api/auth/me or any backend API!
  if (!token && !hasMsalAccount && !tokenFromUrl) {
    return null;
  }

  // 3. User has credentials: fetch profile from backend /api/auth/me
  try {
    const user = await fetchUserProfileFromApi();
    if (user) {
      initCsrfToken().catch(() => {});
      return user;
    }
  } catch (err) {
    // If token expired or was invalid, wipe stale storage
    localStorage.removeItem(AUTH_USER_KEY);
    localStorage.removeItem(AUTH_TOKEN_KEY);
    window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
  }

  return null;
};
