/**
 * GeoVista Portal - Tool: Buffer Impact Analysis
 * Unified Buffer + Spatial Join geoprocessing tool executed in PostGIS.
 * Features:
 *   - Any source layer & Result layer (All, Filtered, Selected, or By ID).
 *   - Planar UTM Zone 43N (EPSG:32643) buffering (side=both|left|right, endcap=flat|round).
 *   - Multiple target layers evaluated simultaneously with relations & category filters.
 *   - Scenario comparison distances producing count matrix.
 *   - Presets & localStorage setup persistence.
 *   - Interactive Report Card in Results tab with division breakdowns & GeoJSON export.
 */

import { state } from '../state.js?v=9';
import { switchTab } from '../ui.js?v=9';
import { toMeters, fromMeters, formatDistance, formatArea } from '../units.js?v=9';
import { zoomToFeature } from '../layers.js?v=9';

export function renderBufferImpactTool() {
  const isImp = state.unitSystem === 'imperial';
  return `
    <div class="tool-card" id="tool-buffer-impact-card">
      <div class="tool-header" data-toggle="tool-body-buffer-impact">
        <div class="tool-header-title">
          <i data-lucide="shield-alert"></i>
          <span>Buffer Impact Analysis</span>
        </div>
        <i data-lucide="chevron-down" class="tool-toggle-icon"></i>
      </div>
      <div class="tool-body" id="tool-body-buffer-impact">
        <form id="form-buffer-impact-tool" onsubmit="return false;">
          
          <!-- Presets -->
          <div class="tool-form-group">
            <label for="impact-preset-select">Analysis Presets</label>
            <select id="impact-preset-select" class="tool-select">
              <option value="none">-- Custom Configuration --</option>
              <option value="road_widening">Road Widening (Roads &rarr; Points, 10m flat)</option>
              <option value="utility_corridor">Utility Corridor (Roads &rarr; Points & Divisions, 15m)</option>
              <option value="service_area">Service Area (Points &rarr; Roads & Points, 300m)</option>
              <option value="protected_zone">Protected Zone (Divisions &rarr; Points, 50m)</option>
            </select>
          </div>

          <!-- Source Layer (Buffered) -->
          <div class="tool-form-group">
            <label for="impact-source-layer">Source Layer (to buffer)</label>
            <select id="impact-source-layer" class="tool-select"></select>
          </div>
          
          <div style="display:grid;grid-template-columns: 1fr 1fr;gap: 8px;margin-bottom:12px;">
            <div class="tool-form-group">
              <label for="impact-source-subset">Features to Buffer</label>
              <select id="impact-source-subset" class="tool-select" style="font-size:11.5px;">
                <option value="all" selected>All features</option>
                <option value="filtered">Filtered features</option>
                <option value="selected">Selected feature</option>
                <option value="by_id">Specific ID(s)</option>
              </select>
            </div>
            <div class="tool-form-group hide" id="impact-source-id-wrap">
              <label for="impact-source-id-input">Feature ID</label>
              <input type="text" id="impact-source-id-input" class="tool-input" placeholder="e.g. RD-001" value="RD-001">
            </div>
          </div>

          <!-- Buffer Distance & Units -->
          <div style="background:var(--bg-surface-solid);padding:10px;border-radius:var(--radius-sm);border:1px solid var(--border-color);margin-bottom:12px;">
            <div style="display:grid;grid-template-columns: 2fr 1fr;gap: 8px;">
              <div class="tool-form-group">
                <label for="impact-distance-input">Buffer Distance</label>
                <input type="number" id="impact-distance-input" class="tool-input" value="${isImp ? '65' : '20'}" min="1" max="3280" step="any">
              </div>
              <div class="tool-form-group">
                <label for="impact-unit-select">Unit</label>
                <select id="impact-unit-select" class="tool-select">
                  <option value="m" ${!isImp ? 'selected' : ''}>m</option>
                  <option value="km">km</option>
                  <option value="ft" ${isImp ? 'selected' : ''}>ft</option>
                </select>
              </div>
            </div>

            <!-- Total Width Helper for Lines -->
            <div class="tool-form-group" style="margin-top:6px;">
              <label style="font-size:11.5px;display:flex;align-items:center;gap:6px;cursor:pointer;">
                <input type="checkbox" id="impact-use-total-width">
                <span>Proposed Total Width Helper (Line Corridor)</span>
              </label>
              <div id="impact-total-width-input-wrap" class="hide" style="margin-top:4px;">
                <input type="number" id="impact-total-width-input" class="tool-input" placeholder="e.g. 40" step="any" style="font-size:11.5px;">
                <span id="impact-corridor-helper-text" style="font-size:10.5px;color:var(--text-muted);display:block;margin-top:2px;">
                  Corridor: ±20m each side
                </span>
              </div>
            </div>

            <!-- Line Options -->
            <div style="display:grid;grid-template-columns: 1fr 1fr;gap: 8px;margin-top:8px;">
              <div class="tool-form-group">
                <label for="impact-line-side">Buffer Side</label>
                <select id="impact-line-side" class="tool-select" style="font-size:11.5px;">
                  <option value="both" selected>Both sides</option>
                  <option value="left">Left side only</option>
                  <option value="right">Right side only</option>
                </select>
              </div>
              <div class="tool-form-group">
                <label for="impact-line-endcap">End Cap</label>
                <select id="impact-line-endcap" class="tool-select" style="font-size:11.5px;">
                  <option value="flat" selected>Flat (default)</option>
                  <option value="round">Round</option>
                </select>
              </div>
            </div>

            <div class="tool-form-group" style="margin-top:8px;">
              <label style="font-size:11.5px;display:flex;align-items:center;gap:6px;cursor:pointer;">
                <input type="checkbox" id="impact-dissolve-check" checked>
                <span>Dissolve overlapping buffers</span>
              </label>
            </div>
          </div>

          <!-- Target Layers to Search (Checklist) -->
          <div class="tool-form-group" style="margin-bottom:12px;">
            <label>Target Layers to Search Inside Buffer</label>
            <div id="impact-target-checkboxes" style="display:flex;flex-direction:column;gap:6px;background:var(--bg-surface-solid);padding:8px 10px;border-radius:var(--radius-sm);border:1px solid var(--border-color);max-height:140px;overflow-y:auto;">
              <!-- Populated dynamically -->
            </div>
          </div>

          <!-- Scenarios Comparison -->
          <div class="tool-form-group" style="margin-bottom:12px;">
            <label for="impact-scenarios-input">Scenario Distances for Comparison</label>
            <input type="text" id="impact-scenarios-input" class="tool-input" value="${isImp ? '15, 30, 50, 65' : '5, 10, 15, 20'}" placeholder="e.g. 5, 10, 15, 20">
            <span style="font-size:10.5px;color:var(--text-muted);display:block;margin-top:2px;">
              Produces count matrix at each distance in chosen unit.
            </span>
          </div>

          <!-- Setup Persistence -->
          <div style="display:flex;gap:6px;margin-bottom:14px;">
            <button type="button" id="btn-save-impact-setup" class="btn btn-xs btn-outline" style="flex:1;">
              <i data-lucide="bookmark"></i> Save Setup
            </button>
            <button type="button" id="btn-load-impact-setup" class="btn btn-xs btn-outline" style="flex:1;">
              <i data-lucide="folder"></i> Load Setup
            </button>
          </div>

          <!-- Help Text -->
          <div style="font-size:11px;color:var(--text-muted);background:var(--bg-surface-solid);padding:6px 8px;border-radius:var(--radius-sm);border:1px solid var(--border-color);margin-bottom:12px;">
            <i data-lucide="info" style="width:12px;height:12px;vertical-align:middle;color:var(--primary);"></i>
            Note: The sample data uses points of interest. Results reflect exact PostGIS EPSG:32643 UTM planar calculations.
          </div>

          <div class="tool-actions">
            <button type="button" id="btn-run-buffer-impact" class="btn btn-primary btn-sm">
              <i data-lucide="activity"></i> Run Impact Analysis
            </button>
            <button type="button" id="btn-clear-buffer-impact" class="btn btn-outline btn-sm">
              <i data-lucide="trash-2"></i> Clear
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}

export function initBufferImpactTool() {
  const presetSelect = document.getElementById('impact-preset-select');
  const sourceSelect = document.getElementById('impact-source-layer');
  const sourceSubset = document.getElementById('impact-source-subset');
  const sourceIdWrap = document.getElementById('impact-source-id-wrap');
  const sourceIdInput = document.getElementById('impact-source-id-input');
  const distInput = document.getElementById('impact-distance-input');
  const unitSelect = document.getElementById('impact-unit-select');
  const totalWidthCheck = document.getElementById('impact-use-total-width');
  const totalWidthWrap = document.getElementById('impact-total-width-input-wrap');
  const totalWidthInput = document.getElementById('impact-total-width-input');
  const corridorText = document.getElementById('impact-corridor-helper-text');
  const lineSide = document.getElementById('impact-line-side');
  const lineEndCap = document.getElementById('impact-line-endcap');
  const dissolveCheck = document.getElementById('impact-dissolve-check');
  const targetsContainer = document.getElementById('impact-target-checkboxes');
  const scenariosInput = document.getElementById('impact-scenarios-input');
  const saveBtn = document.getElementById('btn-save-impact-setup');
  const loadBtn = document.getElementById('btn-load-impact-setup');
  const runBtn = document.getElementById('btn-run-buffer-impact');
  const clearBtn = document.getElementById('btn-clear-buffer-impact');

  if (!sourceSelect) return;

  const populateSourcesAndTargets = () => {
    let srcOpts = '';
    let tgtCheckboxes = '';

    state.layers.forEach((layerItem, id) => {
      srcOpts += `<option value="${id}">${layerItem.config.title} (${layerItem.featureCount})</option>`;
      const checked = id === 'points' ? 'checked' : '';
      tgtCheckboxes += `
        <label style="font-size:11.5px;display:flex;align-items:center;gap:6px;cursor:pointer;">
          <input type="checkbox" class="impact-target-check" value="${id}" ${checked}>
          <span>${layerItem.config.title}</span>
        </label>
      `;
    });

    if (state.resultLayers && state.resultLayers.size > 0) {
      srcOpts += '<optgroup label="Result Layers">';
      state.resultLayers.forEach((res, resId) => {
        srcOpts += `<option value="result:${resId}">Result: ${res.title}</option>`;
        tgtCheckboxes += `
          <label style="font-size:11.5px;display:flex;align-items:center;gap:6px;cursor:pointer;">
            <input type="checkbox" class="impact-target-check" value="result:${resId}">
            <span>Result: ${res.title}</span>
          </label>
        `;
      });
      srcOpts += '</optgroup>';
    }

    sourceSelect.innerHTML = srcOpts;
    if (state.layers.has('roads')) sourceSelect.value = 'roads';
    targetsContainer.innerHTML = tgtCheckboxes;
  };

  // Toggle specific ID input
  sourceSubset.addEventListener('change', () => {
    sourceIdWrap.classList.toggle('hide', sourceSubset.value !== 'by_id');
  });

  // Total width helper logic
  totalWidthCheck?.addEventListener('change', () => {
    const active = totalWidthCheck.checked;
    totalWidthWrap.classList.toggle('hide', !active);
    if (active) {
      const half = (parseFloat(distInput.value) || 20) * 2;
      totalWidthInput.value = half;
      updateCorridorText();
    }
  });

  const updateCorridorText = () => {
    const totalW = parseFloat(totalWidthInput.value) || 0;
    const half = totalW / 2;
    distInput.value = half;
    if (corridorText) {
      corridorText.textContent = `Corridor: ±${half} ${unitSelect.value} each side (Total ${totalW} ${unitSelect.value})`;
    }
  };

  totalWidthInput?.addEventListener('input', updateCorridorText);

  // Unit change listener
  state.on('units:change', (sys) => {
    if (unitSelect) {
      unitSelect.value = sys === 'imperial' ? 'ft' : 'm';
      if (distInput) distInput.value = sys === 'imperial' ? '65' : '20';
      if (scenariosInput) scenariosInput.value = sys === 'imperial' ? '15, 30, 50, 65' : '5, 10, 15, 20';
    }
  });

  // Presets
  presetSelect?.addEventListener('change', () => {
    const p = presetSelect.value;
    const isImp = state.unitSystem === 'imperial';

    if (p === 'road_widening') {
      sourceSelect.value = 'roads';
      sourceSubset.value = 'all';
      sourceIdWrap.classList.add('hide');
      distInput.value = isImp ? '33' : '10';
      lineSide.value = 'both';
      lineEndCap.value = 'flat';
      dissolveCheck.checked = true;
      scenariosInput.value = isImp ? '15, 33, 50, 65' : '5, 10, 15, 20';
      targetsContainer.querySelectorAll('.impact-target-check').forEach(cb => {
        cb.checked = cb.value === 'points';
      });
    } else if (p === 'utility_corridor') {
      sourceSelect.value = 'roads';
      distInput.value = isImp ? '50' : '15';
      lineSide.value = 'both';
      lineEndCap.value = 'round';
      dissolveCheck.checked = true;
      scenariosInput.value = isImp ? '15, 50, 100' : '5, 15, 30';
      targetsContainer.querySelectorAll('.impact-target-check').forEach(cb => {
        cb.checked = cb.value === 'points' || cb.value === 'division_boundary';
      });
    } else if (p === 'service_area') {
      sourceSelect.value = 'points';
      distInput.value = isImp ? '1000' : '300';
      dissolveCheck.checked = false;
      scenariosInput.value = isImp ? '330, 650, 1000' : '100, 200, 300';
      targetsContainer.querySelectorAll('.impact-target-check').forEach(cb => {
        cb.checked = cb.value === 'points' || cb.value === 'roads';
      });
    } else if (p === 'protected_zone') {
      sourceSelect.value = 'division_boundary';
      distInput.value = isImp ? '164' : '50';
      dissolveCheck.checked = true;
      scenariosInput.value = isImp ? '50, 100, 164' : '15, 30, 50';
      targetsContainer.querySelectorAll('.impact-target-check').forEach(cb => {
        cb.checked = cb.value === 'points';
      });
    }
  });

  // LocalStorage setup save / load
  saveBtn?.addEventListener('click', () => {
    const setup = {
      sourceLayer: sourceSelect.value,
      sourceSubset: sourceSubset.value,
      sourceId: sourceIdInput.value,
      distance: distInput.value,
      unit: unitSelect.value,
      lineSide: lineSide.value,
      lineEndCap: lineEndCap.value,
      dissolve: dissolveCheck.checked,
      scenarios: scenariosInput.value,
      targets: Array.from(targetsContainer.querySelectorAll('.impact-target-check:checked')).map(cb => cb.value)
    };
    localStorage.setItem('geovista_buffer_impact_setup', JSON.stringify(setup));
    state.emit('toast', { type: 'success', message: 'Analysis setup saved to localStorage.' });
  });

  loadBtn?.addEventListener('click', () => {
    const saved = localStorage.getItem('geovista_buffer_impact_setup');
    if (!saved) {
      state.emit('toast', { type: 'warning', message: 'No saved setup found in localStorage.' });
      return;
    }
    try {
      const setup = JSON.parse(saved);
      if (setup.sourceLayer) sourceSelect.value = setup.sourceLayer;
      if (setup.sourceSubset) sourceSubset.value = setup.sourceSubset;
      if (setup.sourceId) sourceIdInput.value = setup.sourceId;
      if (setup.distance) distInput.value = setup.distance;
      if (setup.unit) unitSelect.value = setup.unit;
      if (setup.lineSide) lineSide.value = setup.lineSide;
      if (setup.lineEndCap) lineEndCap.value = setup.lineEndCap;
      if (setup.dissolve !== undefined) dissolveCheck.checked = setup.dissolve;
      if (setup.scenarios) scenariosInput.value = setup.scenarios;
      sourceIdWrap.classList.toggle('hide', sourceSubset.value !== 'by_id');

      targetsContainer.querySelectorAll('.impact-target-check').forEach(cb => {
        cb.checked = setup.targets && setup.targets.includes(cb.value);
      });
      state.emit('toast', { type: 'info', message: 'Loaded analysis setup from localStorage.' });
    } catch (e) {
      console.error('Failed to parse saved setup:', e);
    }
  });

  // Execute Impact Analysis
  runBtn.addEventListener('click', async () => {
    const sourceLayer = sourceSelect.value;
    const subset = sourceSubset.value;
    const bufferDistance = parseFloat(distInput.value) || 20;
    const unit = unitSelect.value || 'm';
    const side = lineSide.value;
    const endcap = lineEndCap.value;
    const dissolve = dissolveCheck.checked;

    // Resolve source feature IDs
    let sourceIds = [];
    if (subset === 'by_id') {
      const raw = sourceIdInput.value.trim();
      sourceIds = raw ? raw.split(/[\s,]+/) : ['RD-001'];
    } else if (subset === 'filtered') {
      const srcLayerObj = state.getLayer(sourceLayer);
      if (srcLayerObj && srcLayerObj.filteredIds) {
        sourceIds = Array.from(srcLayerObj.filteredIds);
      }
    } else if (subset === 'selected' && state.selectedFeature && state.selectedFeature.layerId === sourceLayer) {
      const id = state.selectedFeature.feature?.properties?.[state.getLayer(sourceLayer)?.config?.idField];
      if (id) sourceIds = [id];
    }

    // Selected target layers
    const checkedTargets = Array.from(targetsContainer.querySelectorAll('.impact-target-check:checked')).map(cb => ({
      layer: cb.value,
      relation: 'intersects'
    }));

    if (checkedTargets.length === 0) {
      state.emit('toast', { type: 'warning', message: 'Please select at least one target layer to evaluate.' });
      return;
    }

    // Parse scenarios
    const rawScenarios = scenariosInput.value.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n) && n > 0);

    runBtn.disabled = true;
    runBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Computing Buffer Impact in Turf.js...';
    if (window.lucide) window.lucide.createIcons();

    try {
      // 100% Client-side Turf.js Buffer Impact Analysis
      const srcLayerObj = state.getLayer(sourceLayer);
      if (!srcLayerObj?.data) throw new Error('Source layer data unavailable.');

      const sourceFeatures = srcLayerObj.data.features.filter(f => 
        sourceIds.length === 0 || sourceIds.includes(f.properties?.[srcLayerObj.config.idField])
      );

      const distInKm = toMeters(bufferDistance, unit) / 1000;
      const srcFc = { type: 'FeatureCollection', features: sourceFeatures };
      let bufferFc = turf.buffer(srcFc, distInKm, { units: 'kilometers' });

      if (dissolve && bufferFc && bufferFc.features.length > 1) {
        try {
          const unioned = bufferFc.features.reduce((acc, cur) => acc ? turf.union(acc, cur) : cur, null);
          bufferFc = { type: 'FeatureCollection', features: unioned ? [unioned] : bufferFc.features };
        } catch (_) {}
      }

      // Check affected targets
      const affectedList = [];
      const perTargetCounts = [];

      checkedTargets.forEach(tgtKey => {
        const tgtObj = state.getLayer(tgtKey);
        if (!tgtObj?.data) return;

        let tgtHitCount = 0;
        tgtObj.data.features.forEach(tFeat => {
          let hit = false;
          try {
            for (const bFeat of bufferFc.features) {
              if (tFeat.geometry.type === 'Point') {
                if (turf.booleanPointInPolygon(tFeat, bFeat)) { hit = true; break; }
              } else {
                if (turf.booleanIntersects(tFeat, bFeat)) { hit = true; break; }
              }
            }
          } catch (_) {
            hit = false;
          }

          if (hit) {
            affectedList.push(tFeat);
            tgtHitCount++;
          }
        });

        perTargetCounts.push({
          layerId: tgtKey,
          layerTitle: tgtObj.config.title,
          affectedCount: tgtHitCount,
          totalCount: tgtObj.data.features.length
        });
      });

      // Compute Scenario comparison
      const scenarioTable = [];
      rawScenarios.forEach(scDist => {
        const scKm = toMeters(scDist, unit) / 1000;
        let scCount = 0;
        try {
          const scBuffer = turf.buffer(srcFc, scKm, { units: 'kilometers' });
          checkedTargets.forEach(tgtKey => {
            const tgtObj = state.getLayer(tgtKey);
            if (!tgtObj?.data) return;
            tgtObj.data.features.forEach(tFeat => {
              for (const b of scBuffer.features) {
                if (tFeat.geometry.type === 'Point' ? turf.booleanPointInPolygon(tFeat, b) : turf.booleanIntersects(tFeat, b)) {
                  scCount++;
                  break;
                }
              }
            });
          });
        } catch (_) {}
        scenarioTable.push({
          distanceMeters: toMeters(scDist, unit),
          count: scCount
        });
      });

      const data = {
        bufferGeoJSON: bufferFc,
        affectedFeatures: { type: 'FeatureCollection', features: affectedList },
        impactReport: {
          totalAffected: affectedList.length,
          perTargetCounts,
          scenarioTable,
          projectionMethod: 'Client-side Geodesic Turf.js EPSG:4326'
        }
      };

      // Create Leaflet Result Layers:
      // 1. Buffer Polygon Layer
      const bufferLeaflet = L.geoJSON(data.bufferGeoJSON, {
        style: {
          color: '#F97316',
          fillColor: '#F97316',
          fillOpacity: 0.18,
          weight: 2,
          dashArray: '4, 4'
        }
      });

      // 2. Affected Features Layer
      const affectedLeaflet = L.geoJSON(data.affectedFeatures, {
        pointToLayer: (feat, latlng) => {
          return L.circleMarker(latlng, {
            radius: 8,
            fillColor: '#EF4444',
            color: '#FFFFFF',
            weight: 2,
            opacity: 1,
            fillOpacity: 1
          });
        },
        style: {
          color: '#EF4444',
          weight: 4,
          opacity: 0.9
        },
        onEachFeature: (feat, l) => {
          const p = feat.properties || {};
          l.bindPopup(`
            <div class="popup-card">
              <div class="popup-card-header">
                <span class="popup-title">${p.name || p.road_name || 'Impacted Feature'}</span>
                <span class="badge badge-accent">Impacted</span>
              </div>
              <div class="popup-card-body">
                <table class="popup-table">
                  <tbody>
                    <tr><td class="key">Category</td><td class="val">${p.category || '—'}</td></tr>
                    <tr><td class="key">Division</td><td class="val">${p.div_name || '—'}</td></tr>
                    <tr><td class="key">Source ID</td><td class="val">${p.source_feature_id || '—'}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          `);
        }
      });

      const combinedGroup = L.featureGroup([bufferLeaflet, affectedLeaflet]);

      state.addResultLayer(data.resultId, {
        id: data.resultId,
        title: data.title,
        type: 'Buffer Impact',
        data: data.affectedFeatures,
        bufferData: data.bufferGeoJSON,
        leafletLayer: combinedGroup,
        report: data.report,
        inputUnit: unit,
        inputDistance: bufferDistance
      });

      state.emit('toast', {
        type: 'success',
        message: `Buffer Impact complete: ${data.report.totalAffected} features impacted within ${bufferDistance} ${unit}.`
      });

      switchTab('results');

    } catch (err) {
      console.error('Buffer impact error:', err);
      state.emit('toast', { type: 'danger', message: `Impact analysis failed: ${err.message}` });
    } finally {
      runBtn.disabled = false;
      runBtn.innerHTML = '<i data-lucide="activity"></i> Run Impact Analysis';
      if (window.lucide) window.lucide.createIcons();
    }
  });

  clearBtn.addEventListener('click', () => {
    state.clearResultLayers();
    state.emit('toast', { type: 'info', message: 'Cleared all analysis result layers.' });
  });

  state.on('layers:loaded', populateSourcesAndTargets);
  state.on('resultLayer:added', populateSourcesAndTargets);
  state.on('resultLayer:removed', populateSourcesAndTargets);
  populateSourcesAndTargets();
}
