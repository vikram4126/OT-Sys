/**
 * authConfig.js — Microsoft Entra ID (Azure AD) MSAL Configuration
 * 
 * Details provided by backend/client team:
 * - Tenant ID: a4d4d5cd-20cf-444e-bfe7-3d3ecef3fe94
 * - Authority: https://login.microsoftonline.com/a4d4d5cd-20cf-444e-bfe7-3d3ecef3fe94
 * - Client ID: 0755a915-8b6c-437d-86e5-758e0f380c57
 * - API Scope: api://0755a915-8b6c-437d-86e5-758e0f380c57/access_as_user
 */

import { PublicClientApplication, LogLevel } from '@azure/msal-browser';

export const msalConfig = {
  auth: {
    clientId: '0755a915-8b6c-437d-86e5-758e0f380c57',
    authority: 'https://login.microsoftonline.com/a4d4d5cd-20cf-444e-bfe7-3d3ecef3fe94',
    redirectUri: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
    postLogoutRedirectUri: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
    navigateToLoginRequestUrl: true,
  },
  cache: {
    cacheLocation: 'localStorage', // Keeps session alive across tabs and reloads
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return;
        if (level === LogLevel.Error) {
          console.error('[MSAL]', message);
        }
      },
      logLevel: LogLevel.Warning,
    },
  },
};

/**
 * Scopes to request when acquiring an access token for backend API.
 * Note: Client specified: api://0755a915-8b6c-437d-86e5-758e0f380c57/access_as_user (User.Read won't work)
 */
export const apiLoginRequest = {
  scopes: ['api://0755a915-8b6c-437d-86e5-758e0f380c57/access_as_user'],
};

// Singleton PublicClientApplication instance
export const msalInstance = new PublicClientApplication(msalConfig);

let isInitialized = false;
let initPromise = null;

/**
 * Ensure MSAL instance is initialized before use (required by MSAL v3+)
 */
export async function ensureMsalInitialized() {
  if (isInitialized) return msalInstance;
  if (!initPromise) {
    initPromise = msalInstance.initialize().then(async () => {
      // Handle redirect promise if returned from Microsoft login redirect
      await msalInstance.handleRedirectPromise();
      const accounts = msalInstance.getAllAccounts();
      if (accounts.length > 0 && !msalInstance.getActiveAccount()) {
        msalInstance.setActiveAccount(accounts[0]);
      }
      isInitialized = true;
      return msalInstance;
    });
  }
  return initPromise;
}

/**
 * Silently acquire or retrieve valid Bearer token for API calls
 */
export async function getFreshBearerToken() {
  try {
    await ensureMsalInitialized();
    const account = msalInstance.getActiveAccount() || msalInstance.getAllAccounts()[0];
    if (account) {
      const response = await msalInstance.acquireTokenSilent({
        scopes: apiLoginRequest.scopes,
        account: account,
      });
      if (response?.accessToken) {
        try {
          localStorage.setItem('ot_auth_token', response.accessToken);
        } catch {}
        return response.accessToken;
      }
    }
  } catch (err) {
    // If silent acquisition fails (e.g. InteractionRequiredAuthError), fallback to cached token
  }

  try {
    return localStorage.getItem('ot_auth_token') || null;
  } catch {
    return null;
  }
}
