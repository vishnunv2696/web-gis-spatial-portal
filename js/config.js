/**
 * GeoVista Portal - Configuration Registry
 * Define all map settings, basemaps, and layer specifications.
 * New layers can be added here without modifying application or tool code.
 */

export const MAP_CONFIG = {
  center: [11.2555, 75.7807],
  zoom: 15,
  minZoom: 10,
  maxZoom: 19,
  crsLabel: 'EPSG:4326',
  fullExtentBounds: [
    [11.2505, 75.7750],
    [11.2610, 75.7865]
  ]
};

export const BASEMAPS = [
  {
    id: 'carto-light',
    name: 'Carto Light',
    description: 'Clean, minimal light background',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
    theme: 'light',
    previewBg: 'linear-gradient(135deg, #f0f3f6, #d9e2ec)'
  },
  {
    id: 'carto-dark',
    name: 'Carto Dark',
    description: 'Modern high-contrast dark canvas',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
    theme: 'dark',
    previewBg: 'linear-gradient(135deg, #1b2431, #0f172a)'
  },
  {
    id: 'osm-standard',
    name: 'OpenStreetMap',
    description: 'Global standard street map',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    subdomains: 'abc',
    maxZoom: 19,
    theme: 'light',
    previewBg: 'linear-gradient(135deg, #e6f4ea, #d2e3fc)'
  },
  {
    id: 'osm-hot',
    name: 'OSM Humanitarian',
    description: 'High readability humanitarian style',
    url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Tiles style by Humanitarian OpenStreetMap Team',
    subdomains: 'abc',
    maxZoom: 19,
    theme: 'light',
    previewBg: 'linear-gradient(135deg, #ffe0b2, #ffccbc)'
  },
  {
    id: 'esri-imagery',
    name: 'Esri Satellite',
    description: 'High-resolution global satellite imagery',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    subdomains: '',
    maxZoom: 19,
    theme: 'dark',
    previewBg: 'linear-gradient(135deg, #1c3d28, #18281d)'
  },
  {
    id: 'opentopomap',
    name: 'OpenTopoMap',
    description: 'Topographic contour and relief map',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: 'Kartendaten: &copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende, SRTM | Kartendarstellung: &copy; <a href="http://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
    subdomains: 'abc',
    maxZoom: 17,
    theme: 'light',
    previewBg: 'linear-gradient(135deg, #e0d7c6, #c5bba8)'
  }
];

export const POINT_CATEGORY_COLORS = {
  'School': '#3B82F6',     // Blue
  'Hospital': '#EF4444',   // Red
  'Shop': '#10B981',       // Emerald
  'Temple': '#F59E0B',     // Amber
  'Mosque': '#14B8A6',     // Teal
  'Bank': '#8B5CF6',       // Purple
  'Bus Stop': '#F97316',   // Orange
  'Restaurant': '#EC4899', // Pink
  'Default': '#64748B'     // Slate
};

export const ROAD_CATEGORY_STYLES = {
  'Primary': { color: '#E11D48', weight: 4.5, opacity: 0.95 },          // Crimson Red
  'Secondary': { color: '#2563EB', weight: 3.5, opacity: 0.90 },        // Cobalt Blue
  'Tertiary': { color: '#D97706', weight: 3.0, opacity: 0.85 },         // Warm Amber
  'Residential': { color: '#475569', weight: 2.2, opacity: 0.85 },      // Slate Grey
  'Service / Local': { color: '#059669', weight: 2.0, opacity: 0.80 },  // Emerald Green
  'Default': { color: '#EA580C', weight: 3.0, opacity: 0.90 }           // Vibrant Orange fallback
};

export const DIVISION_COLORS = {
  'DIV-01': '#6366F1', // Indigo
  'DIV-02': '#0EA5E9', // Sky
  'DIV-03': '#10B981', // Emerald
  'DIV-04': '#F59E0B'  // Amber
};

export const LAYER_CONFIGS = [
  {
    id: 'division_boundary',
    title: 'Division Boundaries',
    geometryType: 'Polygon',
    dataPath: './data/boundaries.geojson',
    idField: 'div_id',
    labelField: 'div_name',
    visible: true,
    opacity: 0.35,
    style: {
      color: '#4338CA',
      weight: 2,
      opacity: 0.9,
      fillColor: '#6366F1',
      fillOpacity: 0.25,
      dashArray: '3, 3'
    },
    hoverStyle: {
      weight: 3.5,
      opacity: 1,
      fillOpacity: 0.45
    },
    fields: [
      { key: 'div_id', label: 'Division ID', isPrimary: true },
      { key: 'div_name', label: 'Division Name' },
      { key: 'zone_type', label: 'Zone Type' },
      { key: 'area_sqm', label: 'Area (sq.m)', format: (val) => `${Number(val).toLocaleString()} m²` }
    ]
  },
  {
    id: 'roads',
    title: 'Road Network',
    geometryType: 'LineString',
    dataPath: './data/roads.geojson',
    idField: 'road_id',
    labelField: 'name',
    visible: true,
    opacity: 0.95,
    styleRules: ROAD_CATEGORY_STYLES,
    hoverStyle: {
      weight: 6,
      opacity: 1
    },
    fields: [
      { key: 'road_id', label: 'Road ID', isPrimary: true },
      { key: 'name', altKey: 'road_name', label: 'Road Name' },
      { key: 'road_class', altKey: 'category', label: 'Road Class' },
      { key: 'osm_id', label: 'OSM ID' },
      { key: 'length_m', label: 'Length (m)', format: (val) => val != null && !isNaN(val) ? `${Number(val).toFixed(1)} m` : '—' }
    ]
  },
  {
    id: 'points',
    title: 'Points of Interest',
    geometryType: 'Point',
    dataPath: './data/points.geojson',
    idField: 'point_id',
    labelField: 'name',
    visible: true,
    opacity: 1.0,
    cluster: true,
    categoryField: 'category',
    categoryColors: POINT_CATEGORY_COLORS,
    fields: [
      { key: 'point_id', label: 'Point ID', isPrimary: true },
      { key: 'name', label: 'Name' },
      { key: 'category', label: 'Category' },
      { key: 'location', label: 'Location' },
      { key: 'div_id', label: 'Division' },
      { key: 'lon', label: 'Longitude', format: (val) => Number(val).toFixed(6) },
      { key: 'lat', label: 'Latitude', format: (val) => Number(val).toFixed(6) }
    ]
  }
];
