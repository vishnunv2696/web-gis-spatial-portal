/**
 * GeoVista Portal - Tool: Buffer Geoprocessing
 * Computes geodesic buffers around points, lines, or polygons using Turf.js,
 * supports meter/kilometer units and optional polygon dissolve, and outputs
 * interactive, exportable result layers.
 */

import { state } from '../state.js';
import { switchTab } from '../ui.js';
import { toMeters, formatDistance, getDefaultDistanceUnit } from '../units.js';

export function renderBufferTool() {
  const isImp = state.unitSystem === 'imperial';
  return `
    <div class="tool-card" id="tool-buffer-card">
      <div class="tool-header" data-toggle="tool-body-buffer">
        <div class="tool-header-title">
          <i data-lucide="circle-dot"></i>
          <span>Buffer Analysis</span>
        </div>
      </div>
      <div class="tool-body" id="tool-body-buffer">
        <form id="form-buffer-tool" onsubmit="return false;">
          <div class="tool-form-group">
            <label for="buffer-layer-select">Source Vector Layer</label>
            <select id="buffer-layer-select" class="tool-select"></select>
          </div>

          <div style="display:grid;grid-template-columns: 2fr 1fr;gap: 8px;">
            <div class="tool-form-group">
              <label for="buffer-distance-input">Distance</label>
              <input type="number" id="buffer-distance-input" class="tool-input" value="${isImp ? '328' : '100'}" min="1" max="50000" step="1">
            </div>
            <div class="tool-form-group">
              <label for="buffer-units-select">Units</label>
              <select id="buffer-units-select" class="tool-select">
                <option value="meters" ${!isImp ? 'selected' : ''}>Meters (m)</option>
                <option value="kilometers">Kilometers (km)</option>
                <option value="feet" ${isImp ? 'selected' : ''}>Feet (ft)</option>
              </select>
            </div>
          </div>

          <div class="tool-form-group">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
              <input type="checkbox" id="buffer-dissolve-check">
              <span>Dissolve overlapping buffers</span>
            </label>
          </div>

          <div class="tool-actions">
            <button type="button" id="btn-run-buffer" class="btn btn-primary btn-sm">
              <i data-lucide="play"></i> Run Buffer
            </button>
            <button type="button" id="btn-clear-buffer" class="btn btn-outline btn-sm">
              <i data-lucide="trash-2"></i> Clear
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}

export function initBufferTool() {
  const layerSelect = document.getElementById('buffer-layer-select');
  const distInput = document.getElementById('buffer-distance-input');
  const unitsSelect = document.getElementById('buffer-units-select');
  const dissolveCheck = document.getElementById('buffer-dissolve-check');
  const runBtn = document.getElementById('btn-run-buffer');
  const clearBtn = document.getElementById('btn-clear-buffer');

  if (!layerSelect) return;

  const populateLayers = () => {
    let opts = '';
    state.layers.forEach((layerItem, id) => {
      opts += `<option value="${id}">${layerItem.config.title}</option>`;
    });
    layerSelect.innerHTML = opts;
  };

  runBtn.addEventListener('click', async () => {
    const layerId = layerSelect.value;
    const distance = parseFloat(distInput.value);
    const units = unitsSelect.value;
    const shouldDissolve = dissolveCheck.checked;

    if (isNaN(distance) || distance <= 0) {
      state.emit('toast', { type: 'warning', message: 'Please enter a valid positive buffer distance.' });
      distInput.focus();
      return;
    }

    const layer = state.getLayer(layerId);
    if (!layer || !layer.data) return;

    runBtn.disabled = true;
    runBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Buffering...';
    if (window.lucide) window.lucide.createIcons();

    try {
      // Turf.js buffer calculation
      const buffered = turf.buffer(layer.data, distance, { units });

      let finalGeoJSON = buffered;
      if (shouldDissolve && buffered.features && buffered.features.length > 1) {
        try {
          if (turf.dissolve) {
            finalGeoJSON = turf.dissolve(buffered);
          } else {
            // Fallback union
            let unionPoly = buffered.features[0];
            for (let i = 1; i < buffered.features.length; i++) {
              unionPoly = turf.union(turf.featureCollection([unionPoly, buffered.features[i]]));
            }
            finalGeoJSON = turf.featureCollection([unionPoly]);
          }
        } catch (e) {
          console.warn('Dissolve warning:', e);
        }
      }

      // Create Leaflet Result Layer
      const resultId = `buffer_${Date.now()}`;
      const title = `Buffer: ${layer.config.title} (${distance} ${units})`;

      const leafletResultLayer = L.geoJSON(finalGeoJSON, {
        style: {
          color: '#0D9488',
          weight: 2,
          fillColor: '#14B8A6',
          fillOpacity: 0.35,
          dashArray: '4, 4'
        },
        onEachFeature: (feature, l) => {
          l.bindPopup(`
            <div class="popup-card">
              <div class="popup-card-header">
                <span class="popup-layer-tag">Buffer Result</span>
                <h4 class="popup-title">${title}</h4>
              </div>
              <div class="popup-card-body">
                <p style="font-size:12px;">Distance: <strong>${distance} ${units}</strong></p>
                <p style="font-size:12px;">Source: <strong>${layer.config.title}</strong></p>
              </div>
            </div>
          `);
        }
      });

      state.addResultLayer(resultId, {
        id: resultId,
        title,
        type: 'Buffer',
        data: finalGeoJSON,
        leafletLayer: leafletResultLayer,
        metadata: {
          sourceLayer: layer.config.title,
          distance: `${distance} ${units}`,
          dissolved: shouldDissolve,
          featureCount: finalGeoJSON.features ? finalGeoJSON.features.length : 1
        }
      });

      // Fit map to buffer result
      state.map.fitBounds(leafletResultLayer.getBounds(), { padding: [30, 30] });

      state.emit('toast', {
        type: 'success',
        message: `Buffer created: ${distance} ${units} around ${layer.config.title}.`
      });

      // Switch to Results tab
      switchTab('results');

    } catch (err) {
      console.error('Buffer error:', err);
      state.emit('toast', { type: 'danger', message: `Buffer failed: ${err.message}` });
    } finally {
      runBtn.disabled = false;
      runBtn.innerHTML = '<i data-lucide="play"></i> Run Buffer';
      if (window.lucide) window.lucide.createIcons();
    }
  });

  clearBtn.addEventListener('click', () => {
    state.clearResultLayers();
    state.emit('toast', { type: 'info', message: 'All analysis result layers removed.' });
  });

  state.on('layers:loaded', populateLayers);
  populateLayers();

  state.on('units:change', (sys) => {
    if (unitsSelect) {
      unitsSelect.value = sys === 'imperial' ? 'feet' : 'meters';
      distInput.value = sys === 'imperial' ? '328' : '100';
    }
  });
}
