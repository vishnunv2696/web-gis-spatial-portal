/**
 * GeoVista Portal - Map Controller
 * Manages Leaflet map instance, basemap switcher, map navigation controls,
 * geolocation, and status bar readouts.
 */

import { MAP_CONFIG, BASEMAPS } from './config.js';
import { state } from './state.js';

let map = null;
let currentTileLayer = null;
let locationMarker = null;
let locationCircle = null;
let pulseMarker = null;

export function initMap() {
  // Initialize Leaflet map
  map = L.map('map', {
    center: MAP_CONFIG.center,
    zoom: MAP_CONFIG.zoom,
    minZoom: MAP_CONFIG.minZoom,
    maxZoom: MAP_CONFIG.maxZoom,
    zoomControl: false,
    attributionControl: true
  });

  // Fit initially to full data bounds
  map.fitBounds(MAP_CONFIG.fullExtentBounds, { padding: [20, 20] });

  // Add Leaflet scale bar supporting both metric and imperial
  const createScaleControl = () => {
    return L.control.scale({
      metric: true,
      imperial: true,
      position: 'bottomleft',
      maxWidth: 140
    });
  };

  let scaleControl = createScaleControl().addTo(map);

  state.on('units:change', () => {
    if (scaleControl && map) {
      map.removeControl(scaleControl);
      scaleControl = createScaleControl().addTo(map);
    }
  });

  // Set active basemap
  setupBasemaps();

  // Setup UI controls and event listeners
  setupMapControls();
  setupStatusBar();
  renderBasemapCards();

  // Register map to global state
  state.setMap(map);

  return map;
}

function setupBasemaps() {
  const activeId = state.activeBasemapId;
  const basemapConfig = BASEMAPS.find(b => b.id === activeId) || BASEMAPS[0];

  let tileErrorCount = 0;
  let tileErrorTimer = null;

  const createLayer = (config) => {
    const layer = L.tileLayer(config.url, {
      attribution: config.attribution,
      subdomains: config.subdomains,
      maxZoom: config.maxZoom,
      referrerPolicy: 'strict-origin-when-cross-origin'
    });

    layer.on('tileerror', () => {
      tileErrorCount++;
      if (tileErrorTimer) clearTimeout(tileErrorTimer);
      tileErrorTimer = setTimeout(() => {
        tileErrorCount = 0;
      }, 4000);

      if (tileErrorCount >= 4 && state.activeBasemapId !== 'carto-light') {
        tileErrorCount = 0;
        state.emit('toast', {
          type: 'warning',
          message: `Tiles for "${config.name}" are unavailable. Switched to Carto Light fallback.`
        });
        state.setBasemap('carto-light');
      }
    });

    return layer;
  };

  currentTileLayer = createLayer(basemapConfig).addTo(map);

  state.on('basemap:change', (newId) => {
    const nextConfig = BASEMAPS.find(b => b.id === newId);
    if (!nextConfig) return;

    if (currentTileLayer) {
      map.removeLayer(currentTileLayer);
    }

    tileErrorCount = 0;
    currentTileLayer = createLayer(nextConfig).addTo(map);

    // Bring tileLayer to bottom
    currentTileLayer.bringToBack();
    updateBasemapCardSelection(newId);
  });
}

function renderBasemapCards() {
  const container = document.getElementById('basemap-grid');
  if (!container) return;

  container.innerHTML = BASEMAPS.map(bm => `
    <div class="basemap-card ${bm.id === state.activeBasemapId ? 'active' : ''}" data-basemap-id="${bm.id}">
      <div class="basemap-card-preview" style="background: ${bm.previewBg};">
        <i data-lucide="${bm.theme === 'dark' ? 'moon' : 'sun'}" style="color: ${bm.theme === 'dark' ? '#94A3B8' : '#0284C7'};"></i>
      </div>
      <div class="basemap-card-info">
        <div class="basemap-card-name">
          <span>${bm.name}</span>
          ${bm.id === state.activeBasemapId ? '<span class="badge badge-blue">Active</span>' : ''}
        </div>
        <div class="basemap-card-desc">${bm.description}</div>
      </div>
    </div>
  `).join('');

  // Attach click events
  container.querySelectorAll('.basemap-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.getAttribute('data-basemap-id');
      state.setBasemap(id);
      // Close modal
      const modal = document.getElementById('modal-basemap');
      if (modal) modal.classList.remove('open');
    });
  });

  if (window.lucide) window.lucide.createIcons();
}

function updateBasemapCardSelection(selectedId) {
  const container = document.getElementById('basemap-grid');
  if (!container) return;

  container.querySelectorAll('.basemap-card').forEach(card => {
    const id = card.getAttribute('data-basemap-id');
    if (id === selectedId) {
      card.classList.add('active');
      const nameEl = card.querySelector('.basemap-card-name');
      if (nameEl && !nameEl.querySelector('.badge')) {
        nameEl.insertAdjacentHTML('beforeend', '<span class="badge badge-blue">Active</span>');
      }
    } else {
      card.classList.remove('active');
      const badge = card.querySelector('.badge');
      if (badge) badge.remove();
    }
  });
}

function setupMapControls() {
  // Zoom In / Out
  document.getElementById('btn-zoom-in')?.addEventListener('click', () => map.zoomIn());
  document.getElementById('btn-zoom-out')?.addEventListener('click', () => map.zoomOut());

  // Zoom to Full Extent
  document.getElementById('btn-zoom-extent')?.addEventListener('click', () => {
    map.fitBounds(MAP_CONFIG.fullExtentBounds, { padding: [25, 25], maxZoom: 16 });
  });

  // Fullscreen Toggle
  document.getElementById('btn-fullscreen')?.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.warn('Fullscreen request failed:', err);
      });
    } else {
      document.exitFullscreen();
    }
  });

  // Locate Me (Browser Geolocation)
  document.getElementById('btn-locate-me')?.addEventListener('click', handleLocateMe);

  // Toggle Floating Legend
  document.getElementById('btn-map-legend')?.addEventListener('click', () => {
    state.emit('legend:toggle');
  });

  // Basemap switcher modal triggers
  const openBasemapModal = () => {
    document.getElementById('modal-basemap')?.classList.add('open');
  };
  document.getElementById('btn-basemap-card')?.addEventListener('click', openBasemapModal);
  document.getElementById('btn-nav-basemap')?.addEventListener('click', openBasemapModal);
}

function handleLocateMe() {
  if (!navigator.geolocation) {
    state.emit('toast', { type: 'warning', message: 'Geolocation is not supported by your browser.' });
    return;
  }

  state.emit('toast', { type: 'info', message: 'Acquiring your location...' });

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude, accuracy } = position.coords;
      const latlng = [latitude, longitude];

      if (locationMarker) map.removeLayer(locationMarker);
      if (locationCircle) map.removeLayer(locationCircle);

      locationCircle = L.circle(latlng, {
        radius: accuracy,
        color: '#0284C7',
        fillColor: '#0284C7',
        fillOpacity: 0.15,
        weight: 1.5
      }).addTo(map);

      const locIcon = L.divIcon({
        className: 'locate-pulse-icon',
        html: `<div style="width:14px;height:14px;background:#0284C7;border:2.5px solid #FFFFFF;border-radius:50%;box-shadow:0 0 8px rgba(2,132,199,0.8);"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7]
      });

      locationMarker = L.marker(latlng, { icon: locIcon })
        .addTo(map)
        .bindPopup(`<b>Your Position</b><br>Accuracy: within ${Math.round(accuracy)} meters`)
        .openPopup();

      map.setView(latlng, 16);
      state.emit('toast', { type: 'success', message: `Located within ${Math.round(accuracy)}m accuracy.` });
    },
    (error) => {
      let msg = 'Unable to retrieve location.';
      if (error.code === error.PERMISSION_DENIED) {
        msg = 'Location permission denied. Please enable location access in browser settings.';
      } else if (error.code === error.POSITION_UNAVAILABLE) {
        msg = 'Location information is unavailable.';
      } else if (error.code === error.TIMEOUT) {
        msg = 'Location request timed out.';
      }
      state.emit('toast', { type: 'warning', message: msg });
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

function setupStatusBar() {
  const coordsEl = document.getElementById('status-coords');
  const zoomEl = document.getElementById('status-zoom');

  map.on('mousemove', (e) => {
    if (!coordsEl) return;
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;
    const latDir = lat >= 0 ? 'N' : 'S';
    const lngDir = lng >= 0 ? 'E' : 'W';
    coordsEl.textContent = `${Math.abs(lat).toFixed(5)}° ${latDir}, ${Math.abs(lng).toFixed(5)}° ${lngDir}`;
  });

  map.on('zoomend', () => {
    if (zoomEl) zoomEl.textContent = `Zoom: ${map.getZoom()}`;
  });
}

/**
 * Highlights a coordinate or feature with an animated pulsing ring
 */
export function pulseAtLocation(latlng) {
  if (pulseMarker) {
    map.removeLayer(pulseMarker);
    pulseMarker = null;
  }

  const pulseIcon = L.divIcon({
    className: 'pulse-icon-container',
    html: '<div class="pulse-marker-ring"></div>',
    iconSize: [44, 44],
    iconAnchor: [22, 22]
  });

  pulseMarker = L.marker(latlng, { icon: pulseIcon, zIndexOffset: 2000 }).addTo(map);

  setTimeout(() => {
    if (pulseMarker) {
      map.removeLayer(pulseMarker);
      pulseMarker = null;
    }
  }, 4500);
}
