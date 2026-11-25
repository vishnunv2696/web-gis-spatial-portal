/**
 * GeoVista Portal - Advanced Navigation Extras
 * Handles status bar inline coordinate jumping, map bookmarks in localStorage,
 * shareable URL hash generation and restoration, North arrow, and reset view.
 */

import { state } from './state.js?v=10';
import { parseCoordinates, formatDD } from './coords.js?v=10';
import { dropLocationMarker } from './search.js?v=10';
import { MAP_CONFIG } from './config.js?v=10';

const BOOKMARKS_KEY = 'geovista_bookmarks';

const DEFAULT_HOME_BOOKMARK = {
  id: 'bm_home',
  name: 'Default Kozhikode Extent',
  isHome: true,
  center: [11.25875, 75.78041],
  zoom: 14,
  activeLayers: ['points', 'roads', 'division_boundary'],
  basemapId: 'carto-light',
  createdAt: 'Default Preset'
};

export function initNavigationExtras() {
  setupStatusBarCoordinateEditor();
  setupBookmarks();
  setupShareableLink();
  setupNorthArrowAndResetView();
}

// -----------------------------------------------------------------------------
// 1. Status Bar Inline Coordinate Editor ("Go to coordinates")
// -----------------------------------------------------------------------------
function setupStatusBarCoordinateEditor() {
  const coordsWrap = document.getElementById('status-coords-wrap');
  const coordsText = document.getElementById('status-coords');
  const inputBox = document.getElementById('status-coords-input-box');
  const inputEl = document.getElementById('status-coords-input');
  const goBtn = document.getElementById('btn-status-coords-go');
  const closeBtn = document.getElementById('btn-status-coords-close');

  if (!coordsText || !inputBox || !inputEl) return;

  const showEditor = () => {
    coordsText.classList.add('hide');
    inputBox.classList.remove('hide');

    if (state.map) {
      const center = state.map.getCenter();
      inputEl.value = `${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`;
    }
    inputEl.focus();
    inputEl.select();
  };

  const hideEditor = () => {
    inputBox.classList.add('hide');
    coordsText.classList.remove('hide');
  };

  const executeJump = () => {
    const text = inputEl.value.trim();
    if (!text) {
      hideEditor();
      return;
    }

    const parsed = parseCoordinates(text);
    if (!parsed) {
      state.emit('toast', {
        type: 'warning',
        message: 'Invalid coordinate format. Enter DD (11.25, 75.78), DMS, or UTM Zone 43N.'
      });
      return;
    }

    dropLocationMarker(parsed.lat, parsed.lon, `Jump: ${parsed.format}`, parsed.label);
    hideEditor();
    state.emit('toast', {
      type: 'success',
      message: `Navigated to coordinates: ${parsed.label}`
    });
  };

  coordsText.addEventListener('click', showEditor);
  goBtn?.addEventListener('click', executeJump);
  closeBtn?.addEventListener('click', hideEditor);

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      executeJump();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      hideEditor();
    }
  });
}

// -----------------------------------------------------------------------------
// 2. Map Bookmarks (localStorage)
// -----------------------------------------------------------------------------
function setupBookmarks() {
  const bookmarksBtn = document.getElementById('btn-nav-bookmarks');
  const modal = document.getElementById('modal-bookmarks');
  const saveBtn = document.getElementById('btn-save-bookmark');
  const nameInput = document.getElementById('input-bookmark-name');
  const homeBtn = document.getElementById('btn-home-extent');

  bookmarksBtn?.addEventListener('click', () => {
    modal?.classList.add('open');
    renderBookmarksList();
    if (nameInput) {
      nameInput.value = '';
      nameInput.focus();
    }
  });

  saveBtn?.addEventListener('click', () => {
    if (!state.map) return;

    const name = nameInput?.value.trim() || `Bookmark (${new Date().toLocaleTimeString()})`;
    const center = state.map.getCenter();
    const zoom = state.map.getZoom();
    const basemapId = state.activeBasemapId;

    const visibleLayers = [];
    state.layers.forEach((l, id) => {
      if (l.visible) visibleLayers.push(id);
    });

    const newBookmark = {
      id: `bm_${Date.now()}`,
      name,
      center: [center.lat, center.lng],
      zoom,
      activeLayers: visibleLayers,
      basemapId,
      createdAt: new Date().toLocaleDateString()
    };

    saveBookmark(newBookmark);
    if (nameInput) nameInput.value = '';
    renderBookmarksList();
    state.emit('toast', { type: 'success', message: `Saved bookmark "${name}".` });
  });

  homeBtn?.addEventListener('click', () => {
    if (state.map) {
      state.map.fitBounds(MAP_CONFIG.fullExtentBounds, { padding: [25, 25], maxZoom: 16 });
      modal?.classList.remove('open');
      state.emit('toast', { type: 'info', message: 'Restored Home Extent.' });
    }
  });
}

function getStoredBookmarks() {
  try {
    const raw = localStorage.getItem(BOOKMARKS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return [DEFAULT_HOME_BOOKMARK, ...parsed.filter(b => b.id !== 'bm_home')];
  } catch {
    return [DEFAULT_HOME_BOOKMARK];
  }
}

function saveBookmark(bookmark) {
  try {
    const bookmarks = getStoredBookmarks().filter(b => b.id !== 'bm_home');
    bookmarks.unshift(bookmark);
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks));
  } catch (err) {
    console.warn('Failed to save bookmark:', err);
  }
}

function deleteBookmark(id) {
  try {
    const bookmarks = getStoredBookmarks().filter(b => b.id !== 'bm_home' && b.id !== id);
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks));
    renderBookmarksList();
    state.emit('toast', { type: 'info', message: 'Bookmark removed.' });
  } catch (err) {
    console.warn('Failed to delete bookmark:', err);
  }
}

function renderBookmarksList() {
  const container = document.getElementById('bookmarks-list');
  if (!container) return;

  const bookmarks = getStoredBookmarks();
  let html = '';

  bookmarks.forEach(bm => {
    const isHome = !!bm.isHome;
    const centerStr = Array.isArray(bm.center)
      ? `${bm.center[0].toFixed(4)}, ${bm.center[1].toFixed(4)}`
      : 'Default View';

    html += `
      <div class="bookmark-card" data-id="${bm.id}">
        <div class="bookmark-info" data-id="${bm.id}">
          <div class="bookmark-name">
            ${isHome ? '<i data-lucide="home" style="width:13px;height:13px;color:var(--primary);display:inline;vertical-align:middle;margin-right:4px;"></i>' : ''}
            ${escapeHtml(bm.name)}
          </div>
          <div class="bookmark-meta">Zoom: ${bm.zoom} &bull; ${centerStr}</div>
        </div>
        <div class="bookmark-actions">
          <button class="btn btn-xs btn-outline btn-jump-bookmark" data-id="${bm.id}" title="Jump to view">
            Go
          </button>
          ${!isHome ? `
            <button class="btn btn-xs btn-icon btn-del-bookmark" data-id="${bm.id}" title="Delete bookmark" style="color:var(--danger);">
              <i data-lucide="trash-2"></i>
            </button>
          ` : ''}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  // Wire jump and delete actions
  container.querySelectorAll('.bookmark-info, .btn-jump-bookmark').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-id');
      const bm = bookmarks.find(b => b.id === id);
      if (bm && state.map) {
        state.map.setView(bm.center, bm.zoom, { animate: true });
        if (bm.basemapId && bm.basemapId !== state.activeBasemapId) {
          state.setBasemap(bm.basemapId);
        }
        if (Array.isArray(bm.activeLayers)) {
          state.layers.forEach((layerItem, layerId) => {
            const shouldBeVisible = bm.activeLayers.includes(layerId);
            if (layerItem.visible !== shouldBeVisible) {
              state.setLayerVisibility(layerId, shouldBeVisible);
            }
          });
        }
        document.getElementById('modal-bookmarks')?.classList.remove('open');
        state.emit('toast', { type: 'success', message: `Restored view "${bm.name}".` });
      }
    });
  });

  container.querySelectorAll('.btn-del-bookmark').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      deleteBookmark(id);
    });
  });

  if (window.lucide) window.lucide.createIcons();
}

// -----------------------------------------------------------------------------
// 3. Shareable URL Hash Link
// -----------------------------------------------------------------------------
function setupShareableLink() {
  const shareBtn = document.getElementById('btn-share-link');

  shareBtn?.addEventListener('click', () => {
    if (!state.map) return;

    const center = state.map.getCenter();
    const zoom = state.map.getZoom();
    const basemap = state.activeBasemapId;

    const visibleLayers = [];
    state.layers.forEach((l, id) => {
      if (l.visible) visibleLayers.push(id);
    });

    const hashParams = new URLSearchParams();
    hashParams.set('center', `${center.lat.toFixed(5)},${center.lng.toFixed(5)}`);
    hashParams.set('zoom', String(zoom));
    hashParams.set('basemap', basemap);
    if (visibleLayers.length > 0) {
      hashParams.set('layers', visibleLayers.join(','));
    }

    const hashString = `#${hashParams.toString()}`;
    window.location.hash = hashString;

    const fullShareUrl = window.location.href;
    navigator.clipboard.writeText(fullShareUrl).then(() => {
      state.emit('toast', {
        type: 'success',
        message: 'Shareable map link copied to clipboard!'
      });
    }).catch(() => {
      state.emit('toast', {
        type: 'info',
        message: `Shareable link created in address bar: ${hashString}`
      });
    });
  });
}

/**
 * Restores map view state from URL hash (#center=lat,lng&zoom=...&basemap=...&layers=...)
 * Ensures strictly sanitized input without tokens, IDs, or credentials.
 */
export function restoreViewFromHash() {
  if (!window.location.hash || window.location.hash.length < 3) return;

  try {
    const rawHash = window.location.hash.substring(1);
    const params = new URLSearchParams(rawHash);

    const centerParam = params.get('center');
    const zoomParam = params.get('zoom');
    const basemapParam = params.get('basemap');
    const layersParam = params.get('layers');

    if (centerParam && state.map) {
      const parts = centerParam.split(',');
      if (parts.length === 2) {
        const lat = parseFloat(parts[0]);
        const lon = parseFloat(parts[1]);
        const zoom = parseInt(zoomParam, 10) || 15;

        if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
          state.map.setView([lat, lon], Math.min(Math.max(zoom, 10), 19));
        }
      }
    }

    if (basemapParam && ['carto-light', 'carto-dark', 'osm-standard', 'esri-satellite', 'opentopo'].includes(basemapParam)) {
      state.setBasemap(basemapParam);
    }

    if (layersParam) {
      const layerNames = layersParam.split(',').map(s => s.trim());
      state.layers.forEach((layerItem, id) => {
        const isVisible = layerNames.includes(id);
        state.setLayerVisibility(id, isVisible);
      });
    }

  } catch (err) {
    console.warn('Could not parse shareable URL hash:', err);
  }
}

// -----------------------------------------------------------------------------
// 4. North Arrow & Reset View Controls
// -----------------------------------------------------------------------------
function setupNorthArrowAndResetView() {
  const resetBtn = document.getElementById('btn-reset-view');
  const northBtn = document.getElementById('btn-north-arrow');
  const northIcon = document.getElementById('north-arrow-icon');

  resetBtn?.addEventListener('click', () => {
    if (state.map) {
      state.map.fitBounds(MAP_CONFIG.fullExtentBounds, { padding: [25, 25], maxZoom: 16 });
      state.emit('toast', { type: 'info', message: 'Map view reset to full Kozhikode extent.' });
    }
  });

  northBtn?.addEventListener('click', () => {
    if (!state.map) return;

    // Smooth compass animation indicating True North
    if (northIcon) {
      northIcon.style.transition = 'transform 400ms cubic-bezier(0.34, 1.56, 0.64, 1)';
      northIcon.style.transform = 'rotate(-360deg)';
      setTimeout(() => {
        northIcon.style.transition = 'none';
        northIcon.style.transform = 'rotate(0deg)';
      }, 420);
    }

    // Re-center map slightly or ensure orientation is north-aligned
    state.emit('toast', { type: 'info', message: 'Map is oriented to True North (EPSG:4326).' });
  });
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
