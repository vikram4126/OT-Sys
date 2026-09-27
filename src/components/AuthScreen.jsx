// src/components/AuthScreen.jsx
import React, { useState } from 'react';
import './AuthScreen.scss';
import { loginWithMicrosoft, DEFAULT_USER } from '../services/authService';

// Microsoft 4-Color Logo
const MicrosoftIcon = () => (
  <svg width="20" height="20" viewBox="0 0 21 21" style={{ flexShrink: 0 }}>
    <rect x="1" y="1" width="9" height="9" fill="#f25022" />
    <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
    <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
    <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
  </svg>
);

// Gear Logo
const GearLogo = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00338D" strokeWidth="1.8" strokeLinecap="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

// Lock Security Shield Icon
const ShieldLockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);

export default function AuthScreen({ onLoginSuccess }) {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isForbidden, setIsForbidden] = useState(false);

  const handleMicrosoftLogin = async () => {
    setErrorMsg('');
    setIsForbidden(false);
    setLoading(true);

    try {
      const result = await loginWithMicrosoft();
      if (result && result.user && onLoginSuccess) {
        onLoginSuccess(result.user);
      }
    } catch (err) {
      console.error('Microsoft SSO Error:', err);
      if (err.isForbidden || err.status === 403 || err.response?.status === 403) {
        setIsForbidden(true);
        setErrorMsg('Access Denied: Your account has not been authorized or has been suspended. Please contact your system administrator.');
      } else if (err.isUnauthorized || err.status === 401 || err.response?.status === 401) {
        setErrorMsg('Authentication token expired or rejected by server. Please try signing in again.');
      } else if (err.errorCode === 'user_cancelled' || err.message?.includes('user_cancelled')) {
        setErrorMsg('Sign-in window was closed before completing.');
      } else {
        setErrorMsg(err.message || 'Unable to sign in with Microsoft Entra ID. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Offline / local development bypass
  const handleDevBypass = () => {
    localStorage.setItem('ot_auth_user', JSON.stringify(DEFAULT_USER));
    localStorage.setItem('ot_auth_token', 'demo_dev_token');
    if (onLoginSuccess) {
      onLoginSuccess(DEFAULT_USER);
    }
  };

  return (
    <div className="kpmg-auth-wrapper">
      <div className="kpmg-auth-card">

        {/* Brand Header */}
        <div className="kpmg-auth-icon-badge">
          <GearLogo />
        </div>

        <h1 className="kpmg-auth-title">Sign in to OT Overview</h1>
        <p className="kpmg-auth-subtitle">
          OT Security & Resilience Management Platform
        </p>

        {/* Trust & Tenant Info Badge */}
        <div className="kpmg-auth-entra-badge">
          <ShieldLockIcon />
          <span>Secured by Microsoft Entra ID</span>
        </div>

        {/* Alerts / Error messages */}
        {errorMsg && (
          <div className={`kpmg-auth-alert ${isForbidden ? 'forbidden' : 'error'}`}>
            <div className="kpmg-auth-alert-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <div className="kpmg-auth-alert-text">
              {errorMsg}
            </div>
          </div>
        )}

        {/* Microsoft Sign-In Action */}
        <div className="kpmg-auth-action-area">
          <button
            type="button"
            className="kpmg-auth-btn-microsoft"
            onClick={handleMicrosoftLogin}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="kpmg-auth-spinner" />
                <span>Connecting to Microsoft…</span>
              </>
            ) : (
              <>
                <MicrosoftIcon />
                <span>Sign in with Microsoft</span>
              </>
            )}
          </button>
        </div>

        {/* Tenant Details note */}
        <div className="kpmg-auth-disclaimer">
          Single Sign-On is managed through Microsoft Entra ID. No separate username or password is required.
        </div>

        {/* Local development bypass helper */}
        <div className="kpmg-auth-dev-fallback">
          <button
            type="button"
            className="kpmg-auth-dev-btn"
            onClick={handleDevBypass}
            title="Use local demo account for offline testing"
          >
            Offline Demo Mode (Lead Analyst) →
          </button>
        </div>

      </div>
    </div>
  );
}
