/**
 * GeoVista Portal - Location Search Bar Controller
 * Handles local coordinate evaluation (DD, DMS, UTM 43N) and external place geocoding via server proxy.
 * Provides dropdown suggestions, keyboard navigation, recent searches, and map pin drop with rich popups.
 */

import { state } from './state.js';
import { parseCoordinates, formatDD, formatDMS, toCopyString } from './coords.js';
import { pulseAtLocation } from './map.js';

let searchMarker = null;
let highlightedIndex = -1;
let currentDropdownItems = [];

const RECENT_SEARCHES_KEY = 'geovista_recent_searches';
const MAX_RECENT = 6;

export function initLocationSearch() {
  const searchInput = document.getElementById('nav-search-input');
  const clearBtn = document.getElementById('btn-search-clear');
  const dropdown = document.getElementById('nav-search-dropdown');
  const mobileToggle = document.getElementById('btn-mobile-search-toggle');
  const mobileClose = document.getElementById('btn-mobile-search-close');
  const searchCenter = document.getElementById('navbar-search-center');

  if (!searchInput) return;

  if (window.lucide) window.lucide.createIcons();

  // 1. Input Typing: Instant Local Coordinate Evaluation
  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim();
    if (clearBtn) clearBtn.classList.toggle('hide', !query);

    if (!query) {
      renderRecentSearches();
      return;
    }

    renderSuggestions(query);
  });

  // 2. Input Focus: Show recent or current suggestions
  searchInput.addEventListener('focus', () => {
    const query = searchInput.value.trim();
    if (!query) {
      renderRecentSearches();
    } else {
      renderSuggestions(query);
    }
  });

  // 3. Clear Button
  clearBtn?.addEventListener('click', () => {
    searchInput.value = '';
    clearBtn.classList.add('hide');
    closeDropdown();
    removeSearchMarker();
    searchInput.focus();
  });

  // 4. Keyboard Navigation (Arrows, Enter, Escape)
  searchInput.addEventListener('keydown', (e) => {
    if (dropdown?.classList.contains('hide')) {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitPlaceSearch(searchInput.value.trim());
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      navigateDropdown(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      navigateDropdown(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && currentDropdownItems[highlightedIndex]) {
        currentDropdownItems[highlightedIndex].action();
      } else {
        submitPlaceSearch(searchInput.value.trim());
      }
    } else if (e.key === 'Escape') {
      closeDropdown();
      if (searchCenter?.classList.contains('mobile-active')) {
        searchCenter.classList.remove('mobile-active');
      }
    }
  });

  // 5. Close dropdown on outside click
  document.addEventListener('click', (e) => {
    const wrap = document.getElementById('nav-search-wrap');
    if (wrap && !wrap.contains(e.target) && !e.target.closest('#btn-mobile-search-toggle') && !e.target.closest('#btn-mobile-search-close')) {
      closeDropdown();
      if (searchCenter?.classList.contains('mobile-active')) {
        searchCenter.classList.remove('mobile-active');
      }
    }
  });

  // 6. Mobile Search Toggle Button
  mobileToggle?.addEventListener('click', () => {
    if (searchCenter) {
      const isNowActive = searchCenter.classList.toggle('mobile-active');
      if (isNowActive) {
        setTimeout(() => searchInput.focus(), 100);
      } else {
        closeDropdown();
      }
    }
  });

  // 7. Mobile Search Close Button
  mobileClose?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (searchCenter?.classList.contains('mobile-active')) {
      searchCenter.classList.remove('mobile-active');
      closeDropdown();
    }
  });
}

function openDropdown() {
  const dropdown = document.getElementById('nav-search-dropdown');
  if (dropdown) dropdown.classList.remove('hide');
  highlightedIndex = -1;
}

function closeDropdown() {
  const dropdown = document.getElementById('nav-search-dropdown');
  if (dropdown) dropdown.classList.add('hide');
  highlightedIndex = -1;
  currentDropdownItems = [];
}

/**
 * Renders local coordinate match suggestion and place search option
 */
function renderSuggestions(query) {
  const resultsContainer = document.getElementById('search-results-list');
  if (!resultsContainer) return;

  currentDropdownItems = [];
  let html = '';

  // Check if input is a valid coordinate format (DD, DMS, UTM 43N)
  const coordResult = parseCoordinates(query);
  if (coordResult) {
    html += `
      <div class="search-item" data-action="coord" id="search-item-0">
        <i data-lucide="map-pin" class="search-item-icon" style="color:var(--primary);"></i>
        <div class="search-item-info">
          <div class="search-item-title">Go to Coordinates (${coordResult.format})</div>
          <div class="search-item-subtitle">${coordResult.label}</div>
        </div>
        <span class="search-item-tag">Instant</span>
      </div>
    `;

    currentDropdownItems.push({
      id: 'search-item-0',
      action: () => {
        saveRecentSearch(query);
        closeDropdown();
        dropLocationMarker(coordResult.lat, coordResult.lon, `Coordinates (${coordResult.format})`);
      }
    });
  }

  // Option to trigger external geocoder on Enter
  const itemIdx = currentDropdownItems.length;
  html += `
    <div class="search-item" data-action="place" id="search-item-${itemIdx}">
      <i data-lucide="search" class="search-item-icon"></i>
      <div class="search-item-info">
        <div class="search-item-title">Search places for "${escapeHtml(query)}"</div>
        <div class="search-item-subtitle">Press Enter or click to search OpenStreetMap Nominatim</div>
      </div>
      <span class="search-item-tag">Press Enter</span>
    </div>
  `;

  currentDropdownItems.push({
    id: `search-item-${itemIdx}`,
    action: () => submitPlaceSearch(query)
  });

  resultsContainer.innerHTML = html;
  attachDropdownListeners(resultsContainer);
  openDropdown();
  if (window.lucide) window.lucide.createIcons();
}

/**
 * Submits query to server geocoder proxy (POST /api/geocode)
 */
export async function submitPlaceSearch(rawQuery) {
  const query = rawQuery.trim();
  if (!query) return;

  // If input is coordinates, jump immediately without calling server
  const coordResult = parseCoordinates(query);
  if (coordResult) {
    saveRecentSearch(query);
    closeDropdown();
    dropLocationMarker(coordResult.lat, coordResult.lon, `Coordinates (${coordResult.format})`);
    return;
  }

  if (query.length < 2) {
    state.emit('toast', { type: 'warning', message: 'Please enter at least 2 characters to search places.' });
    return;
  }

  const resultsContainer = document.getElementById('search-results-list');
  if (!resultsContainer) return;

  openDropdown();
  resultsContainer.innerHTML = `
    <div style="padding:14px;text-align:center;color:var(--text-secondary);font-size:12px;">
      <i data-lucide="loader-2" class="spin" style="width:16px;height:16px;margin-bottom:6px;color:var(--primary);display:block;margin:0 auto 6px;"></i>
      Searching places for "${escapeHtml(query)}"...
    </div>
  `;
  if (window.lucide) window.lucide.createIcons();

  // Check if map bounded search is enabled
  const boundedCheck = document.getElementById('search-bounded-check');
  const isBounded = boundedCheck ? boundedCheck.checked : false;

  let viewbox = null;
  if (isBounded && state.map) {
    const b = state.map.getBounds();
    // OpenStreetMap Nominatim viewbox format: left,top,right,bottom (lon,lat,lon,lat)
    viewbox = `${b.getWest().toFixed(5)},${b.getNorth().toFixed(5)},${b.getEast().toFixed(5)},${b.getSouth().toFixed(5)}`;
  }

  try {
    // 1. Search local vector features in memory
    const localMatches = [];
    const qLower = query.toLowerCase();
    state.layers.forEach((layerItem) => {
      (layerItem.data?.features || []).forEach(f => {
        const name = f.properties?.name || f.properties?.road_name || f.properties?.div_name;
        if (name && String(name).toLowerCase().includes(qLower)) {
          let lat = 0, lon = 0;
          if (f.geometry?.type === 'Point' && f.geometry.coordinates) {
            lon = f.geometry.coordinates[0];
            lat = f.geometry.coordinates[1];
          } else if (window.turf) {
            try {
              const c = turf.centroid(f);
              lon = c.geometry.coordinates[0];
              lat = c.geometry.coordinates[1];
            } catch (_) {}
          }
          if (lat && lon && localMatches.length < 5) {
            localMatches.push({
              name: String(name),
              display_name: `${name} (${layerItem.config.title})`,
              lat,
              lon,
              type: layerItem.config.title
            });
          }
        }
      });
    });

    // 2. Query OpenStreetMap Nominatim directly
    let nominatimPlaces = [];
    try {
      let url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=6&addressdetails=1`;
      if (isBounded && viewbox) {
        url += `&viewbox=${viewbox}&bounded=1`;
      }
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (res.ok) {
        const data = await res.json();
        nominatimPlaces = (data || []).map(p => ({
          name: p.name || p.display_name.split(',')[0],
          display_name: p.display_name,
          lat: parseFloat(p.lat),
          lon: parseFloat(p.lon),
          type: p.type || p.class || 'Place'
        }));
      }
    } catch (_) {}

    saveRecentSearch(query);

    const places = [...localMatches, ...nominatimPlaces].slice(0, 8);
    if (places.length === 0) {
      resultsContainer.innerHTML = `
        <div style="padding:16px;text-align:center;color:var(--text-muted);font-size:12px;">
          No matching places found near Kozhikode.<br>
          <span style="font-size:11px;">Try entering a landmark, road, or city name.</span>
        </div>
      `;
      return;
    }

    currentDropdownItems = [];
    let html = '';

    places.forEach((place, idx) => {
      const title = place.name || 'Location';
      const subtitle = place.display_name || '';
      const tag = place.type || 'place';

      html += `
        <div class="search-item" id="search-item-${idx}">
          <i data-lucide="map-pin" class="search-item-icon"></i>
          <div class="search-item-info">
            <div class="search-item-title">${escapeHtml(title)}</div>
            <div class="search-item-subtitle" title="${escapeHtml(subtitle)}">${escapeHtml(subtitle)}</div>
          </div>
          <span class="search-item-tag">${escapeHtml(tag)}</span>
        </div>
      `;

      currentDropdownItems.push({
        id: `search-item-${idx}`,
        action: () => {
          closeDropdown();
          if (place.bbox) {
            state.map.fitBounds([
              [place.bbox[0], place.bbox[1]],
              [place.bbox[2], place.bbox[3]]
            ], { maxZoom: 17, padding: [40, 40] });
          } else {
            state.map.setView([place.lat, place.lon], 16);
          }
          dropLocationMarker(place.lat, place.lon, title, subtitle);
        }
      });
    });

    resultsContainer.innerHTML = html;
    attachDropdownListeners(resultsContainer);
    if (window.lucide) window.lucide.createIcons();

  } catch (err) {
    resultsContainer.innerHTML = `
      <div style="padding:14px;color:var(--danger);font-size:12px;text-align:center;">
        ${escapeHtml(err.message)}
      </div>
    `;
  }
}

/**
 * Drops an animated location search pin with a popup offering coordinates & tools integration
 */
export function dropLocationMarker(lat, lon, title = 'Location', details = '') {
  if (!state.map) return;

  removeSearchMarker();

  const pinIcon = L.divIcon({
    className: 'search-pin-container',
    html: `
      <div class="search-pin-inner">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
          <circle cx="12" cy="10" r="3"></circle>
        </svg>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
  });

  searchMarker = L.marker([lat, lon], { icon: pinIcon, zIndexOffset: 3000 }).addTo(state.map);

  const ddStr = formatDD(lat, lon);
  const dmsStr = formatDMS(lat, lon);

  const popupHtml = `
    <div class="search-popup-card">
      <div class="search-popup-title">${escapeHtml(title)}</div>
      ${details ? `<div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;max-height:60px;overflow-y:auto;">${escapeHtml(details)}</div>` : ''}
      <div class="search-popup-coords">
        <div><strong>DD:</strong> ${ddStr}</div>
        <div><strong>DMS:</strong> ${dmsStr}</div>
      </div>
      <div class="search-popup-actions">
        <button class="btn btn-xs btn-outline btn-popup-copy-coords" title="Copy coordinates to clipboard">
          <svg style="width:12px;height:12px;display:inline-block;vertical-align:middle;margin-right:2px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
          Copy
        </button>
        <button class="btn btn-xs btn-primary btn-popup-set-centre" title="Set as origin center in tools">
          <svg style="width:12px;height:12px;display:inline-block;vertical-align:middle;margin-right:2px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="22" x2="18" y1="12" y2="12"/><line x1="6" x2="2" y1="12" y2="12"/><line x1="12" x2="12" y1="6" y2="2"/><line x1="12" x2="12" y1="22" y2="18"/></svg>
          Use as Centre
        </button>
      </div>
    </div>
  `;

  searchMarker.bindPopup(popupHtml, { minWidth: 220, autoPanPadding: [30, 30] }).openPopup();

  // Attach popup button handlers on popupopen
  searchMarker.on('popupopen', () => {
    const popupNode = searchMarker.getPopup().getElement();
    if (!popupNode) return;

    popupNode.querySelector('.btn-popup-copy-coords')?.addEventListener('click', () => {
      const textToCopy = toCopyString(lat, lon, title);
      navigator.clipboard.writeText(textToCopy).then(() => {
        state.emit('toast', { type: 'success', message: 'Coordinates copied to clipboard!' });
      });
    });

    popupNode.querySelector('.btn-popup-set-centre')?.addEventListener('click', () => {
      state.emit('tools:setCentre', { lat, lng: lon, name: title });
      state.emit('toast', { type: 'info', message: `Analysis origin set to "${title}".` });
    });
  });

  // Pulse animation at location
  pulseAtLocation([lat, lon]);

  if (!state.map.getBounds().contains([lat, lon])) {
    state.map.setView([lat, lon], Math.max(state.map.getZoom(), 15));
  }
}

export function removeSearchMarker() {
  if (searchMarker && state.map) {
    state.map.removeLayer(searchMarker);
    searchMarker = null;
  }
}

function navigateDropdown(direction) {
  if (currentDropdownItems.length === 0) return;

  highlightedIndex += direction;
  if (highlightedIndex < 0) highlightedIndex = currentDropdownItems.length - 1;
  if (highlightedIndex >= currentDropdownItems.length) highlightedIndex = 0;

  document.querySelectorAll('.search-item').forEach((item, idx) => {
    item.classList.toggle('highlighted', idx === highlightedIndex);
    if (idx === highlightedIndex) {
      item.scrollIntoView({ block: 'nearest' });
    }
  });
}

function attachDropdownListeners(container) {
  container.querySelectorAll('.search-item').forEach((el, idx) => {
    el.addEventListener('click', () => {
      if (currentDropdownItems[idx]) {
        currentDropdownItems[idx].action();
      }
    });
  });
}

function renderRecentSearches() {
  const resultsContainer = document.getElementById('search-results-list');
  if (!resultsContainer) return;

  const recents = getRecentSearches();
  if (recents.length === 0) {
    closeDropdown();
    return;
  }

  currentDropdownItems = [];
  let html = `
    <div class="search-section-header">
      <span>Recent Searches</span>
      <span class="search-clear-recent" id="btn-clear-recent-searches">Clear</span>
    </div>
  `;

  recents.forEach((queryText, idx) => {
    html += `
      <div class="search-item" id="search-item-${idx}">
        <i data-lucide="history" class="search-item-icon" style="color:var(--text-muted);"></i>
        <div class="search-item-info">
          <div class="search-item-title">${escapeHtml(queryText)}</div>
        </div>
      </div>
    `;

    currentDropdownItems.push({
      id: `search-item-${idx}`,
      action: () => {
        const input = document.getElementById('nav-search-input');
        if (input) input.value = queryText;
        submitPlaceSearch(queryText);
      }
    });
  });

  resultsContainer.innerHTML = html;
  attachDropdownListeners(resultsContainer);

  document.getElementById('btn-clear-recent-searches')?.addEventListener('click', (e) => {
    e.stopPropagation();
    clearRecentSearches();
    closeDropdown();
  });

  openDropdown();
  if (window.lucide) window.lucide.createIcons();
}

function getRecentSearches() {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(query) {
  if (!query) return;
  try {
    let list = getRecentSearches().filter(q => q.toLowerCase() !== query.toLowerCase());
    list.unshift(query);
    if (list.length > MAX_RECENT) list = list.slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(list));
  } catch (err) {
    console.warn('Failed to save recent search:', err);
  }
}

function clearRecentSearches() {
  try {
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  } catch (err) {
    console.warn('Failed to clear recent searches:', err);
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
