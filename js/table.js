/**
 * GeoVista Portal - Attribute Table Controller
 * Manages the attribute table bottom drawer, multi-layer tabs, sorting,
 * text searching, row-to-map synchronization, and CSV export.
 */

import { state } from './state.js';
import { zoomToFeature } from './layers.js';

let activeLayerId = 'points';
let sortColumn = null;
let sortAscending = true;
let searchQuery = '';

export function initTable() {
  setupDrawerControls();
  updateExportButtonState();

  // React immediately to authentication role changes
  state.on('auth:change', () => {
    updateExportButtonState();
  });

  // Listen for layers loaded
  state.on('layers:loaded', () => {
    renderLayerTabs();
    renderTable();
  });

  // Re-render table if features filtered or selection changes
  state.on('layer:filtered', () => {
    renderTable();
  });

  state.on('layer:updated', () => {
    renderLayerTabs();
    renderTable();
  });

  state.on('feature:selected', (selection) => {
    if (selection && selection.layerId === activeLayerId) {
      highlightSelectedRow(selection.feature);
    }
  });
}

function setupDrawerControls() {
  const drawer = document.getElementById('attribute-drawer');
  const toggleBtn = document.getElementById('btn-toggle-drawer');
  const closeBtn = document.getElementById('btn-close-drawer');
  const searchInput = document.getElementById('table-search');
  const exportBtn = document.getElementById('btn-export-csv');

  const toggleDrawer = () => {
    drawer?.classList.toggle('open');
    const isOpen = drawer?.classList.contains('open');
    state.drawerOpen = isOpen;
    toggleBtn?.classList.toggle('active', isOpen);
  };

  toggleBtn?.addEventListener('click', toggleDrawer);
  closeBtn?.addEventListener('click', () => {
    drawer?.classList.remove('open');
    state.drawerOpen = false;
    toggleBtn?.classList.remove('active');
  });

  // Search input with debounce
  searchInput?.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim().toLowerCase();
    renderTable();
  });

  // CSV Export button
  exportBtn?.addEventListener('click', exportActiveTableToCSV);
}

export function openDrawerForLayer(layerId) {
  const drawer = document.getElementById('attribute-drawer');
  const toggleBtn = document.getElementById('btn-toggle-drawer');
  if (drawer && !drawer.classList.contains('open')) {
    drawer.classList.add('open');
    state.drawerOpen = true;
    toggleBtn?.classList.add('active');
  }

  activeLayerId = layerId;
  renderLayerTabs();
  renderTable();
}

function renderLayerTabs() {
  const container = document.getElementById('drawer-layer-tabs');
  if (!container) return;

  let tabsHtml = '';
  state.layers.forEach((layerItem, id) => {
    const isActive = id === activeLayerId;
    const isFiltered = layerItem.filteredIds !== undefined && layerItem.filteredIds !== null;
    const countDisplay = isFiltered 
      ? `(${layerItem.filteredIds.size} of ${layerItem.featureCount})`
      : `(${layerItem.featureCount})`;
    tabsHtml += `
      <button class="drawer-tab ${isActive ? 'active' : ''} ${isFiltered ? 'tab-filtered' : ''}" data-layer-id="${id}">
        ${layerItem.config.title} ${countDisplay}
      </button>
    `;
  });

  container.innerHTML = tabsHtml;

  container.querySelectorAll('.drawer-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      activeLayerId = tab.getAttribute('data-layer-id');
      renderLayerTabs();
      renderTable();
    });
  });
}

function renderTable() {
  const tableContainer = document.getElementById('attribute-table-container');
  const countBadge = document.getElementById('table-row-count');
  const layer = state.getLayer(activeLayerId);

  if (!tableContainer || !layer) {
    if (tableContainer) tableContainer.innerHTML = '<div class="empty-state">No layer data available</div>';
    return;
  }

  const { config, data } = layer;
  let features = (data && data.features) ? [...data.features] : [];

  // 0. Attribute Filter from state
  const isFiltered = layer.filteredIds !== undefined && layer.filteredIds !== null;
  if (isFiltered) {
    features = features.filter(feat => {
      const id = feat.properties?.[config.idField];
      return layer.filteredIds.has(id);
    });
  }

  // 1. Text Search Filter (searches within filtered subset)
  if (searchQuery) {
    features = features.filter(feat => {
      const props = feat.properties || {};
      return Object.values(props).some(val => 
        String(val).toLowerCase().includes(searchQuery)
      );
    });
  }

  // 2. Column Sorting
  if (sortColumn) {
    const fldMeta = config.fields?.find(f => f.key === sortColumn);
    features.sort((a, b) => {
      let valA = a.properties?.[sortColumn];
      if ((valA === undefined || valA === null) && fldMeta?.altKey) {
        valA = a.properties?.[fldMeta.altKey];
      }
      let valB = b.properties?.[sortColumn];
      if ((valB === undefined || valB === null) && fldMeta?.altKey) {
        valB = b.properties?.[fldMeta.altKey];
      }

      if (valA === valB) return 0;
      if (valA === undefined || valA === null) return 1;
      if (valB === undefined || valB === null) return -1;

      let comparison = 0;
      if (typeof valA === 'number' && typeof valB === 'number') {
        comparison = valA - valB;
      } else {
        comparison = String(valA).localeCompare(String(valB), undefined, { numeric: true });
      }

      return sortAscending ? comparison : -comparison;
    });
  }

  // Update row count badge
  if (countBadge) {
    const totalCount = layer.featureCount || layer.data?.features?.length || 0;
    if (isFiltered) {
      countBadge.textContent = searchQuery 
        ? `Showing ${features.length} of ${layer.filteredIds.size} filtered (of ${totalCount})`
        : `Showing ${features.length} of ${totalCount}`;
    } else {
      countBadge.textContent = searchQuery 
        ? `Showing ${features.length} of ${totalCount}`
        : `${features.length} features`;
    }
  }

  // Build filter banner if active
  let bannerHtml = '';
  if (isFiltered) {
    bannerHtml = `
      <div class="table-filter-banner" style="display:flex;align-items:center;justify-content:space-between;padding:6px 12px;background:var(--primary-light, rgba(2,132,199,0.08));border-bottom:1px solid var(--border-color);font-size:12px;font-weight:600;">
        <span>
          <i data-lucide="filter" style="width:13px;height:13px;vertical-align:middle;color:var(--primary);"></i>
          Filter active: showing <strong>${features.length} of ${layer.featureCount}</strong> features
          &bull; <a href="#" id="btn-clear-table-filter" style="color:var(--primary);text-decoration:underline;">Clear filter</a>
        </span>
        <button id="btn-zoom-table-filter" class="btn btn-xs btn-outline" style="padding:2px 8px;">
          <i data-lucide="maximize-2"></i> Zoom to results
        </button>
      </div>
    `;
  }

  // Build table HTML
  const fields = config.fields || [];
  let tableHtml = bannerHtml + '<table class="data-table"><thead><tr>';

  fields.forEach(fld => {
    const isSorted = sortColumn === fld.key;
    const sortIcon = isSorted ? (sortAscending ? ' &uarr;' : ' &darr;') : '';
    tableHtml += `
      <th data-field="${fld.key}">
        ${fld.label}${sortIcon}
      </th>
    `;
  });

  tableHtml += '</tr></thead><tbody>';

  if (features.length === 0) {
    const msg = isFiltered 
      ? 'No features match the active filter criteria.' 
      : 'No matching features found';
    tableHtml += `<tr><td colspan="${fields.length}" style="text-align:center;padding:24px;color:var(--text-muted);">${msg}</td></tr>`;
  } else {
    features.forEach(feat => {
      const props = feat.properties || {};
      const featId = props[config.idField];
      const isSelected = state.selectedFeature && 
        state.selectedFeature.feature?.properties?.[config.idField] === featId;

      tableHtml += `<tr data-feature-id="${featId}" class="${isSelected ? 'selected' : ''}">`;

      fields.forEach(fld => {
        let val = props[fld.key];
        if ((val === undefined || val === null) && fld.altKey) {
          val = props[fld.altKey];
        }
        if (val === undefined || val === null) val = '—';
        const displayVal = fld.format ? fld.format(val) : val;
        tableHtml += `<td>${displayVal}</td>`;
      });

      tableHtml += '</tr>';
    });
  }

  tableHtml += '</tbody></table>';
  tableContainer.innerHTML = tableHtml;

  // Header Sort Click
  tableContainer.querySelectorAll('th').forEach(th => {
    th.addEventListener('click', () => {
      const fieldKey = th.getAttribute('data-field');
      if (sortColumn === fieldKey) {
        sortAscending = !sortAscending;
      } else {
        sortColumn = fieldKey;
        sortAscending = true;
      }
      renderTable();
    });
  });

  // Filter banner events
  const clearBtn = document.getElementById('btn-clear-table-filter');
  clearBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    state.emit('filter:clear', { layerId: activeLayerId });
  });

  const zoomBtn = document.getElementById('btn-zoom-table-filter');
  zoomBtn?.addEventListener('click', () => {
    state.emit('filter:locate', { layerId: activeLayerId });
  });

  // Row Click Sync
  tableContainer.querySelectorAll('tbody tr').forEach(tr => {
    tr.addEventListener('click', () => {
      const featId = tr.getAttribute('data-feature-id');
      if (!featId) return;

      tableContainer.querySelectorAll('tr.selected').forEach(r => r.classList.remove('selected'));
      tr.classList.add('selected');

      zoomToFeature(activeLayerId, featId);
    });
  });

  if (window.lucide) window.lucide.createIcons();
}

function highlightSelectedRow(feature) {
  const layer = state.getLayer(activeLayerId);
  if (!layer || !feature) return;

  const idField = layer.config.idField;
  const featId = feature.properties?.[idField];

  const tableContainer = document.getElementById('attribute-table-container');
  if (!tableContainer) return;

  tableContainer.querySelectorAll('tr.selected').forEach(r => r.classList.remove('selected'));
  const row = tableContainer.querySelector(`tr[data-feature-id="${featId}"]`);
  if (row) {
    row.classList.add('selected');
    row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

export function updateExportButtonState() {
  const exportBtn = document.getElementById('btn-export-csv');
  if (!exportBtn) return;

  const canExport = state.role === 'editor' || state.role === 'admin';
  if (canExport) {
    exportBtn.removeAttribute('disabled');
    exportBtn.removeAttribute('title');
    exportBtn.style.opacity = '1';
    exportBtn.style.cursor = 'pointer';
    exportBtn.innerHTML = '<i data-lucide="download"></i> Export CSV';
  } else {
    exportBtn.setAttribute('disabled', 'true');
    exportBtn.setAttribute('title', 'Export is available to editors and admins. Please sign in.');
    exportBtn.style.opacity = '0.45';
    exportBtn.style.cursor = 'not-allowed';
    exportBtn.innerHTML = '<i data-lucide="lock"></i> Export CSV';
  }
  if (window.lucide) window.lucide.createIcons();
}

async function exportActiveTableToCSV() {
  const layer = state.getLayer(activeLayerId);
  if (!layer || !layer.data) return;

  const exportBtn = document.getElementById('btn-export-csv');
  if (exportBtn) {
    exportBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Exporting...';
    if (window.lucide) window.lucide.createIcons();
  }

  try {
    const fields = layer.config.fields || [];
    const features = (layer.filteredIds && layer.filteredIds.size > 0)
      ? layer.data.features.filter(f => layer.filteredIds.has(f.properties?.[layer.config.idField]))
      : (layer.data.features || []);

    const header = fields.map(f => `"${f.label.replace(/"/g, '""')}"`).join(',');
    const rows = features.map(feat => {
      return fields.map(f => {
        let val = feat.properties?.[f.key];
        if ((val === undefined || val === null) && f.altKey) {
          val = feat.properties?.[f.altKey];
        }
        if (val === null || val === undefined) val = '';
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(',');
    });

    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `geovista_${activeLayerId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    state.emit('toast', {
      type: 'success',
      message: `Exported ${features.length} records to geovista_${activeLayerId}.csv`
    });
  } catch (err) {
    console.error('Table export error:', err);
    state.emit('toast', {
      type: 'error',
      message: `Failed to export CSV: ${err.message}`
    });
  } finally {
    if (exportBtn) {
      updateExportButtonState();
    }
  }
}
