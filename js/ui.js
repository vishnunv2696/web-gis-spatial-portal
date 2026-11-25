/**
 * GeoVista Portal - UI Controller
 * Manages sidebar tabs, collapsible panels, floating adjustable legend,
 * theme toggling, modals, and toast notification messaging.
 */

import { state } from './state.js';

export function initUI() {
  setupTheme();
  setupUnitsToggle();
  setupSettingsMenu();
  setupMobileActionsMenu();
  setupSidebar();
  setupTabs();
  setupFloatingLegend();
  setupModals();
  setupToastListener();
  setupKeyboardShortcuts();

  // Re-run Lucide icon parser
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function setupTheme() {
  const themeToggleBtn = document.getElementById('btn-theme-toggle');
  const themeIcon = document.getElementById('theme-icon');
  const themeBadge = document.getElementById('theme-badge');

  const updateThemeUI = (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    if (themeIcon) {
      themeIcon.setAttribute('data-lucide', theme === 'dark' ? 'sun' : 'moon');
      if (window.lucide) window.lucide.createIcons();
    }
    if (themeBadge) {
      themeBadge.textContent = theme === 'dark' ? 'Dark' : 'Light';
    }
  };

  // Set initial theme
  updateThemeUI(state.theme);

  themeToggleBtn?.addEventListener('click', () => {
    state.toggleTheme();
  });

  state.on('theme:change', (newTheme) => {
    updateThemeUI(newTheme);
  });
}

function setupUnitsToggle() {
  const toggleBtn = document.getElementById('btn-units-toggle');
  const badge = document.getElementById('nav-units-badge');
  const settingsBtn = document.getElementById('btn-nav-settings');

  const updateUnitsUI = (system) => {
    document.documentElement.setAttribute('data-units', system);
    const isImp = system === 'imperial';
    if (badge) {
      badge.textContent = isImp ? 'Imperial (ft)' : 'Metric (m)';
    }
    if (settingsBtn) {
      settingsBtn.title = isImp ? 'Settings (Imperial: ft)' : 'Settings (Metric: m)';
      settingsBtn.setAttribute('aria-label', isImp ? 'Settings (Imperial units active)' : 'Settings (Metric units active)');
    }
  };

  updateUnitsUI(state.unitSystem);

  toggleBtn?.addEventListener('click', () => {
    state.toggleUnitSystem();
    const isImp = state.unitSystem === 'imperial';
    state.emit('toast', {
      type: 'info',
      message: `Global units set to ${isImp ? 'Imperial (ft, mi, acres)' : 'Metric (m, km, m²)'}.`
    });
  });

  state.on('units:change', (newSystem) => {
    updateUnitsUI(newSystem);
  });
}

function setupSettingsMenu() {
  const settingsBtn = document.getElementById('btn-nav-settings');
  const dropdown = document.getElementById('settings-dropdown');
  if (!settingsBtn || !dropdown) return;

  const toggleSettings = (forceState) => {
    const isOpen = typeof forceState === 'boolean' ? forceState : !dropdown.classList.contains('open');
    dropdown.classList.toggle('open', isOpen);
    settingsBtn.setAttribute('aria-expanded', String(isOpen));
    
    if (isOpen) {
      document.getElementById('user-dropdown')?.classList.remove('open');
      document.getElementById('mobile-actions-dropdown')?.classList.remove('open');
    }
  };

  settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSettings();
  });

  window.addEventListener('click', (e) => {
    if (!e.target.closest('#nav-settings-menu-wrap')) {
      toggleSettings(false);
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dropdown.classList.contains('open')) {
      toggleSettings(false);
      settingsBtn.focus();
    }
  });
}

function setupMobileActionsMenu() {
  const toggleBtn = document.getElementById('btn-mobile-actions-toggle');
  const dropdown = document.getElementById('mobile-actions-dropdown');
  if (!toggleBtn || !dropdown) return;

  const toggleMenu = (forceState) => {
    const isOpen = typeof forceState === 'boolean' ? forceState : !dropdown.classList.contains('open');
    dropdown.classList.toggle('open', isOpen);
    toggleBtn.setAttribute('aria-expanded', String(isOpen));

    if (isOpen) {
      document.getElementById('settings-dropdown')?.classList.remove('open');
      document.getElementById('user-dropdown')?.classList.remove('open');
    }
  };

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMenu();
  });

  const mapActions = [
    { from: 'm-btn-nav-layers', to: 'btn-nav-layers' },
    { from: 'm-btn-nav-tools', to: 'btn-nav-tools' },
    { from: 'm-btn-nav-basemap', to: 'btn-nav-basemap' },
    { from: 'm-btn-toggle-drawer', to: 'btn-toggle-drawer' },
    { from: 'm-btn-nav-bookmarks', to: 'btn-nav-bookmarks' },
    { from: 'm-btn-share-link', to: 'btn-share-link' },
  ];

  mapActions.forEach(({ from, to }) => {
    document.getElementById(from)?.addEventListener('click', () => {
      toggleMenu(false);
      document.getElementById(to)?.click();
    });
  });

  window.addEventListener('click', (e) => {
    if (!e.target.closest('#mobile-actions-wrap')) {
      toggleMenu(false);
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dropdown.classList.contains('open')) {
      toggleMenu(false);
      toggleBtn.focus();
    }
  });
}

function setupSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('btn-toggle-sidebar');

  // Sidebar is closed by default in HTML (.collapsed)
  state.sidebarCollapsed = sidebar ? sidebar.classList.contains('collapsed') : true;

  const toggleSidebar = () => {
    if (!sidebar) return;
    sidebar.classList.toggle('collapsed');
    const isCollapsed = sidebar.classList.contains('collapsed');
    state.sidebarCollapsed = isCollapsed;

    // Smooth map resize on transition
    const triggerResize = () => {
      if (state.map) state.map.invalidateSize();
    };
    setTimeout(triggerResize, 150);
    setTimeout(triggerResize, 320);
  };

  toggleBtn?.addEventListener('click', toggleSidebar);

  // Quick navigation buttons in header (open sidebar on user action only)
  document.getElementById('btn-nav-layers')?.addEventListener('click', () => {
    if (sidebar?.classList.contains('collapsed')) toggleSidebar();
    switchTab('layers');
  });

  document.getElementById('btn-nav-tools')?.addEventListener('click', () => {
    if (sidebar?.classList.contains('collapsed')) toggleSidebar();
    switchTab('tools');
  });
}

export function switchTab(tabName) {
  const tabs = document.querySelectorAll('.sidebar-tab');
  const panels = document.querySelectorAll('.tab-panel');

  tabs.forEach(tab => {
    const isTarget = tab.getAttribute('data-tab') === tabName;
    tab.classList.toggle('active', isTarget);
    tab.setAttribute('aria-selected', isTarget ? 'true' : 'false');
  });

  panels.forEach(panel => {
    const isTarget = panel.id === `panel-${tabName}`;
    panel.classList.toggle('active', isTarget);
  });

  state.activeTab = tabName;
  if (window.lucide) window.lucide.createIcons();
}

function setupTabs() {
  const tabs = document.querySelectorAll('.sidebar-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-tab');
      switchTab(target);

      // If user clicks Legend tab in sidebar, also show and focus floating legend
      if (target === 'legend') {
        const floatLegend = document.getElementById('floating-legend');
        if (floatLegend) {
          floatLegend.classList.remove('hidden');
        }
      }
    });
  });
}

/**
 * Correction 4: Adjustable Floating Map Legend
 * Provides drag-to-reposition, resize handle, collapse/expand, corner docking,
 * visibility toggle, and sessionStorage state persistence.
 */
function setupFloatingLegend() {
  const legend = document.getElementById('floating-legend');
  const header = document.getElementById('floating-legend-header');
  const collapseBtn = document.getElementById('btn-legend-collapse');
  const collapseIcon = document.getElementById('legend-collapse-icon');
  const resetBtn = document.getElementById('btn-legend-reset');
  const closeBtn = document.getElementById('btn-legend-close');
  const resizeHandle = document.getElementById('floating-legend-resize');
  const mapWrapper = document.querySelector('.map-wrapper');

  if (!legend || !header) return;

  const isMobile = window.innerWidth <= 768;

  // 1. Load saved state or use responsive defaults
  let legendState = {
    visible: true,
    collapsed: isMobile,
    left: null,
    top: null,
    right: isMobile ? null : 20,
    bottom: isMobile ? 54 : 50,
    width: 220,
    height: 260
  };

  try {
    const saved = sessionStorage.getItem('geovista_legend_state');
    if (saved) {
      legendState = { ...legendState, ...JSON.parse(saved) };
    }
  } catch (err) {
    console.warn('Could not restore legend state:', err);
  }

  // Apply state to DOM
  const applyLegendStyles = () => {
    legend.classList.toggle('hidden', !legendState.visible);
    legend.classList.toggle('collapsed', !!legendState.collapsed);

    if (collapseIcon) {
      collapseIcon.setAttribute('data-lucide', legendState.collapsed ? 'chevron-up' : 'chevron-down');
      if (window.lucide) window.lucide.createIcons();
    }

    if (legendState.width && !legendState.collapsed) {
      legend.style.width = `${legendState.width}px`;
    }
    if (legendState.height && !legendState.collapsed) {
      legend.style.height = `${legendState.height}px`;
    }

    if (legendState.left !== null) {
      legend.style.left = `${legendState.left}px`;
      legend.style.right = 'auto';
    } else if (legendState.right !== null) {
      legend.style.right = `${legendState.right}px`;
      legend.style.left = 'auto';
    }

    if (legendState.top !== null) {
      legend.style.top = `${legendState.top}px`;
      legend.style.bottom = 'auto';
    } else if (legendState.bottom !== null) {
      legend.style.bottom = `${legendState.bottom}px`;
      legend.style.top = 'auto';
    }
  };

  const saveLegendState = () => {
    try {
      sessionStorage.setItem('geovista_legend_state', JSON.stringify(legendState));
    } catch (_) {}
  };

  applyLegendStyles();

  // 2. Collapse / Expand toggle
  collapseBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    legendState.collapsed = !legendState.collapsed;
    legend.classList.toggle('collapsed', legendState.collapsed);
    if (!legendState.collapsed) {
      legend.style.height = `${legendState.height || 260}px`;
      legend.style.width = `${legendState.width || 220}px`;
    } else {
      legend.style.height = 'auto';
    }
    if (collapseIcon) {
      collapseIcon.setAttribute('data-lucide', legendState.collapsed ? 'chevron-up' : 'chevron-down');
      if (window.lucide) window.lucide.createIcons();
    }
    saveLegendState();
  });

  // 3. Reset position & dock to default corner
  resetBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const mobileNow = window.innerWidth <= 768;
    legendState = {
      visible: true,
      collapsed: mobileNow,
      left: mobileNow ? 12 : null,
      right: mobileNow ? null : 20,
      top: null,
      bottom: mobileNow ? 54 : 50,
      width: 220,
      height: 260
    };
    legend.style.left = mobileNow ? '12px' : 'auto';
    legend.style.right = mobileNow ? 'auto' : '20px';
    legend.style.top = 'auto';
    legend.style.bottom = mobileNow ? '54px' : '50px';
    legend.style.width = '220px';
    legend.style.height = mobileNow ? 'auto' : '260px';
    legend.classList.toggle('collapsed', mobileNow);
    legend.classList.remove('hidden');
    if (collapseIcon) {
      collapseIcon.setAttribute('data-lucide', mobileNow ? 'chevron-up' : 'chevron-down');
      if (window.lucide) window.lucide.createIcons();
    }
    saveLegendState();
  });

  // 4. Close / Hide
  closeBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    legendState.visible = false;
    legend.classList.add('hidden');
    saveLegendState();
  });

  // 5. Reactive Toggle Event (from Map toolbar or sidebar)
  state.on('legend:toggle', () => {
    legendState.visible = !legendState.visible;
    legend.classList.toggle('hidden', !legendState.visible);
    saveLegendState();
  });

  // 6. Drag to reposition
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let initialLeft = 0;
  let initialTop = 0;

  header.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return; // ignore buttons
    isDragging = true;
    header.style.cursor = 'grabbing';
    legend.setPointerCapture(e.pointerId);

    const rect = legend.getBoundingClientRect();
    const parentRect = (mapWrapper || document.body).getBoundingClientRect();

    dragStartX = e.clientX;
    dragStartY = e.clientY;
    initialLeft = rect.left - parentRect.left;
    initialTop = rect.top - parentRect.top;

    legend.style.left = `${initialLeft}px`;
    legend.style.top = `${initialTop}px`;
    legend.style.right = 'auto';
    legend.style.bottom = 'auto';
    e.preventDefault();
  });

  window.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    const parentRect = (mapWrapper || document.body).getBoundingClientRect();
    const legendRect = legend.getBoundingClientRect();

    let newLeft = initialLeft + (e.clientX - dragStartX);
    let newTop = initialTop + (e.clientY - dragStartY);

    // Clamp within map bounds
    const maxLeft = parentRect.width - legendRect.width - 8;
    const maxTop = parentRect.height - legendRect.height - 8;

    newLeft = Math.max(8, Math.min(newLeft, maxLeft));
    newTop = Math.max(8, Math.min(newTop, maxTop));

    legend.style.left = `${newLeft}px`;
    legend.style.top = `${newTop}px`;
    legendState.left = Math.round(newLeft);
    legendState.top = Math.round(newTop);
    legendState.right = null;
    legendState.bottom = null;
  });

  const stopDrag = () => {
    if (isDragging) {
      isDragging = false;
      header.style.cursor = 'grab';
      saveLegendState();
    }
  };

  window.addEventListener('pointerup', stopDrag);
  window.addEventListener('pointercancel', stopDrag);

  // 7. Corner Resizing
  if (resizeHandle) {
    let isResizing = false;
    let resizeStartX = 0;
    let resizeStartY = 0;
    let initialW = 0;
    let initialH = 0;

    resizeHandle.addEventListener('pointerdown', (e) => {
      isResizing = true;
      resizeHandle.setPointerCapture(e.pointerId);
      const rect = legend.getBoundingClientRect();
      resizeStartX = e.clientX;
      resizeStartY = e.clientY;
      initialW = rect.width;
      initialH = rect.height;
      e.stopPropagation();
      e.preventDefault();
    });

    window.addEventListener('pointermove', (e) => {
      if (!isResizing || legendState.collapsed) return;
      const newW = Math.max(180, Math.min(initialW + (e.clientX - resizeStartX), 420));
      const newH = Math.max(120, Math.min(initialH + (e.clientY - resizeStartY), 500));

      legend.style.width = `${newW}px`;
      legend.style.height = `${newH}px`;
      legendState.width = Math.round(newW);
      legendState.height = Math.round(newH);
    });

    const stopResize = () => {
      if (isResizing) {
        isResizing = false;
        saveLegendState();
      }
    };

    window.addEventListener('pointerup', stopResize);
    window.addEventListener('pointercancel', stopResize);
  }
}

function setupModals() {
  // Modal close buttons
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.getAttribute('data-modal');
      const modal = document.getElementById(modalId);
      if (modal) modal.classList.remove('open');
    });
  });

  // Close modals on backdrop click
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        backdrop.classList.remove('open');
      }
    });
  });

  // About modal opener
  document.getElementById('btn-nav-about')?.addEventListener('click', () => {
    document.getElementById('modal-about')?.classList.add('open');
    document.getElementById('settings-dropdown')?.classList.remove('open');
  });
}

function setupToastListener() {
  const container = document.getElementById('toast-container');
  if (!container) return;

  state.on('toast', ({ type = 'info', message = '' }) => {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let iconName = 'info';
    if (type === 'success') iconName = 'check-circle-2';
    if (type === 'warning') iconName = 'alert-triangle';
    if (type === 'danger') iconName = 'alert-circle';

    toast.innerHTML = `
      <i data-lucide="${iconName}"></i>
      <span>${message}</span>
    `;

    container.appendChild(toast);
    if (window.lucide) window.lucide.createIcons();

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 200ms ease';
      setTimeout(() => toast.remove(), 250);
    }, 4000);
  });
}

function setupKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    // Ctrl + B: toggle sidebar
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      document.getElementById('btn-toggle-sidebar')?.click();
    }
    // Escape: close open modals or drawer
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-backdrop.open').forEach(m => m.classList.remove('open'));
      const drawer = document.getElementById('attribute-drawer');
      if (drawer && drawer.classList.contains('open')) {
        drawer.classList.remove('open');
        document.getElementById('btn-toggle-drawer')?.classList.remove('active');
      }
    }
  });
}
