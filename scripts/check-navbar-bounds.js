/**
 * In-browser Navbar Bounding Box & Layout Auditor
 * Evaluates whether all navbar elements are fully contained, non-overlapping,
 * and within the viewport without horizontal overflow.
 */

export function auditNavbarLayout() {
  const nav = document.querySelector('header.navbar');
  if (!nav) return { pass: false, error: 'Navbar not found' };

  const navRect = nav.getBoundingClientRect();
  const vpWidth = window.innerWidth;
  const docScrollWidth = document.documentElement.scrollWidth;
  const bodyScrollWidth = document.body.scrollWidth;

  const errors = [];
  const warnings = [];

  // 1. Horizontal Scroll Check
  if (docScrollWidth > vpWidth + 1 || bodyScrollWidth > vpWidth + 1) {
    errors.push(`Horizontal scrollbar detected: scrollWidth (${Math.max(docScrollWidth, bodyScrollWidth)}) > innerWidth (${vpWidth})`);
  }

  // 2. Navbar Container Check
  if (navRect.left < -1 || navRect.right > vpWidth + 1) {
    errors.push(`Navbar container exceeds viewport: left=${navRect.left}, right=${navRect.right}, vpWidth=${vpWidth}`);
  }

  // 3. Search Control Check: Exactly ONE visible
  const searchCenter = document.getElementById('navbar-search-center');
  const mobileToggle = document.getElementById('btn-mobile-search-toggle');
  const searchCenterVis = searchCenter && window.getComputedStyle(searchCenter).display !== 'none';
  const mobileToggleVis = mobileToggle && window.getComputedStyle(mobileToggle).display !== 'none';

  if (searchCenterVis && mobileToggleVis) {
    errors.push('Both desktop search input and mobile search button are visible simultaneously');
  } else if (!searchCenterVis && !mobileToggleVis) {
    errors.push('No search control is visible in navbar');
  }

  // 4. Brand Block Check
  const brandName = document.querySelector('.brand-name');
  const brandSub = document.querySelector('.brand-sub');
  if (brandName && window.getComputedStyle(brandName).display !== 'none') {
    const nameRect = brandName.getBoundingClientRect();
    if (nameRect.height > 25) {
      errors.push(`Brand title wrapped onto multiple lines: height=${nameRect.height}px`);
    }
  }
  if (brandSub && window.getComputedStyle(brandSub).display !== 'none') {
    const subRect = brandSub.getBoundingClientRect();
    if (subRect.height > 18) {
      errors.push(`Brand subtitle wrapped onto multiple lines: height=${subRect.height}px`);
    }
  }

  // 5. Containment & Overlap Check on Navbar Zones
  const zones = ['.navbar-left', '.navbar-center', '.navbar-right'];
  const visibleItems = [];

  for (const sel of zones) {
    const zone = document.querySelector(sel);
    if (!zone || window.getComputedStyle(zone).display === 'none') continue;

    const zoneRect = zone.getBoundingClientRect();
    if (zoneRect.left < navRect.left - 1 || zoneRect.right > navRect.right + 1) {
      errors.push(`Zone ${sel} overflows navbar bounds: left=${zoneRect.left}, right=${zoneRect.right}`);
    }

    // Check visible children inside zone
    const children = Array.from(zone.children).filter(el => {
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    });

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const cRect = child.getBoundingClientRect();
      if (cRect.width === 0 || cRect.height === 0) continue;

      visibleItems.push({ id: child.id || child.className, rect: cRect });

      // Containment in navbar
      if (cRect.left < navRect.left - 1) {
        errors.push(`Element ${child.id || child.className} clipped on left: ${cRect.left} < ${navRect.left}`);
      }
      if (cRect.right > navRect.right + 1) {
        errors.push(`Element ${child.id || child.className} clipped on right: ${cRect.right} > ${navRect.right}`);
      }
      if (cRect.bottom > navRect.bottom + 1) {
        errors.push(`Element ${child.id || child.className} clipped on bottom: ${cRect.bottom} > ${navRect.bottom}`);
      }

      // Sibling overlap check
      if (i > 0) {
        const prevChild = children[i - 1];
        const pRect = prevChild.getBoundingClientRect();
        if (pRect.right > cRect.left + 0.5) {
          errors.push(`Overlap between ${prevChild.id || prevChild.className} (right=${pRect.right}) and ${child.id || child.className} (left=${cRect.left})`);
        }
      }
    }
  }

  // 6. Settings Menu and User Menu Presence
  const settingsBtn = document.getElementById('btn-nav-settings');
  const userBtn = document.getElementById('btn-nav-auth');
  if (!settingsBtn || window.getComputedStyle(settingsBtn).display === 'none') {
    errors.push('Settings button #btn-nav-settings is missing or hidden');
  }
  if (!userBtn || window.getComputedStyle(userBtn).display === 'none') {
    errors.push('User / login button #btn-nav-auth is missing or hidden');
  }

  return {
    pass: errors.length === 0,
    vpWidth,
    docScrollWidth,
    errors,
    warnings,
    searchMode: searchCenterVis ? 'input' : 'button',
    visibleCount: visibleItems.length
  };
}

if (typeof window !== 'undefined') {
  window.auditNavbarLayout = auditNavbarLayout;
}
