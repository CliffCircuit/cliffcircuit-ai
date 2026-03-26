// ═══════════════════════════════════════════════════════════════════════════
// auth.js — Shared Google OAuth auth guard for CliffCircuit Portal
// Loaded by all portal pages. Redirects to login.html if not authenticated.
// ═══════════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  const AUTH_KEY = 'cc_google_auth';
  const LOGIN_PATH = '/portal/login.html';

  /**
   * Get current authenticated session from localStorage.
   * Returns { token, user: { email, name, picture, expiresAt, userId, roles } } or null.
   */
  function getCurrentSession() {
    try {
      const raw = localStorage.getItem(AUTH_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      // Check expiry (if expiresAt is part of the stored user object or the session itself)
      // Assuming session.user contains expiresAt from the JWT payload
      if (session.user && session.user.expiresAt && Date.now() > session.user.expiresAt) {
        localStorage.removeItem(AUTH_KEY);
        return null;
      }
      return session;
    } catch {
      localStorage.removeItem(AUTH_KEY);
      return null;
    }
  }

  /**
   * Store authenticated session data, including the server-issued JWT.
   * @param {object} sessionData - Object containing { token: string, user: object }
   */
  function setAuthUser(sessionData) {
    localStorage.setItem(AUTH_KEY, JSON.stringify(sessionData));
  }

  /**
   * Clear auth session and redirect to login.
   */
  function authLogout() {
    localStorage.removeItem(AUTH_KEY);
    // Also clear legacy auth
    localStorage.removeItem('cc_auth');
    window.location.href = LOGIN_PATH;
  }

  /**
   * Check if user is authenticated. If not, redirect to login.
   * Call this on page load for protected pages.
   */
  function requireAuth() {
    const session = getCurrentSession();
    if (!session) {
      // Save intended destination for post-login redirect
      const current = window.location.pathname + window.location.search;
      if (current !== LOGIN_PATH && !current.includes('auth-callback')) {
        sessionStorage.setItem('cc_auth_redirect', current);
      }
      window.location.href = LOGIN_PATH;
      return false;
    }
    return true;
  }

  // Expose globally
  window.getCurrentSession = getCurrentSession;
  window.setAuthUser = setAuthUser; // Keep this name for now for backward compatibility or rename to setSession
  window.authLogout = authLogout;
  window.requireAuth = requireAuth;

  // Auto-guard: if this script is loaded on a protected page, check auth immediately.
  // Login and callback pages should NOT load this script (or load it after their own logic).
  const path = window.location.pathname;
  const isPublicPage = path.includes('login.html') || path.includes('auth-callback.html');
  if (!isPublicPage) {
    requireAuth();
  }
})();
