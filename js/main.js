/**
 * GeoVista Portal - Application Bootstrap
 * Initializes core map engine, UI components, layer manager, and geoprocessing tools.
 */

import { initMap } from './map.js?v=10';
import { initUI } from './ui.js?v=10';
import { initLayers } from './layers.js?v=10';
import { initTable } from './table.js?v=10';
import { initTools } from './tools/index.js?v=10';
import { initAuth } from './auth.js?v=10';
import { initEdit } from './edit.js?v=10';
import { initAdmin } from './admin.js?v=10';
import { initLocationSearch } from './search.js?v=10';
import { initNavigationExtras, restoreViewFromHash } from './navigation.js?v=10';
import { state } from './state.js?v=10';

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // 1. Initialize UI shell
    initUI();

    // 2. Initialize Authentication & User state
    await initAuth();

    // 3. Initialize Leaflet Map and Basemaps
    initMap();

    // 4. Initialize Attribute Table Drawer
    initTable();

    // 5. Ingest and render all vector layers (via PostGIS / API)
    await initLayers();

    // 6. Initialize Geoprocessing Tools
    initTools();

    // 7. Initialize Feature Editing & Admin Controllers
    initEdit();
    initAdmin();

    // 8. Initialize Location Search Bar & Advanced Navigation Extras
    initLocationSearch();
    initNavigationExtras();

    // 9. Restore shareable URL hash state if present
    restoreViewFromHash();

    // Welcome notification
    setTimeout(() => {
      state.emit('toast', {
        type: 'info',
        message: 'GeoVista Portal online with RBAC & audit logging.'
      });
    }, 600);

    console.log('GeoVista Portal initialized successfully with auth, editing, and admin modules.');
  } catch (error) {
    console.error('Fatal initialization error:', error);
  }
});
