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

// Fallback demo user for local offline preview if needed
export const DEFAULT_USER = {
  id: 'u1',
  user_id: 'u1',
  name: 'Lead Analyst',
  email: 'analyst@acmeindustrial.com',
  role: 'Lead Analyst',
  isAdmin: true,
  is_admin: true,
  status: 'active',
  department: 'OT Security & Resilience',
  avatarInitials: 'LA',
};

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
 * Get currently logged-in user object from storage
 */
export const getCurrentUser = () => {
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY);
    return raw ? JSON.parse(raw) : null;
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
 * Logout function
 */
export const logout = async () => {
  const user = getCurrentUser();
  if (user) {
    addLog(LOG_TYPES.LOGOUT || 'logout', `User logged out: ${user.email}`);
  }

  localStorage.removeItem(AUTH_USER_KEY);
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem('ot_csrf_token');
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));

  try {
    await ensureMsalInitialized();
    const account = msalInstance.getActiveAccount() || msalInstance.getAllAccounts()[0];
    if (account) {
      await msalInstance.logoutPopup({ account });
    }
  } catch (err) {
    console.warn('MSAL logout error:', err.message);
  }
};

/**
 * Initialize session on app boot (call once when app mounts)
 */
export const initializeAuthSession = async () => {
  // Always trigger CSRF initialization on first page view
  initCsrfToken().catch(() => {});

  // 1. If backend has DEBUG=true auto-auth enabled (or localhost dev), test /api/auth/me directly
  try {
    const user = await fetchUserProfileFromApi();
    if (user) return user;
  } catch (err) {
    // If not auto-authenticated by backend, check local dev bypass or MSAL
  }

  // 2. If pointing to local backend (127.0.0.1 / localhost), auto-login dev user so UI never blocks on MSAL
  const apiBase = process.env.REACT_APP_API_BASE || '';
  const isLocalDev = apiBase.includes('127.0.0.1') || apiBase.includes('localhost');
  if (isLocalDev) {
    const cached = getCurrentUser();
    if (cached) return cached;
    const devUser = {
      ...DEFAULT_USER,
      name: 'Local Dev Analyst',
      email: 'dev@local.test',
      role: 'Lead Analyst',
      isAdmin: true,
      is_admin: true,
    };
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(devUser));
    localStorage.setItem(AUTH_TOKEN_KEY, 'local_dev_token');
    window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
    return devUser;
  }

  // 3. Normal MSAL session check for deployed environments
  try {
    await ensureMsalInitialized();
    const accounts = msalInstance.getAllAccounts();
    if (accounts.length > 0) {
      const active = msalInstance.getActiveAccount() || accounts[0];
      msalInstance.setActiveAccount(active);

      // If user is already cached, return it to avoid unnecessary /auth/me calls
      const cached = getCurrentUser();
      if (cached) return cached;

      // Otherwise fetch profile from /api/auth/me once
      return await fetchUserProfileFromApi();
    }
  } catch (err) {
    console.warn('Auto auth session init error:', err.message);
  }
  return getCurrentUser();
};
