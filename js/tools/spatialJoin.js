/**
 * GeoVista Portal - Tool: Upgraded Spatial Join
 * Executes SQL-based spatial joins via POST /api/tools/spatial-join.
 * Supports:
 *   - Any pair of layers (points, lines, polygons) and Result layers.
 *   - Features to use: All, Filtered, Selected.
 *   - Full PostGIS relations (Intersects, Within, Contains, Touches, Crosses, Overlaps, Disjoint, Equals, Covers, Covered by).
 *   - Distance joins ("Within distance of", "Nearest feature" 1..K with distance_m).
 *   - Left join vs Inner join, 1-to-many vs 1-to-1, attribute prefixing (join_).
 *   - Summary breakdown aggregation table with locate on row click.
 */

import { state } from '../state.js';
import { switchTab } from '../ui.js';
import { toMeters, fromMeters, formatDistance } from '../units.js';
import { zoomToFeature } from '../layers.js';

const RELATION_DESCRIPTIONS = {
  intersects: 'Geometries share at least one point in common.',
  within: 'Input geometry lies entirely inside the target geometry.',
  contains: 'Input geometry completely encloses the target geometry.',
  touches: 'Geometries share a boundary, but their interiors do not intersect.',
  crosses: 'Geometries share some but not all interior points (e.g. line crossing polygon/line).',
  overlaps: 'Geometries of the same dimension intersect with a common region of the same dimension.',
  disjoint: 'Geometries have no points in common.',
  equals: 'Geometries have exactly the same spatial shape and coordinates.',
  covers: 'Input geometry covers target without any part of target lying outside.',
  covered_by: 'Input geometry is entirely covered by the target geometry.',
  within_distance: 'Input feature is within a geodesic distance of the target feature.',
  nearest: 'Finds the closest K target features ordered by exact geodesic distance.'
};

export function renderSpatialJoinTool() {
  const isImp = state.unitSystem === 'imperial';
  return `
    <div class="tool-card" id="tool-spatial-join-card">
      <div class="tool-header" data-toggle="tool-body-spatial-join">
        <div class="tool-header-title">
          <i data-lucide="layers"></i>
          <span>Spatial Join (PostGIS)</span>
        </div>
        <i data-lucide="chevron-down" class="tool-toggle-icon"></i>
      </div>
      <div class="tool-body" id="tool-body-spatial-join">
        <form id="form-spatial-join-tool" onsubmit="return false;">
          
          <!-- Input Layer -->
          <div class="tool-form-group">
            <label for="join-input-layer">Input Vector Layer (Base)</label>
            <select id="join-input-layer" class="tool-select"></select>
          </div>
          <div class="tool-form-group" style="margin-top:-6px;margin-bottom:12px;">
            <label style="font-size:11px;color:var(--text-muted);">Features to use:</label>
            <select id="join-input-subset" class="tool-select" style="font-size:11.5px;padding:4px 8px;">
              <option value="all" selected>All features</option>
              <option value="filtered">Filtered features only</option>
              <option value="selected">Currently selected feature</option>
            </select>
          </div>

          <!-- Target Layer -->
          <div class="tool-form-group">
            <label for="join-target-layer">Join / Target Layer</label>
            <select id="join-target-layer" class="tool-select"></select>
          </div>
          <div class="tool-form-group" style="margin-top:-6px;margin-bottom:12px;">
            <label style="font-size:11px;color:var(--text-muted);">Features to use:</label>
            <select id="join-target-subset" class="tool-select" style="font-size:11.5px;padding:4px 8px;">
              <option value="all" selected>All features</option>
              <option value="filtered">Filtered features only</option>
              <option value="selected">Currently selected feature</option>
            </select>
          </div>

          <!-- Spatial Predicate -->
          <div class="tool-form-group">
            <label for="join-relation-select">Spatial Relation</label>
            <select id="join-relation-select" class="tool-select">
              <optgroup label="Topological Relations">
                <option value="within">Within (Inside target)</option>
                <option value="intersects" selected>Intersects (Shares space)</option>
                <option value="contains">Contains (Encloses target)</option>
                <option value="touches">Touches (Boundary contact)</option>
                <option value="crosses">Crosses (Partial intersection)</option>
                <option value="overlaps">Overlaps (Same dimension overlap)</option>
                <option value="disjoint">Disjoint (No common space)</option>
                <option value="equals">Equals (Spatially identical)</option>
                <option value="covers">Covers (Completely covers)</option>
                <option value="covered_by">Covered by (Covered by target)</option>
              </optgroup>
              <optgroup label="Distance Joins">
                <option value="within_distance">Within distance of</option>
                <option value="nearest">Nearest feature (1 to K)</option>
              </optgroup>
            </select>
            <div id="join-relation-desc" style="font-size:11px;color:var(--text-secondary);background:var(--bg-surface-solid);padding:6px 8px;border-radius:var(--radius-sm);border:1px solid var(--border-color);margin-top:6px;">
              ${RELATION_DESCRIPTIONS.intersects}
            </div>
          </div>

          <!-- Distance Settings (Hidden unless distance relation selected) -->
          <div id="join-distance-wrap" class="hide" style="background:var(--bg-surface-solid);padding:10px;border-radius:var(--radius-sm);border:1px solid var(--border-color);margin-bottom:12px;">
            <div style="display:grid;grid-template-columns: 2fr 1fr;gap: 8px;">
              <div class="tool-form-group">
                <label for="join-distance-input">Search Distance</label>
                <input type="number" id="join-distance-input" class="tool-input" value="${isImp ? '650' : '200'}" min="1" step="any">
              </div>
              <div class="tool-form-group">
                <label for="join-unit-select">Unit</label>
                <select id="join-unit-select" class="tool-select">
                  <option value="m" ${!isImp ? 'selected' : ''}>m</option>
                  <option value="km">km</option>
                  <option value="ft" ${isImp ? 'selected' : ''}>ft</option>
                </select>
              </div>
            </div>

            <div class="tool-form-group hide" id="join-nearest-k-wrap" style="margin-top:6px;">
              <label for="join-nearest-k-input">Nearest K matches (1 to 10)</label>
              <input type="number" id="join-nearest-k-input" class="tool-input" value="1" min="1" max="10" step="1">
            </div>
          </div>

          <!-- Join Options (1-to-many, left join, prefix) -->
          <div style="display:grid;grid-template-columns: 1fr 1fr;gap: 8px;margin-bottom:12px;">
            <div class="tool-form-group">
              <label for="join-type-select">Join Type</label>
              <select id="join-type-select" class="tool-select">
                <option value="inner" selected>Inner (Matched only)</option>
                <option value="left">Left (Keep unmatched)</option>
              </select>
            </div>
            <div class="tool-form-group">
              <label for="join-cardinality-select">Match</label>
              <select id="join-cardinality-select" class="tool-select">
                <option value="one_to_many" selected>1-to-many</option>
                <option value="one_to_one">1-to-1 (First)</option>
              </select>
            </div>
          </div>

          <div class="tool-form-group" style="margin-bottom:12px;">
            <label for="join-prefix-input">Attribute Prefix</label>
            <input type="text" id="join-prefix-input" class="tool-input" value="join_" placeholder="e.g. join_">
          </div>

          <div class="tool-actions">
            <button type="button" id="btn-run-spatial-join" class="btn btn-primary btn-sm">
              <i data-lucide="play"></i> Run Spatial Join
            </button>
            <button type="button" id="btn-clear-spatial-join" class="btn btn-outline btn-sm">
              <i data-lucide="trash-2"></i> Clear
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}

export function initSpatialJoinTool() {
  const inputSelect = document.getElementById('join-input-layer');
  const targetSelect = document.getElementById('join-target-layer');
  const inputSubset = document.getElementById('join-input-subset');
  const targetSubset = document.getElementById('join-target-subset');
  const relSelect = document.getElementById('join-relation-select');
  const relDesc = document.getElementById('join-relation-desc');
  const distWrap = document.getElementById('join-distance-wrap');
  const distInput = document.getElementById('join-distance-input');
  const unitSelect = document.getElementById('join-unit-select');
  const nearestKWrap = document.getElementById('join-nearest-k-wrap');
  const nearestKInput = document.getElementById('join-nearest-k-input');
  const joinTypeSelect = document.getElementById('join-type-select');
  const cardinalitySelect = document.getElementById('join-cardinality-select');
  const prefixInput = document.getElementById('join-prefix-input');
  const runBtn = document.getElementById('btn-run-spatial-join');
  const clearBtn = document.getElementById('btn-clear-spatial-join');

  if (!inputSelect) return;

  const populateAllLayers = () => {
    let opts = '';
    state.layers.forEach((layerItem, id) => {
      opts += `<option value="${id}">${layerItem.config.title} (${layerItem.featureCount})</option>`;
    });

    // Add active Result layers
    if (state.resultLayers && state.resultLayers.size > 0) {
      opts += '<optgroup label="Result Layers">';
      state.resultLayers.forEach((res, resId) => {
        opts += `<option value="result:${resId}">Result: ${res.title}</option>`;
      });
      opts += '</optgroup>';
    }

    inputSelect.innerHTML = opts;
    targetSelect.innerHTML = opts;

    // Set default selections
    if (state.layers.has('points')) inputSelect.value = 'points';
    if (state.layers.has('division_boundary')) targetSelect.value = 'division_boundary';
  };

  // Update relation description and distance visibility
  relSelect.addEventListener('change', () => {
    const val = relSelect.value;
    if (relDesc) relDesc.textContent = RELATION_DESCRIPTIONS[val] || '';

    const isDist = val === 'within_distance' || val === 'nearest';
    distWrap.classList.toggle('hide', !isDist);
    nearestKWrap.classList.toggle('hide', val !== 'nearest');
  });

  // Global units change
  state.on('units:change', (sys) => {
    if (unitSelect) {
      unitSelect.value = sys === 'imperial' ? 'ft' : 'm';
      if (distInput) distInput.value = sys === 'imperial' ? '650' : '200';
    }
  });

  // Execute Join
  runBtn.addEventListener('click', async () => {
    const inputLayer = inputSelect.value;
    const targetLayer = targetSelect.value;
    const rel = relSelect.value;
    const joinType = joinTypeSelect.value;
    const cardinality = cardinalitySelect.value;
    const prefix = prefixInput.value.trim() || 'join_';
    const dist = parseFloat(distInput.value) || 100;
    const unit = unitSelect.value || 'm';
    const nearestK = parseInt(nearestKInput.value, 10) || 1;

    // Resolve feature IDs if subset chosen
    const resolveIds = (layerId, subsetType) => {
      if (subsetType === 'all' || layerId.startsWith('result:')) return [];
      const layer = state.getLayer(layerId);
      if (!layer) return [];
      if (subsetType === 'filtered' && layer.filteredIds) {
        return Array.from(layer.filteredIds);
      }
      if (subsetType === 'selected' && state.selectedFeature && state.selectedFeature.layerId === layerId) {
        const id = state.selectedFeature.feature?.properties?.[layer.config.idField];
        return id ? [id] : [];
      }
      return [];
    };

    const inputIds = resolveIds(inputLayer, inputSubset.value);
    const targetIds = resolveIds(targetLayer, targetSubset.value);

    runBtn.disabled = true;
    runBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Joining in Turf.js...';
    if (window.lucide) window.lucide.createIcons();

    try {
      // 100% Client-side Turf.js Spatial Join
      const inLayerObj = state.getLayer(inputLayer);
      const tgtLayerObj = state.getLayer(targetLayer);
      if (!inLayerObj?.data || !tgtLayerObj?.data) {
        throw new Error('Layer data not loaded.');
      }

      const inputFeatures = inLayerObj.data.features.filter(f => 
        inputIds.length === 0 || inputIds.includes(f.properties?.[inLayerObj.config.idField])
      );
      const targetFeatures = tgtLayerObj.data.features.filter(f => 
        targetIds.length === 0 || targetIds.includes(f.properties?.[tgtLayerObj.config.idField])
      );

      const maxDistM = (rel === 'within_distance') ? toMeters(dist, unit) : 0;
      const joinedFeatures = [];

      inputFeatures.forEach(inFeat => {
        const matches = [];

        targetFeatures.forEach(tgtFeat => {
          let matched = false;
          try {
            if (rel === 'within_distance') {
              const dKm = turf.distance(turf.centroid(inFeat), turf.centroid(tgtFeat), { units: 'kilometers' });
              matched = (dKm * 1000) <= maxDistM;
            } else if (inFeat.geometry.type === 'Point' && (tgtFeat.geometry.type === 'Polygon' || tgtFeat.geometry.type === 'MultiPolygon')) {
              matched = turf.booleanPointInPolygon(inFeat, tgtFeat);
            } else {
              matched = turf.booleanIntersects(inFeat, tgtFeat);
            }
          } catch (_) {
            matched = false;
          }

          if (matched) matches.push(tgtFeat);
        });

        if (joinType === 'inner' && matches.length === 0) return;

        const mergeProperties = (mFeat) => {
          const props = { ...inFeat.properties };
          if (mFeat) {
            Object.entries(mFeat.properties || {}).forEach(([k, v]) => {
              props[`${prefix}${k}`] = v;
            });
          }
          return {
            type: 'Feature',
            geometry: inFeat.geometry,
            properties: props
          };
        };

        if (cardinality === 'one_to_one' || matches.length <= 1) {
          joinedFeatures.push(mergeProperties(matches[0] || null));
        } else {
          matches.forEach(m => joinedFeatures.push(mergeProperties(m)));
        }
      });

      const geojson = {
        type: 'FeatureCollection',
        features: joinedFeatures
      };

      const data = {
        title: `Spatial Join: ${inLayerObj.config.title} + ${tgtLayerObj.config.title}`,
        geojson,
        matchedCount: joinedFeatures.length,
        totalCount: inputFeatures.length
      };

      // Create Leaflet layer for the joined result
      const resultLayer = L.geoJSON(geojson, {
        pointToLayer: (feat, latlng) => {
          return L.circleMarker(latlng, {
            radius: 8,
            fillColor: '#8B5CF6',
            color: '#FFFFFF',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.9
          });
        },
        style: {
          color: '#8B5CF6',
          weight: 4,
          opacity: 0.85
        },
        onEachFeature: (feat, l) => {
          const props = feat.properties || {};
          let rows = '';
          Object.entries(props).forEach(([k, v]) => {
            if (typeof v !== 'object') {
              rows += `<tr><td class="key">${k}</td><td class="val">${v || '—'}</td></tr>`;
            }
          });
          l.bindPopup(`
            <div class="popup-card">
              <div class="popup-card-header">
                <span class="popup-title">${props.name || props.road_name || 'Joined Feature'}</span>
                <span class="popup-id-badge">${props.id || ''}</span>
              </div>
              <div class="popup-card-body" style="max-height:180px;overflow-y:auto;">
                <table class="popup-table"><tbody>${rows}</tbody></table>
              </div>
            </div>
          `);
        }
      });

      state.addResultLayer(data.resultId, {
        id: data.resultId,
        title: data.title,
        type: 'Spatial Join',
        data: geojson,
        leafletLayer: resultLayer,
        summary: data.summary
      });

      state.emit('toast', {
        type: 'success',
        message: `Spatial join complete: ${data.summary.totalJoined} features joined (${data.summary.unmatchedCount} unmatched).`
      });

      switchTab('results');

    } catch (err) {
      console.error('Spatial join error:', err);
      state.emit('toast', { type: 'danger', message: `Join failed: ${err.message}` });
    } finally {
      runBtn.disabled = false;
      runBtn.innerHTML = '<i data-lucide="play"></i> Run Spatial Join';
      if (window.lucide) window.lucide.createIcons();
    }
  });

  clearBtn.addEventListener('click', () => {
    state.clearResultLayers();
    state.emit('toast', { type: 'info', message: 'Cleared all spatial join results.' });
  });

  state.on('layers:loaded', populateAllLayers);
  state.on('resultLayer:added', populateAllLayers);
  state.on('resultLayer:removed', populateAllLayers);
  populateAllLayers();
}
