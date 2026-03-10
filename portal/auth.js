// ═══════════════════════════════════════════════════════════════════════════
// auth.js — Shared Google OAuth auth guard for CliffCircuit Portal
// Loaded by all portal pages. Redirects to login.html if not authenticated.
// ═══════════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  const AUTH_KEY = 'cc_google_auth';
  const LOGIN_PATH = '/portal/login.html';

  /**
   * Get current authenticated user from localStorage.
   * Returns { email, name, picture, expiresAt } or null.
   */
  function getCurrentUser() {
    try {
      const raw = localStorage.getItem(AUTH_KEY);
      if (!raw) return null;
      const user = JSON.parse(raw);
      // Check expiry
      if (user.expiresAt && Date.now() > user.expiresAt) {
        localStorage.removeItem(AUTH_KEY);
        return null;
      }
      return user;
    } catch {
      localStorage.removeItem(AUTH_KEY);
      return null;
    }
  }

  /**
   * Store authenticated user session.
   */
  function setAuthUser(userData) {
    localStorage.setItem(AUTH_KEY, JSON.stringify(userData));
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
    const user = getCurrentUser();
    if (!user) {
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
  window.getCurrentUser = getCurrentUser;
  window.setAuthUser = setAuthUser;
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
