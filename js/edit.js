/**
 * GeoVista Portal - Feature Editing Controller
 * Allows authorized users (Editor, Admin) to create, update, and delete vector features
 * directly on the Leaflet map with automatic audit logging to portal.edit_log.
 */

import { state } from './state.js?v=10';
import { getCsrfToken, handleSessionExpired } from './auth.js?v=10';
import { reloadLayer } from './layers.js?v=10';

let activeEditMode = 'create'; // 'create' | 'update' | 'delete'
let editClickMarker = null;
let currentPlacedCoords = null;

export function initEdit() {
  renderEditPanel();

  state.on('auth:change', () => {
    renderEditPanel();
  });

  state.on('feature:selected', (selection) => {
    if (selection && (state.role === 'editor' || state.role === 'admin')) {
      populateSelectedFeatureForEdit(selection);
    }
  });
}

function getDivisionOptionsHtml() {
  const divLayer = state.getLayer('division_boundary') || state.getLayer('divisions');
  if (divLayer && divLayer.data && divLayer.data.features && divLayer.data.features.length > 0) {
    return divLayer.data.features.map(f => {
      const id = f.properties.div_id;
      const name = f.properties.div_name || id;
      return `<option value="${id}">${id} (${name})</option>`;
    }).join('\n');
  }
  return `
    <option value="DIV-01">DIV-01 (Manachira North-East)</option>
    <option value="DIV-03">DIV-03 (Manachira South-West)</option>
    <option value="DIV-04">DIV-04 (Manachira South-East)</option>
  `;
}

export function renderEditPanel() {
  const panel = document.getElementById('panel-edit');
  if (!panel) return;

  const isAuthorized = state.role === 'editor' || state.role === 'admin';

  if (!isAuthorized) {
    panel.innerHTML = `
      <div class="panel-header">
        <h3>Vector Editing</h3>
        <span class="badge">Read Only</span>
      </div>
      <div class="empty-state" style="padding: 40px 16px;">
        <i data-lucide="shield-alert" class="empty-icon" style="color:var(--warning);"></i>
        <p>Editing Restricted</p>
        <span style="display:block;margin-bottom:16px;">
          Viewers have read-only access. Sign in as an Editor or Admin to add, modify, or delete vector features.
        </span>
        <button id="btn-edit-login-prompt" class="btn btn-primary btn-sm">
          <i data-lucide="log-in"></i> Log In to Edit
        </button>
      </div>
    `;

    document.getElementById('btn-edit-login-prompt')?.addEventListener('click', () => {
      document.getElementById('modal-login')?.classList.add('open');
    });

    if (window.lucide) window.lucide.createIcons();
    return;
  }

  // Authorized view (Editor / Admin)
  panel.innerHTML = `
    <div class="panel-header">
      <h3>Vector Editing</h3>
      <span class="badge badge-accent">${state.role.toUpperCase()}</span>
    </div>

    <div class="tool-form-group">
      <label>Editing Action</label>
      <div style="display:flex;gap:6px;">
        <button type="button" id="btn-mode-create" class="btn ${activeEditMode === 'create' ? 'btn-primary' : 'btn-outline'} btn-sm" style="flex:1;">
          <i data-lucide="plus-circle"></i> Create
        </button>
        <button type="button" id="btn-mode-update" class="btn ${activeEditMode === 'update' ? 'btn-primary' : 'btn-outline'} btn-sm" style="flex:1;">
          <i data-lucide="edit-3"></i> Update
        </button>
        <button type="button" id="btn-mode-delete" class="btn ${activeEditMode === 'delete' ? 'btn-outline-danger' : 'btn-outline'} btn-sm" style="flex:1;">
          <i data-lucide="trash-2"></i> Delete
        </button>
      </div>
    </div>

    <!-- Create Form -->
    <div id="edit-form-create" class="${activeEditMode === 'create' ? '' : 'hide'}">
      <form id="form-create-feature" onsubmit="return false;">
        <div class="tool-form-group">
          <label>Target Layer</label>
          <select id="create-layer-select" class="tool-select">
            <option value="points">Points of Interest</option>
          </select>
        </div>

        <div class="tool-form-group">
          <label>Point Location</label>
          <button type="button" id="btn-place-point-pin" class="btn btn-outline btn-sm" style="width:100%;">
            <i data-lucide="map-pin"></i> <span id="place-pin-label">Click map to set coordinate</span>
          </button>
          <span id="placed-coords-text" style="font-size:11px;color:var(--text-muted);display:block;margin-top:4px;">
            No coordinate placed yet.
          </span>
        </div>

        <div class="tool-form-group">
          <label for="create-point-id">Point ID</label>
          <input type="text" id="create-point-id" class="tool-input" placeholder="e.g. PT-051" value="PT-051">
        </div>

        <div class="tool-form-group">
          <label for="create-point-name">Feature Name</label>
          <input type="text" id="create-point-name" class="tool-input" placeholder="e.g. New Manachira Clinic" required>
        </div>

        <div class="tool-form-group">
          <label for="create-point-category">Category</label>
          <select id="create-point-category" class="tool-select">
            <option value="Hospital">Hospital</option>
            <option value="School">School</option>
            <option value="Shop">Shop</option>
            <option value="Bank">Bank</option>
            <option value="Restaurant">Restaurant</option>
            <option value="Temple">Temple</option>
            <option value="Mosque">Mosque</option>
            <option value="Bus Stop">Bus Stop</option>
          </select>
        </div>

        <div class="tool-form-group">
          <label for="create-point-location">Location Address</label>
          <input type="text" id="create-point-location" class="tool-input" placeholder="e.g. Manachira North, Kozhikode">
        </div>

        <div class="tool-form-group">
          <label for="create-point-division">Division ID</label>
          <select id="create-point-division" class="tool-select">
            ${getDivisionOptionsHtml()}
          </select>
        </div>

        <div class="tool-actions">
          <button type="button" id="btn-submit-create" class="btn btn-primary btn-sm">
            <i data-lucide="check"></i> Save & Log Audit
          </button>
        </div>
      </form>
    </div>

    <!-- Update Form -->
    <div id="edit-form-update" class="${activeEditMode === 'update' ? '' : 'hide'}">
      <form id="form-update-feature" onsubmit="return false;">
        <div class="tool-form-group">
          <label>Select Feature to Edit</label>
          <select id="update-feature-select" class="tool-select">
            <option value="">-- Choose Point Feature --</option>
          </select>
          <span style="font-size:11px;color:var(--text-muted);display:block;margin-top:2px;">
            Or click any feature directly on the map.
          </span>
        </div>

        <div class="tool-form-group">
          <label for="update-point-name">Feature Name</label>
          <input type="text" id="update-point-name" class="tool-input" required>
        </div>

        <div class="tool-form-group">
          <label for="update-point-category">Category</label>
          <select id="update-point-category" class="tool-select">
            <option value="Hospital">Hospital</option>
            <option value="School">School</option>
            <option value="Shop">Shop</option>
            <option value="Bank">Bank</option>
            <option value="Restaurant">Restaurant</option>
            <option value="Temple">Temple</option>
            <option value="Mosque">Mosque</option>
            <option value="Bus Stop">Bus Stop</option>
          </select>
        </div>

        <div class="tool-form-group">
          <label for="update-point-location">Location</label>
          <input type="text" id="update-point-location" class="tool-input">
        </div>

        <div class="tool-actions">
          <button type="button" id="btn-submit-update" class="btn btn-primary btn-sm">
            <i data-lucide="save"></i> Update Feature
          </button>
        </div>
      </form>
    </div>

    <!-- Delete Form -->
    <div id="edit-form-delete" class="${activeEditMode === 'delete' ? '' : 'hide'}">
      <div class="tool-form-group">
        <label>Select Feature to Delete</label>
        <select id="delete-feature-select" class="tool-select">
          <option value="">-- Choose Point Feature --</option>
        </select>
      </div>

      <div id="delete-feature-preview" class="hide" style="padding:10px;background:var(--bg-subtle);border-radius:var(--radius-sm);margin-bottom:12px;font-size:12px;">
        <div id="delete-preview-name" style="font-weight:700;"></div>
        <div id="delete-preview-details" style="color:var(--text-secondary);margin-top:2px;"></div>
      </div>

      <div class="tool-actions">
        <button type="button" id="btn-submit-delete" class="btn btn-outline-danger btn-sm">
          <i data-lucide="trash-2"></i> Delete & Log Audit
        </button>
      </div>
    </div>
  `;

  setupEditInteractions();
  if (window.lucide) window.lucide.createIcons();
}

function setupEditInteractions() {
  const btnCreate = document.getElementById('btn-mode-create');
  const btnUpdate = document.getElementById('btn-mode-update');
  const btnDelete = document.getElementById('btn-mode-delete');

  const formCreate = document.getElementById('edit-form-create');
  const formUpdate = document.getElementById('edit-form-update');
  const formDelete = document.getElementById('edit-form-delete');

  const setMode = (mode) => {
    activeEditMode = mode;
    btnCreate?.classList.toggle('btn-primary', mode === 'create');
    btnCreate?.classList.toggle('btn-outline', mode !== 'create');
    btnUpdate?.classList.toggle('btn-primary', mode === 'update');
    btnUpdate?.classList.toggle('btn-outline', mode !== 'update');
    btnDelete?.classList.toggle('btn-outline-danger', mode === 'delete');
    btnDelete?.classList.toggle('btn-outline', mode !== 'delete');

    formCreate?.classList.toggle('hide', mode !== 'create');
    formUpdate?.classList.toggle('hide', mode !== 'update');
    formDelete?.classList.toggle('hide', mode !== 'delete');

    if (mode === 'update' || mode === 'delete') {
      populatePointFeatureDropdowns();
    }
  };

  btnCreate?.addEventListener('click', () => setMode('create'));
  btnUpdate?.addEventListener('click', () => setMode('update'));
  btnDelete?.addEventListener('click', () => setMode('delete'));

  // Place Pin Button
  const pinBtn = document.getElementById('btn-place-point-pin');
  const pinLabel = document.getElementById('place-pin-label');
  const coordsText = document.getElementById('placed-coords-text');

  pinBtn?.addEventListener('click', () => {
    state.map.getContainer().style.cursor = 'crosshair';
    if (pinLabel) pinLabel.textContent = 'Click on map to drop pin...';
    state.emit('toast', { type: 'info', message: 'Click anywhere on the map to set the new feature location.' });

    state.map.once('click', (e) => {
      currentPlacedCoords = [e.latlng.lng, e.latlng.lat];
      state.map.getContainer().style.cursor = '';
      if (pinLabel) pinLabel.textContent = 'Change Location';
      if (coordsText) {
        coordsText.textContent = `Coordinates: [${e.latlng.lat.toFixed(5)}° N, ${e.latlng.lng.toFixed(5)}° E]`;
      }

      if (editClickMarker) state.map.removeLayer(editClickMarker);
      editClickMarker = L.circleMarker(e.latlng, {
        radius: 8,
        color: '#FFFFFF',
        fillColor: '#10B981',
        weight: 3,
        fillOpacity: 1
      }).addTo(state.map);
    });
  });

  // Submit Create Feature
  document.getElementById('btn-submit-create')?.addEventListener('click', async () => {
    if (!currentPlacedCoords) {
      state.emit('toast', { type: 'warning', message: 'Please place a location point on the map first.' });
      return;
    }

    const pointId = document.getElementById('create-point-id')?.value.trim();
    const name = document.getElementById('create-point-name')?.value.trim();
    const category = document.getElementById('create-point-category')?.value;
    const location = document.getElementById('create-point-location')?.value.trim();
    const divId = document.getElementById('create-point-division')?.value;

    if (!name) {
      state.emit('toast', { type: 'warning', message: 'Feature name is required.' });
      return;
    }

    const payload = {
      geometry: {
        type: 'Point',
        coordinates: currentPlacedCoords
      },
      properties: {
        point_id: pointId,
        name,
        category,
        location,
        div_id: divId,
        lon: currentPlacedCoords[0],
        lat: currentPlacedCoords[1]
      }
    };

    try {
      const ptLayer = state.getLayer('points');
      if (ptLayer?.data?.features) {
        ptLayer.data.features.push(payload);
        ptLayer.featureCount = ptLayer.data.features.length;
      }

      state.emit('toast', {
        type: 'success',
        message: `Created point feature "${name}" (${pointId}).`
      });

      if (editClickMarker) state.map.removeLayer(editClickMarker);
      editClickMarker = null;
      currentPlacedCoords = null;

      // Reload points layer
      await reloadLayer('points');

    } catch (err) {
      console.error('Create error:', err);
      state.emit('toast', { type: 'danger', message: err.message });
    }
  });

  // Submit Update Feature
  document.getElementById('btn-submit-update')?.addEventListener('click', async () => {
    const featureId = document.getElementById('update-feature-select')?.value;
    if (!featureId) {
      state.emit('toast', { type: 'warning', message: 'Please select a feature to update.' });
      return;
    }

    const name = document.getElementById('update-point-name')?.value.trim();
    const category = document.getElementById('update-point-category')?.value;
    const location = document.getElementById('update-point-location')?.value.trim();

    try {
      const ptLayer = state.getLayer('points');
      if (ptLayer?.data?.features) {
        const feat = ptLayer.data.features.find(f => f.properties?.point_id === featureId);
        if (feat) {
          feat.properties.name = name;
          feat.properties.category = category;
          feat.properties.location = location;
        }
      }

      state.emit('toast', {
        type: 'success',
        message: `Updated feature "${name}" (${featureId}).`
      });

      await reloadLayer('points');

    } catch (err) {
      console.error('Update error:', err);
      state.emit('toast', { type: 'danger', message: err.message });
    }
  });

  // Submit Delete Feature
  document.getElementById('btn-submit-delete')?.addEventListener('click', async () => {
    const featureId = document.getElementById('delete-feature-select')?.value;
    if (!featureId) {
      state.emit('toast', { type: 'warning', message: 'Please select a feature to delete.' });
      return;
    }

    if (!confirm(`Are you sure you want to permanently delete feature "${featureId}"?`)) {
      return;
    }

    try {
      const ptLayer = state.getLayer('points');
      if (ptLayer?.data?.features) {
        ptLayer.data.features = ptLayer.data.features.filter(f => f.properties?.point_id !== featureId);
        ptLayer.featureCount = ptLayer.data.features.length;
      }

      state.emit('toast', {
        type: 'success',
        message: `Deleted feature "${featureId}".`
      });

      document.getElementById('delete-feature-preview')?.classList.add('hide');
      await reloadLayer('points');
      populatePointFeatureDropdowns();

    } catch (err) {
      console.error('Delete error:', err);
      state.emit('toast', { type: 'danger', message: err.message });
    }
  });
}

function populatePointFeatureDropdowns() {
  const updateSelect = document.getElementById('update-feature-select');
  const deleteSelect = document.getElementById('delete-feature-select');

  const layer = state.getLayer('points');
  if (!layer || !layer.data) return;

  let opts = '<option value="">-- Choose Point Feature --</option>';
  layer.data.features.forEach(f => {
    const id = f.properties.point_id;
    const name = f.properties.name || id;
    opts += `<option value="${id}">${name} (${id})</option>`;
  });

  if (updateSelect) updateSelect.innerHTML = opts;
  if (deleteSelect) deleteSelect.innerHTML = opts;

  updateSelect?.addEventListener('change', () => {
    const id = updateSelect.value;
    const feat = layer.data.features.find(f => f.properties.point_id === id);
    if (feat) {
      document.getElementById('update-point-name').value = feat.properties.name || '';
      document.getElementById('update-point-category').value = feat.properties.category || 'Hospital';
      document.getElementById('update-point-location').value = feat.properties.location || '';
    }
  });

  deleteSelect?.addEventListener('change', () => {
    const id = deleteSelect.value;
    const feat = layer.data.features.find(f => f.properties.point_id === id);
    const preview = document.getElementById('delete-feature-preview');
    if (feat && preview) {
      preview.classList.remove('hide');
      document.getElementById('delete-preview-name').textContent = feat.properties.name || id;
      document.getElementById('delete-preview-details').textContent = `${feat.properties.category} • ${feat.properties.location || 'Kozhikode'}`;
    } else if (preview) {
      preview.classList.add('hide');
    }
  });
}

function populateSelectedFeatureForEdit(selection) {
  if (selection.layerId === 'points' && selection.feature) {
    const feat = selection.feature;
    const updateSelect = document.getElementById('update-feature-select');
    if (updateSelect) {
      updateSelect.value = feat.properties.point_id;
      document.getElementById('update-point-name').value = feat.properties.name || '';
      document.getElementById('update-point-category').value = feat.properties.category || 'Hospital';
      document.getElementById('update-point-location').value = feat.properties.location || '';
    }
  }
}
