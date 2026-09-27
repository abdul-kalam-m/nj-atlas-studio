// The turf packages (D-038), loaded only when a screening ring or a cut export needs them.
let loading = null;
let loadingJsts = null;

// JSTS, the geometry engine inside @turf/buffer, for buffer layers (D-075). The buffer worker loads it itself;
// the page loads it only when module workers are not available.
export const JSTS_URL = 'https://cdn.jsdelivr.net/npm/@turf/jsts@2.7.2/+esm';

export function loadJsts() {
  if (!loadingJsts) {
    loadingJsts = import(JSTS_URL).then((module) => module.default ?? module);
    loadingJsts.catch(() => { loadingJsts = null; });
  }
  return loadingJsts;
}

export function loadTurf() {
  if (!loading) {
    loading = Promise.all([
      import('https://cdn.jsdelivr.net/npm/@turf/buffer@7.4.0/+esm'),
      import('https://cdn.jsdelivr.net/npm/@turf/intersect@7.4.0/+esm'),
    ]).then(([buffer, intersect]) => ({ buffer: buffer.buffer ?? buffer.default, intersect: intersect.intersect ?? intersect.default }));
    loading.catch(() => { loading = null; });
  }
  return loading;
}
