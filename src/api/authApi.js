/**
 * authApi.js — Authentication API endpoints connector.
 * 
 * 💡 Jab Backend Developer Login / Auth ke endpoints dega:
 * Sirf AUTH_ENDPOINTS ke paths update karne hain.
 * Axios client pehle se Bearer token aur headers handle kar raha hai!
 */

import api from './client';

export const AUTH_ENDPOINTS = {
  // Replace these with your backend team's exact paths
  login: '/auth/login/',
  logout: '/auth/logout/',
  forgotPassword: '/auth/forgot-password/',
  resetPassword: '/auth/reset-password/',
  currentUser: '/auth/me/',
};

/**
 * Call real backend login
 * @param {Object} credentials { email, password }
 */
export const apiLogin = async (credentials) => {
  return api.post(AUTH_ENDPOINTS.login, credentials);
};

/**
 * Call real backend forgot password
 * @param {string} email
 */
export const apiForgotPassword = async (email) => {
  return api.post(AUTH_ENDPOINTS.forgotPassword, { email });
};

/**
 * Call real backend reset password
 * @param {Object} data { token, password }
 */
export const apiResetPassword = async (data) => {
  return api.post(AUTH_ENDPOINTS.resetPassword, data);
};

/**
 * Fetch current authenticated user
 */
export const apiGetCurrentUser = async () => {
  return api.get(AUTH_ENDPOINTS.currentUser);
};
