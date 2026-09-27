/**
 * authApi.js — Authentication and User Profile API endpoints
 * 
 * Microsoft Entra ID integration:
 * - Access token sent as Bearer token in Authorization header
 * - /api/auth/me called once on app load to retrieve profile & permissions
 */

import api from './client';

export const AUTH_ENDPOINTS = {
  currentUser: '/auth/me',
  health: '/health',
};

/**
 * Fetch current authenticated user profile from backend
 * Returns: user_id, name, email, role, is_admin, status, last_login, client_id, permissions
 */
export const apiGetCurrentUser = async () => {
  return api.get(AUTH_ENDPOINTS.currentUser);
};

/**
 * Health check endpoint (also sets initial CSRF cookie on first page view)
 */
export const apiCheckHealth = async () => {
  return api.get(AUTH_ENDPOINTS.health);
};
