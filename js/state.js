/**
 * GeoVista Portal - Application State & Event Bus
 * Provides centralized state management and reactive pub/sub messaging.
 */

class EventEmitter {
  constructor() {
    this.listeners = new Map();
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(cb => {
        try {
          cb(data);
        } catch (err) {
          console.error(`Error in event listener for "${event}":`, err);
        }
      });
    }
  }
}

class AppState extends EventEmitter {
  constructor() {
    super();
    this.map = null;
    const savedTheme = localStorage.getItem('geovista_theme') || 
      (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    this.theme = savedTheme;
    this.activeBasemapId = localStorage.getItem('geovista_basemap') || 'osm-standard';
    this.unitSystem = localStorage.getItem('geovista_unit_system') || 'metric'; // 'metric' | 'imperial'
    
    // Core data stores
    this.layers = new Map();           // id -> { config, data, leafletLayer, clusterGroup, visible, opacity }
    this.resultLayers = new Map();     // id -> { title, type, data, leafletLayer, metadata }
    this.selectedFeature = null;       // { layerId, feature, leafletLayer }
    this.activeHighlightLayer = null;  // Leaflet highlight layer
    this.activeFilter = new Map();      // layerId -> filterCriteria
    this.sidebarCollapsed = true;
    this.activeTab = 'layers';
    this.drawerOpen = false;
    this.activeDrawerLayer = 'points';
  }

  setMap(mapInstance) {
    this.map = mapInstance;
    this.emit('map:ready', mapInstance);
  }

  setBasemap(basemapId) {
    this.activeBasemapId = basemapId;
    localStorage.setItem('geovista_basemap', basemapId);
    this.emit('basemap:change', basemapId);
  }

  setTheme(theme) {
    this.theme = theme;
    localStorage.setItem('geovista_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    this.emit('theme:change', theme);
  }

  toggleTheme() {
    this.setTheme(this.theme === 'dark' ? 'light' : 'dark');
  }

  setUnitSystem(unitSystem) {
    this.unitSystem = unitSystem === 'imperial' ? 'imperial' : 'metric';
    localStorage.setItem('geovista_unit_system', this.unitSystem);
    document.documentElement.setAttribute('data-units', this.unitSystem);
    this.emit('units:change', this.unitSystem);
  }

  toggleUnitSystem() {
    this.setUnitSystem(this.unitSystem === 'imperial' ? 'metric' : 'imperial');
  }

  registerLayer(id, layerData) {
    this.layers.set(id, layerData);
    this.emit('layer:registered', { id, ...layerData });
  }

  getLayer(id) {
    return this.layers.get(id);
  }

  setLayerVisibility(id, visible) {
    const layer = this.layers.get(id);
    if (!layer) return;
    layer.visible = visible;
    if (visible) {
      if (layer.clusterGroup) {
        this.map.addLayer(layer.clusterGroup);
      } else if (layer.leafletLayer) {
        this.map.addLayer(layer.leafletLayer);
      }
    } else {
      if (layer.clusterGroup) {
        this.map.removeLayer(layer.clusterGroup);
      } else if (layer.leafletLayer) {
        this.map.removeLayer(layer.leafletLayer);
      }
    }
    this.emit('layer:visibility', { id, visible });
  }

  setLayerOpacity(id, opacity) {
    const layer = this.layers.get(id);
    if (!layer) return;
    layer.opacity = opacity;
    if (layer.leafletLayer && layer.leafletLayer.setStyle) {
      layer.leafletLayer.setStyle({ opacity, fillOpacity: opacity * 0.4 });
    }
    this.emit('layer:opacity', { id, opacity });
  }

  addResultLayer(id, resultData) {
    this.resultLayers.set(id, resultData);
    if (resultData.leafletLayer) {
      this.map.addLayer(resultData.leafletLayer);
    }
    this.emit('resultLayer:added', { id, ...resultData });
  }

  removeResultLayer(id) {
    const res = this.resultLayers.get(id);
    if (res && res.leafletLayer) {
      this.map.removeLayer(res.leafletLayer);
    }
    this.resultLayers.delete(id);
    this.emit('resultLayer:removed', id);
  }

  clearResultLayers() {
    this.resultLayers.forEach((res, id) => {
      if (res.leafletLayer) this.map.removeLayer(res.leafletLayer);
    });
    this.resultLayers.clear();
    this.emit('resultLayers:cleared');
  }

  setSelectedFeature(selection) {
    this.selectedFeature = selection;
    this.emit('feature:selected', selection);
  }
}

export const state = new AppState();
