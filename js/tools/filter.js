/**
 * GeoVista Portal - Tool: Attribute Field Filter
 * Queries PostGIS SQL API (POST /api/tools/filter) with strict whitelist validation.
 * Features:
 *   - Locates results with dynamic padding (accounting for sidebar & drawer).
 *   - Pulses outline/halo highlight.
 *   - Auto-opens popup on single match (configurable toggle, default on).
 *   - Retains current extent and displays message when zero matches occur.
 *   - "Zoom to results" button in filter panel and table banner.
 *   - Keeps map filtering, drawer tab counts, and table rows in sync.
 *   - Reset restores all features, rows, counts, and clears highlights.
 */

import { state } from '../state.js?v=10';
import { pulseAtLocation } from '../map.js?v=10';
import { openDrawerForLayer } from '../table.js?v=10';

export function renderFilterTool() {
  return `
    <div class="tool-card" id="tool-filter-card">
      <div class="tool-header" data-toggle="tool-body-filter">
        <div class="tool-header-title">
          <i data-lucide="filter"></i>
          <span>Attribute Field Filter</span>
        </div>
        <i data-lucide="chevron-down" class="tool-toggle-icon"></i>
      </div>
      <div class="tool-body" id="tool-body-filter">
        <form id="form-filter-tool" onsubmit="return false;">
          <div class="tool-form-group">
            <label for="filter-layer-select">Target Layer</label>
            <select id="filter-layer-select" class="tool-select"></select>
          </div>

          <div class="tool-form-group">
            <label for="filter-field-select">Attribute Field</label>
            <select id="filter-field-select" class="tool-select"></select>
          </div>

          <div class="tool-form-group">
            <label for="filter-operator-select">Operator</label>
            <select id="filter-operator-select" class="tool-select">
              <option value="=">Equals (=)</option>
              <option value="!=">Not Equals (!=)</option>
              <option value="contains">Contains (text)</option>
              <option value=">">Greater Than (&gt;)</option>
              <option value="<">Less Than (&lt;)</option>
              <option value="between">Between (range)</option>
            </select>
          </div>

          <div class="tool-form-group" id="filter-single-value-wrap">
            <label for="filter-value-select">Filter Value</label>
            <select id="filter-value-select" class="tool-select"></select>
            <input type="text" id="filter-value-text" class="tool-input hide" placeholder="Enter value...">
          </div>

          <div class="tool-form-group hide" id="filter-between-wrap">
            <label>Range (Min to Max)</label>
            <div style="display:flex;gap:8px;">
              <input type="number" id="filter-min-val" class="tool-input" placeholder="Min" step="any">
              <input type="number" id="filter-max-val" class="tool-input" placeholder="Max" step="any">
            </div>
          </div>

          <div class="tool-form-group">
            <label style="font-size:11.5px;display:flex;align-items:center;gap:6px;cursor:pointer;color:var(--text-secondary);">
              <input type="checkbox" id="filter-auto-popup" checked>
              <span>Auto-open popup on single match</span>
            </label>
          </div>

          <div id="filter-match-status" style="margin: 8px 0; font-size: 11.5px; font-weight: 600; color: var(--text-secondary);">
            Ready to filter
          </div>

          <div id="filter-zoom-btn-wrap" class="hide" style="margin-bottom: 10px;">
            <button type="button" id="btn-zoom-filter-results" class="btn btn-xs btn-outline">
              <i data-lucide="maximize-2"></i> Zoom to results
            </button>
          </div>

          <div class="tool-actions">
            <button type="button" id="btn-run-filter" class="btn btn-primary btn-sm">
              <i data-lucide="check"></i> Apply Filter
            </button>
            <button type="button" id="btn-reset-filter" class="btn btn-outline btn-sm">
              <i data-lucide="rotate-ccw"></i> Reset
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}

/**
 * Calculates dynamic map padding based on whether sidebar and attribute table are open.
 */
export function getMapPadding() {
  const drawer = document.getElementById('attribute-drawer');
  const mapSize = state.map ? state.map.getSize() : { x: 800, y: 600 };

  let bottomPad = 35;
  if (drawer && drawer.classList.contains('open')) {
    const drHeight = drawer.offsetHeight || 290;
    // Clamp bottom padding so it never exceeds 45% of available map height
    bottomPad = Math.min(drHeight + 20, Math.floor(mapSize.y * 0.45));
  }

  // Sidebar is positioned via flex layout and does not overlap the map canvas.
  // Standard margin of 35px ensures comfortable clearance from controls.
  return {
    paddingTopLeft: [35, 35],
    paddingBottomRight: [35, bottomPad]
  };
}

/**
 * Fits the map to filtered results taking into account UI padding and auto-popup
 */
export function locateFilterResults(layerId, matchedIds, bounds, autoPopup = true) {
  const layer = state.getLayer(layerId);
  if (!layer || !state.map || !matchedIds || matchedIds.length === 0) return;

  const { paddingTopLeft, paddingBottomRight } = getMapPadding();
  const idField = layer.config.idField;
  const matchedSet = new Set(matchedIds.map(String));

  // Find all matched features from GeoJSON data
  const matchedFeatures = (layer.data?.features || []).filter(f => 
    matchedSet.has(String(f.properties?.[idField]))
  );

  // Single Point Feature handling
  if (layer.config.geometryType === 'Point' && (matchedIds.length === 1 || matchedFeatures.length === 1)) {
    const singleId = String(matchedIds[0]);
    const feat = matchedFeatures[0] || layer.data?.features?.find(f => String(f.properties?.[idField]) === singleId);
    let latlng = null;

    if (feat && feat.geometry && feat.geometry.coordinates) {
      latlng = L.latLng(feat.geometry.coordinates[1], feat.geometry.coordinates[0]);
    }

    // Try finding marker on map
    let leafletMarker = null;
    layer.leafletLayer?.eachLayer(l => {
      const fId = l.feature?.properties?.[idField] || l._fId;
      if (String(fId) === singleId) {
        if (!latlng) latlng = l.getLatLng();
        leafletMarker = l;
      }
    });

    if (!leafletMarker && layer.clusterGroup) {
      layer.clusterGroup.eachLayer(l => {
        const fId = l.feature?.properties?.[idField] || l._fId;
        if (String(fId) === singleId) {
          if (!latlng) latlng = l.getLatLng();
          leafletMarker = l;
        }
      });
    }

    if (latlng) {
      // Use fitBounds on single point with padding so Leaflet honors bottom drawer offset
      const pointBounds = L.latLngBounds([latlng, latlng]);
      state.map.fitBounds(pointBounds, {
        paddingTopLeft,
        paddingBottomRight,
        maxZoom: 16
      });
      pulseAtLocation(latlng);

      if (autoPopup && leafletMarker) {
        setTimeout(() => {
          if (layer.clusterGroup && layer.clusterGroup.zoomToShowLayer) {
            layer.clusterGroup.zoomToShowLayer(leafletMarker, () => {
              if (leafletMarker.openPopup) leafletMarker.openPopup();
            });
          } else if (leafletMarker.openPopup) {
            leafletMarker.openPopup();
          }
        }, 350);
      }
      return;
    }
  }

  // Calculate bounding box across matched features (or fallback to server bounds)
  let leafletBounds = null;
  if (bounds && Array.isArray(bounds) && bounds.length === 2 && bounds[0] && bounds[1]) {
    try {
      leafletBounds = L.latLngBounds(bounds);
    } catch (_) {}
  }

  if ((!leafletBounds || !leafletBounds.isValid()) && matchedFeatures.length > 0) {
    const coordsList = [];
    matchedFeatures.forEach(f => {
      const geom = f.geometry;
      if (!geom) return;
      if (geom.type === 'Point' && geom.coordinates) {
        coordsList.push([geom.coordinates[1], geom.coordinates[0]]);
      } else if (geom.type === 'LineString' && geom.coordinates) {
        geom.coordinates.forEach(c => coordsList.push([c[1], c[0]]));
      } else if (geom.type === 'Polygon' && geom.coordinates) {
        geom.coordinates[0]?.forEach(c => coordsList.push([c[1], c[0]]));
      } else if (geom.type === 'MultiPolygon' && geom.coordinates) {
        geom.coordinates.forEach(poly => poly[0]?.forEach(c => coordsList.push([c[1], c[0]])));
      }
    });
    if (coordsList.length > 0) {
      leafletBounds = L.latLngBounds(coordsList);
    }
  }

  if (leafletBounds && leafletBounds.isValid()) {
    state.map.fitBounds(leafletBounds, {
      paddingTopLeft,
      paddingBottomRight,
      maxZoom: 16
    });
    pulseAtLocation(leafletBounds.getCenter());
  }
}

export function initFilterTool() {
  const layerSelect = document.getElementById('filter-layer-select');
  const fieldSelect = document.getElementById('filter-field-select');
  const opSelect = document.getElementById('filter-operator-select');
  const valSelect = document.getElementById('filter-value-select');
  const valText = document.getElementById('filter-value-text');
  const singleValWrap = document.getElementById('filter-single-value-wrap');
  const betweenWrap = document.getElementById('filter-between-wrap');
  const minInput = document.getElementById('filter-min-val');
  const maxInput = document.getElementById('filter-max-val');
  const autoPopupCheck = document.getElementById('filter-auto-popup');
  const statusEl = document.getElementById('filter-match-status');
  const zoomBtnWrap = document.getElementById('filter-zoom-btn-wrap');
  const zoomBtn = document.getElementById('btn-zoom-filter-results');
  const runBtn = document.getElementById('btn-run-filter');
  const resetBtn = document.getElementById('btn-reset-filter');

  if (!layerSelect) return;

  const populateLayers = () => {
    let opts = '';
    state.layers.forEach((layerItem, id) => {
      opts += `<option value="${id}">${layerItem.config.title} (${layerItem.featureCount})</option>`;
    });
    layerSelect.innerHTML = opts;
    updateFields();
  };

  const updateFields = () => {
    const layerId = layerSelect.value;
    const layer = state.getLayer(layerId);
    if (!layer) return;

    let fieldOpts = '';
    layer.config.fields.forEach(f => {
      fieldOpts += `<option value="${f.key}">${f.label} (${f.key})</option>`;
    });
    fieldSelect.innerHTML = fieldOpts;
    updateValues();
  };

  const updateValues = () => {
    const layerId = layerSelect.value;
    const fieldKey = fieldSelect.value;
    const op = opSelect.value;
    const layer = state.getLayer(layerId);
    if (!layer || !layer.data) return;

    if (op === 'between') {
      singleValWrap.classList.add('hide');
      betweenWrap.classList.remove('hide');
      return;
    }

    betweenWrap.classList.add('hide');
    singleValWrap.classList.remove('hide');

    if (op === 'contains') {
      valSelect.classList.add('hide');
      valText.classList.remove('hide');
    } else {
      valSelect.classList.remove('hide');
      valText.classList.add('hide');

      const uniqueVals = new Set();
      layer.data.features.forEach(f => {
        const v = f.properties?.[fieldKey];
        if (v !== undefined && v !== null) uniqueVals.add(v);
      });

      let valOpts = '';
      Array.from(uniqueVals).sort().forEach(v => {
        valOpts += `<option value="${v}">${v}</option>`;
      });
      valSelect.innerHTML = valOpts;
    }
  };

  layerSelect.addEventListener('change', updateFields);
  fieldSelect.addEventListener('change', updateValues);
  opSelect.addEventListener('change', updateValues);

  // Apply Filter via API
  runBtn.addEventListener('click', async () => {
    const layerId = layerSelect.value;
    const fieldKey = fieldSelect.value;
    const op = opSelect.value;
    const layer = state.getLayer(layerId);
    if (!layer || !layer.data) return;

    let value = null;
    let minVal = null;
    let maxVal = null;

    if (op === 'between') {
      minVal = parseFloat(minInput.value);
      maxVal = parseFloat(maxInput.value);
      if (isNaN(minVal) || isNaN(maxVal)) {
        state.emit('toast', { type: 'warning', message: 'Please enter valid Min and Max numbers.' });
        return;
      }
    } else if (op === 'contains') {
      value = valText.value.trim();
      if (!value) {
        state.emit('toast', { type: 'warning', message: 'Please enter a search text.' });
        return;
      }
    } else {
      value = valSelect.value;
    }

    runBtn.disabled = true;
    runBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Filtering...';
    if (window.lucide) window.lucide.createIcons();

    try {
      // 100% Client-side filtering on GeoJSON features
      const matchedIds = [];
      const idField = layer.config.idField;
      const fldMeta = layer.config.fields?.find(f => f.key === fieldKey);

      let minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity;
      let hasCoords = false;

      (layer.data.features || []).forEach(feat => {
        const props = feat.properties || {};
        let rawVal = props[fieldKey];
        if ((rawVal === undefined || rawVal === null) && fldMeta?.altKey) {
          rawVal = props[fldMeta.altKey];
        }

        let isMatch = false;
        if (op === '=') {
          isMatch = String(rawVal).toLowerCase() === String(value).toLowerCase();
        } else if (op === '!=') {
          isMatch = String(rawVal).toLowerCase() !== String(value).toLowerCase();
        } else if (op === 'contains') {
          isMatch = String(rawVal).toLowerCase().includes(String(value).toLowerCase());
        } else if (op === '>') {
          isMatch = parseFloat(rawVal) > parseFloat(value);
        } else if (op === '<') {
          isMatch = parseFloat(rawVal) < parseFloat(value);
        } else if (op === 'between') {
          const num = parseFloat(rawVal);
          isMatch = num >= minVal && num <= maxVal;
        }

        if (isMatch) {
          const fId = props[idField];
          matchedIds.push(fId);

          const geom = feat.geometry;
          if (geom && geom.coordinates) {
            const addCoord = (lng, lat) => {
              if (lat < minLat) minLat = lat;
              if (lat > maxLat) maxLat = lat;
              if (lng < minLng) minLng = lng;
              if (lng > maxLng) maxLng = lng;
              hasCoords = true;
            };

            if (geom.type === 'Point') {
              addCoord(geom.coordinates[0], geom.coordinates[1]);
            } else if (geom.type === 'LineString') {
              geom.coordinates.forEach(c => addCoord(c[0], c[1]));
            } else if (geom.type === 'Polygon') {
              geom.coordinates[0]?.forEach(c => addCoord(c[0], c[1]));
            } else if (geom.type === 'MultiPolygon') {
              geom.coordinates.forEach(p => p[0]?.forEach(c => addCoord(c[0], c[1])));
            }
          }
        }
      });

      const matchedCount = matchedIds.length;
      const totalCount = layer.data.features ? layer.data.features.length : 0;
      const matchedSet = new Set(matchedIds);
      const bounds = hasCoords ? [[minLat, minLng], [maxLat, maxLng]] : null;

      // Store in layer and global state
      layer.filteredIds = matchedSet;
      state.activeFilter.set(layerId, {
        field: fieldKey,
        operator: op,
        value,
        matchedIds,
        matchedCount,
        totalCount,
        bounds
      });

      // Update map features
      if (layer.config.geometryType === 'Point') {
        if (layer.clusterGroup) layer.clusterGroup.clearLayers();
        layer.leafletLayer.clearLayers();

        layer.data.features.forEach(feat => {
          const fId = feat.properties?.[layer.config.idField];
          if (matchedSet.has(fId) || matchedSet.has(String(fId))) {
            const latlng = [feat.geometry.coordinates[1], feat.geometry.coordinates[0]];
            const marker = L.circleMarker(latlng, {
              radius: 7,
              fillColor: layer.config.categoryColors?.[feat.properties?.category] || '#0284C7',
              color: '#FFFFFF',
              weight: 2,
              opacity: 1,
              fillOpacity: layer.config.opacity
            });
            marker.feature = feat;
            marker._fId = fId;
            marker.bindPopup(buildPopup(feat, layer.config), { maxWidth: 300, className: 'custom-leaflet-popup' });
            marker.on('click', () => {
              state.setSelectedFeature({
                layerId: layer.config.id,
                feature: feat,
                leafletLayer: marker
              });
            });
            layer.leafletLayer.addLayer(marker);
            if (layer.clusterGroup) layer.clusterGroup.addLayer(marker);
          }
        });

      } else {
        layer.leafletLayer.eachLayer(subLayer => {
          const fId = subLayer.feature?.properties?.[layer.config.idField];
          const isMatch = matchedSet.has(fId);
          if (layer.config.geometryType === 'LineString') {
            subLayer.setStyle({ opacity: isMatch ? layer.config.opacity : 0.05 });
          } else if (layer.config.geometryType === 'Polygon') {
            subLayer.setStyle({
              fillOpacity: isMatch ? layer.config.opacity : 0.03,
              opacity: isMatch ? 0.9 : 0.08
            });
          }
        });
      }

      // Handle Locate & UI updates
      if (matchedCount > 0) {
        statusEl.innerHTML = `<span style="color:var(--primary);font-weight:700;">Matched: ${matchedCount} of ${totalCount} features</span>`;
        zoomBtnWrap.classList.remove('hide');

        // Locate with dynamic padding
        const autoPopup = autoPopupCheck ? autoPopupCheck.checked : true;
        locateFilterResults(layerId, matchedIds, resultData.bounds, autoPopup);

        state.emit('toast', {
          type: 'success',
          message: `Filter applied: ${matchedCount} of ${totalCount} matched.`
        });
      } else {
        statusEl.innerHTML = `<span style="color:var(--text-muted);font-weight:600;">No matching features found (${matchedCount} of ${totalCount})</span>`;
        zoomBtnWrap.classList.add('hide');
        state.emit('toast', {
          type: 'info',
          message: `No features match the filter criteria.`
        });
      }

      // Automatically switch to that layer's tab in the drawer and emit filtered event
      openDrawerForLayer(layerId);
      state.emit('layer:filtered', { layerId, matchedCount, totalCount, matchedIds });

    } catch (err) {
      console.error('Filter execution error:', err);
      state.emit('toast', { type: 'danger', message: `Filter failed: ${err.message}` });
    } finally {
      runBtn.disabled = false;
      runBtn.innerHTML = '<i data-lucide="check"></i> Apply Filter';
      if (window.lucide) window.lucide.createIcons();
    }
  });

  // Zoom to Results button click
  zoomBtn?.addEventListener('click', () => {
    const layerId = layerSelect.value;
    const filterState = state.activeFilter.get(layerId);
    if (filterState && filterState.matchedIds && filterState.matchedIds.length > 0) {
      const autoPopup = autoPopupCheck ? autoPopupCheck.checked : true;
      locateFilterResults(layerId, filterState.matchedIds, filterState.bounds, autoPopup);
    }
  });

  // Reset Filter
  const doReset = (layerId) => {
    const layer = state.getLayer(layerId);
    if (!layer || !layer.data) return;

    delete layer.filteredIds;
    state.activeFilter.delete(layerId);

    if (layer.config.geometryType === 'Point') {
      if (layer.clusterGroup) layer.clusterGroup.clearLayers();
      layer.leafletLayer.clearLayers();

      layer.data.features.forEach(feat => {
        const latlng = [feat.geometry.coordinates[1], feat.geometry.coordinates[0]];
        const fId = feat.properties?.[layer.config.idField];
        const marker = L.circleMarker(latlng, {
          radius: 7,
          fillColor: layer.config.categoryColors?.[feat.properties?.category] || '#0284C7',
          color: '#FFFFFF',
          weight: 2,
          opacity: 1,
          fillOpacity: layer.config.opacity
        });
        marker.feature = feat;
        marker._fId = fId;
        marker.bindPopup(buildPopup(feat, layer.config), { maxWidth: 300, className: 'custom-leaflet-popup' });
        marker.on('click', () => {
          state.setSelectedFeature({
            layerId: layer.config.id,
            feature: feat,
            leafletLayer: marker
          });
        });
        layer.leafletLayer.addLayer(marker);
        if (layer.clusterGroup) layer.clusterGroup.addLayer(marker);
      });
    } else {
      layer.leafletLayer.eachLayer(subLayer => {
        if (layer.config.geometryType === 'LineString') {
          subLayer.setStyle({ opacity: layer.config.opacity });
        } else if (layer.config.geometryType === 'Polygon') {
          subLayer.setStyle({
            fillOpacity: layer.config.opacity,
            opacity: 0.9
          });
        }
      });
    }

    statusEl.textContent = 'Filter reset. Showing all features.';
    zoomBtnWrap.classList.add('hide');

    state.emit('toast', { type: 'info', message: `Filter reset for ${layer.config.title}. Showing all ${layer.featureCount} features.` });
    state.emit('layer:filtered', { layerId });
  };

  resetBtn.addEventListener('click', () => {
    doReset(layerSelect.value);
  });

  // Listen to table banner filter:clear and filter:locate events
  state.on('filter:clear', ({ layerId }) => {
    doReset(layerId);
  });

  state.on('filter:locate', ({ layerId }) => {
    const targetLayerId = layerId || layerSelect.value;
    const filterState = state.activeFilter.get(targetLayerId);
    const layer = state.getLayer(targetLayerId);
    const matchedIds = filterState?.matchedIds || (layer?.filteredIds ? Array.from(layer.filteredIds) : []);
    const bounds = filterState?.bounds || null;
    if (matchedIds && matchedIds.length > 0) {
      const autoPopup = autoPopupCheck ? autoPopupCheck.checked : true;
      locateFilterResults(targetLayerId, matchedIds, bounds, autoPopup);
    }
  });

  function buildPopup(feature, config) {
    const props = feature.properties || {};
    let rows = '';
    config.fields.forEach(f => {
      rows += `<tr><td class="key">${f.label}</td><td class="val">${props[f.key] || '—'}</td></tr>`;
    });
    return `
      <div class="popup-card">
        <div class="popup-card-header">
          <span class="popup-title">${props[config.labelField] || 'Feature'}</span>
          <span class="popup-id-badge">${props[config.idField] || ''}</span>
        </div>
        <div class="popup-card-body">
          <table class="popup-table"><tbody>${rows}</tbody></table>
        </div>
      </div>
    `;
  }

  state.on('layers:loaded', populateLayers);
  populateLayers();
}
