/**
 * GeoVista Portal - Layer Management Controller
 * Dynamically ingests GeoJSON vector data, manages symbology, marker clustering,
 * interactive popups, hover highlights, and layer controls.
 */

import { LAYER_CONFIGS, POINT_CATEGORY_COLORS, ROAD_CATEGORY_STYLES, DIVISION_COLORS } from './config.js?v=7';
import { state } from './state.js?v=7';
import { pulseAtLocation } from './map.js?v=7';

export async function initLayers() {
  const container = document.getElementById('layers-list');
  if (container) {
    container.innerHTML = '<div class="loading-state"><i data-lucide="loader-2" class="spin"></i> Loading static GeoJSON vector layers...</div>';
    if (window.lucide) window.lucide.createIcons();
  }

  // Setup refresh button listener
  document.querySelectorAll('.btn-refresh-layers').forEach(btn => {
    btn.addEventListener('click', () => refreshAllLayers());
  });
  document.getElementById('btn-db-retry')?.addEventListener('click', () => refreshAllLayers());

  hideDbError();
  const allBounds = [];
  let failedLayers = [];

  for (const config of LAYER_CONFIGS) {
    try {
      const dataUrl = config.dataPath || `./data/${config.id}.geojson`;
      const apiRes = await fetch(dataUrl);
      if (!apiRes.ok) {
        throw new Error(`HTTP ${apiRes.status} loading ${dataUrl}`);
      }

      const geojson = await apiRes.json();
      const layerData = buildLayer(config, geojson);
      state.registerLayer(config.id, layerData);

      if (layerData.bounds && layerData.bounds.isValid()) {
        allBounds.push(layerData.bounds);
      }
    } catch (err) {
      console.error(`Failed to load static layer "${config.title}":`, err.message);
      failedLayers.push(config.title);
    }
  }

  // Update total badge
  const totalBadge = document.getElementById('total-layers-badge');
  if (totalBadge) totalBadge.textContent = `${state.layers.size} layers`;

  // Render sidebar controls and legend
  renderLayerManagerUI();
  renderLegend();

  // Fit map to all loaded vector data
  if (allBounds.length > 0 && state.map) {
    const combinedBounds = allBounds[0];
    for (let i = 1; i < allBounds.length; i++) {
      combinedBounds.extend(allBounds[i]);
    }
    state.map.fitBounds(combinedBounds, { padding: [30, 30], maxZoom: 16 });
  }

  state.emit('layers:loaded', state.layers);
}

function buildLayer(config, geojson) {
  let leafletLayer = null;
  let clusterGroup = null;
  let bounds = null;

  if (config.geometryType === 'Point') {
    // Standard GeoJSON layer
    leafletLayer = L.geoJSON(geojson, {
      pointToLayer: (feature, latlng) => createPointMarker(feature, latlng, config),
      onEachFeature: (feature, layer) => bindFeatureInteractions(feature, layer, config)
    });

    // MarkerCluster layer
    clusterGroup = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 45,
      spiderfyOnMaxZoom: true,
      zoomToBoundsOnClick: true,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount();
        let sizeClass = 'small';
        if (count > 20) sizeClass = 'large';
        else if (count > 10) sizeClass = 'medium';

        return L.divIcon({
          html: `<div><span>${count}</span></div>`,
          className: `marker-cluster marker-cluster-${sizeClass}`,
          iconSize: L.point(36, 36)
        });
      }
    });

    leafletLayer.eachLayer(layer => clusterGroup.addLayer(layer));
    bounds = clusterGroup.getBounds();

    if (config.visible && state.map) {
      if (config.cluster) {
        state.map.addLayer(clusterGroup);
      } else {
        state.map.addLayer(leafletLayer);
      }
    }

  } else if (config.geometryType === 'LineString') {
    leafletLayer = L.geoJSON(geojson, {
      style: (feature) => getRoadStyle(feature, config.opacity),
      onEachFeature: (feature, layer) => bindFeatureInteractions(feature, layer, config)
    });

    bounds = leafletLayer.getBounds();
    if (config.visible && state.map) {
      state.map.addLayer(leafletLayer);
    }

  } else if (config.geometryType === 'Polygon') {
    leafletLayer = L.geoJSON(geojson, {
      style: (feature) => getPolygonStyle(feature, config.opacity),
      onEachFeature: (feature, layer) => {
        bindFeatureInteractions(feature, layer, config);
        
        // Add permanent division label at centroid via Leaflet tooltip
        if (feature.properties && feature.properties.div_name) {
          layer.bindTooltip(feature.properties.div_name, {
            permanent: true,
            direction: 'center',
            className: 'division-label'
          });
        }
      }
    });

    bounds = leafletLayer.getBounds();
    if (config.visible && state.map) {
      state.map.addLayer(leafletLayer);
    }
  }

  return {
    id: config.id,
    config,
    data: geojson,
    leafletLayer,
    clusterGroup,
    isClustered: !!config.cluster,
    bounds,
    visible: config.visible,
    opacity: config.opacity,
    featureCount: geojson.features ? geojson.features.length : 0
  };
}

function createPointMarker(feature, latlng, config) {
  const cat = feature.properties?.category || 'Default';
  const color = POINT_CATEGORY_COLORS[cat] || POINT_CATEGORY_COLORS['Default'];

  return L.circleMarker(latlng, {
    radius: 7,
    fillColor: color,
    color: '#FFFFFF',
    weight: 2,
    opacity: 1,
    fillOpacity: config.opacity || 0.95
  });
}

function getRoadStyle(feature, opacity = 0.95) {
  const props = feature.properties || {};
  // Priority 1: Check road_class (PostgreSQL attribute), then category, highway, type, class
  const rawCat = props.road_class || props.category || props.highway || props.type || props.class || props.surface || 'Default';
  const cleanCat = String(rawCat).trim().toLowerCase();

  let matchKey = 'Default';
  if (cleanCat.includes('primary')) {
    matchKey = 'Primary';
  } else if (cleanCat.includes('secondary')) {
    matchKey = 'Secondary';
  } else if (cleanCat.includes('tertiary')) {
    matchKey = 'Tertiary';
  } else if (cleanCat.includes('resident') || cleanCat.includes('living')) {
    matchKey = 'Residential';
  } else if (cleanCat.includes('motorway') || cleanCat.includes('trunk')) {
    matchKey = 'Primary';
  } else if (cleanCat.includes('service') || cleanCat.includes('unclass') || cleanCat.includes('track') || cleanCat.includes('path')) {
    matchKey = 'Service / Local';
  } else {
    const found = Object.keys(ROAD_CATEGORY_STYLES).find(k => k.toLowerCase() === cleanCat);
    if (found) matchKey = found;
  }

  const baseStyle = ROAD_CATEGORY_STYLES[matchKey] || ROAD_CATEGORY_STYLES['Default'];
  return {
    color: baseStyle.color,
    weight: baseStyle.weight,
    opacity: opacity,
    dashArray: baseStyle.dashArray || null,
    lineCap: 'round',
    lineJoin: 'round'
  };
}

function getPolygonStyle(feature, opacity = 0.35) {
  const divId = feature.properties?.div_id;
  const fillColor = DIVISION_COLORS[divId] || '#6366F1';
  return {
    color: fillColor,
    weight: 2,
    opacity: 0.9,
    fillColor: fillColor,
    fillOpacity: opacity,
    dashArray: '3, 4'
  };
}

function bindFeatureInteractions(feature, layer, config) {
  // 1. Hover styles
  layer.on('mouseover', (e) => {
    if (layer.setStyle && config.geometryType !== 'Point') {
      layer.setStyle({
        weight: config.geometryType === 'Polygon' ? 3.5 : 6,
        opacity: 1,
        fillOpacity: config.geometryType === 'Polygon' ? 0.5 : undefined
      });
    } else if (config.geometryType === 'Point' && layer.setRadius) {
      layer.setRadius(10);
      layer.setStyle({ weight: 3 });
    }
  });

  layer.on('mouseout', (e) => {
    if (layer.setStyle && config.geometryType !== 'Point') {
      if (config.geometryType === 'Polygon') {
        layer.setStyle(getPolygonStyle(feature, config.opacity));
      } else {
        layer.setStyle(getRoadStyle(feature, config.opacity));
      }
    } else if (config.geometryType === 'Point' && layer.setRadius) {
      layer.setRadius(7);
      layer.setStyle({ weight: 2 });
    }
  });

  // 2. Click popup
  const popupHtml = buildPopupContent(feature, config);
  layer.bindPopup(popupHtml, { maxWidth: 300, className: 'custom-leaflet-popup' });

  layer.on('click', (e) => {
    state.setSelectedFeature({
      layerId: config.id,
      feature,
      leafletLayer: layer
    });
  });
}

export function buildPopupContent(feature, config) {
  const props = feature.properties || {};
  const id = props[config.idField] || 'N/A';
  const title = props[config.labelField] || props.name || props.road_name || `${config.title} Feature`;

  let tableRows = '';
  config.fields.forEach(fld => {
    let rawVal = props[fld.key];
    if ((rawVal === undefined || rawVal === null) && fld.altKey) {
      rawVal = props[fld.altKey];
    }
    if (rawVal === undefined || rawVal === null) rawVal = '—';
    const displayVal = fld.format ? fld.format(rawVal) : rawVal;

    tableRows += `
      <tr>
        <td class="key">${fld.label}</td>
        <td class="val">${displayVal}</td>
      </tr>
    `;
  });

  return `
    <div class="popup-card">
      <div class="popup-card-header">
        <div class="popup-title-group">
          <span class="popup-layer-tag">${config.title}</span>
          <h4 class="popup-title">${title}</h4>
        </div>
        <span class="popup-id-badge">${id}</span>
      </div>
      <div class="popup-card-body">
        <table class="popup-table">
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderLayerManagerUI() {
  const container = document.getElementById('layers-list');
  if (!container) return;

  container.innerHTML = '';

  state.layers.forEach((layerItem, id) => {
    const { config, featureCount, visible, opacity, isClustered } = layerItem;

    let iconName = 'map-pin';
    if (config.geometryType === 'LineString') iconName = 'route';
    if (config.geometryType === 'Polygon') iconName = 'box-select';

    const card = document.createElement('div');
    card.className = 'layer-card';
    card.id = `layer-card-${id}`;

    card.innerHTML = `
      <div class="layer-card-top">
        <div class="layer-card-title-group">
          <div class="layer-geom-icon">
            <i data-lucide="${iconName}"></i>
          </div>
          <div>
            <div class="layer-name">${config.title}</div>
            <span class="badge badge-blue">${featureCount} ${config.geometryType.toLowerCase()}s</span>
          </div>
        </div>
        <div class="layer-card-actions">
          <button class="btn-icon btn-sm btn-zoom-layer" data-layer-id="${id}" title="Zoom to Layer">
            <i data-lucide="maximize-2"></i>
          </button>
          <label class="toggle-switch" title="Toggle Visibility">
            <input type="checkbox" class="layer-visibility-toggle" data-layer-id="${id}" ${visible ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div class="layer-card-controls">
        <div class="layer-slider-row">
          <span>Opacity</span>
          <input type="range" min="0" max="1" step="0.05" value="${opacity}" class="layer-opacity-slider" data-layer-id="${id}">
          <span class="opacity-val">${Math.round(opacity * 100)}%</span>
        </div>

        ${config.geometryType === 'Point' ? `
          <div class="layer-toggle-row">
            <span>Cluster Markers</span>
            <label class="toggle-switch" title="Toggle Marker Clustering">
              <input type="checkbox" class="layer-cluster-toggle" data-layer-id="${id}" ${isClustered ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
        ` : ''}
      </div>
    `;

    // Event listeners
    // 1. Visibility toggle
    const visToggle = card.querySelector('.layer-visibility-toggle');
    visToggle?.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      toggleLayerVisibility(id, isChecked);
    });

    // 2. Opacity slider
    const opSlider = card.querySelector('.layer-opacity-slider');
    const opValText = card.querySelector('.opacity-val');
    opSlider?.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      if (opValText) opValText.textContent = `${Math.round(val * 100)}%`;
      setLayerOpacity(id, val);
    });

    // 3. Cluster toggle
    const clusterToggle = card.querySelector('.layer-cluster-toggle');
    clusterToggle?.addEventListener('change', (e) => {
      toggleClustering(id, e.target.checked);
    });

    // 4. Zoom to layer
    const zoomBtn = card.querySelector('.btn-zoom-layer');
    zoomBtn?.addEventListener('click', () => {
      zoomToLayer(id);
    });

    container.appendChild(card);
  });

  if (window.lucide) window.lucide.createIcons();
}

export function toggleLayerVisibility(id, visible) {
  const layer = state.getLayer(id);
  if (!layer || !state.map) return;

  layer.visible = visible;

  if (visible) {
    if (layer.isClustered && layer.clusterGroup) {
      state.map.addLayer(layer.clusterGroup);
    } else if (layer.leafletLayer) {
      state.map.addLayer(layer.leafletLayer);
    }
    state.emit('toast', { type: 'info', message: `Shown ${layer.config.title}` });
  } else {
    if (layer.clusterGroup) state.map.removeLayer(layer.clusterGroup);
    if (layer.leafletLayer) state.map.removeLayer(layer.leafletLayer);
    state.emit('toast', { type: 'info', message: `Hidden ${layer.config.title}` });
  }

  state.emit('layer:visibility', { id, visible });
}

export function setLayerOpacity(id, opacity) {
  const layer = state.getLayer(id);
  if (!layer) return;

  layer.opacity = opacity;

  if (layer.config.geometryType === 'Polygon') {
    layer.leafletLayer.setStyle({ fillOpacity: opacity });
  } else if (layer.config.geometryType === 'LineString') {
    layer.leafletLayer.setStyle({ opacity });
  } else if (layer.config.geometryType === 'Point') {
    layer.leafletLayer.eachLayer(marker => {
      if (marker.setStyle) marker.setStyle({ fillOpacity: opacity });
    });
  }
}

export function toggleClustering(id, enableCluster) {
  const layer = state.getLayer(id);
  if (!layer || layer.config.geometryType !== 'Point' || !state.map) return;

  layer.isClustered = enableCluster;

  if (layer.visible) {
    if (enableCluster) {
      state.map.removeLayer(layer.leafletLayer);
      state.map.addLayer(layer.clusterGroup);
      state.emit('toast', { type: 'info', message: 'Point clustering enabled.' });
    } else {
      state.map.removeLayer(layer.clusterGroup);
      state.map.addLayer(layer.leafletLayer);
      state.emit('toast', { type: 'info', message: 'Point clustering disabled.' });
    }
  }
}

export function zoomToLayer(id) {
  const layer = state.getLayer(id);
  if (!layer || !state.map) return;

  if (layer.bounds && layer.bounds.isValid()) {
    state.map.fitBounds(layer.bounds, { padding: [25, 25], maxZoom: 17 });
  }
}

export function zoomToFeature(layerId, featureId) {
  const layer = state.getLayer(layerId);
  if (!layer || !state.map) return;

  let targetFeature = null;
  let targetLeafletLayer = null;

  layer.leafletLayer?.eachLayer(l => {
    const fId = l.feature?.properties?.[layer.config.idField] || l._fId;
    if (String(fId) === String(featureId)) {
      targetFeature = l.feature;
      targetLeafletLayer = l;
    }
  });

  if (!targetLeafletLayer && layer.clusterGroup) {
    layer.clusterGroup.eachLayer(l => {
      const fId = l.feature?.properties?.[layer.config.idField] || l._fId;
      if (String(fId) === String(featureId)) {
        targetFeature = l.feature;
        targetLeafletLayer = l;
      }
    });
  }

  // Fallback: search layer GeoJSON feature data if marker reference was missing
  if (!targetFeature && layer.data?.features) {
    targetFeature = layer.data.features.find(f => String(f.properties?.[layer.config.idField]) === String(featureId));
  }

  // Make sure layer is visible
  if (!layer.visible) {
    const toggle = document.querySelector(`.layer-visibility-toggle[data-layer-id="${layerId}"]`);
    if (toggle) toggle.checked = true;
    toggleLayerVisibility(layerId, true);
  }

  if (layer.config.geometryType === 'Point') {
    let latlng = targetLeafletLayer?.getLatLng();
    if (!latlng && targetFeature?.geometry?.coordinates) {
      latlng = L.latLng(targetFeature.geometry.coordinates[1], targetFeature.geometry.coordinates[0]);
    }
    if (!latlng) return;

    if (layer.clusterGroup && targetLeafletLayer && layer.clusterGroup.zoomToShowLayer) {
      layer.clusterGroup.zoomToShowLayer(targetLeafletLayer, () => {
        targetLeafletLayer.openPopup();
      });
    } else {
      state.map.setView(latlng, 17);
      if (targetLeafletLayer?.openPopup) {
        setTimeout(() => targetLeafletLayer.openPopup(), 300);
      }
    }
    pulseAtLocation(latlng);
  } else {
    let bounds = targetLeafletLayer?.getBounds();
    if (!bounds && targetFeature) {
      const geom = targetFeature.geometry;
      if (geom?.coordinates) {
        if (geom.type === 'LineString') {
          bounds = L.latLngBounds(geom.coordinates.map(c => [c[1], c[0]]));
        } else if (geom.type === 'Polygon') {
          bounds = L.latLngBounds(geom.coordinates[0].map(c => [c[1], c[0]]));
        }
      }
    }
    if (bounds && bounds.isValid()) {
      state.map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
      pulseAtLocation(bounds.getCenter());
      if (targetLeafletLayer?.openPopup) {
        setTimeout(() => targetLeafletLayer.openPopup(), 300);
      }
    }
  }

  state.setSelectedFeature({
    layerId,
    feature: targetFeature,
    leafletLayer: targetLeafletLayer
  });
}

function renderLegend() {
  const container = document.getElementById('legend-content');
  if (!container) return;

  let html = `
    <div class="legend-group">
      <div class="legend-group-title">Points of Interest (by Category)</div>
  `;

  Object.entries(POINT_CATEGORY_COLORS).forEach(([cat, color]) => {
    if (cat === 'Default') return;
    html += `
      <div class="legend-item">
        <span class="legend-swatch legend-swatch-circle" style="background-color: ${color};"></span>
        <span>${cat}</span>
      </div>
    `;
  });

  html += `
    </div>
    <div class="legend-group">
      <div class="legend-group-title">Road Network (by Class)</div>
  `;

  Object.entries(ROAD_CATEGORY_STYLES).forEach(([cat, style]) => {
    if (cat === 'Default') return;
    html += `
      <div class="legend-item">
        <span class="legend-swatch legend-swatch-line" style="background-color: ${style.color}; height: ${Math.max(style.weight, 3.5)}px;"></span>
        <span>${cat}</span>
      </div>
    `;
  });

  html += `
    </div>
    <div class="legend-group">
      <div class="legend-group-title">Division Boundaries</div>
  `;

  Object.entries(DIVISION_COLORS).forEach(([div, color]) => {
    html += `
      <div class="legend-item">
        <span class="legend-swatch" style="background-color: ${color}; opacity: 0.7;"></span>
        <span>${div} Zone</span>
      </div>
    `;
  });

  html += '</div>';
  if (container) container.innerHTML = html;
  const floatingContainer = document.getElementById('floating-legend-content');
  if (floatingContainer) floatingContainer.innerHTML = html;
}

export function showDbError(message) {
  const panel = document.getElementById('db-error-panel');
  const msgEl = document.getElementById('db-error-message');
  if (panel) {
    if (msgEl && message) msgEl.textContent = message;
    panel.classList.remove('hide');
    if (window.lucide) window.lucide.createIcons();
  }
}

export function hideDbError() {
  const panel = document.getElementById('db-error-panel');
  if (panel) {
    panel.classList.add('hide');
  }
}

export async function reloadLayer(layerId) {
  const oldLayer = state.getLayer(layerId);
  if (!oldLayer) return;

  const config = oldLayer.config;

  try {
    const dataUrl = config.dataPath || `./data/${config.id}.geojson`;
    const apiRes = await fetch(dataUrl);
    if (!apiRes.ok) {
      throw new Error(`HTTP ${apiRes.status} loading ${dataUrl}`);
    }

    const geojson = await apiRes.json();

    // Clean up old Leaflet layers from map
    if (oldLayer.clusterGroup && state.map) {
      state.map.removeLayer(oldLayer.clusterGroup);
    }
    if (oldLayer.leafletLayer && state.map) {
      state.map.removeLayer(oldLayer.leafletLayer);
    }

    const newLayerData = buildLayer(config, geojson);

    // Maintain active filter across layer refresh
    if (state.activeFilter && state.activeFilter.has(layerId)) {
      const activeF = state.activeFilter.get(layerId);
      if (activeF && activeF.matchedIds) {
        newLayerData.filteredIds = new Set(activeF.matchedIds);
        if (newLayerData.config.geometryType === 'Point') {
          if (newLayerData.clusterGroup) newLayerData.clusterGroup.clearLayers();
          newLayerData.leafletLayer.clearLayers();
          newLayerData.data.features.forEach(feat => {
            if (newLayerData.filteredIds.has(feat.properties?.[newLayerData.config.idField])) {
              const latlng = [feat.geometry.coordinates[1], feat.geometry.coordinates[0]];
              const marker = L.circleMarker(latlng, {
                radius: 7,
                fillColor: newLayerData.config.categoryColors[feat.properties.category] || '#0284C7',
                color: '#FFFFFF',
                weight: 2,
                opacity: 1,
                fillOpacity: newLayerData.config.opacity
              });
              marker.bindPopup(buildPopup(feat, newLayerData.config));
              newLayerData.leafletLayer.addLayer(marker);
              if (newLayerData.clusterGroup) newLayerData.clusterGroup.addLayer(marker);
            }
          });
        } else {
          newLayerData.leafletLayer.eachLayer(subLayer => {
            const fId = subLayer.feature?.properties?.[newLayerData.config.idField];
            const isMatch = newLayerData.filteredIds.has(fId);
            if (newLayerData.config.geometryType === 'LineString') {
              subLayer.setStyle({ opacity: isMatch ? newLayerData.config.opacity : 0.05 });
            } else if (newLayerData.config.geometryType === 'Polygon') {
              subLayer.setStyle({
                fillOpacity: isMatch ? newLayerData.config.opacity : 0.03,
                opacity: isMatch ? 0.9 : 0.08
              });
            }
          });
        }
      }
    }

    state.registerLayer(layerId, newLayerData);

    renderLayerManagerUI();
    state.emit('layers:loaded', state.layers);
    hideDbError();
    return newLayerData;
  } catch (err) {
    console.error(`Failed to reload layer ${layerId}:`, err);
    throw err;
  }
}

export async function refreshAllLayers() {
  const refreshBtns = document.querySelectorAll('.btn-refresh-layers');
  const retryBtn = document.getElementById('btn-db-retry');
  
  refreshBtns.forEach(btn => btn.classList.add('loading'));
  const refreshIcon = document.querySelector('#btn-refresh-layers i');
  if (refreshIcon) refreshIcon.classList.add('spin');
  if (retryBtn) retryBtn.disabled = true;

  try {
    let successCount = 0;
    const errors = [];
    const counts = [];

    for (const config of LAYER_CONFIGS) {
      try {
        const dataUrl = config.dataPath || `./data/${config.id}.geojson`;
        const apiRes = await fetch(dataUrl);
        if (!apiRes.ok) {
          throw new Error(`HTTP ${apiRes.status}`);
        }

        const geojson = await apiRes.json();

        // Clean up previous Leaflet layers
        const oldLayer = state.getLayer(config.id);
        if (oldLayer) {
          if (oldLayer.clusterGroup && state.map) {
            state.map.removeLayer(oldLayer.clusterGroup);
          }
          if (oldLayer.leafletLayer && state.map) {
            state.map.removeLayer(oldLayer.leafletLayer);
          }
        }

        const newLayerData = buildLayer(config, geojson);
        state.registerLayer(config.id, newLayerData);
        successCount++;
        counts.push(`${config.title}: ${newLayerData.featureCount}`);
      } catch (err) {
        errors.push(`${config.title} (${err.message})`);
      }
    }

    // Update total badge
    const totalBadge = document.getElementById('total-layers-badge');
    if (totalBadge) totalBadge.textContent = `${state.layers.size} layers`;

    renderLayerManagerUI();
    renderLegend();
    state.emit('layers:loaded', state.layers);

    if (errors.length > 0) {
      showDbError(`PostgreSQL query error: Could not reload ${errors.join(', ')}`);
      state.emit('toast', {
        type: 'danger',
        message: `Failed to reload ${errors.length} layer(s) from PostgreSQL.`
      });
    } else {
      hideDbError();
      state.emit('toast', {
        type: 'success',
        message: `Layers refreshed live from PostgreSQL PostGIS (${counts.join(', ')}).`
      });
    }
  } catch (err) {
    console.error('refreshAllLayers fatal error:', err);
    showDbError(`Failed to refresh layers: ${err.message}`);
    state.emit('toast', {
      type: 'danger',
      message: `Database error refreshing layers: ${err.message}`
    });
  } finally {
    refreshBtns.forEach(btn => btn.classList.remove('loading'));
    if (refreshIcon) refreshIcon.classList.remove('spin');
    if (retryBtn) retryBtn.disabled = false;
  }
}
