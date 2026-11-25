/**
 * GeoVista Portal - Units Conversion Module (Client-side)
 * Defines exact conversion factors matching server/units.js.
 * Provides formatting, localized labels, and conversion helpers.
 */

export const DISTANCE_FACTORS = {
  m: 1,
  km: 1000,
  ft: 0.3048,
  mi: 1609.344
};

export const AREA_FACTORS = {
  sqm: 1,
  sqkm: 1000000,
  ha: 10000,
  sqft: 0.09290304,
  ac: 4046.8564224
};

export function normalizeDistanceUnit(unit) {
  if (!unit) return 'm';
  const u = String(unit).toLowerCase().trim();
  if (u === 'ft' || u === 'feet' || u === 'foot') return 'ft';
  if (u === 'km' || u === 'kilometer' || u === 'kilometers') return 'km';
  if (u === 'mi' || u === 'mile' || u === 'miles') return 'mi';
  return 'm';
}

export function normalizeAreaUnit(unit) {
  if (!unit) return 'sqm';
  const u = String(unit).toLowerCase().trim();
  if (u === 'sqft' || u === 'ft2' || u === 'sq ft') return 'sqft';
  if (u === 'sqkm' || u === 'km2' || u === 'sq km') return 'sqkm';
  if (u === 'ha' || u === 'hectare' || u === 'hectares') return 'ha';
  if (u === 'ac' || u === 'acre' || u === 'acres') return 'ac';
  return 'sqm';
}

export function toMeters(value, unit = 'm') {
  const num = parseFloat(value);
  if (isNaN(num)) return 0;
  const norm = normalizeDistanceUnit(unit);
  return num * DISTANCE_FACTORS[norm];
}

export function fromMeters(meters, unit = 'm') {
  const num = parseFloat(meters);
  if (isNaN(num)) return 0;
  const norm = normalizeDistanceUnit(unit);
  return num / DISTANCE_FACTORS[norm];
}

export function toSquareMeters(value, unit = 'sqm') {
  const num = parseFloat(value);
  if (isNaN(num)) return 0;
  const norm = normalizeAreaUnit(unit);
  return num * AREA_FACTORS[norm];
}

export function fromSquareMeters(sqm, unit = 'sqm') {
  const num = parseFloat(sqm);
  if (isNaN(num)) return 0;
  const norm = normalizeAreaUnit(unit);
  return num / AREA_FACTORS[norm];
}

/**
 * Format a distance in meters to a target unit string with label
 */
export function formatDistance(meters, unit = 'm', decimals = 1) {
  if (meters === undefined || meters === null || isNaN(meters)) return '—';
  const norm = normalizeDistanceUnit(unit);
  const converted = fromMeters(meters, norm);
  const unitLabel = norm === 'ft' ? 'ft' : norm === 'km' ? 'km' : norm === 'mi' ? 'mi' : 'm';
  return `${converted.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals })} ${unitLabel}`;
}

/**
 * Format an area in square meters to target area unit string with label
 */
export function formatArea(sqm, unit = 'sqm', decimals = 2) {
  if (sqm === undefined || sqm === null || isNaN(sqm)) return '—';
  const norm = normalizeAreaUnit(unit);
  const converted = fromSquareMeters(sqm, norm);
  const labelMap = {
    sqm: 'm²',
    sqkm: 'km²',
    ha: 'ha',
    sqft: 'sq ft',
    ac: 'acres'
  };
  return `${converted.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals })} ${labelMap[norm] || norm}`;
}

/**
 * Get the preferred distance unit for the active unit system ('metric' or 'imperial')
 */
export function getDefaultDistanceUnit(system = 'metric') {
  return system === 'imperial' ? 'ft' : 'm';
}

/**
 * Get preferred area unit for active unit system
 */
export function getDefaultAreaUnit(system = 'metric') {
  return system === 'imperial' ? 'ac' : 'sqm';
}
