/**
 * GeoVista Portal - Tool: Search by ID
 * Searches vector layers by feature ID or key attribute with autocomplete,
 * zooms to geometry, pulses highlight animation, and opens popup.
 */

import { state } from '../state.js?v=10';
import { zoomToFeature } from '../layers.js?v=10';

export function renderSearchTool() {
  return `
    <div class="tool-card" id="tool-search-card">
      <div class="tool-header" data-toggle="tool-body-search">
        <div class="tool-header-title">
          <i data-lucide="search"></i>
          <span>Search by Feature ID</span>
        </div>
        <i data-lucide="chevron-down" class="tool-toggle-icon"></i>
      </div>
      <div class="tool-body" id="tool-body-search">
        <form id="form-search-tool" onsubmit="return false;">
          <div class="tool-form-group">
            <label for="search-layer-select">Target Layer</label>
            <select id="search-layer-select" class="tool-select">
              <!-- Dynamically populated -->
            </select>
          </div>

          <div class="tool-form-group">
            <label for="search-field-select">Search Field</label>
            <select id="search-field-select" class="tool-select">
              <!-- Dynamically populated -->
            </select>
          </div>

          <div class="tool-form-group">
            <label for="search-id-input">Feature ID / Value</label>
            <input type="text" id="search-id-input" class="tool-input" list="search-id-suggestions" placeholder="e.g. PT-001, RD-001, DIV-01..." autocomplete="off">
            <datalist id="search-id-suggestions"></datalist>
          </div>

          <div class="tool-actions">
            <button type="button" id="btn-run-search" class="btn btn-primary btn-sm">
              <i data-lucide="search"></i> Find Feature
            </button>
            <button type="button" id="btn-clear-search" class="btn btn-outline btn-sm">
              <i data-lucide="rotate-ccw"></i> Clear
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}

export function initSearchTool() {
  const layerSelect = document.getElementById('search-layer-select');
  const fieldSelect = document.getElementById('search-field-select');
  const inputEl = document.getElementById('search-id-input');
  const datalist = document.getElementById('search-id-suggestions');
  const runBtn = document.getElementById('btn-run-search');
  const clearBtn = document.getElementById('btn-clear-search');

  if (!layerSelect) return;

  const populateLayers = () => {
    let opts = '';
    state.layers.forEach((layerItem, id) => {
      opts += `<option value="${id}">${layerItem.config.title} (${layerItem.featureCount})</option>`;
    });
    layerSelect.innerHTML = opts;
    updateFieldsAndSuggestions();
  };

  const updateFieldsAndSuggestions = () => {
    const layerId = layerSelect.value;
    const layer = state.getLayer(layerId);
    if (!layer) return;

    // Fields
    let fieldOpts = '';
    layer.config.fields.forEach(f => {
      const selected = f.key === layer.config.idField ? 'selected' : '';
      fieldOpts += `<option value="${f.key}" ${selected}>${f.label} (${f.key})</option>`;
    });
    fieldSelect.innerHTML = fieldOpts;
    updateSuggestions();
  };

  const updateSuggestions = () => {
    const layerId = layerSelect.value;
    const fieldKey = fieldSelect.value;
    const layer = state.getLayer(layerId);
    if (!layer || !layer.data || !datalist) return;

    let suggestions = '';
    const uniqueVals = new Set();
    layer.data.features.forEach(feat => {
      const val = feat.properties?.[fieldKey];
      if (val !== undefined && val !== null) {
        uniqueVals.add(String(val));
      }
    });

    Array.from(uniqueVals).slice(0, 50).forEach(v => {
      suggestions += `<option value="${v}">`;
    });
    datalist.innerHTML = suggestions;
  };

  layerSelect.addEventListener('change', updateFieldsAndSuggestions);
  fieldSelect.addEventListener('change', updateSuggestions);

  // Run Search
  runBtn.addEventListener('click', () => {
    const layerId = layerSelect.value;
    const fieldKey = fieldSelect.value;
    const query = inputEl.value.trim().toLowerCase();

    if (!query) {
      state.emit('toast', { type: 'warning', message: 'Please enter a feature ID to search.' });
      inputEl.focus();
      return;
    }

    const layer = state.getLayer(layerId);
    if (!layer || !layer.data) return;

    // Find feature
    const match = layer.data.features.find(feat => {
      const val = String(feat.properties?.[fieldKey] || '').toLowerCase();
      return val === query;
    });

    if (match) {
      const idVal = match.properties[layer.config.idField];
      zoomToFeature(layerId, idVal);
      state.emit('toast', {
        type: 'success',
        message: `Found feature "${match.properties[layer.config.labelField] || idVal}" in ${layer.config.title}`
      });
    } else {
      state.emit('toast', {
        type: 'warning',
        message: `No feature found matching "${query}" in ${layer.config.title}`
      });
    }
  });

  // Clear Search
  clearBtn.addEventListener('click', () => {
    inputEl.value = '';
    state.emit('toast', { type: 'info', message: 'Search cleared.' });
  });

  state.on('layers:loaded', populateLayers);
  populateLayers();
}
