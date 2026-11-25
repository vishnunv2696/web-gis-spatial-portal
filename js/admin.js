/**
 * GeoVista Portal - Admin Controller
 * Manages the Admin Edit History Audit Log panel (filtering, row-to-map zoom, CSV export)
 * and the User Management panel (listing, creation, status toggle, password reset).
 */

import { state } from './state.js?v=9';
import { getCsrfToken, handleSessionExpired } from './auth.js?v=9';
import { zoomToFeature } from './layers.js?v=9';

export function initAdmin() {
  setupEditHistoryModal();
  setupUserManagementModal();
  setupExportHistoryModal();

  state.on('admin:openHistory', loadEditHistory);
  state.on('admin:openUsers', loadUserList);
  state.on('export:openHistory', loadExportHistory);
}

// -----------------------------------------------------------------------------
// 1. Audit Edit History Panel
// -----------------------------------------------------------------------------
function setupEditHistoryModal() {
  const modal = document.getElementById('modal-edit-history');
  const btnFilter = document.getElementById('btn-filter-history');
  const btnReset = document.getElementById('btn-reset-history');
  const btnExport = document.getElementById('btn-export-history-csv');

  btnFilter?.addEventListener('click', loadEditHistory);

  btnReset?.addEventListener('click', () => {
    document.getElementById('history-layer-filter').value = '';
    document.getElementById('history-action-filter').value = '';
    document.getElementById('history-user-filter').value = '';
    loadEditHistory();
  });

  btnExport?.addEventListener('click', () => {
    const layer = document.getElementById('history-layer-filter')?.value || '';
    const action = document.getElementById('history-action-filter')?.value || '';
    const user = document.getElementById('history-user-filter')?.value || '';

    const params = new URLSearchParams();
    if (layer) params.set('layer', layer);
    if (action) params.set('action', action);
    if (user) params.set('username', user);

    window.open(`/api/admin/edit-log/export?${params.toString()}`, '_blank');
    state.emit('toast', { type: 'success', message: 'Downloading audit edit history CSV...' });
  });
}

export async function loadEditHistory() {
  const tableContainer = document.getElementById('history-table-container');
  const countBadge = document.getElementById('history-count-badge');
  if (!tableContainer) return;

  const layer = document.getElementById('history-layer-filter')?.value || '';
  const action = document.getElementById('history-action-filter')?.value || '';
  const username = document.getElementById('history-user-filter')?.value?.trim() || '';

  const params = new URLSearchParams({ limit: '100', offset: '0' });
  if (layer) params.set('layer', layer);
  if (action) params.set('action', action);
  if (username) params.set('username', username);

  tableContainer.innerHTML = '<div class="loading-state"><i data-lucide="loader-2" class="spin"></i> Loading audit logs...</div>';
  if (window.lucide) window.lucide.createIcons();

  try {
    const res = await fetch(`/api/admin/edit-log?${params.toString()}`, {
      credentials: 'include'
    });

    if (res.status === 401) {
      handleSessionExpired();
      return;
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch edit logs');

    if (countBadge) countBadge.textContent = `${data.total} audit events`;

    if (!data.records || data.records.length === 0) {
      tableContainer.innerHTML = '<div class="empty-state">No edit history records found matching criteria.</div>';
      return;
    }

    let html = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Action</th>
            <th>Layer</th>
            <th>Feature ID</th>
            <th>Editor</th>
            <th>Change Summary</th>
          </tr>
        </thead>
        <tbody>
    `;

    data.records.forEach(r => {
      let actionBadge = 'badge-blue';
      if (r.action === 'CREATE') actionBadge = 'badge-accent';
      if (r.action === 'DELETE') actionBadge = 'badge-danger';

      let diffSummary = '';
      if (r.action === 'CREATE') {
        diffSummary = `Created "${r.new_values?.name || r.feature_id}" (${r.new_values?.category || ''})`;
      } else if (r.action === 'UPDATE') {
        diffSummary = `Modified properties (name: ${r.new_values?.name || '—'})`;
      } else if (r.action === 'DELETE') {
        diffSummary = `Removed feature "${r.old_values?.name || r.feature_id}"`;
      }

      const dateStr = new Date(r.at).toLocaleString();

      html += `
        <tr class="history-row" data-layer="${r.layer}" data-feature-id="${r.feature_id}" title="Click to zoom to feature on map">
          <td style="font-size:11px;color:var(--text-muted);">${dateStr}</td>
          <td><span class="badge ${actionBadge}">${r.action}</span></td>
          <td style="font-weight:600;">${r.layer}</td>
          <td><code>${r.feature_id}</code></td>
          <td><strong>${r.username}</strong></td>
          <td style="font-size:11.5px;color:var(--text-secondary);">${diffSummary}</td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    tableContainer.innerHTML = html;

    // Row Click: Zoom to Feature on Map
    tableContainer.querySelectorAll('.history-row').forEach(row => {
      row.addEventListener('click', () => {
        const lKey = row.getAttribute('data-layer');
        const fId = row.getAttribute('data-feature-id');

        // Close modal and fly to feature
        document.getElementById('modal-edit-history')?.classList.remove('open');
        zoomToFeature(lKey, fId);
        state.emit('toast', { type: 'info', message: `Zoomed to ${lKey} feature ${fId}` });
      });
    });

  } catch (err) {
    console.error('Audit log fetch error:', err);
    tableContainer.innerHTML = `<div class="empty-state" style="color:var(--danger);">${err.message}</div>`;
  }
}

// -----------------------------------------------------------------------------
// 2. Admin User Management Panel
// -----------------------------------------------------------------------------
function setupUserManagementModal() {
  const formCreate = document.getElementById('form-admin-create-user');

  formCreate?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('admin-new-username')?.value.trim();
    const password = document.getElementById('admin-new-password')?.value;
    const role = document.getElementById('admin-new-role')?.value;

    if (!username || !password || !role) {
      state.emit('toast', { type: 'warning', message: 'All user fields are required.' });
      return;
    }

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken()
        },
        credentials: 'include',
        body: JSON.stringify({ username, password, role })
      });

      if (res.status === 401) {
        handleSessionExpired();
        return;
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create user');

      state.emit('toast', { type: 'success', message: `User "${username}" created successfully.` });
      formCreate.reset();
      await loadUserList();

    } catch (err) {
      state.emit('toast', { type: 'danger', message: err.message });
    }
  });
}

export async function loadUserList() {
  const container = document.getElementById('admin-users-table-container');
  if (!container) return;

  container.innerHTML = '<div class="loading-state"><i data-lucide="loader-2" class="spin"></i> Loading users...</div>';
  if (window.lucide) window.lucide.createIcons();

  try {
    const res = await fetch('/api/admin/users', { credentials: 'include' });
    if (res.status === 401) {
      handleSessionExpired();
      return;
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load user list');

    let html = `
      <table class="data-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Username</th>
            <th>Role</th>
            <th>Status</th>
            <th>Failed Logins</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
    `;

    (data.users || []).forEach(u => {
      const isLocked = u.locked_until && new Date(u.locked_until) > new Date();

      html += `
        <tr>
          <td>${u.id}</td>
          <td><strong>${u.username}</strong></td>
          <td><span class="badge badge-blue">${u.role.toUpperCase()}</span></td>
          <td>
            ${u.active ? '<span class="badge badge-accent">Active</span>' : '<span class="badge badge-danger">Deactivated</span>'}
            ${isLocked ? '<span class="badge badge-warning">Locked</span>' : ''}
          </td>
          <td>${u.failed_attempts || 0}</td>
          <td>
            <div style="display:flex;gap:4px;">
              <button class="btn btn-xs ${u.active ? 'btn-outline-danger' : 'btn-outline'} btn-user-toggle-status" data-user-id="${u.id}" data-active="${u.active}">
                ${u.active ? 'Deactivate' : 'Activate'}
              </button>
              <button class="btn btn-xs btn-outline btn-user-reset-pwd" data-user-id="${u.id}" data-username="${u.username}">
                Reset Password
              </button>
            </div>
          </td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    // Status Toggle Handlers
    container.querySelectorAll('.btn-user-toggle-status').forEach(btn => {
      btn.addEventListener('click', async () => {
        const userId = btn.getAttribute('data-user-id');
        const currentActive = btn.getAttribute('data-active') === 'true';
        const newActive = !currentActive;

        try {
          const res = await fetch(`/api/admin/users/${userId}/status`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'X-CSRF-Token': getCsrfToken()
            },
            credentials: 'include',
            body: JSON.stringify({ active: newActive })
          });

          const resData = await res.json();
          if (!res.ok) throw new Error(resData.error || 'Failed to update user');

          state.emit('toast', { type: 'success', message: `User status updated.` });
          await loadUserList();
        } catch (err) {
          state.emit('toast', { type: 'danger', message: err.message });
        }
      });
    });

    // Reset Password Handlers
    container.querySelectorAll('.btn-user-reset-pwd').forEach(btn => {
      btn.addEventListener('click', async () => {
        const userId = btn.getAttribute('data-user-id');
        const username = btn.getAttribute('data-username');
        const newPassword = prompt(`Enter new password for user "${username}" (min 8 chars):`);
        if (!newPassword) return;

        if (newPassword.length < 8) {
          state.emit('toast', { type: 'warning', message: 'Password must be at least 8 characters.' });
          return;
        }

        try {
          const res = await fetch(`/api/admin/users/${userId}/password`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'X-CSRF-Token': getCsrfToken()
            },
            credentials: 'include',
            body: JSON.stringify({ newPassword })
          });

          const resData = await res.json();
          if (!res.ok) throw new Error(resData.error || 'Failed to reset password');

          state.emit('toast', { type: 'success', message: `Password reset for user "${username}".` });
          await loadUserList();
        } catch (err) {
          state.emit('toast', { type: 'danger', message: err.message });
        }
      });
    });

  } catch (err) {
    container.innerHTML = `<div class="empty-state" style="color:var(--danger);">${err.message}</div>`;
  }
}

// -----------------------------------------------------------------------------
// 3. Export Activity Audit Log Panel
// -----------------------------------------------------------------------------
function setupExportHistoryModal() {
  const btnFilter = document.getElementById('btn-filter-export-logs');
  const btnReset = document.getElementById('btn-reset-export-logs');

  btnFilter?.addEventListener('click', loadExportHistory);

  btnReset?.addEventListener('click', () => {
    const statusEl = document.getElementById('export-status-filter');
    const userEl = document.getElementById('export-user-filter');
    if (statusEl) statusEl.value = '';
    if (userEl) userEl.value = '';
    loadExportHistory();
  });
}

export async function loadExportHistory() {
  const tableContainer = document.getElementById('export-table-container');
  const countBadge = document.getElementById('export-count-badge');
  const todayBadge = document.getElementById('export-today-badge');
  const userFilterWrap = document.getElementById('export-user-filter-wrap');
  if (!tableContainer) return;

  const isAdmin = state.role === 'admin';
  if (userFilterWrap) {
    userFilterWrap.style.display = isAdmin ? 'flex' : 'none';
  }

  const status = document.getElementById('export-status-filter')?.value || '';
  const username = isAdmin ? (document.getElementById('export-user-filter')?.value?.trim() || '') : '';

  const params = new URLSearchParams({ limit: '100', offset: '0' });
  if (status) params.set('status', status);
  if (username) params.set('username', username);

  tableContainer.innerHTML = '<div class="loading-state"><i data-lucide="loader-2" class="spin"></i> Loading export audit logs...</div>';
  if (window.lucide) window.lucide.createIcons();

  try {
    const res = await fetch(`/api/export/logs?${params.toString()}`, {
      credentials: 'include'
    });

    if (res.status === 401) {
      handleSessionExpired();
      return;
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch export activity logs');

    if (countBadge) countBadge.textContent = `${data.total} attempts`;
    if (todayBadge) todayBadge.textContent = `${data.totalToday} today`;

    if (!data.records || data.records.length === 0) {
      tableContainer.innerHTML = '<div class="empty-state">No export audit records found.</div>';
      return;
    }

    let html = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>User</th>
            <th>Role</th>
            <th>Resource</th>
            <th>Format</th>
            <th>Rows</th>
            <th>Status</th>
            <th>IP Address</th>
          </tr>
        </thead>
        <tbody>
    `;

    data.records.forEach(r => {
      const timeStr = new Date(r.export_time).toLocaleString();
      const statusBadge = r.status === 'ALLOWED'
        ? '<span class="badge badge-success" style="background:#16a34a;color:#fff;">ALLOWED</span>'
        : '<span class="badge badge-accent" style="background:#dc2626;color:#fff;">DENIED</span>';

      html += `
        <tr>
          <td style="white-space:nowrap;font-size:11.5px;color:var(--text-muted);">${timeStr}</td>
          <td><strong>${r.username}</strong></td>
          <td><span class="badge badge-subtle">${r.role}</span></td>
          <td style="font-family:monospace;font-size:11.5px;">${r.resource}</td>
          <td><span class="badge badge-blue">${String(r.format).toUpperCase()}</span></td>
          <td style="text-align:right;font-weight:600;">${r.row_count}</td>
          <td>${statusBadge}</td>
          <td style="font-size:11px;color:var(--text-muted);">${r.ip_address || '-'}</td>
        </tr>
      `;
    });

    html += `
        </tbody>
      </table>
    `;

    tableContainer.innerHTML = html;

  } catch (err) {
    console.error('Error fetching export logs:', err);
    tableContainer.innerHTML = `<div class="empty-state" style="color:var(--danger);">${err.message}</div>`;
  }
}
