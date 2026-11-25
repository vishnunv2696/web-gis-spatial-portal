/**
 * GeoVista Portal - Coordinate Parsing & Conversion Engine
 * Parses Decimal Degrees (DD), Degrees-Minutes-Seconds (DMS), and UTM Zone 43N.
 * Provides high-precision bidirectional conversion and formatting for map popups and clipboard.
 */

// WGS84 Ellipsoid constants
const WGS84_A = 6378137.0; // semi-major axis (meters)
const WGS84_F = 1 / 298.257223563; // flattening
const WGS84_B = WGS84_A * (1.0 - WGS84_F); // semi-minor axis
const WGS84_E2 = (WGS84_A * WGS84_A - WGS84_B * WGS84_B) / (WGS84_A * WGS84_A); // first eccentricity squared
const WGS84_E_PRIME2 = (WGS84_A * WGS84_A - WGS84_B * WGS84_B) / (WGS84_B * WGS84_B); // second eccentricity squared
const UTM_K0 = 0.9996; // scale factor at central meridian

/**
 * Converts UTM coordinates (Zone 43N, WGS84) to Latitude and Longitude.
 * Central meridian for Zone 43 = 75° E (lon0 = 75 * pi / 180)
 */
export function utm43NToLatLng(easting, northing) {
  const x = easting - 500000.0; // remove 500,000m false easting
  const y = northing; // Northern hemisphere (false northing = 0)
  const lon0 = (43 * 6 - 183) * (Math.PI / 180); // Central meridian = 75° (1.3089969 rad)

  const e1 = (1.0 - Math.sqrt(1.0 - WGS84_E2)) / (1.0 + Math.sqrt(1.0 - WGS84_E2));
  const M = y / UTM_K0;
  const mu = M / (WGS84_A * (1.0 - WGS84_E2 / 4.0 - 3.0 * WGS84_E2 * WGS84_E2 / 64.0 - 5.0 * Math.pow(WGS84_E2, 3) / 256.0));

  // Footprint latitude
  const phi1 = mu +
    (3.0 * e1 / 2.0 - 27.0 * Math.pow(e1, 3) / 32.0) * Math.sin(2.0 * mu) +
    (21.0 * e1 * e1 / 16.0 - 55.0 * Math.pow(e1, 4) / 32.0) * Math.sin(4.0 * mu) +
    (151.0 * Math.pow(e1, 3) / 96.0) * Math.sin(6.0 * mu) +
    (1097.0 * Math.pow(e1, 4) / 512.0) * Math.sin(8.0 * mu);

  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const tanPhi1 = Math.tan(phi1);

  const N1 = WGS84_A / Math.sqrt(1.0 - WGS84_E2 * sinPhi1 * sinPhi1);
  const T1 = tanPhi1 * tanPhi1;
  const C1 = WGS84_E_PRIME2 * cosPhi1 * cosPhi1;
  const R1 = WGS84_A * (1.0 - WGS84_E2) / Math.pow(1.0 - WGS84_E2 * sinPhi1 * sinPhi1, 1.5);
  const D = x / (N1 * UTM_K0);

  // Calculate latitude
  const latRad = phi1 - (N1 * tanPhi1 / R1) * (
    (D * D) / 2.0 -
    (5.0 + 3.0 * T1 + 10.0 * C1 - 4.0 * C1 * C1 - 9.0 * WGS84_E_PRIME2) * Math.pow(D, 4) / 24.0 +
    (61.0 + 90.0 * T1 + 298.0 * C1 + 45.0 * T1 * T1 - 252.0 * WGS84_E_PRIME2 - 3.0 * C1 * C1) * Math.pow(D, 6) / 720.0
  );

  // Calculate longitude
  const lonRad = lon0 + (
    D -
    (1.0 + 2.0 * T1 + C1) * Math.pow(D, 3) / 6.0 +
    (5.0 - 2.0 * C1 + 28.0 * T1 - 3.0 * C1 * C1 + 8.0 * WGS84_E_PRIME2 + 24.0 * T1 * T1) * Math.pow(D, 5) / 120.0
  ) / cosPhi1;

  const lat = latRad * (180.0 / Math.PI);
  const lon = lonRad * (180.0 / Math.PI);

  return { lat, lon };
}

/**
 * Parses DMS string components into Decimal Degrees.
 */
function dmsToDecimal(degrees, minutes, seconds, direction) {
  let dd = parseFloat(degrees) + (parseFloat(minutes || 0) / 60) + (parseFloat(seconds || 0) / 3600);
  const dir = String(direction || '').toUpperCase();
  if (dir === 'S' || dir === 'W') {
    dd = -dd;
  }
  return dd;
}

/**
 * Universal Coordinate Parser
 * Automatically identifies and parses Decimal Degrees, DMS, and UTM Zone 43N.
 * Returns { lat, lon, format, label } or null if invalid.
 */
export function parseCoordinates(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') return null;

  const text = rawInput.trim();
  if (text.length < 3 || text.length > 80) return null;

  // ---------------------------------------------------------------------------
  // 1. UTM Zone 43N Check
  // Examples: "43N 659000 1245000", "UTM 43N 659000 1245000", "659000E 1245000N UTM 43N"
  // ---------------------------------------------------------------------------
  const utmRegex1 = /(?:UTM\s*)?43\s*N\s+([0-9]{5,7}(?:\.[0-9]+)?)(?:\s*m?\s*E)?\s+([0-9]{6,8}(?:\.[0-9]+)?)(?:\s*m?\s*N)?/i;
  const utmRegex2 = /([0-9]{5,7}(?:\.[0-9]+)?)\s*(?:m?\s*E)?\s*,?\s*([0-9]{6,8}(?:\.[0-9]+)?)\s*(?:m?\s*N)?\s+(?:UTM\s*)?43\s*N/i;

  const utmMatch = text.match(utmRegex1) || text.match(utmRegex2);
  if (utmMatch) {
    const easting = parseFloat(utmMatch[1]);
    const northing = parseFloat(utmMatch[2]);

    // Sensible boundary check for Kerala/Kozhikode UTM 43N region
    if (easting >= 100000 && easting <= 900000 && northing >= 800000 && northing <= 2000000) {
      const { lat, lon } = utm43NToLatLng(easting, northing);
      if (isValidLatLng(lat, lon)) {
        return {
          lat,
          lon,
          format: 'UTM',
          source: text,
          label: `UTM Zone 43N (${Math.round(easting)}E, ${Math.round(northing)}N)`
        };
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Degrees-Minutes-Seconds (DMS) Check
  // Examples:
  // "11° 15' 19.8\" N, 75° 46' 50.5\" E"
  // "11 15 19.8 N, 75 46 50.5 E"
  // "11°15'19.8\"N 75°46'50.5\"E"
  // ---------------------------------------------------------------------------
  const dmsPartRegex = /([0-9]{1,3})[°\s_dD]+([0-9]{1,2})['\s_mM]+(?:([0-9]{1,2}(?:\.[0-9]+)?)["\s_sS]*)?\s*([NSEWnsew])/g;
  const dmsMatches = [...text.matchAll(dmsPartRegex)];

  if (dmsMatches.length === 2) {
    let lat = null;
    let lon = null;

    dmsMatches.forEach(m => {
      const deg = m[1];
      const min = m[2];
      const sec = m[3] || '0';
      const dir = m[4].toUpperCase();
      const val = dmsToDecimal(deg, min, sec, dir);

      if (dir === 'N' || dir === 'S') {
        lat = val;
      } else if (dir === 'E' || dir === 'W') {
        lon = val;
      }
    });

    if (lat !== null && lon !== null && isValidLatLng(lat, lon)) {
      return {
        lat,
        lon,
        format: 'DMS',
        source: text,
        label: formatDMS(lat, lon)
      };
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Decimal Degrees (DD) Check
  // Examples:
  // "11.2555, 75.7807"
  // "11.2555 75.7807"
  // "11.2555° N, 75.7807° E"
  // "75.7807° E, 11.2555° N" (reordered coordinates with direction letters)
  // ---------------------------------------------------------------------------
  // Clean special symbols like degree signs and tabs
  const cleanDD = text.replace(/°/g, '').replace(/\t/g, ' ');

  // With directional indicators (e.g. "11.2555N, 75.7807E" or "75.7807 E, 11.2555 N")
  const ddDirRegex = /([0-9]+(?:\.[0-9]+)?)\s*([NSEWnsew])\s*[,;\s]+\s*([0-9]+(?:\.[0-9]+)?)\s*([NSEWnsew])/i;
  const dirMatch = cleanDD.match(ddDirRegex);
  if (dirMatch) {
    let val1 = parseFloat(dirMatch[1]);
    let dir1 = dirMatch[2].toUpperCase();
    let val2 = parseFloat(dirMatch[3]);
    let dir2 = dirMatch[4].toUpperCase();

    if (dir1 === 'S') val1 = -val1;
    if (dir1 === 'W') val1 = -val1;
    if (dir2 === 'S') val2 = -val2;
    if (dir2 === 'W') val2 = -val2;

    let lat = null;
    let lon = null;

    if (['N', 'S'].includes(dir1) && ['E', 'W'].includes(dir2)) {
      lat = val1;
      lon = val2;
    } else if (['E', 'W'].includes(dir1) && ['N', 'S'].includes(dir2)) {
      lon = val1;
      lat = val2;
    }

    if (lat !== null && lon !== null && isValidLatLng(lat, lon)) {
      return {
        lat,
        lon,
        format: 'DD',
        source: text,
        label: formatDD(lat, lon)
      };
    }
  }

  // Plain numbers with comma or space (e.g. "11.2555, 75.7807" or "-11.2555 75.7807")
  const plainRegex = /^([+-]?[0-9]{1,2}(?:\.[0-9]+)?)\s*[,;\s]+\s*([+-]?[0-9]{1,3}(?:\.[0-9]+)?)$/;
  const plainMatch = cleanDD.match(plainRegex);
  if (plainMatch) {
    const lat = parseFloat(plainMatch[1]);
    const lon = parseFloat(plainMatch[2]);

    if (isValidLatLng(lat, lon)) {
      return {
        lat,
        lon,
        format: 'DD',
        source: text,
        label: formatDD(lat, lon)
      };
    }
  }

  return null;
}

/**
 * Validates latitude and longitude ranges.
 */
export function isValidLatLng(lat, lon) {
  return typeof lat === 'number' &&
         typeof lon === 'number' &&
         !isNaN(lat) &&
         !isNaN(lon) &&
         lat >= -90 &&
         lat <= 90 &&
         lon >= -180 &&
         lon <= 180;
}

/**
 * Formats a coordinate pair into clean Decimal Degrees with directional indicators.
 * e.g. "11.25550° N, 75.78070° E"
 */
export function formatDD(lat, lon, precision = 5) {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(precision)}° ${latDir}, ${Math.abs(lon).toFixed(precision)}° ${lonDir}`;
}

/**
 * Formats Decimal Degrees into standard Degrees-Minutes-Seconds (DMS).
 * e.g. "11° 15' 19.8\" N, 75° 46' 50.5\" E"
 */
export function formatDMS(lat, lon) {
  const toDmsString = (val, posDir, negDir) => {
    const dir = val >= 0 ? posDir : negDir;
    const abs = Math.abs(val);
    const deg = Math.floor(abs);
    const minFloat = (abs - deg) * 60;
    const min = Math.floor(minFloat);
    const sec = ((minFloat - min) * 60).toFixed(1);
    return `${deg}° ${min}' ${sec}" ${dir}`;
  };

  return `${toDmsString(lat, 'N', 'S')}, ${toDmsString(lon, 'E', 'W')}`;
}

/**
 * Formats coordinates for standard clipboard copy.
 */
export function toCopyString(lat, lon, name = '') {
  const dd = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  const dms = formatDMS(lat, lon);
  if (name) {
    return `${name}\nCoordinates: ${dd} (${dms})`;
  }
  return `${dd} (${dms})`;
}
