// The slower address search (D-048): when the geocoder finds nothing, address points are searched by house
// number and street name, the two indexed fields (a text search of the full address took over 40 s).
// Pure: imports only sql.js.
import { quote } from './sql.js';

const STREET_TYPES = new Set(['ST', 'STREET', 'AVE', 'AVENUE', 'AV', 'RD', 'ROAD', 'DR', 'DRIVE', 'LN', 'LANE', 'BLVD',
  'BOULEVARD', 'CT', 'COURT', 'PL', 'PLACE', 'WAY', 'TER', 'TERRACE', 'HWY', 'HIGHWAY', 'PKWY', 'PARKWAY', 'CIR', 'CIRCLE',
  'TPKE', 'TURNPIKE', 'PIKE', 'ALY', 'ALLEY', 'SQ', 'SQUARE', 'TRL', 'TRAIL', 'LOOP', 'RUN', 'PATH']);
const DIRECTIONS = new Set(['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW', 'NORTH', 'SOUTH', 'EAST', 'WEST']);

// "12 Church Landing Rd, Pennsville" -> { number: 12, street: 'CHURCH LANDING', place: 'Pennsville' }, or null.
export function parseAddress(text) {
  const [first, second] = String(text ?? '').split(',');
  const match = /^\s*(\d+)[A-Za-z]?\s+(.+?)\s*$/.exec(first ?? '');
  if (!match) return null;
  let words = match[2].toUpperCase().replace(/[.#]/g, '').split(/\s+/).filter(Boolean);
  if (words.length > 1 && DIRECTIONS.has(words[0])) words = words.slice(1);
  if (words.length > 1 && DIRECTIONS.has(words[words.length - 1])) words = words.slice(0, -1);
  if (words.length > 1 && STREET_TYPES.has(words[words.length - 1])) words = words.slice(0, -1);
  if (!words.length) return null;
  const place = second?.trim() || null;
  return { number: Number(match[1]), street: words.join(' '), place };
}

// The where clause for address points; the place narrows it to a postal community when one was typed.
export function addressWhere(parsed, fallback) {
  const parts = [`${fallback.number_field} = ${parsed.number}`, `${fallback.street_field} = ${quote(parsed.street)}`];
  if (parsed.place) parts.push(`${fallback.place_field} = ${quote(parsed.place)}`);
  return parts.join(' AND ');
}
