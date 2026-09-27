// Buffers run here, off the page's main thread (D-075): the map stays responsive, and Cancel ends the worker.
// JSTS is the same build @turf/buffer uses; it loads once per worker.
import { bufferFeatures } from './geoprocess.js';
import { JSTS_URL } from './turf.js';

let engine = null;

self.onmessage = async (event) => {
  const { features, distances, dissolve } = event.data;
  try {
    engine = engine ?? (await import(JSTS_URL)).default;
    const result = bufferFeatures(engine, features, { distances, dissolve,
      onProgress: (done, total) => self.postMessage({ type: 'progress', done, total }) });
    self.postMessage({ type: 'done', result });
  } catch (error) {
    self.postMessage({ type: 'error', message: String(error?.message ?? error) });
  }
};
