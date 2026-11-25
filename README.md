# GeoVista Portal - Interactive Web GIS Spatial Analysis Platform

[![GitHub Pages](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-2ea44f?style=for-the-badge&logo=github)](https://vishnunv2696.github.io/web-gis-spatial-portal/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)
[![Vanilla JS](https://img.shields.io/badge/Vanilla-ESM%20JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Leaflet](https://img.shields.io/badge/Mapping-Leaflet%201.9.4-199900?style=for-the-badge&logo=leaflet&logoColor=white)](https://leafletjs.com/)
[![Turf.js](https://img.shields.io/badge/Geoprocessing-Turf.js%207.0-2ecc71?style=for-the-badge)](https://turfjs.org/)

> **Interactive Web GIS Spatial Analysis Portal with Buffer, Filter, Near, and Attribute Calculation tools.**
> 
> Explore, visualize, and analyze multi-layer vector GIS data directly in your browser with zero backend or database dependencies.

---

## 🌐 Live Demo

Explore the live application deployed on GitHub Pages:
👉 **[https://vishnunv2696.github.io/web-gis-spatial-portal/](https://vishnunv2696.github.io/web-gis-spatial-portal/)**

---

## 🚀 Key Features

### 1. Vector Map Visualization
- **Multi-Geometry Layer Support**: Handles Points of Interest (POI), Road Networks (Lines), and Administrative Division Zones (Polygons).
- **Cartographic Thematic Styling**: Dynamic road styling categorized by highway classification (motorway, trunk, primary, secondary, tertiary, residential).
- **Marker Clustering**: Interactive point clustering with count badges and cluster breakdown zoom.
- **Basemap Switching**: Toggle between CartoDB Positron, OpenStreetMap, Satellite imagery, and Dark Matter.
- **Layer Controls**: Live opacity sliders, visibility toggles, interactive attribute inspection, and full-screen data table viewing.

### 2. Built-in Geoprocessing & Spatial Tools
- 🧮 **Attribute Calculator & Statistics**:
  - **Summary Statistics**: Real-time statistical analysis (Median, Mean, Sum, Min, Max, Count, Standard Deviation) with one-click CSV export.
  - **Field Calculator**: Dynamic formula evaluation (`field_A * 1.5`, `field_A + field_B`, etc.) with instant layer property mutation.
- ⭕ **Buffer Tool**: Generate geodesic distance buffers around point, line, or polygon geometries with custom units (meters, kilometers, miles).
- 🔍 **Attribute Filter**: Filter vector datasets by custom numeric or text queries (e.g., `road_class = 'primary'` or `length_m > 500`) with automatic map zooming.
- 🎯 **Proximity & Nearby**: Calculate distances between layers and detect nearest neighbors within radius thresholds.
- 🔗 **Spatial Join**: In-browser point-in-polygon attribute transfer with count and aggregation metrics.
- 💥 **Buffer Impact Analysis**: Multi-layer intersection analysis to quantify spatial impacts across assets and boundaries.
- 📏 **Measurement**: Interactive distance and area measurement tools with metric and imperial units.

### 3. Interactive Attribute Table & Feature Inspection
- Sort, search, and paginate through records across all layers.
- **Zoom to Feature**: Center and highlight specific map features directly from the attribute table.
- **Client-Side Data Export**: Export active layers, query results, and statistical summaries as GeoJSON or CSV directly from the browser.

---

## 🛠️ Tech Stack & Architecture

- **Mapping Engine**: [Leaflet 1.9.4](https://leafletjs.com/)
- **Geoprocessing Core**: [Turf.js 7.0.0](https://turfjs.org/)
- **Clustering**: [Leaflet.markercluster 1.5.3](https://github.com/Leaflet/Leaflet.markercluster)
- **Icons**: [Lucide Icons](https://lucide.dev/)
- **UI Architecture**: Vanilla ECMAScript Modules (ESM) — 100% client-side, zero build step required, lightning-fast loading.
- **Coordinate Reference System**: WGS 84 (`EPSG:4326`)

---

## 📂 Project Structure

```text
web-gis-spatial-portal/
├── assets/                  # Basemap preview thumbnails and branding icons
├── css/                     # Clean, responsive CSS with Dark Mode support
│   ├── main.css
│   ├── map.css
│   ├── components.css
│   └── dark.css
├── data/                    # Static WGS84 GeoJSON vector datasets
│   ├── points.geojson       # Point features (100 locations)
│   ├── roads.geojson        # Line features (126 classified road segments)
│   └── boundaries.geojson   # Administrative polygon boundaries (4 zones)
├── js/                      # Modular ESM application architecture
│   ├── tools/               # Client-side spatial tools
│   │   ├── calculate.js     # Field Calculator & Summary Statistics
│   │   ├── buffer.js        # Buffer generation
│   │   ├── filter.js        # Attribute query engine
│   │   ├── nearby.js        # Proximity analysis
│   │   ├── spatialJoin.js   # Spatial join engine
│   │   ├── bufferImpact.js  # Multi-layer impact analysis
│   │   └── measure.js       # Distance and area measurement
│   ├── config.js            # Layer configuration and styling rules
│   ├── layers.js            # GeoJSON loader and layer management
│   ├── map.js               # Leaflet map initialization and basemap handlers
│   ├── table.js             # Attribute table renderer and CSV exporter
│   ├── edit.js              # In-memory feature editing
│   ├── search.js            # Nominatim geocoding & vector search
│   └── main.js              # Application entrypoint
├── index.html               # Main single-page application interface
├── .nojekyll                # GitHub Pages configuration
└── README.md
```

---

## 💻 Running Locally

Because the portal uses standard ECMAScript Modules (ESM) and fetches static GeoJSON files, it runs in any modern browser served via a local HTTP server:

```bash
# Clone the repository
git clone https://github.com/vishnunv2696/web-gis-spatial-portal.git
cd web-gis-spatial-portal

# Serve using any static server:
# Option 1: Python
python -m http.server 8000

# Option 2: Node npx serve
npx serve .

# Option 3: VS Code Live Server extension
# Right-click index.html -> "Open with Live Server"
```

Open `http://localhost:8000` in your browser.

---

## 📄 License

This project is licensed under the MIT License.
