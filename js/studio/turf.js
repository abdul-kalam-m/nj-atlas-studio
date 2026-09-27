// The turf packages (D-038), loaded only when a buffer or a cut export needs them.
let loading = null;

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
