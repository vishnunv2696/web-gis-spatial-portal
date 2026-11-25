/**
 * GeoVista Portal - Tool: Find Nearby
 * Discovers features within a given radius using map click or feature origin,
 * computes exact geodesic distance in meters, draws radius circle,
 * highlights matches, and outputs a distance-sorted list with GeoJSON export.
 */

import { state } from '../state.js';
import { switchTab } from '../ui.js';
import { zoomToFeature } from '../layers.js';
import { toMeters, fromMeters, formatDistance } from '../units.js';

let clickedLatLng = null;
let clickPickerActive = false;
let clickPickerMarker = null;

export function renderNearbyTool() {
  const isImp = state.unitSystem === 'imperial';
  return `
    <div class="tool-card" id="tool-nearby-card">
      <div class="tool-header" data-toggle="tool-body-nearby">
        <div class="tool-header-title">
          <i data-lucide="crosshair"></i>
          <span>Find Nearby Features</span>
        </div>
      </div>
      <div class="tool-body" id="tool-body-nearby">
        <form id="form-nearby-tool" onsubmit="return false;">
          <div class="tool-form-group">
            <label>Origin Location</label>
            <div style="display:flex;gap:8px;">
              <button type="button" id="btn-pick-map-coords" class="btn btn-outline btn-sm" style="flex:1;">
                <i data-lucide="map-pin"></i> <span id="pick-coords-label">Click on Map</span>
              </button>
            </div>
            <span id="picked-coords-display" style="font-size:11px;color:var(--text-muted);display:block;margin-top:4px;">
              Origin: Center of Manachira [11.2555, 75.7807]
            </span>
          </div>

          <div class="tool-form-group">
            <label for="nearby-radius-input">Search Radius: <strong id="radius-display-val">${isImp ? '820 ft' : '250 m'}</strong></label>
            <div style="display:grid;grid-template-columns: 2fr 1fr;gap: 8px;margin-bottom:6px;">
              <input type="number" id="nearby-radius-num" class="tool-input" value="${isImp ? '820' : '250'}" min="1" step="any">
              <select id="nearby-unit-select" class="tool-select">
                <option value="m" ${!isImp ? 'selected' : ''}>Meters (m)</option>
                <option value="km">Kilometers (km)</option>
                <option value="ft" ${isImp ? 'selected' : ''}>Feet (ft)</option>
              </select>
            </div>
            <input type="range" id="nearby-radius-slider" min="50" max="1000" step="25" value="250" style="width:100%;accent-color:var(--primary);">
          </div>

          <div class="tool-form-group">
            <label for="nearby-target-layer">Target Layer</label>
            <select id="nearby-target-layer" class="tool-select"></select>
          </div>

          <div class="tool-form-group">
            <label for="nearby-category-filter">Category Filter (Optional)</label>
            <select id="nearby-category-filter" class="tool-select">
              <option value="ALL">All Categories</option>
            </select>
          </div>

          <div class="tool-actions">
            <button type="button" id="btn-run-nearby" class="btn btn-primary btn-sm">
              <i data-lucide="search"></i> Find Nearby
            </button>
            <button type="button" id="btn-clear-nearby" class="btn btn-outline btn-sm">
              <i data-lucide="trash-2"></i> Clear
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}

export function initNearbyTool() {
  const pickBtn = document.getElementById('btn-pick-map-coords');
  const pickLabel = document.getElementById('pick-coords-label');
  const coordsDisplay = document.getElementById('picked-coords-display');
  const radiusNum = document.getElementById('nearby-radius-num');
  const unitSelect = document.getElementById('nearby-unit-select');
  const radiusSlider = document.getElementById('nearby-radius-slider');
  const radiusVal = document.getElementById('radius-display-val');
  const targetLayerSelect = document.getElementById('nearby-target-layer');
  const catFilterSelect = document.getElementById('nearby-category-filter');
  const runBtn = document.getElementById('btn-run-nearby');
  const clearBtn = document.getElementById('btn-clear-nearby');

  if (!pickBtn) return;

  // Default origin: Manachira Center
  clickedLatLng = L.latLng(11.2555, 75.7807);

  // Listen for origin set from search pin popup
  state.on('tools:setCentre', ({ lat, lng, name }) => {
    clickedLatLng = L.latLng(lat, lng);
    if (coordsDisplay) {
      coordsDisplay.textContent = `Origin: ${name || 'Selected Location'} [${lat.toFixed(4)}, ${lng.toFixed(4)}]`;
    }
  });

  const updateRadiusReadout = () => {
    const unit = unitSelect ? unitSelect.value : 'm';
    const val = parseFloat(radiusNum ? radiusNum.value : (radiusSlider ? radiusSlider.value : 250));
    const meters = toMeters(val, unit);
    if (radiusVal) {
      radiusVal.textContent = `${val} ${unit}`;
    }
  };

  // Radius slider
  radiusSlider?.addEventListener('input', (e) => {
    const unit = unitSelect ? unitSelect.value : 'm';
    const meters = parseFloat(e.target.value);
    const converted = fromMeters(meters, unit);
    if (radiusNum) radiusNum.value = Math.round(converted * 10) / 10;
    if (radiusVal) radiusVal.textContent = `${Math.round(converted * 10) / 10} ${unit}`;
  });

  radiusNum?.addEventListener('input', updateRadiusReadout);
  unitSelect?.addEventListener('change', updateRadiusReadout);

  state.on('units:change', (sys) => {
    if (unitSelect) {
      unitSelect.value = sys === 'imperial' ? 'ft' : 'm';
      if (radiusNum) radiusNum.value = sys === 'imperial' ? '820' : '250';
      updateRadiusReadout();
    }
  });

  // Layer & category setup
  const populateLayersAndCategories = () => {
    let opts = '';
    state.layers.forEach((layerItem, id) => {
      opts += `<option value="${id}">${layerItem.config.title}</option>`;
    });
    targetLayerSelect.innerHTML = opts;
    updateCategories();
  };

  const updateCategories = () => {
    const layerId = targetLayerSelect.value;
    const layer = state.getLayer(layerId);
    if (!layer || !layer.data) return;

    let catOpts = '<option value="ALL">All Categories</option>';
    const cats = new Set();
    layer.data.features.forEach(f => {
      if (f.properties?.category) cats.add(f.properties.category);
    });

    cats.forEach(c => {
      catOpts += `<option value="${c}">${c}</option>`;
    });
    catFilterSelect.innerHTML = catOpts;
  };

  targetLayerSelect.addEventListener('change', updateCategories);

  // Map Click Picker
  pickBtn.addEventListener('click', () => {
    clickPickerActive = !clickPickerActive;
    if (clickPickerActive) {
      pickBtn.classList.add('btn-primary');
      pickBtn.classList.remove('btn-outline');
      pickLabel.textContent = 'Click map to place pin...';
      state.map.getContainer().style.cursor = 'crosshair';
      state.emit('toast', { type: 'info', message: 'Click anywhere on the map to set your search origin.' });

      const onMapClick = (e) => {
        clickedLatLng = e.latlng;
        clickPickerActive = false;
        pickBtn.classList.remove('btn-primary');
        pickBtn.classList.add('btn-outline');
        pickLabel.textContent = 'Change Origin';
        state.map.getContainer().style.cursor = '';

        coordsDisplay.textContent = `Origin: [${clickedLatLng.lat.toFixed(5)}° N, ${clickedLatLng.lng.toFixed(5)}° E]`;

        if (clickPickerMarker) state.map.removeLayer(clickPickerMarker);
        clickPickerMarker = L.marker(clickedLatLng, {
          icon: L.divIcon({
            html: '<div style="background:#EF4444;width:16px;height:16px;border-radius:50%;border:3px solid #FFF;box-shadow:0 0 10px rgba(239,68,68,0.9);"></div>',
            iconSize: [16, 16],
            iconAnchor: [8, 8]
          })
        }).addTo(state.map);

        state.map.off('click', onMapClick);
      };

      state.map.once('click', onMapClick);
    } else {
      pickBtn.classList.remove('btn-primary');
      pickBtn.classList.add('btn-outline');
      pickLabel.textContent = 'Click on Map';
      state.map.getContainer().style.cursor = '';
    }
  });

  // Run Find Nearby
  runBtn.addEventListener('click', () => {
    if (!clickedLatLng) {
      state.emit('toast', { type: 'warning', message: 'Please set an origin on the map first.' });
      return;
    }

    const userDist = parseFloat(radiusNum ? radiusNum.value : (radiusSlider ? radiusSlider.value : 250));
    const userUnit = unitSelect ? unitSelect.value : 'm';
    const radiusMeters = toMeters(userDist, userUnit);
    const targetLayerId = targetLayerSelect.value;
    const category = catFilterSelect.value;
    const layer = state.getLayer(targetLayerId);

    if (!layer || !layer.data) return;

    const originPoint = turf.point([clickedLatLng.lng, clickedLatLng.lat]);
    const matches = [];

    layer.data.features.forEach(feat => {
      // Category filter check
      if (category !== 'ALL' && feat.properties?.category !== category) return;

      let distance = Infinity;
      if (feat.geometry.type === 'Point') {
        distance = turf.distance(originPoint, feat, { units: 'meters' });
      } else if (feat.geometry.type === 'LineString' || feat.geometry.type === 'MultiLineString') {
        distance = turf.pointToLineDistance(originPoint, feat, { units: 'meters' });
      } else if (feat.geometry.type === 'Polygon' || feat.geometry.type === 'MultiPolygon') {
        const centroid = turf.centroid(feat);
        distance = turf.distance(originPoint, centroid, { units: 'meters' });
      }

      if (distance <= radiusMeters) {
        matches.push({
          feature: feat,
          distance: Math.round(distance),
          distance_m: distance
        });
      }
    });

    // Sort ascending by distance (closest first)
    matches.sort((a, b) => a.distance - b.distance);

    // Draw search radius circle and match layer
    const radiusCircle = L.circle(clickedLatLng, {
      radius: radiusMeters,
      color: '#0284C7',
      fillColor: '#38BDF8',
      fillOpacity: 0.12,
      weight: 2,
      dashArray: '5, 5'
    });

    const matchGeoJSON = {
      type: 'FeatureCollection',
      features: matches.map(m => m.feature)
    };

    const matchLayer = L.geoJSON(matchGeoJSON, {
      pointToLayer: (feature, latlng) => {
        return L.circleMarker(latlng, {
          radius: 9,
          fillColor: '#F59E0B',
          color: '#FFFFFF',
          weight: 3,
          opacity: 1,
          fillOpacity: 1
        });
      },
      style: {
        color: '#F59E0B',
        weight: 5,
        opacity: 1
      }
    });

    const resultGroup = L.featureGroup([radiusCircle, matchLayer]);

    const resultId = `nearby_${Date.now()}`;
    const resultTitle = `Nearby in ${layer.config.title} (${matches.length} within ${radiusMeters}m)`;

    state.addResultLayer(resultId, {
      id: resultId,
      title: resultTitle,
      type: 'Nearby',
      data: matchGeoJSON,
      leafletLayer: resultGroup,
      metadata: {
        radius: `${radiusMeters} m`,
        matchesCount: matches.length,
        matches: matches.map(m => ({
          name: m.feature.properties[layer.config.labelField] || m.feature.properties[layer.config.idField],
          category: m.feature.properties.category || 'General',
          distance: m.distance,
          id: m.feature.properties[layer.config.idField],
          layerId: targetLayerId
        }))
      }
    });

    // Fit map to radius circle
    state.map.fitBounds(radiusCircle.getBounds(), { padding: [25, 25] });

    state.emit('toast', {
      type: 'success',
      message: `Found ${matches.length} nearby features within ${radiusMeters}m.`
    });

    // Switch to Results tab
    switchTab('results');
  });

  // Clear Nearby
  clearBtn.addEventListener('click', () => {
    if (clickPickerMarker && state.map) {
      state.map.removeLayer(clickPickerMarker);
      clickPickerMarker = null;
    }
    state.clearResultLayers();
    coordsDisplay.textContent = 'Origin: Center of Manachira [11.2555, 75.7807]';
    clickedLatLng = L.latLng(11.2555, 75.7807);
    state.emit('toast', { type: 'info', message: 'Nearby search cleared.' });
  });

  state.on('layers:loaded', populateLayersAndCategories);
  populateLayersAndCategories();
}
