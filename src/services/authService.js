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
import api, { initCsrfToken } from '../api/client';

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

    // If backend /api/auth/me returned 404 or connection error, but Microsoft account is authenticated:
    const account = msalInstance.getActiveAccount() || msalInstance.getAllAccounts()[0];
    if (account) {
      console.warn('Backend /api/auth/me not responding, falling back to Microsoft account:', err.message);
      const initials = (account.name || account.username || 'US')
        .split(' ')
        .filter(Boolean)
        .map(part => part[0])
        .join('')
        .substring(0, 2)
        .toUpperCase();
      const user = {
        id: account.homeAccountId || 'user_1',
        user_id: account.homeAccountId || 'user_1',
        name: account.name || 'Authenticated User',
        email: account.username || '',
        role: 'Lead Analyst',
        isAdmin: true,
        is_admin: true,
        status: 'active',
        lastLogin: new Date().toISOString(),
        clientId: null,
        permissions: ['view', 'edit', 'override', 'report'],
        avatarInitials: initials || 'OT',
      };
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
      window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
      return user;
    }

    throw err;
  }
};

/**
 * URL for server-initiated Microsoft Azure AD OAuth Login
 */
export const getAzureLoginUrl = () => {
  const base = process.env.REACT_APP_API_BASE || 'http://localhost:8000/api';
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
 * Login with Microsoft Entra ID
 * Initiates backend Azure OAuth flow (http://localhost:8000/api/auth/azure/login)
 */
export const loginWithMicrosoft = async () => {
  // Clear logged out flag so fresh login can proceed
  try {
    localStorage.removeItem('ot_logged_out');
  } catch {}
  redirectToAzureLogin();
  return { redirecting: true };
};

/**
 * Logout function:
 * Completely clears all user and auth tokens from localStorage, sessionStorage, cookies,
 * and calls backend logout so the session is terminated server-side.
 * Sets 'ot_logged_out' flag to ensure hard refresh never re-logs in automatically.
 */
export const logout = async () => {
  const user = getCurrentUser();
  if (user) {
    addLog(LOG_TYPES.LOGOUT || 'logout', `User logged out: ${user.email}`);
  }

  // 1. Mark session as explicitly logged out
  try {
    localStorage.setItem('ot_logged_out', 'true');
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

  // 2. Clear non-HttpOnly client cookies
  try {
    document.cookie.split(';').forEach(c => {
      document.cookie = c.replace(/^ +/, '').replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/');
    });
  } catch {}

  // 3. Inform backend to terminate server session / invalidate cookies
  try {
    await api.post('/auth/logout').catch(() => api.get('/auth/logout')).catch(() => {});
  } catch {}

  // 4. Dispatch event so UI state drops currentUser immediately
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));

  // 5. Clean query and hash params so OAuth tokens are not left in URL bar
  try {
    if (window.location.search || window.location.hash) {
      const cleanUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
    }
  } catch {}

  // 6. Perform MSAL popup logout if an active account is registered
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
 * If user has explicitly logged out, stays on login screen.
 */
export const initializeAuthSession = async () => {
  // If user explicitly clicked logout, DO NOT auto-restore session on refresh
  try {
    if (localStorage.getItem('ot_logged_out') === 'true') {
      return null;
    }
  } catch {}

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

  // 2. Check session with backend /api/auth/me (authenticates via Cookie or Bearer token)
  try {
    const user = await fetchUserProfileFromApi();
    if (user) {
      initCsrfToken().catch(() => {});
      return user;
    }
  } catch (err) {
    // Not authenticated or session expired — clear storage and show login screen
    localStorage.removeItem(AUTH_USER_KEY);
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }

  return null;
};
