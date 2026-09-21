// src/components/AuthScreen.jsx
import React, { useState } from 'react';
import './AuthScreen.scss';
import {
  DEFAULT_USER,
  INITIAL_DEFAULT_PASSWORD,
  getActivePassword,
  login,
  requestPasswordReset,
  confirmNewPassword,
} from '../services/authService';

/* ── SVG Icons from public/icons matching user design ── */

// Login Icon from public/icons/Login.svg
const LoginIcon = () => (
  <img
    src={`${process.env.PUBLIC_URL || ''}/icons/Login.svg`}
    alt="Login"
    width="24"
    height="24"
    className="kpmg-auth-badge-icon"
  />
);

// Mail Icon from public/icons/Mail 1.svg (for Forgot Password & Check Email)
const MailIcon = () => (
  <img
    src={`${process.env.PUBLIC_URL || ''}/icons/Mail 1.svg`}
    alt="Mail"
    width="24"
    height="24"
    className="kpmg-auth-badge-icon"
  />
);

// Password Key Icon from public/icons/Password.svg (for Choose New Password)
const PasswordKeyIcon = () => (
  <img
    src={`${process.env.PUBLIC_URL || ''}/icons/Password.svg`}
    alt="Password"
    width="24"
    height="24"
    className="kpmg-auth-badge-icon"
  />
);

// Eye icon (show password)
const EyeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

// Eye-off icon (hide password)
const EyeOffIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

export default function AuthScreen({ onLoginSuccess }) {
  // Views: 'login' | 'forgot' | 'check-email' | 'new-password'
  const [view, setView] = useState('login');

  // Form states
  const [email, setEmail] = useState(DEFAULT_USER.email);
  const [password, setPassword] = useState(getActivePassword() || INITIAL_DEFAULT_PASSWORD);
  const [showPassword, setShowPassword] = useState(false);

  // New password states
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Feedback states
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const clearMessages = () => {
    setErrorMsg('');
    setSuccessMsg('');
  };

  const handleNavigate = (nextView) => {
    clearMessages();
    setView(nextView);
  };

  // 1. Submit Login
  const handleLoginSubmit = async (e) => {
    if (e) e.preventDefault();
    clearMessages();
    setLoading(true);

    try {
      const result = await login(email, password);
      if (onLoginSuccess) {
        onLoginSuccess(result.user);
      }
    } catch (err) {
      setErrorMsg(err.message || 'Login failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  // 2. Submit Reset Request (Enter email)
  const handleForgotSubmit = async (e) => {
    if (e) e.preventDefault();
    clearMessages();
    setLoading(true);

    try {
      await requestPasswordReset(email);
      handleNavigate('check-email');
    } catch (err) {
      setErrorMsg(err.message || 'Could not send reset link. Try again.');
    } finally {
      setLoading(false);
    }
  };

  // 3. Submit New Password
  const handleNewPasswordSubmit = async (e) => {
    if (e) e.preventDefault();
    clearMessages();
    setLoading(true);

    try {
      await confirmNewPassword(newPassword, confirmPassword);
      setPassword(newPassword); // sync state
      setSuccessMsg('Password reset successful! You can now log in with your new password.');
      setNewPassword('');
      setConfirmPassword('');
      setView('login');
    } catch (err) {
      setErrorMsg(err.message || 'Password update failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="kpmg-auth-wrapper">
      <div className="kpmg-auth-card">

        {/* ───────────────────────────────────────────────────────────── */}
        {/* VIEW 1: LOGIN                                                */}
        {/* ───────────────────────────────────────────────────────────── */}
        {view === 'login' && (
          <div>
            <div className="kpmg-auth-icon-badge">
              <LoginIcon />
            </div>

            <h1 className="kpmg-auth-title">Log in to your account</h1>
            <p className="kpmg-auth-subtitle">
              Access the platform using your registered credentials.
            </p>

            {errorMsg && <div className="kpmg-auth-alert error">{errorMsg}</div>}
            {successMsg && <div className="kpmg-auth-alert success">{successMsg}</div>}

            <form onSubmit={handleLoginSubmit} className="kpmg-auth-form">
              <div className="kpmg-auth-field">
                <label className="kpmg-auth-label">Email</label>
                <div className="kpmg-auth-input-wrapper">
                  <input
                    type="email"
                    className="kpmg-auth-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    required
                  />
                </div>
              </div>

              <div className="kpmg-auth-field">
                <label className="kpmg-auth-label">Password</label>
                <div className="kpmg-auth-input-wrapper">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="kpmg-auth-input with-toggle"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                  />
                  <button
                    type="button"
                    className="kpmg-auth-eye-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>

              <div className="kpmg-auth-forgot-row">
                <button
                  type="button"
                  className="kpmg-auth-forgot-link"
                  onClick={() => handleNavigate('forgot')}
                >
                  Forgot password
                </button>
              </div>

              <button
                type="submit"
                className="kpmg-auth-btn-primary"
                disabled={loading}
              >
                {loading ? 'Logging in…' : 'Log in'}
              </button>
            </form>

            <div className="kpmg-auth-footer-hint">
              <div className="kpmg-auth-demo-badge">
                <span>Demo:</span>
                <strong>vikramkumar4@kpmg.com</strong>
                <span>•</span>
                <strong>12345</strong>
              </div>
            </div>
          </div>
        )}

        {/* ───────────────────────────────────────────────────────────── */}
        {/* VIEW 2: FORGOT PASSWORD (Enter your email to reset password) */}
        {/* ───────────────────────────────────────────────────────────── */}
        {view === 'forgot' && (
          <div>
            <div className="kpmg-auth-icon-badge">
              <MailIcon />
            </div>

            <h1 className="kpmg-auth-title">Enter your email to reset password</h1>
            <p className="kpmg-auth-subtitle">
              We'll send you a link to reset your password.
            </p>

            {errorMsg && <div className="kpmg-auth-alert error">{errorMsg}</div>}

            <form onSubmit={handleForgotSubmit} className="kpmg-auth-form">
              <div className="kpmg-auth-field">
                <label className="kpmg-auth-label">Email</label>
                <div className="kpmg-auth-input-wrapper">
                  <input
                    type="email"
                    className="kpmg-auth-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="vikramkumar4@kpmg.com"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                className="kpmg-auth-btn-primary"
                disabled={loading}
              >
                {loading ? 'Sending link…' : 'Reset password'}
              </button>

              <button
                type="button"
                className="kpmg-auth-btn-secondary"
                onClick={() => handleNavigate('login')}
              >
                Cancel
              </button>
            </form>
          </div>
        )}

        {/* ───────────────────────────────────────────────────────────── */}
        {/* VIEW 3: CHECK YOUR EMAIL                                      */}
        {/* ───────────────────────────────────────────────────────────── */}
        {view === 'check-email' && (
          <div>
            <div className="kpmg-auth-icon-badge">
              <MailIcon />
            </div>

            <h1 className="kpmg-auth-title">Please check your email</h1>
            <p className="kpmg-auth-subtitle">
              If an account exists for <strong>{email || 'your email'}</strong>, you will get an email with instructions on resetting your password.
            </p>

            <div className="kpmg-auth-form">
              <button
                type="button"
                className="kpmg-auth-btn-primary"
                onClick={() => handleNavigate('login')}
              >
                Back to Log In
              </button>

              <div style={{ textAlign: 'center', marginTop: 12 }}>
                <button
                  type="button"
                  className="kpmg-auth-sim-link"
                  onClick={() => handleNavigate('new-password')}
                  title="Directly test the new password screen"
                >
                  🔗 Simulate clicking email reset link →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ───────────────────────────────────────────────────────────── */}
        {/* VIEW 4: CHOOSE A NEW PASSWORD                                */}
        {/* ───────────────────────────────────────────────────────────── */}
        {view === 'new-password' && (
          <div>
            <div className="kpmg-auth-icon-badge">
              <PasswordKeyIcon />
            </div>

            <h1 className="kpmg-auth-title">Choose a new password</h1>
            <p className="kpmg-auth-subtitle">
              Create a strong password for your account.
            </p>

            {errorMsg && <div className="kpmg-auth-alert error">{errorMsg}</div>}

            <form onSubmit={handleNewPasswordSubmit} className="kpmg-auth-form">
              <div className="kpmg-auth-field">
                <label className="kpmg-auth-label">New password</label>
                <div className="kpmg-auth-input-wrapper">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    className="kpmg-auth-input with-toggle"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                  />
                  <button
                    type="button"
                    className="kpmg-auth-eye-btn"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                  >
                    {showNewPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>

              <div className="kpmg-auth-field">
                <label className="kpmg-auth-label">Confirm password</label>
                <div className="kpmg-auth-input-wrapper">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    className="kpmg-auth-input with-toggle"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                  />
                  <button
                    type="button"
                    className="kpmg-auth-eye-btn"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="kpmg-auth-btn-primary"
                disabled={loading}
              >
                {loading ? 'Saving…' : 'Reset password'}
              </button>

              <button
                type="button"
                className="kpmg-auth-btn-secondary"
                onClick={() => handleNavigate('login')}
              >
                Back to Log in
              </button>
            </form>
          </div>
        )}

      </div>
    </div>
  );
}
