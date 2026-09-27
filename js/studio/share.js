// Map document <-> link, and the embed snippet (IMPLEMENTATION_GUIDE.md §4.10). No DOM; works in Node too.
// #m=<base64url(deflate-raw(JSON))>, or #m0=<base64url(JSON)> where CompressionStream is missing.

export const LONG_LINK = 2000;

export function toBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(text) {
  const base = String(text).replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base + '='.repeat((4 - (base.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function pipe(bytes, stream) {
  const response = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await response.arrayBuffer());
}

export const canCompress = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

// Map document -> the hash (without '#').
export async function encodeDoc(doc, { compress = canCompress() } = {}) {
  const bytes = new TextEncoder().encode(JSON.stringify(doc));
  if (compress) return `m=${toBase64Url(await pipe(bytes, new CompressionStream('deflate-raw')))}`;
  return `m0=${toBase64Url(bytes)}`;
}

// Hash -> parsed JSON, or null when the hash holds no map document. Throws on a damaged link.
export async function decodeHash(hash) {
  const params = new URLSearchParams(String(hash ?? '').replace(/^#/, ''));
  if (params.has('m')) {
    if (!canCompress()) throw new Error('compression unsupported');
    const bytes = await pipe(fromBase64Url(params.get('m')), new DecompressionStream('deflate-raw'));
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  if (params.has('m0')) return JSON.parse(new TextDecoder().decode(fromBase64Url(params.get('m0'))));
  return null;
}

export function linkFor(pageUrl, hash) {
  return `${String(pageUrl).split('#')[0]}#${hash}`;
}

export function isLong(link) {
  return link.length > LONG_LINK;
}

function escapeAttribute(text) {
  return String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export function embedSnippet(pageUrl, hash, title, width = 800, height = 600) {
  const base = String(pageUrl).split('#')[0].split('?')[0];
  return `<iframe src="${escapeAttribute(`${base}?embed=1#${hash}`)}" width="${width}" height="${height}" `
    + `title="${escapeAttribute(title || 'Map')}" style="border:0" loading="lazy"></iframe>`;
}
