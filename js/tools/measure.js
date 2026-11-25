/**
 * GeoVista Portal - Tool: Measurement & Nearest Road
 * Interactive measurement of line distance and polygon area with live coordinate tracking,
 * plus Nearest Road detection from any clicked point using Turf.js.
 */

import { state } from '../state.js?v=10';
import { switchTab } from '../ui.js?v=10';
import { formatDistance, formatArea, fromMeters, fromSquareMeters } from '../units.js?v=10';

let activeMeasureMode = null; // 'distance' | 'area' | 'nearest-road'
let measurePoints = [];
let measureMarkers = [];
let measureGraphic = null;

export function renderMeasureTool() {
  return `
    <div class="tool-card" id="tool-measure-card">
      <div class="tool-header" data-toggle="tool-body-measure">
        <div class="tool-header-title">
          <i data-lucide="ruler"></i>
          <span>Measurement & Nearest Road</span>
        </div>
      </div>
      <div class="tool-body" id="tool-body-measure">
        <form id="form-measure-tool" onsubmit="return false;">
          <div class="tool-form-group">
            <label>Measurement Mode</label>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <button type="button" id="btn-measure-dist" class="btn btn-outline btn-sm" style="flex:1;">
                <i data-lucide="git-commit"></i> Distance
              </button>
              <button type="button" id="btn-measure-area" class="btn btn-outline btn-sm" style="flex:1;">
                <i data-lucide="square"></i> Area
              </button>
              <button type="button" id="btn-nearest-road" class="btn btn-outline btn-sm" style="flex:1;">
                <i data-lucide="navigation"></i> Nearest Road
              </button>
            </div>
          </div>

          <div id="measure-instructions" style="font-size:11.5px;color:var(--text-muted);background:var(--bg-surface-solid);padding:8px 10px;border-radius:var(--radius-sm);border:1px solid var(--border-color);margin-bottom:12px;">
            Select a mode above and click on the map to start measuring.
          </div>

          <div id="measure-live-output" class="hide" style="font-size:13px;font-weight:700;color:var(--primary);background:var(--primary-light);padding:8px 12px;border-radius:var(--radius-sm);margin-bottom:12px;">
            <!-- Live readout -->
          </div>

          <div class="tool-actions">
            <button type="button" id="btn-finish-measure" class="btn btn-primary btn-sm hide">
              <i data-lucide="check"></i> Finish & Save
            </button>
            <button type="button" id="btn-clear-measure" class="btn btn-outline btn-sm">
              <i data-lucide="trash-2"></i> Reset
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}

export function initMeasureTool() {
  const distBtn = document.getElementById('btn-measure-dist');
  const areaBtn = document.getElementById('btn-measure-area');
  const nearestBtn = document.getElementById('btn-nearest-road');
  const instructEl = document.getElementById('measure-instructions');
  const liveOutputEl = document.getElementById('measure-live-output');
  const finishBtn = document.getElementById('btn-finish-measure');
  const clearBtn = document.getElementById('btn-clear-measure');

  if (!distBtn) return;

  const setMode = (mode) => {
    resetMeasurement();
    activeMeasureMode = mode;

    distBtn.classList.toggle('btn-primary', mode === 'distance');
    distBtn.classList.toggle('btn-outline', mode !== 'distance');
    areaBtn.classList.toggle('btn-primary', mode === 'area');
    areaBtn.classList.toggle('btn-outline', mode !== 'area');
    nearestBtn.classList.toggle('btn-primary', mode === 'nearest-road');
    nearestBtn.classList.toggle('btn-outline', mode !== 'nearest-road');

    if (mode === 'distance') {
      instructEl.textContent = 'Click on the map to add points along your path. Double click or press Finish when done.';
      finishBtn.classList.remove('hide');
      state.map.getContainer().style.cursor = 'crosshair';
    } else if (mode === 'area') {
      instructEl.textContent = 'Click at least 3 points on the map to enclose a polygon area. Press Finish when done.';
      finishBtn.classList.remove('hide');
      state.map.getContainer().style.cursor = 'crosshair';
    } else if (mode === 'nearest-road') {
      instructEl.textContent = 'Click anywhere on the map to find the closest road from the road network.';
      finishBtn.classList.add('hide');
      state.map.getContainer().style.cursor = 'crosshair';
    }
  };

  distBtn.addEventListener('click', () => setMode('distance'));
  areaBtn.addEventListener('click', () => setMode('area'));
  nearestBtn.addEventListener('click', () => setMode('nearest-road'));

  // Map Click Listener for Measuring
  state.on('map:ready', (map) => {
    map.on('click', handleMapClick);
  });
  if (state.map) {
    state.map.on('click', handleMapClick);
  }

  function handleMapClick(e) {
    if (!activeMeasureMode) return;

    const latlng = e.latlng;

    if (activeMeasureMode === 'nearest-road') {
      handleNearestRoad(latlng);
      return;
    }

    measurePoints.push([latlng.lng, latlng.lat]);

    // Add marker
    const marker = L.circleMarker(latlng, {
      radius: 5,
      color: '#0284C7',
      fillColor: '#FFFFFF',
      fillOpacity: 1,
      weight: 2
    }).addTo(state.map);
    measureMarkers.push(marker);

    // Update graphic
    if (activeMeasureMode === 'distance') {
      const latlngs = measurePoints.map(p => [p[1], p[0]]);
      if (!measureGraphic) {
        measureGraphic = L.polyline(latlngs, {
          color: '#0284C7',
          weight: 4,
          dashArray: '6, 6'
        }).addTo(state.map);
      } else {
        measureGraphic.setLatLngs(latlngs);
      }

      if (measurePoints.length >= 2) {
        const line = turf.lineString(measurePoints);
        const lengthM = turf.length(line, { units: 'meters' });
        liveOutputEl.classList.remove('hide');
        const isImp = state.unitSystem === 'imperial';
        const primary = formatDistance(lengthM, isImp ? 'ft' : 'm');
        const secondary = formatDistance(lengthM, isImp ? 'm' : 'ft');
        liveOutputEl.textContent = `Distance: ${primary} (${secondary})`;
      }

    } else if (activeMeasureMode === 'area') {
      const latlngs = measurePoints.map(p => [p[1], p[0]]);
      if (!measureGraphic) {
        measureGraphic = L.polygon(latlngs, {
          color: '#10B981',
          fillColor: '#34D399',
          fillOpacity: 0.25,
          weight: 2
        }).addTo(state.map);
      } else {
        measureGraphic.setLatLngs(latlngs);
      }

      if (measurePoints.length >= 3) {
        const closed = [...measurePoints, measurePoints[0]];
        const poly = turf.polygon([closed]);
        const areaSqm = turf.area(poly);
        liveOutputEl.classList.remove('hide');
        const isImp = state.unitSystem === 'imperial';
        const primary = formatArea(areaSqm, isImp ? 'ac' : 'sqm');
        const secondary = formatArea(areaSqm, isImp ? 'sqft' : 'ha');
        liveOutputEl.textContent = `Area: ${primary} (${secondary})`;
      }
    }
  }

  function handleNearestRoad(latlng) {
    const roadLayer = state.getLayer('roads');
    if (!roadLayer || !roadLayer.data) {
      state.emit('toast', { type: 'warning', message: 'Road layer is not loaded.' });
      return;
    }

    const clickPoint = turf.point([latlng.lng, latlng.lat]);
    let minDistance = Infinity;
    let closestRoad = null;

    roadLayer.data.features.forEach(road => {
      const dist = turf.pointToLineDistance(clickPoint, road, { units: 'meters' });
      if (dist < minDistance) {
        minDistance = dist;
        closestRoad = road;
      }
    });

    if (closestRoad) {
      resetMeasurement();

      const roadName = closestRoad.properties.road_name || closestRoad.properties.road_id;
      const roadClass = closestRoad.properties.category || 'General';
      const distRounded = Math.round(minDistance);

      // Add click marker
      const startMarker = L.circleMarker(latlng, {
        radius: 7,
        color: '#FFFFFF',
        fillColor: '#EF4444',
        fillOpacity: 1,
        weight: 2
      }).addTo(state.map);
      measureMarkers.push(startMarker);

      // Create Result Layer
      const resultGeoJSON = {
        type: 'FeatureCollection',
        features: [closestRoad]
      };

      const resultLayer = L.geoJSON(resultGeoJSON, {
        style: {
          color: '#E11D48',
          weight: 6,
          opacity: 1
        }
      });

      const resultGroup = L.featureGroup([startMarker, resultLayer]);

      const distStr = formatDistance(minDistance, state.unitSystem === 'imperial' ? 'ft' : 'm');
      const resultId = `nearest_road_${Date.now()}`;
      state.addResultLayer(resultId, {
        id: resultId,
        title: `Nearest Road: ${roadName} (${distStr})`,
        type: 'Nearest Road',
        data: resultGeoJSON,
        leafletLayer: resultGroup,
        metadata: {
          roadName,
          roadClass,
          distance: distStr,
          distance_m: minDistance,
          roadId: closestRoad.properties.road_id
        }
      });

      liveOutputEl.classList.remove('hide');
      liveOutputEl.innerHTML = `Nearest Road: <strong>${roadName}</strong> (${roadClass}) &bull; <strong>${distStr} away</strong>`;
      state.emit('toast', {
        type: 'success',
        message: `Nearest road is ${roadName} (${distStr} away).`
      });

      switchTab('results');
    }
  }

  finishBtn.addEventListener('click', () => {
    if (measurePoints.length < 2) {
      state.emit('toast', { type: 'warning', message: 'Please click at least 2 points.' });
      return;
    }

    let resultGeoJSON = null;
    let resultTitle = '';
    let resultType = '';

    if (activeMeasureMode === 'distance') {
      const line = turf.lineString(measurePoints);
      const lengthM = turf.length(line, { units: 'meters' });
      resultGeoJSON = turf.featureCollection([line]);
      resultType = 'Distance Measurement';
      resultTitle = `Measured Path (${Math.round(lengthM)} m)`;
    } else if (activeMeasureMode === 'area') {
      if (measurePoints.length < 3) {
        state.emit('toast', { type: 'warning', message: 'Please click at least 3 points for area.' });
        return;
      }
      const closed = [...measurePoints, measurePoints[0]];
      const poly = turf.polygon([closed]);
      const areaSqm = turf.area(poly);
      resultGeoJSON = turf.featureCollection([poly]);
      resultType = 'Area Measurement';
      resultTitle = `Measured Area (${Math.round(areaSqm).toLocaleString()} m²)`;
    }

    if (resultGeoJSON) {
      const resultId = `measure_${Date.now()}`;
      const savedGraphic = measureGraphic;
      measureGraphic = null; // Transfer ownership to result layer

      state.addResultLayer(resultId, {
        id: resultId,
        title: resultTitle,
        type: resultType,
        data: resultGeoJSON,
        leafletLayer: savedGraphic,
        metadata: {
          summary: liveOutputEl.textContent,
          pointsCount: measurePoints.length
        }
      });

      state.emit('toast', { type: 'success', message: `${resultType} saved to Results.` });
      resetMeasurement();
      switchTab('results');
    }
  });

  clearBtn.addEventListener('click', () => {
    resetMeasurement();
    state.emit('toast', { type: 'info', message: 'Measurement cleared.' });
  });

  function resetMeasurement() {
    measureMarkers.forEach(m => state.map && state.map.removeLayer(m));
    measureMarkers = [];
    measurePoints = [];
    if (measureGraphic && state.map) {
      state.map.removeLayer(measureGraphic);
      measureGraphic = null;
    }
    if (state.map) state.map.getContainer().style.cursor = '';
    activeMeasureMode = null;
    distBtn.classList.remove('btn-primary');
    distBtn.classList.add('btn-outline');
    areaBtn.classList.remove('btn-primary');
    areaBtn.classList.add('btn-outline');
    nearestBtn.classList.remove('btn-primary');
    nearestBtn.classList.add('btn-outline');
    finishBtn.classList.add('hide');
    liveOutputEl.classList.add('hide');
    instructEl.textContent = 'Select a mode above and click on the map to start measuring.';
  }
}
