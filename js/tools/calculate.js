/**
 * GeoVista Portal - Tool: Attribute Calculator & Statistics
 * Provides:
 *   1. Summary Statistics: Count, Sum, Mean, Median, Min, Max, Range, Standard Deviation.
 *   2. Field Calculator: Safe math expression evaluation across attributes & geometry ($area, $length, $lat, $lon).
 *   3. Scope selector: All features vs Filtered/Selected features.
 *   4. Real-time layer and attribute table synchronization, Copy & CSV export.
 */

import { state } from '../state.js';

let activeCalcMode = 'stats'; // 'stats' | 'calc'
let lastComputedStats = null;

export function renderCalculateTool() {
  return `
    <div class="tool-card" id="tool-calc-card">
      <div class="tool-header" data-toggle="tool-body-calc">
        <div class="tool-header-title">
          <i data-lucide="calculator"></i>
          <span>Attribute Calculator & Statistics</span>
        </div>
        <i data-lucide="chevron-down" class="tool-toggle-icon"></i>
      </div>
      <div class="tool-body" id="tool-body-calc">
        <form id="form-calc-tool" onsubmit="return false;">
          <!-- Common Selection: Layer & Scope -->
          <div class="tool-form-group">
            <label for="calc-layer-select">Target Layer</label>
            <select id="calc-layer-select" class="tool-select"></select>
          </div>

          <div class="tool-form-group">
            <label for="calc-scope-select">Calculation Scope</label>
            <select id="calc-scope-select" class="tool-select">
              <option value="all">All Features</option>
              <option value="filtered">Filtered / Selected Features Only</option>
            </select>
            <div id="calc-scope-hint" style="font-size:11px;color:var(--text-muted);margin-top:3px;"></div>
          </div>

          <!-- Mode Switcher Tabs -->
          <div class="calc-mode-switcher" style="display:flex;gap:4px;margin-bottom:14px;background:var(--bg-surface-solid);padding:3px;border-radius:var(--radius-sm);border:1px solid var(--border-color);">
            <button type="button" id="btn-calc-mode-stats" class="btn btn-sm btn-primary calc-mode-btn" style="flex:1;font-size:11.5px;padding:6px;">
              <i data-lucide="bar-chart-2"></i> Summary Statistics
            </button>
            <button type="button" id="btn-calc-mode-calc" class="btn btn-sm btn-outline calc-mode-btn" style="flex:1;font-size:11.5px;padding:6px;">
              <i data-lucide="edit-3"></i> Field Calculator
            </button>
          </div>

          <!-- ================= MODE A: Summary Statistics ================= -->
          <div id="calc-panel-stats">
            <div class="tool-form-group">
              <label for="calc-stats-field-select">Target Numeric Field or Property</label>
              <select id="calc-stats-field-select" class="tool-select"></select>
            </div>

            <div class="tool-actions">
              <button type="button" id="btn-run-stats" class="btn btn-primary btn-sm" style="flex:1;">
                <i data-lucide="play"></i> Compute Statistics
              </button>
              <button type="button" id="btn-clear-stats" class="btn btn-outline btn-sm">
                <i data-lucide="rotate-ccw"></i> Reset
              </button>
            </div>

            <!-- Output Container for Summary Statistics -->
            <div id="calc-stats-output" class="hide" style="margin-top:14px;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                <span id="calc-stats-title" style="font-size:11.5px;font-weight:700;color:var(--text-primary);text-transform:uppercase;letter-spacing:0.4px;">
                  Summary Statistics
                </span>
                <div style="display:flex;gap:4px;">
                  <button type="button" id="btn-copy-stats" class="btn btn-xs btn-outline" title="Copy to clipboard">
                    <i data-lucide="copy"></i> Copy
                  </button>
                  <button type="button" id="btn-export-stats-csv" class="btn btn-xs btn-outline" title="Download CSV">
                    <i data-lucide="download"></i> CSV
                  </button>
                </div>
              </div>

              <!-- Top Highlights Grid -->
              <div class="calc-stats-grid" id="calc-stats-cards"></div>

              <!-- Detailed Metric Table -->
              <table class="data-table" style="font-size:11.5px;margin-top:8px;width:100%;border-radius:var(--radius-sm);overflow:hidden;">
                <tbody id="calc-stats-table-body"></tbody>
              </table>

              <div id="calc-stats-ignored-notice" style="font-size:10.5px;color:var(--text-muted);font-style:italic;margin-top:6px;"></div>
            </div>
          </div>

          <!-- ================= MODE B: Field Calculator ================= -->
          <div id="calc-panel-calc" class="hide">
            <div class="tool-form-group">
              <label>Destination Attribute Column</label>
              <div style="display:flex;gap:14px;margin-bottom:6px;font-size:12px;">
                <label style="display:flex;align-items:center;gap:4px;cursor:pointer;">
                  <input type="radio" name="calc-dest-type" value="new" checked id="calc-dest-radio-new">
                  <span>Create New Field</span>
                </label>
                <label style="display:flex;align-items:center;gap:4px;cursor:pointer;">
                  <input type="radio" name="calc-dest-type" value="existing" id="calc-dest-radio-existing">
                  <span>Update Existing Field</span>
                </label>
              </div>

              <div id="calc-new-field-wrap">
                <input type="text" id="calc-new-field-name" class="tool-input" placeholder="Field name (e.g. density_sqkm, cost_est)">
              </div>
              <div id="calc-existing-field-wrap" class="hide">
                <select id="calc-existing-field-select" class="tool-select"></select>
              </div>
            </div>

            <!-- Expression Textarea -->
            <div class="tool-form-group">
              <label for="calc-formula-input">
                Expression / Formula
                <span style="font-size:10.5px;color:var(--text-muted);font-weight:400;margin-left:4px;">(Click chips below to insert)</span>
              </label>
              <textarea id="calc-formula-input" class="tool-input" rows="2" placeholder="e.g. length_m * 1.5 or $area / 10000" style="resize:vertical;font-family:var(--font-mono, monospace);font-size:12px;"></textarea>
            </div>

            <!-- Quick Chips Section -->
            <div class="tool-form-group" style="margin-bottom:8px;">
              <div style="font-size:11px;font-weight:600;color:var(--text-muted);margin-bottom:4px;">Layer Fields & Geometry:</div>
              <div id="calc-field-chips" class="calc-chips-wrap"></div>
            </div>

            <div class="tool-form-group">
              <div style="font-size:11px;font-weight:600;color:var(--text-muted);margin-bottom:4px;">Operators & Math Functions:</div>
              <div class="calc-chips-wrap">
                <button type="button" class="calc-chip" data-insert=" + ">+</button>
                <button type="button" class="calc-chip" data-insert=" - ">-</button>
                <button type="button" class="calc-chip" data-insert=" * ">*</button>
                <button type="button" class="calc-chip" data-insert=" / ">/</button>
                <button type="button" class="calc-chip" data-insert=" ^ ">^</button>
                <button type="button" class="calc-chip" data-insert="(">(</button>
                <button type="button" class="calc-chip" data-insert=")">)</button>
                <button type="button" class="calc-chip" data-insert="round(, 2)">round(x, 2)</button>
                <button type="button" class="calc-chip" data-insert="sqrt()">sqrt(x)</button>
                <button type="button" class="calc-chip" data-insert="abs()">abs(x)</button>
                <button type="button" class="calc-chip" data-insert="min(, )">min(a,b)</button>
                <button type="button" class="calc-chip" data-insert="max(, )">max(a,b)</button>
              </div>
            </div>

            <div class="tool-actions">
              <button type="button" id="btn-run-calc" class="btn btn-primary btn-sm" style="flex:1;">
                <i data-lucide="check"></i> Calculate & Apply
              </button>
              <button type="button" id="btn-clear-calc" class="btn btn-outline btn-sm">
                <i data-lucide="rotate-ccw"></i> Clear
              </button>
            </div>

            <div id="calc-status-output" class="hide" style="margin-top:12px;font-size:12px;padding:8px 10px;border-radius:var(--radius-sm);border:1px solid var(--border-color);"></div>
          </div>
        </form>
      </div>
    </div>
  `;
}

export function initCalculateTool() {
  const layerSelect = document.getElementById('calc-layer-select');
  const scopeSelect = document.getElementById('calc-scope-select');
  const scopeHint = document.getElementById('calc-scope-hint');

  // Mode buttons
  const modeStatsBtn = document.getElementById('btn-calc-mode-stats');
  const modeCalcBtn = document.getElementById('btn-calc-mode-calc');
  const panelStats = document.getElementById('calc-panel-stats');
  const panelCalc = document.getElementById('calc-panel-calc');

  // Mode A elements
  const statsFieldSelect = document.getElementById('calc-stats-field-select');
  const runStatsBtn = document.getElementById('btn-run-stats');
  const clearStatsBtn = document.getElementById('btn-clear-stats');
  const statsOutput = document.getElementById('calc-stats-output');
  const statsCards = document.getElementById('calc-stats-cards');
  const statsTableBody = document.getElementById('calc-stats-table-body');
  const statsIgnoredNotice = document.getElementById('calc-stats-ignored-notice');
  const statsTitle = document.getElementById('calc-stats-title');
  const copyStatsBtn = document.getElementById('btn-copy-stats');
  const exportStatsCsvBtn = document.getElementById('btn-export-stats-csv');

  // Mode B elements
  const destRadioNew = document.getElementById('calc-dest-radio-new');
  const destRadioExisting = document.getElementById('calc-dest-radio-existing');
  const newFieldWrap = document.getElementById('calc-new-field-wrap');
  const existingFieldWrap = document.getElementById('calc-existing-field-wrap');
  const newFieldNameInput = document.getElementById('calc-new-field-name');
  const existingFieldSelect = document.getElementById('calc-existing-field-select');
  const formulaInput = document.getElementById('calc-formula-input');
  const fieldChipsWrap = document.getElementById('calc-field-chips');
  const runCalcBtn = document.getElementById('btn-run-calc');
  const clearCalcBtn = document.getElementById('btn-clear-calc');
  const statusOutput = document.getElementById('calc-status-output');

  if (!layerSelect) return;

  // 1. Populate Layer Dropdown
  const populateLayers = () => {
    let opts = '';
    state.layers.forEach((layerItem, id) => {
      opts += `<option value="${id}">${layerItem.config.title} (${layerItem.featureCount})</option>`;
    });
    layerSelect.innerHTML = opts;
    updateLayerFields();
    updateScopeHint();
  };

  // 2. Update Layer Fields & Chips
  const updateLayerFields = () => {
    const layerId = layerSelect.value;
    const layer = state.getLayer(layerId);
    if (!layer || !layer.data) return;

    const geomType = layer.config.geometryType;
    const fields = layer.config.fields || [];

    // Mode A: Numeric attribute fields + geometry fields
    let statsFieldOpts = '';
    let hasNumericField = false;

    // Check layer sample data for numeric values
    const sampleFeatures = layer.data.features ? layer.data.features.slice(0, 50) : [];

    fields.forEach(f => {
      const isNumeric = sampleFeatures.some(feat => {
        const val = feat.properties?.[f.key] ?? (f.altKey ? feat.properties?.[f.altKey] : undefined);
        return val !== null && val !== undefined && val !== '' && !isNaN(Number(val));
      });

      if (isNumeric) {
        hasNumericField = true;
        statsFieldOpts += `<option value="${f.key}">${f.label} (${f.key})</option>`;
      }
    });

    // Add Virtual Geometry Properties
    if (geomType === 'Polygon' || geomType === 'MultiPolygon') {
      statsFieldOpts += `<option value="$area">Geometry: Area (m²)</option>`;
      statsFieldOpts += `<option value="$area_km2">Geometry: Area (km²)</option>`;
      statsFieldOpts += `<option value="$perimeter">Geometry: Perimeter (m)</option>`;
    } else if (geomType === 'LineString' || geomType === 'MultiLineString') {
      statsFieldOpts += `<option value="$length">Geometry: Length (m)</option>`;
      statsFieldOpts += `<option value="$length_km">Geometry: Length (km)</option>`;
    } else if (geomType === 'Point') {
      statsFieldOpts += `<option value="$lat">Geometry: Latitude (Y)</option>`;
      statsFieldOpts += `<option value="$lon">Geometry: Longitude (X)</option>`;
    }

    if (!statsFieldOpts) {
      statsFieldOpts = `<option value="">(No numeric fields found)</option>`;
    }

    statsFieldSelect.innerHTML = statsFieldOpts;

    // Mode B: Existing fields dropdown
    let existingFieldOpts = '';
    fields.forEach(f => {
      existingFieldOpts += `<option value="${f.key}">${f.label} (${f.key})</option>`;
    });
    existingFieldSelect.innerHTML = existingFieldOpts;

    // Mode B: Field Chips
    let chipsHtml = '';
    fields.forEach(f => {
      chipsHtml += `<button type="button" class="calc-chip" data-insert="${f.key}">${f.key}</button>`;
    });

    // Add geometry chips
    if (geomType === 'Polygon' || geomType === 'MultiPolygon') {
      chipsHtml += `<button type="button" class="calc-chip chip-geom" data-insert="$area" title="Area in square meters">$area</button>`;
      chipsHtml += `<button type="button" class="calc-chip chip-geom" data-insert="$area_km2" title="Area in square kilometers">$area_km2</button>`;
      chipsHtml += `<button type="button" class="calc-chip chip-geom" data-insert="$perimeter" title="Perimeter in meters">$perimeter</button>`;
    } else if (geomType === 'LineString' || geomType === 'MultiLineString') {
      chipsHtml += `<button type="button" class="calc-chip chip-geom" data-insert="$length" title="Length in meters">$length</button>`;
      chipsHtml += `<button type="button" class="calc-chip chip-geom" data-insert="$length_km" title="Length in kilometers">$length_km</button>`;
    } else if (geomType === 'Point') {
      chipsHtml += `<button type="button" class="calc-chip chip-geom" data-insert="$lat" title="Point Latitude">$lat</button>`;
      chipsHtml += `<button type="button" class="calc-chip chip-geom" data-insert="$lon" title="Point Longitude">$lon</button>`;
    }

    fieldChipsWrap.innerHTML = chipsHtml;
    attachChipListeners();
    updateScopeHint();
  };

  const updateScopeHint = () => {
    const layerId = layerSelect.value;
    const layer = state.getLayer(layerId);
    if (!layer || !layer.data) {
      scopeHint.textContent = '';
      return;
    }

    const totalCount = layer.data.features ? layer.data.features.length : 0;
    const filteredCount = layer.filteredIds ? layer.filteredIds.size : 0;

    if (layer.filteredIds) {
      scopeHint.innerHTML = `Filter active: <strong>${filteredCount}</strong> of <strong>${totalCount}</strong> features match.`;
    } else {
      scopeHint.innerHTML = `Total features available: <strong>${totalCount}</strong> (no filter active).`;
    }
  };

  // 3. Mode Switcher
  const setCalcMode = (mode) => {
    activeCalcMode = mode;
    if (mode === 'stats') {
      modeStatsBtn.classList.replace('btn-outline', 'btn-primary');
      modeCalcBtn.classList.replace('btn-primary', 'btn-outline');
      panelStats.classList.remove('hide');
      panelCalc.classList.add('hide');
    } else {
      modeCalcBtn.classList.replace('btn-outline', 'btn-primary');
      modeStatsBtn.classList.replace('btn-primary', 'btn-outline');
      panelCalc.classList.remove('hide');
      panelStats.classList.add('hide');
    }
    if (window.lucide) window.lucide.createIcons();
  };

  modeStatsBtn.addEventListener('click', () => setCalcMode('stats'));
  modeCalcBtn.addEventListener('click', () => setCalcMode('calc'));

  // Destination radio toggle
  destRadioNew.addEventListener('change', () => {
    newFieldWrap.classList.remove('hide');
    existingFieldWrap.classList.add('hide');
  });

  destRadioExisting.addEventListener('change', () => {
    existingFieldWrap.classList.remove('hide');
    newFieldWrap.classList.add('hide');
  });

  // Chip click to insert into formula input
  const attachChipListeners = () => {
    document.querySelectorAll('.calc-chip').forEach(btn => {
      btn.onclick = () => {
        const textToInsert = btn.getAttribute('data-insert');
        if (!textToInsert) return;
        insertAtCursor(formulaInput, textToInsert);
      };
    });
  };

  function insertAtCursor(input, text) {
    const start = input.selectionStart || input.value.length;
    const end = input.selectionEnd || input.value.length;
    const current = input.value;
    input.value = current.substring(0, start) + text + current.substring(end);
    const newPos = start + text.length;
    input.focus();
    input.setSelectionRange(newPos, newPos);
  }

  // 4. Extract Feature Numeric Value Helper
  const getFeatureNumericValue = (feat, fieldKey, geomType) => {
    if (fieldKey === '$area') {
      return (window.turf && (geomType === 'Polygon' || geomType === 'MultiPolygon')) ? turf.area(feat) : 0;
    }
    if (fieldKey === '$area_km2') {
      return (window.turf && (geomType === 'Polygon' || geomType === 'MultiPolygon')) ? turf.area(feat) / 1000000 : 0;
    }
    if (fieldKey === '$perimeter') {
      return (window.turf && (geomType === 'Polygon' || geomType === 'MultiPolygon')) ? turf.length(feat, { units: 'kilometers' }) * 1000 : 0;
    }
    if (fieldKey === '$length') {
      return (window.turf && (geomType === 'LineString' || geomType === 'MultiLineString')) ? turf.length(feat, { units: 'kilometers' }) * 1000 : 0;
    }
    if (fieldKey === '$length_km') {
      return (window.turf && (geomType === 'LineString' || geomType === 'MultiLineString')) ? turf.length(feat, { units: 'kilometers' }) : 0;
    }
    if (fieldKey === '$lat') {
      if (feat.geometry?.type === 'Point' && feat.geometry.coordinates) {
        return feat.geometry.coordinates[1];
      }
      return window.turf ? turf.centroid(feat).geometry.coordinates[1] : 0;
    }
    if (fieldKey === '$lon') {
      if (feat.geometry?.type === 'Point' && feat.geometry.coordinates) {
        return feat.geometry.coordinates[0];
      }
      return window.turf ? turf.centroid(feat).geometry.coordinates[0] : 0;
    }

    const props = feat.properties || {};
    let val = props[fieldKey];
    if (val === undefined || val === null || val === '') {
      return null;
    }
    const num = parseFloat(val);
    return isNaN(num) ? null : num;
  };

  // 5. Get Features in Selected Scope
  const getFeaturesInScope = (layer, scope) => {
    let features = layer.data?.features ? [...layer.data.features] : [];
    if (scope === 'filtered' && layer.filteredIds && layer.filteredIds.size > 0) {
      const idField = layer.config.idField;
      features = features.filter(f => layer.filteredIds.has(f.properties?.[idField]));
    }
    return features;
  };

  // 6. MODE A: Run Summary Statistics
  runStatsBtn.addEventListener('click', () => {
    const layerId = layerSelect.value;
    const layer = state.getLayer(layerId);
    if (!layer || !layer.data) return;

    const fieldKey = statsFieldSelect.value;
    if (!fieldKey) {
      state.emit('toast', { type: 'warning', message: 'Please select a valid attribute field or geometry property.' });
      return;
    }

    const scope = scopeSelect.value;
    const targetFeatures = getFeaturesInScope(layer, scope);
    if (targetFeatures.length === 0) {
      state.emit('toast', { type: 'warning', message: 'No features found in selected scope.' });
      return;
    }

    const values = [];
    let ignoredCount = 0;

    targetFeatures.forEach(feat => {
      const val = getFeatureNumericValue(feat, fieldKey, layer.config.geometryType);
      if (val !== null && !isNaN(val)) {
        values.push(val);
      } else {
        ignoredCount++;
      }
    });

    if (values.length === 0) {
      statsOutput.classList.remove('hide');
      statsCards.innerHTML = '';
      statsTableBody.innerHTML = `<tr><td colspan="2" style="text-align:center;padding:16px;color:var(--danger);">No valid numeric data found for "${fieldKey}".</td></tr>`;
      statsIgnoredNotice.textContent = `All ${targetFeatures.length} features had null or non-numeric values.`;
      state.emit('toast', { type: 'warning', message: `No numeric values found in "${fieldKey}".` });
      return;
    }

    // Compute Math
    const count = values.length;
    let sum = 0;
    let min = values[0];
    let max = values[0];

    for (let i = 0; i < count; i++) {
      const v = values[i];
      sum += v;
      if (v < min) min = v;
      if (v > max) max = v;
    }

    const mean = sum / count;

    // Median
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(count / 2);
    const median = (count % 2 !== 0) ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

    // Standard deviation
    let variance = 0;
    if (count > 1) {
      let sumSqDiff = 0;
      for (let i = 0; i < count; i++) {
        const diff = values[i] - mean;
        sumSqDiff += diff * diff;
      }
      variance = sumSqDiff / (count - 1);
    }
    const stdDev = Math.sqrt(variance);
    const range = max - min;

    // Store for copy/export
    lastComputedStats = {
      layerId,
      layerTitle: layer.config.title,
      fieldKey,
      scope,
      count,
      totalFeatures: targetFeatures.length,
      ignoredCount,
      sum,
      mean,
      median,
      min,
      max,
      range,
      stdDev
    };

    // Format numbers
    const fmt = (num) => {
      if (num === null || num === undefined || isNaN(num)) return '—';
      if (Number.isInteger(num)) return num.toLocaleString();
      return Math.abs(num) >= 1000 ? num.toLocaleString(undefined, { maximumFractionDigits: 2 }) : num.toFixed(4).replace(/\.?0+$/, '');
    };

    // Render Cards
    statsTitle.textContent = `${layer.config.title} • ${fieldKey}`;
    statsCards.innerHTML = `
      <div class="calc-stat-card featured">
        <span class="calc-stat-label">Mean (Average)</span>
        <span class="calc-stat-value">${fmt(mean)}</span>
      </div>
      <div class="calc-stat-card">
        <span class="calc-stat-label">Median</span>
        <span class="calc-stat-value">${fmt(median)}</span>
      </div>
      <div class="calc-stat-card">
        <span class="calc-stat-label">Sum</span>
        <span class="calc-stat-value">${fmt(sum)}</span>
      </div>
      <div class="calc-stat-card">
        <span class="calc-stat-label">Min</span>
        <span class="calc-stat-value">${fmt(min)}</span>
      </div>
      <div class="calc-stat-card">
        <span class="calc-stat-label">Max</span>
        <span class="calc-stat-value">${fmt(max)}</span>
      </div>
    `;

    // Render Detailed Table
    statsTableBody.innerHTML = `
      <tr><td class="key">Feature Count (N)</td><td class="val">${count}</td></tr>
      <tr><td class="key">Sum</td><td class="val">${fmt(sum)}</td></tr>
      <tr><td class="key">Mean (Average)</td><td class="val">${fmt(mean)}</td></tr>
      <tr><td class="key">Median</td><td class="val">${fmt(median)}</td></tr>
      <tr><td class="key">Minimum (Min)</td><td class="val">${fmt(min)}</td></tr>
      <tr><td class="key">Maximum (Max)</td><td class="val">${fmt(max)}</td></tr>
      <tr><td class="key">Range (Max - Min)</td><td class="val">${fmt(range)}</td></tr>
      <tr><td class="key">Standard Deviation (σ)</td><td class="val">${fmt(stdDev)}</td></tr>
    `;

    if (ignoredCount > 0) {
      statsIgnoredNotice.textContent = `* ${ignoredCount} feature(s) with null, undefined, or non-numeric values were excluded.`;
    } else {
      statsIgnoredNotice.textContent = `All ${count} features evaluated had valid numeric values.`;
    }

    statsOutput.classList.remove('hide');
    state.emit('toast', { type: 'success', message: `Computed statistics for ${count} features.` });
  });

  // Clear stats
  clearStatsBtn.addEventListener('click', () => {
    statsOutput.classList.add('hide');
    lastComputedStats = null;
  });

  // Copy stats to clipboard
  copyStatsBtn.addEventListener('click', async () => {
    if (!lastComputedStats) return;
    const s = lastComputedStats;
    const text = [
      `=== Statistical Summary: ${s.layerTitle} (${s.fieldKey}) ===`,
      `Scope: ${s.scope === 'filtered' ? 'Filtered features' : 'All features'}`,
      `Count (N): ${s.count}`,
      `Sum: ${s.sum}`,
      `Mean: ${s.mean}`,
      `Median: ${s.median}`,
      `Min: ${s.min}`,
      `Max: ${s.max}`,
      `Range: ${s.range}`,
      `Std Dev: ${s.stdDev}`,
      s.ignoredCount ? `Ignored non-numeric: ${s.ignoredCount}` : ''
    ].filter(Boolean).join('\n');

    try {
      await navigator.clipboard.writeText(text);
      state.emit('toast', { type: 'success', message: 'Statistics copied to clipboard.' });
    } catch (_) {
      state.emit('toast', { type: 'info', message: 'Clipboard access restricted.' });
    }
  });

  // Export stats as CSV
  exportStatsCsvBtn.addEventListener('click', () => {
    if (!lastComputedStats) return;
    const s = lastComputedStats;
    const csvContent = [
      'Layer,Field,Metric,Value',
      `"${s.layerTitle}","${s.fieldKey}","Count",${s.count}`,
      `"${s.layerTitle}","${s.fieldKey}","Sum",${s.sum}`,
      `"${s.layerTitle}","${s.fieldKey}","Mean",${s.mean}`,
      `"${s.layerTitle}","${s.fieldKey}","Median",${s.median}`,
      `"${s.layerTitle}","${s.fieldKey}","Min",${s.min}`,
      `"${s.layerTitle}","${s.fieldKey}","Max",${s.max}`,
      `"${s.layerTitle}","${s.fieldKey}","Range",${s.range}`,
      `"${s.layerTitle}","${s.fieldKey}","StdDev",${s.stdDev}`
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `statistics_${s.layerId}_${s.fieldKey}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    state.emit('toast', { type: 'success', message: `Exported statistics_${s.layerId}_${s.fieldKey}.csv` });
  });

  // 7. MODE B: Run Field Calculator
  runCalcBtn.addEventListener('click', () => {
    const layerId = layerSelect.value;
    const layer = state.getLayer(layerId);
    if (!layer || !layer.data) return;

    // Destination field
    const isNew = destRadioNew.checked;
    let targetField = '';
    if (isNew) {
      targetField = newFieldNameInput.value.trim().replace(/\s+/g, '_');
      if (!targetField) {
        state.emit('toast', { type: 'warning', message: 'Please enter a name for the new attribute column.' });
        newFieldNameInput.focus();
        return;
      }
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(targetField)) {
        state.emit('toast', { type: 'warning', message: 'Field name must begin with a letter or underscore and contain only alphanumeric characters.' });
        return;
      }
    } else {
      targetField = existingFieldSelect.value;
      if (!targetField) {
        state.emit('toast', { type: 'warning', message: 'Please select an existing attribute column.' });
        return;
      }
    }

    const formula = formulaInput.value.trim();
    if (!formula) {
      state.emit('toast', { type: 'warning', message: 'Please enter a calculation expression.' });
      formulaInput.focus();
      return;
    }

    const scope = scopeSelect.value;
    const targetFeatures = getFeaturesInScope(layer, scope);
    if (targetFeatures.length === 0) {
      state.emit('toast', { type: 'warning', message: 'No features found in selected scope.' });
      return;
    }

    // Evaluate formula across features
    runCalcBtn.disabled = true;
    runCalcBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Calculating...';
    if (window.lucide) window.lucide.createIcons();

    try {
      let successCount = 0;
      let errorCount = 0;
      const geomType = layer.config.geometryType;

      targetFeatures.forEach(feat => {
        // Build context for this feature
        const context = { ...(feat.properties || {}) };

        // Inject geometry values
        if (geomType === 'Polygon' || geomType === 'MultiPolygon') {
          context['$area'] = window.turf ? turf.area(feat) : 0;
          context['$area_km2'] = context['$area'] / 1000000;
          context['$perimeter'] = window.turf ? turf.length(feat, { units: 'kilometers' }) * 1000 : 0;
        } else if (geomType === 'LineString' || geomType === 'MultiLineString') {
          context['$length'] = window.turf ? turf.length(feat, { units: 'kilometers' }) * 1000 : 0;
          context['$length_km'] = context['$length'] / 1000;
        } else if (geomType === 'Point' && feat.geometry?.coordinates) {
          context['$lon'] = feat.geometry.coordinates[0];
          context['$lat'] = feat.geometry.coordinates[1];
        }

        try {
          const result = evaluateFormula(formula, context);
          feat.properties = feat.properties || {};
          feat.properties[targetField] = (typeof result === 'number' && !Number.isInteger(result)) 
            ? parseFloat(result.toFixed(4)) 
            : result;
          successCount++;
        } catch (e) {
          errorCount++;
        }
      });

      // If new field, register in layer.config.fields
      if (isNew) {
        const fields = layer.config.fields || [];
        const existingIdx = fields.findIndex(f => f.key === targetField);
        if (existingIdx === -1) {
          fields.push({
            key: targetField,
            label: targetField.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            format: (val) => (val !== undefined && val !== null) ? String(val) : '—'
          });
          layer.config.fields = fields;
        }
      }

      // Refresh layer UI, table, and dropdowns
      updateLayerFields();
      state.emit('layer:updated', { layerId });
      state.emit('layer:filtered', { layerId });

      statusOutput.classList.remove('hide');
      statusOutput.innerHTML = `
        <span style="color:var(--success);font-weight:700;">✓ Calculated successfully:</span>
        Updated <strong>${successCount}</strong> features in <em>${layer.config.title}</em> (${targetField}).
        ${errorCount > 0 ? `<br><span style="color:var(--warning);">${errorCount} feature(s) had formula evaluation errors.</span>` : ''}
      `;

      state.emit('toast', {
        type: 'success',
        message: `Field "${targetField}" calculated across ${successCount} features.`
      });

    } catch (err) {
      console.error('Field calculation error:', err);
      statusOutput.classList.remove('hide');
      statusOutput.innerHTML = `<span style="color:var(--danger);font-weight:600;">Error: ${err.message}</span>`;
      state.emit('toast', { type: 'danger', message: `Formula error: ${err.message}` });
    } finally {
      runCalcBtn.disabled = false;
      runCalcBtn.innerHTML = '<i data-lucide="check"></i> Calculate & Apply';
      if (window.lucide) window.lucide.createIcons();
    }
  });

  clearCalcBtn.addEventListener('click', () => {
    formulaInput.value = '';
    newFieldNameInput.value = '';
    statusOutput.classList.add('hide');
  });

  // Event Listeners for Dynamic Refresh
  layerSelect.addEventListener('change', updateLayerFields);
  scopeSelect.addEventListener('change', updateScopeHint);
  state.on('layers:loaded', populateLayers);
  state.on('layer:filtered', updateScopeHint);

  populateLayers();
}

/**
 * Safe Mathematical Expression Evaluator (Grammar: AddSub -> MulDiv -> Power -> Unary -> Primary)
 * Supports operators (+, -, *, /, %, ^), parentheses, Math functions (round, sqrt, abs, floor, ceil, min, max, pow, log),
 * and dynamic attribute variable injection with zero eval()/Function() injection vulnerabilities.
 */
export function evaluateFormula(expr, context = {}) {
  let i = 0;
  const tokens = [];
  while (i < expr.length) {
    const c = expr[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(expr[i + 1]))) {
      let num = '';
      while (i < expr.length && /[0-9\.]/.test(expr[i])) { num += expr[i++]; }
      tokens.push({ type: 'NUM', val: parseFloat(num) });
      continue;
    }
    if (/[a-zA-Z_\$]/.test(c)) {
      let id = '';
      while (i < expr.length && /[a-zA-Z0-9_\$]/.test(expr[i])) { id += expr[i++]; }
      tokens.push({ type: 'ID', val: id });
      continue;
    }
    if (c === '(' || c === ')' || c === ',') {
      tokens.push({ type: c, val: c });
      i++;
      continue;
    }
    if (c === '+' || c === '-' || c === '*' || c === '/' || c === '%' || c === '^') {
      tokens.push({ type: 'OP', val: c });
      i++;
      continue;
    }
    throw new Error(`Unexpected character: "${c}"`);
  }

  let pos = 0;
  const peek = () => tokens[pos];
  const consume = (expected) => {
    const t = tokens[pos];
    if (!t || (expected && t.type !== expected && t.val !== expected)) {
      throw new Error(`Expected "${expected}" but got ${t ? `"${t.val}"` : 'end of expression'}`);
    }
    pos++;
    return t;
  };

  const parseExpr = () => parseAddSub();

  const parseAddSub = () => {
    let left = parseMulDiv();
    while (peek() && peek().type === 'OP' && (peek().val === '+' || peek().val === '-')) {
      const op = consume().val;
      const right = parseMulDiv();
      left = (op === '+') ? left + right : left - right;
    }
    return left;
  };

  const parseMulDiv = () => {
    let left = parsePower();
    while (peek() && peek().type === 'OP' && (peek().val === '*' || peek().val === '/' || peek().val === '%')) {
      const op = consume().val;
      const right = parsePower();
      if (op === '*') left = left * right;
      else if (op === '/') left = (right === 0) ? 0 : left / right;
      else if (op === '%') left = (right === 0) ? 0 : left % right;
    }
    return left;
  };

  const parsePower = () => {
    let left = parseUnary();
    if (peek() && peek().type === 'OP' && peek().val === '^') {
      consume();
      const right = parsePower();
      left = Math.pow(left, right);
    }
    return left;
  };

  const parseUnary = () => {
    if (peek() && peek().type === 'OP' && (peek().val === '+' || peek().val === '-')) {
      const op = consume().val;
      const val = parsePrimary();
      return (op === '-') ? -val : val;
    }
    return parsePrimary();
  };

  const parsePrimary = () => {
    const t = peek();
    if (!t) throw new Error('Incomplete expression');
    if (t.type === 'NUM') {
      consume();
      return t.val;
    }
    if (t.type === '(') {
      consume('(');
      const val = parseExpr();
      consume(')');
      return val;
    }
    if (t.type === 'ID') {
      const id = consume().val;
      if (peek() && peek().type === '(') {
        // Function Call
        consume('(');
        const args = [];
        if (peek() && peek().type !== ')') {
          args.push(parseExpr());
          while (peek() && peek().type === ',') {
            consume(',');
            args.push(parseExpr());
          }
        }
        consume(')');
        const fn = id.toLowerCase();
        if (fn === 'round') {
          const decimals = args[1] !== undefined ? args[1] : 0;
          const factor = Math.pow(10, decimals);
          return Math.round(args[0] * factor) / factor;
        } else if (fn === 'sqrt') {
          return Math.sqrt(args[0]);
        } else if (fn === 'abs') {
          return Math.abs(args[0]);
        } else if (fn === 'floor') {
          return Math.floor(args[0]);
        } else if (fn === 'ceil') {
          return Math.ceil(args[0]);
        } else if (fn === 'min') {
          return Math.min(...args);
        } else if (fn === 'max') {
          return Math.max(...args);
        } else if (fn === 'pow') {
          return Math.pow(args[0], args[1]);
        } else if (fn === 'log') {
          return Math.log(args[0]);
        }
        throw new Error(`Unsupported function "${id}()"`);
      } else {
        // Variable lookup
        if (context.hasOwnProperty(id)) {
          const raw = context[id];
          const val = parseFloat(raw);
          return isNaN(val) ? 0 : val;
        }
        // Case-insensitive fallback
        const lowerKey = Object.keys(context).find(k => k.toLowerCase() === id.toLowerCase());
        if (lowerKey) {
          const val = parseFloat(context[lowerKey]);
          return isNaN(val) ? 0 : val;
        }
        throw new Error(`Unknown field "${id}" in layer`);
      }
    }
    throw new Error(`Unexpected token "${t.val}"`);
  };

  const res = parseExpr();
  if (pos < tokens.length) {
    throw new Error(`Extra token "${tokens[pos].val}" found at end of expression`);
  }
  return res;
}
