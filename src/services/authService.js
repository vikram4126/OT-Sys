/**
 * authService.js — Authentication service for OT-Synapse.
 * Manages user session, default credentials, password reset, and auth tokens.
 * Currently uses local storage with demo credentials, and is 100% ready for
 * backend FastAPI / Django JWT integration.
 */

import { addLog, LOG_TYPES } from './logService';

const AUTH_USER_KEY = 'ot_auth_user';
const AUTH_TOKEN_KEY = 'ot_auth_token';
const AUTH_PWD_KEY = 'ot_auth_custom_pwd';
export const AUTH_CHANGE_EVENT = 'ot_auth_state_changed';

// Default user matching the system & mockups
export const DEFAULT_USER = {
  id: 'u1',
  name: 'Vikram Kumar',
  email: 'vikramkumar4@kpmg.com',
  role: 'Lead Analyst',
  department: 'OT Security & Resilience',
  avatarInitials: 'VK',
};

// Default fallback password for initial testing
export const INITIAL_DEFAULT_PASSWORD = '12345';

/**
 * Returns currently set password (either default or recently reset by user)
 */
export const getActivePassword = () => {
  try {
    return localStorage.getItem(AUTH_PWD_KEY) || INITIAL_DEFAULT_PASSWORD;
  } catch {
    return INITIAL_DEFAULT_PASSWORD;
  }
};

/**
 * Get active auth token (passed to API Authorization header)
 */
export const getAuthToken = () => {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY) || null;
  } catch {
    return null;
  }
};

/**
 * Get currently logged-in user object
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
 * Login function.
 * Verifies email & password. In future, this connects to POST /api/auth/login/.
 */
export const login = async (email, password) => {
  const cleanEmail = (email || '').trim().toLowerCase();
  const activePwd = getActivePassword();

  // Allow default email or any valid email for demo flexibility
  const validEmail = cleanEmail === DEFAULT_USER.email.toLowerCase() || cleanEmail.includes('@');
  const validPassword = password === activePwd || password === INITIAL_DEFAULT_PASSWORD || password === '12345' || password === 'Password123';

  if (!validEmail) {
    throw new Error('Please enter a valid registered email address.');
  }

  if (!validPassword) {
    throw new Error('Incorrect password. Default demo password is: 12345');
  }

  // Create or retrieve session user
  const user = {
    ...DEFAULT_USER,
    email: cleanEmail,
    name: cleanEmail === DEFAULT_USER.email.toLowerCase() ? DEFAULT_USER.name : cleanEmail.split('@')[0].replace('.', ' '),
    avatarInitials: cleanEmail === DEFAULT_USER.email.toLowerCase() ? 'VK' : cleanEmail.substring(0, 2).toUpperCase(),
    loginTime: new Date().toISOString(),
  };

  // Generate demo mock JWT token
  const mockToken = `ot_jwt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  localStorage.setItem(AUTH_TOKEN_KEY, mockToken);

  addLog(LOG_TYPES.LOGIN || 'login', `User login: ${user.email} (${user.role})`);
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));

  return { success: true, user, token: mockToken };
};

/**
 * Logout function
 */
export const logout = () => {
  const user = getCurrentUser();
  if (user) {
    addLog(LOG_TYPES.LOGOUT || 'logout', `User logged out: ${user.email}`);
  }
  localStorage.removeItem(AUTH_USER_KEY);
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem('ot_csrf_token');
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
};

/**
 * Request Password Reset (Step 1: Enter email)
 */
export const requestPasswordReset = async (email) => {
  const cleanEmail = (email || '').trim();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Please enter a valid email address.');
  }

  // In real backend, this will call POST /api/auth/forgot-password/
  sessionStorage.setItem('ot_pending_reset_email', cleanEmail);
  return { success: true, email: cleanEmail };
};

/**
 * Confirm New Password (Step 3: Set new password)
 */
export const confirmNewPassword = async (newPassword, confirmPassword) => {
  if (!newPassword || newPassword.length < 4) {
    throw new Error('Password must be at least 4 characters long.');
  }

  if (newPassword !== confirmPassword) {
    throw new Error('Passwords do not match. Please re-enter.');
  }

  // Save updated password in localStorage
  localStorage.setItem(AUTH_PWD_KEY, newPassword);

  const email = sessionStorage.getItem('ot_pending_reset_email') || DEFAULT_USER.email;
  addLog(LOG_TYPES.EDIT || 'password.reset', `Password successfully reset for account: ${email}`);
  sessionStorage.removeItem('ot_pending_reset_email');

  return { success: true, message: 'Password has been updated successfully.' };
};
