/**
 * GeoVista Portal - Tools Hub & Results Tab Controller
 * Orchestrates all geoprocessing tools (Search, Filter, Buffer, Nearby, Spatial Join, Buffer Impact, Measure)
 * and renders the interactive Results tab with live cards, statistics, and GeoJSON downloads.
 */

import { renderSearchTool, initSearchTool } from './search.js?v=10';
import { renderFilterTool, initFilterTool } from './filter.js?v=10';
import { renderCalculateTool, initCalculateTool } from './calculate.js?v=10';
import { renderBufferTool, initBufferTool } from './buffer.js?v=10';
import { renderNearbyTool, initNearbyTool } from './nearby.js?v=10';
import { renderSpatialJoinTool, initSpatialJoinTool } from './spatialJoin.js?v=10';
import { renderBufferImpactTool, initBufferImpactTool } from './bufferImpact.js?v=10';
import { renderMeasureTool, initMeasureTool } from './measure.js?v=10';
import { state } from '../state.js?v=10';
import { zoomToFeature } from '../layers.js?v=10';
import { formatDistance, formatArea } from '../units.js?v=10';

export function initTools() {
  const container = document.getElementById('tools-container');
  if (!container) return;

  // Render all tool forms into accordion
  container.innerHTML = `
    ${renderSearchTool()}
    ${renderFilterTool()}
    ${renderCalculateTool()}
    ${renderBufferTool()}
    ${renderNearbyTool()}
    ${renderSpatialJoinTool()}
    ${renderBufferImpactTool()}
    ${renderMeasureTool()}
  `;

  // Setup accordion toggle interaction
  setupAccordion();

  // Initialize individual tool modules
  initSearchTool();
  initFilterTool();
  initCalculateTool();
  initBufferTool();
  initNearbyTool();
  initSpatialJoinTool();
  initBufferImpactTool();
  initMeasureTool();

  // Setup Results tab management
  setupResultsTab();

  if (window.lucide) window.lucide.createIcons();
}

function setupAccordion() {
  const headers = document.querySelectorAll('.tool-header');
  headers.forEach(header => {
    header.addEventListener('click', () => {
      const card = header.closest('.tool-card');
      const wasOpen = card.classList.contains('open');

      // Close all other tool cards
      document.querySelectorAll('.tool-card').forEach(c => c.classList.remove('open'));

      if (!wasOpen) {
        card.classList.add('open');
      }
    });
  });

  // Open first tool card by default
  const firstCard = document.querySelector('.tool-card');
  if (firstCard) firstCard.classList.add('open');
}

function setupResultsTab() {
  const resultsContainer = document.getElementById('results-list');
  const countBadge = document.getElementById('results-count-badge');
  const clearAllBtn = document.getElementById('btn-clear-results');

  const updateResultsUI = () => {
    const totalResults = state.resultLayers.size;
    const isImp = state.unitSystem === 'imperial';
    const distUnit = isImp ? 'ft' : 'm';
    const areaUnit = isImp ? 'ac' : 'sqm';

    // Update count badge on Results tab header
    if (countBadge) {
      countBadge.textContent = totalResults;
      countBadge.classList.toggle('hide', totalResults === 0);
    }

    if (totalResults === 0) {
      resultsContainer.innerHTML = `
        <div class="empty-state">
          <i data-lucide="sparkles" class="empty-icon"></i>
          <p>No active analysis results</p>
          <span>Run a buffer, find nearby, spatial join, or buffer impact tool to see outputs here.</span>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    const canExport = state.role === 'editor' || state.role === 'admin';
    let html = '';
    state.resultLayers.forEach((res, id) => {
      let metaDetails = '';

      // 1. Nearby Results Display
      if (res.type === 'Nearby' && res.metadata?.matches) {
        metaDetails += `
          <div style="margin-top:8px;">
            <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px;">
              Nearest Matches (${res.metadata.matches.length})
            </div>
            <div style="max-height:160px;overflow-y:auto;display:flex;flex-direction:column;gap:4px;">
        `;
        res.metadata.matches.forEach(m => {
          const displayDist = formatDistance(m.distance_m || m.distance, distUnit);
          metaDetails += `
            <div class="nearby-match-row" data-layer-id="${m.layerId || 'points'}" data-feature-id="${m.id}" style="display:flex;align-items:center;justify-content:space-between;padding:4px 8px;background:var(--bg-subtle);border-radius:4px;font-size:11.5px;cursor:pointer;">
              <span><strong>${m.name || m.id}</strong> <span style="color:var(--text-muted);">(${m.category || ''})</span></span>
              <span class="badge badge-blue">${displayDist}</span>
            </div>
          `;
        });
        metaDetails += '</div></div>';

      // 2. Spatial Join Results Display
      } else if (res.type === 'Spatial Join' && res.summary) {
        const s = res.summary;
        let distStats = '';
        if (s.minDistance !== null) {
          distStats = `
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;margin-top:6px;font-size:11px;background:var(--bg-subtle);padding:6px;border-radius:4px;">
              <div>Min: <strong>${formatDistance(s.minDistance, distUnit)}</strong></div>
              <div>Max: <strong>${formatDistance(s.maxDistance, distUnit)}</strong></div>
              <div>Avg: <strong>${formatDistance(s.avgDistance, distUnit)}</strong></div>
            </div>
          `;
        }

        let groupsRows = '';
        if (s.groups && s.groups.length > 0) {
          s.groups.forEach(g => {
            groupsRows += `
              <tr>
                <td class="key" style="font-weight:600;">${g.groupValue}</td>
                <td class="val" style="color:var(--primary);text-align:right;">${g.count} features</td>
              </tr>
            `;
          });
        }

        metaDetails += `
          <div style="margin-top:8px;">
            <div style="display:flex;gap:6px;margin-bottom:6px;">
              <span class="badge badge-blue">Joined: ${s.totalJoined} of ${s.totalInput}</span>
              ${s.unmatchedCount > 0 ? `<span class="badge badge-accent">Unmatched: ${s.unmatchedCount}</span>` : ''}
            </div>
            ${distStats}
            ${groupsRows ? `
              <div style="margin-top:6px;">
                <div style="font-size:10.5px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:2px;">Category / Division Breakdown</div>
                <table class="popup-table" style="font-size:11px;width:100%;"><tbody>${groupsRows}</tbody></table>
              </div>
            ` : ''}
          </div>
        `;

      // 3. Buffer Impact Analysis Report Card
      } else if (res.type === 'Buffer Impact' && res.report) {
        const rep = res.report;
        let perTargetHtml = '';

        Object.entries(rep.perTarget || {}).forEach(([tLayer, tData]) => {
          let catBadges = '';
          Object.entries(tData.categories || {}).forEach(([cat, cCount]) => {
            catBadges += `<span class="badge badge-blue" style="font-size:10px;padding:2px 6px;">${cat}: ${cCount}</span> `;
          });

          let divBadges = '';
          Object.entries(tData.divisions || {}).forEach(([divName, dCount]) => {
            divBadges += `<span class="badge badge-subtle" style="font-size:10px;padding:2px 6px;">${divName}: ${dCount}</span> `;
          });

          let areaInfo = '';
          if (tData.overlapAreaSqm > 0) {
            areaInfo = `<div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">Overlapped Area: <strong>${formatArea(tData.overlapAreaSqm, areaUnit)}</strong></div>`;
          }

          perTargetHtml += `
            <div style="background:var(--bg-subtle);padding:6px 8px;border-radius:4px;margin-top:6px;">
              <div style="font-weight:700;font-size:11.5px;color:var(--primary);">${tLayer}: ${tData.count} affected</div>
              ${catBadges ? `<div style="margin-top:4px;">${catBadges}</div>` : ''}
              ${divBadges ? `<div style="margin-top:4px;">${divBadges}</div>` : ''}
              ${areaInfo}
            </div>
          `;
        });

        // Scenario comparison table
        let scenarioRows = '';
        (rep.scenarioTable || []).forEach(sc => {
          const displayDist = formatDistance(sc.distanceMeters, distUnit);
          scenarioRows += `
            <tr>
              <td class="key" style="font-weight:600;">${displayDist}</td>
              <td class="val" style="color:var(--primary);text-align:right;">${sc.count} features</td>
            </tr>
          `;
        });

        metaDetails += `
          <div style="margin-top:8px;">
            <div style="display:flex;align-items:center;justify-content:space-between;background:var(--primary-light, rgba(2,132,199,0.1));padding:8px 10px;border-radius:4px;border:1px solid var(--border-color);">
              <div>
                <span style="font-size:10.5px;color:var(--text-muted);display:block;">TOTAL AFFECTED</span>
                <span style="font-size:18px;font-weight:800;color:var(--primary);">${rep.totalAffected} features</span>
              </div>
              <span class="badge badge-accent">${res.inputDistance || 20} ${res.inputUnit || 'm'} corridor</span>
            </div>

            <div style="font-size:10.5px;color:var(--text-muted);margin-top:6px;font-style:italic;">
              ${rep.projectionMethod || 'PostGIS EPSG:32643 UTM Planar'}
            </div>

            ${perTargetHtml}

            ${scenarioRows ? `
              <div style="margin-top:8px;">
                <div style="font-size:10.5px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:2px;">Scenario Distance Comparison</div>
                <table class="popup-table" style="font-size:11px;width:100%;">
                  <thead>
                    <tr style="border-bottom:1px solid var(--border-color);color:var(--text-muted);">
                      <th style="text-align:left;padding:2px 0;">Buffer Distance</th>
                      <th style="text-align:right;padding:2px 0;">Affected Count</th>
                    </tr>
                  </thead>
                  <tbody>${scenarioRows}</tbody>
                </table>
              </div>
            ` : ''}
          </div>
        `;

      } else if (res.metadata) {
        metaDetails += '<div style="font-size:11.5px;color:var(--text-secondary);margin-top:4px;">';
        Object.entries(res.metadata).forEach(([k, v]) => {
          metaDetails += `<div><strong>${k}:</strong> ${v}</div>`;
        });
        metaDetails += '</div>';
      }

      html += `
        <div class="result-item" id="result-card-${id}">
          <div class="result-item-header">
            <span class="badge badge-accent">${res.type}</span>
            <span style="font-size:10px;color:var(--text-muted);">Active Layer</span>
          </div>
          <div class="result-item-title">${res.title}</div>
          ${metaDetails}
          <div class="result-item-actions" style="margin-top:10px;display:flex;gap:4px;flex-wrap:wrap;">
            <button class="btn btn-xs btn-outline btn-zoom-result" data-result-id="${id}" title="Zoom to Extent">
              <i data-lucide="maximize-2"></i> Zoom
            </button>
            ${canExport ? `
              <button class="btn btn-xs btn-outline btn-download-result" data-result-id="${id}" title="Download GeoJSON">
                <i data-lucide="download"></i> GeoJSON
              </button>
            ` : `
              <button class="btn btn-xs btn-outline btn-download-result btn-export-disabled" data-result-id="${id}" disabled title="Export is available to editors and admins. Please sign in." style="opacity:0.45;cursor:not-allowed;">
                <i data-lucide="lock"></i> GeoJSON
              </button>
            `}
            ${res.type === 'Buffer Impact' ? (canExport ? `
              <button class="btn btn-xs btn-outline btn-copy-summary" data-result-id="${id}" title="Copy Report Summary">
                <i data-lucide="copy"></i> Copy
              </button>
            ` : `
              <button class="btn btn-xs btn-outline btn-copy-summary btn-export-disabled" data-result-id="${id}" disabled title="Export is available to editors and admins. Please sign in." style="opacity:0.45;cursor:not-allowed;">
                <i data-lucide="lock"></i> Copy
              </button>
            `) : ''}
            <button class="btn btn-xs btn-outline-danger btn-remove-result" data-result-id="${id}" title="Remove Layer">
              <i data-lucide="trash-2"></i> Remove
            </button>
          </div>
        </div>
      `;
    });

    resultsContainer.innerHTML = html;

    // Attach actions
    resultsContainer.querySelectorAll('.btn-zoom-result').forEach(btn => {
      btn.addEventListener('click', () => {
        const resId = btn.getAttribute('data-result-id');
        const res = state.resultLayers.get(resId);
        if (res && res.leafletLayer && state.map) {
          state.map.fitBounds(res.leafletLayer.getBounds(), { padding: [30, 30] });
        }
      });
    });

    resultsContainer.querySelectorAll('.btn-download-result').forEach(btn => {
      btn.addEventListener('click', () => {
        const resId = btn.getAttribute('data-result-id');
        downloadResultAsGeoJSON(resId);
      });
    });

    resultsContainer.querySelectorAll('.btn-copy-summary').forEach(btn => {
      btn.addEventListener('click', () => {
        const resId = btn.getAttribute('data-result-id');
        const res = state.resultLayers.get(resId);
        if (res && res.report) {
          const rep = res.report;
          let summaryText = `GeoVista Buffer Impact Analysis Report\n`;
          summaryText += `Title: ${res.title}\n`;
          summaryText += `Total Affected Features: ${rep.totalAffected}\n`;
          summaryText += `Projection: ${rep.projectionMethod}\n\n`;
          Object.entries(rep.perTarget || {}).forEach(([t, d]) => {
            summaryText += `- ${t}: ${d.count} features\n`;
          });
          if (rep.scenarioTable) {
            summaryText += `\nScenario Matrix:\n`;
            rep.scenarioTable.forEach(sc => {
              summaryText += `  ${sc.formattedDistance}: ${sc.count} features\n`;
            });
          }
          navigator.clipboard.writeText(summaryText).then(() => {
            state.emit('toast', { type: 'success', message: 'Report summary copied to clipboard!' });
          });
        }
      });
    });

    resultsContainer.querySelectorAll('.btn-remove-result').forEach(btn => {
      btn.addEventListener('click', () => {
        const resId = btn.getAttribute('data-result-id');
        state.removeResultLayer(resId);
        state.emit('toast', { type: 'info', message: 'Result layer removed.' });
      });
    });

    resultsContainer.querySelectorAll('.nearby-match-row').forEach(row => {
      row.addEventListener('click', () => {
        const lId = row.getAttribute('data-layer-id');
        const fId = row.getAttribute('data-feature-id');
        if (lId && fId) {
          zoomToFeature(lId, fId);
        }
      });
    });

    if (window.lucide) window.lucide.createIcons();
  };

  state.on('resultLayer:added', updateResultsUI);
  state.on('resultLayer:removed', updateResultsUI);
  state.on('resultLayers:cleared', updateResultsUI);
  state.on('units:change', updateResultsUI);
  state.on('auth:change', updateResultsUI);

  clearAllBtn?.addEventListener('click', () => {
    state.clearResultLayers();
    state.emit('toast', { type: 'info', message: 'Cleared all analysis results.' });
  });

  updateResultsUI();
}

async function downloadResultAsGeoJSON(resultId) {
  const canExport = state.role === 'editor' || state.role === 'admin';
  if (!canExport) {
    state.emit('toast', {
      type: 'warning',
      message: 'Export is available to editors and admins. Please sign in.'
    });
    return;
  }

  const res = state.resultLayers.get(resultId);
  if (!res || !res.data) {
    state.emit('toast', { type: 'warning', message: 'No result data found to export.' });
    return;
  }

  try {
    const geojsonStr = JSON.stringify(res.data, null, 2);
    const blob = new Blob([geojsonStr], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const filename = `${res.title.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase()}.geojson`;
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    state.emit('toast', { type: 'success', message: `Downloaded ${filename}` });
  } catch (err) {
    console.error('Result export error:', err);
    state.emit('toast', { type: 'error', message: `Failed to download result: ${err.message}` });
  }
}
