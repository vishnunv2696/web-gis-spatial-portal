/**
 * GeoVista Portal - Frontend Authentication Controller
 * Manages user sessions, full-page initial sign-in, login/logout dialogs,
 * CSRF token attachment, role-based UI states, and session expiration handlers.
 */

import { state } from './state.js?v=9';

let currentUser = null;
let currentCsrfToken = '';

export async function initAuth() {
  setupAuthPage();
  setupLoginModal();
  setupUserMenu();

  // Check initial session
  await checkSession();
}

export function getCurrentUser() {
  return currentUser;
}

export function getCsrfToken() {
  return currentCsrfToken;
}

export async function checkSession() {
  // Static GitHub Pages standalone mode: All features unlocked for exploration
  const staticUser = {
    username: 'gis_analyst',
    role: 'editor',
    id: 1
  };
  state.role = 'editor';
  setUserSession(staticUser);
  hideAuthOverlay();
}

function showAuthOverlay() {
  const overlay = document.getElementById('auth-overlay');
  if (overlay) {
    overlay.classList.remove('hidden');
    // Re-check viewer link visibility
    const viewerContainer = document.getElementById('auth-viewer-container');
    if (viewerContainer && state.requireLogin) {
      viewerContainer.classList.add('hide');
    }
  }
}

function hideAuthOverlay() {
  const overlay = document.getElementById('auth-overlay');
  if (overlay) {
    overlay.classList.add('hidden');
    // Ensure map redraws when revealed
    setTimeout(() => {
      if (state.map) state.map.invalidateSize();
    }, 280);
  }
}

function setUserSession(user) {
  currentUser = user;
  state.user = user;
  state.role = user.role;
  document.body.setAttribute('data-role', user.role);

  // Update navbar user button & dropdown
  const userBtn = document.getElementById('btn-nav-auth');
  const userBadge = document.getElementById('nav-user-badge');
  const editTab = document.querySelector('.sidebar-tab[data-tab="edit"]');
  const adminMenuItems = document.querySelectorAll('.admin-only-item');
  const exportMenuItems = document.querySelectorAll('.editor-admin-item');

  if (userBtn && userBadge) {
    userBadge.textContent = `${user.username} (${capitalize(user.role)})`;
    userBtn.classList.add('logged-in');
  }

  // Show/enable Edit tab for editor and admin
  if (editTab) {
    editTab.classList.remove('disabled');
    editTab.title = 'Edit Vector Features';
  }

  // Show admin items if admin
  adminMenuItems.forEach(item => {
    item.classList.toggle('hide', user.role !== 'admin');
  });

  // Show export activity logs for editor and admin
  const canExport = user.role === 'editor' || user.role === 'admin';
  exportMenuItems.forEach(item => {
    item.classList.toggle('hide', !canExport);
  });

  state.emit('auth:change', { authenticated: true, user });
}

function clearUserSession() {
  currentUser = null;
  state.user = null;
  state.role = 'viewer';
  document.body.setAttribute('data-role', 'viewer');

  const userBtn = document.getElementById('btn-nav-auth');
  const userBadge = document.getElementById('nav-user-badge');
  const editTab = document.querySelector('.sidebar-tab[data-tab="edit"]');
  const adminMenuItems = document.querySelectorAll('.admin-only-item');
  const exportMenuItems = document.querySelectorAll('.editor-admin-item');

  if (userBtn && userBadge) {
    userBadge.textContent = 'Log In';
    userBtn.classList.remove('logged-in');
  }

  // Hide or disable Edit tab
  if (editTab) {
    editTab.title = 'Log in as Editor/Admin to edit features';
  }

  adminMenuItems.forEach(item => item.classList.add('hide'));
  exportMenuItems.forEach(item => item.classList.add('hide'));
  state.emit('auth:change', { authenticated: false, user: null, role: 'viewer' });
}

function setupAuthPage() {
  const form = document.getElementById('form-auth-page');
  const errorEl = document.getElementById('auth-error-msg');
  const submitBtn = document.getElementById('btn-auth-signin');
  const continueViewerBtn = document.getElementById('btn-continue-viewer');

  // "Continue as viewer (read-only)" secondary action
  continueViewerBtn?.addEventListener('click', () => {
    if (state.requireLogin) {
      if (errorEl) {
        errorEl.textContent = 'Login is required by server configuration.';
        errorEl.classList.remove('hide');
      }
      return;
    }
    hideAuthOverlay();
    state.emit('toast', {
      type: 'info',
      message: 'Browsing in read-only viewer mode. Log in anytime from the top bar to edit.'
    });
  });

  // Submit full-page sign-in form
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('auth-page-username')?.value.trim();
    const password = document.getElementById('auth-page-password')?.value;

    if (!username || !password) {
      if (errorEl) {
        errorEl.textContent = 'Please enter both username and password.';
        errorEl.classList.remove('hide');
      }
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Signing in...';
      if (window.lucide) window.lucide.createIcons();
    }
    if (errorEl) errorEl.classList.add('hide');

    const expiredMsg = document.getElementById('auth-session-expired-msg');
    if (expiredMsg) expiredMsg.classList.add('hide');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': currentCsrfToken
        },
        credentials: 'include',
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      currentCsrfToken = data.csrfToken || currentCsrfToken;
      setUserSession(data.user);

      // Transition to map
      form.reset();
      hideAuthOverlay();

      state.emit('toast', {
        type: 'success',
        message: `Welcome back, ${data.user.username}! Signed in as ${capitalize(data.user.role)}.`
      });

    } catch (err) {
      if (errorEl) {
        errorEl.textContent = err.message;
        errorEl.classList.remove('hide');
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i data-lucide="log-in"></i> Sign In';
        if (window.lucide) window.lucide.createIcons();
      }
    }
  });
}

function setupLoginModal() {
  const modal = document.getElementById('modal-login');
  const form = document.getElementById('form-login');
  const errorEl = document.getElementById('login-error-msg');
  const submitBtn = document.getElementById('btn-submit-login');

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username')?.value.trim();
    const password = document.getElementById('login-password')?.value;

    if (!username || !password) {
      if (errorEl) {
        errorEl.textContent = 'Please enter both username and password.';
        errorEl.classList.remove('hide');
      }
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Signing in...';
      if (window.lucide) window.lucide.createIcons();
    }
    if (errorEl) errorEl.classList.add('hide');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': currentCsrfToken
        },
        credentials: 'include',
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      currentCsrfToken = data.csrfToken || currentCsrfToken;
      setUserSession(data.user);

      // Close modal
      modal?.classList.remove('open');
      form.reset();

      state.emit('toast', {
        type: 'success',
        message: `Welcome back, ${data.user.username}! Signed in as ${capitalize(data.user.role)}.`
      });

    } catch (err) {
      if (errorEl) {
        errorEl.textContent = err.message;
        errorEl.classList.remove('hide');
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i data-lucide="log-in"></i> Sign In';
        if (window.lucide) window.lucide.createIcons();
      }
    }
  });

  // Open modal / user menu from navbar
  document.getElementById('btn-nav-auth')?.addEventListener('click', () => {
    if (currentUser) {
      // Toggle dropdown menu
      const dropdown = document.getElementById('user-dropdown');
      const isOpening = !dropdown?.classList.contains('open');
      dropdown?.classList.toggle('open');
      if (isOpening) {
        document.getElementById('settings-dropdown')?.classList.remove('open');
        document.getElementById('mobile-actions-dropdown')?.classList.remove('open');
      }
    } else {
      modal?.classList.add('open');
      document.getElementById('login-username')?.focus();
    }
  });
}

function setupUserMenu() {
  const dropdown = document.getElementById('user-dropdown');
  const logoutBtn = document.getElementById('btn-menu-logout');
  const historyBtn = document.getElementById('btn-menu-edit-history');
  const usersBtn = document.getElementById('btn-menu-users');

  // Close dropdown on outside click
  window.addEventListener('click', (e) => {
    if (!e.target.closest('#nav-user-menu-wrap')) {
      dropdown?.classList.remove('open');
    }
  });

  // Logout -> Returns to the initial sign-in page
  logoutBtn?.addEventListener('click', async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'X-CSRF-Token': currentCsrfToken },
        credentials: 'include'
      });
      clearUserSession();
      dropdown?.classList.remove('open');

      // Return to full-page sign-in screen
      showAuthOverlay();

      state.emit('toast', { type: 'info', message: 'You have been signed out.' });
    } catch (err) {
      console.error('Logout error:', err);
    }
  });

  // Admin Edit History Dialog
  historyBtn?.addEventListener('click', () => {
    dropdown?.classList.remove('open');
    document.getElementById('modal-edit-history')?.classList.add('open');
    state.emit('admin:openHistory');
  });

  // Admin Users Dialog
  usersBtn?.addEventListener('click', () => {
    dropdown?.classList.remove('open');
    document.getElementById('modal-admin-users')?.classList.add('open');
    state.emit('admin:openUsers');
  });

  // Export Activity Log Dialog (for editors & admins)
  const exportHistoryBtn = document.getElementById('btn-menu-export-history');
  exportHistoryBtn?.addEventListener('click', () => {
    dropdown?.classList.remove('open');
    document.getElementById('modal-export-history')?.classList.add('open');
    state.emit('export:openHistory');
  });
}

export function handleSessionExpired() {
  clearUserSession();
  
  // Display expired session message and show sign-in screen
  const expiredMsg = document.getElementById('auth-session-expired-msg');
  if (expiredMsg) {
    expiredMsg.classList.remove('hide');
  }
  showAuthOverlay();

  state.emit('toast', {
    type: 'warning',
    message: 'Your session has expired. Please sign in again.'
  });
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}
