/**
 * Runs the Maia-2 network off the main thread, so the board stays responsive
 * while the bot thinks. It only does inference: positions are encoded and
 * moves chosen in src/lib/training/maia.ts.
 *
 * The runtime (/ort/) and the model are installed by `npm run setup:maia`.
 *
 * Messages in:  { type: 'load', modelUrl }
 *               { type: 'run', id, board, ratingSelf, ratingOpponent }
 * Messages out: { type: 'progress', loaded, total }
 *               { type: 'ready' }
 *               { type: 'error', message, missing }
 *               { type: 'result', id, logits } | { type: 'failed', id, message }
 */

/* global ort, importScripts */

const CACHE = 'chesscoach-maia-v1';
let session = null;

/** Fetch the model, reporting progress. The file is kept in the browser's cache storage after the first time. */
async function fetchModel(url) {
  let cache = null;
  try {
    cache = await caches.open(CACHE);
    const hit = await cache.match(url);
    if (hit) return await hit.arrayBuffer();
  } catch {
    cache = null; // no cache storage here: just download
  }

  const res = await fetch(url);
  const type = res.headers.get('content-type') || '';
  if (!res.ok || type.includes('text/html')) {
    const error = new Error('The model file was not found');
    error.missing = true;
    throw error;
  }

  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body.getReader();
  const chunks = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    self.postMessage({ type: 'progress', loaded, total });
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }

  if (cache) {
    try {
      await cache.put(url, new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } }));
    } catch {
      // storage is full or blocked: the model is downloaded again next time
    }
  }
  return bytes.buffer;
}

async function load(modelUrl) {
  try {
    importScripts('/ort/ort.wasm.min.js');
  } catch {
    const error = new Error('The ONNX runtime was not found');
    error.missing = true;
    throw error;
  }
  ort.env.wasm.wasmPaths = '/ort/';
  // One thread: more needs cross-origin isolation headers, and one is fast enough for this network.
  ort.env.wasm.numThreads = 1;
  const model = await fetchModel(modelUrl);
  session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'] });
}

self.onmessage = async (event) => {
  const message = event.data;
  if (message.type === 'load') {
    try {
      await load(message.modelUrl);
      self.postMessage({ type: 'ready' });
    } catch (error) {
      self.postMessage({ type: 'error', message: String((error && error.message) || error), missing: !!(error && error.missing) });
    }
    return;
  }

  if (message.type === 'run') {
    try {
      const feeds = {
        boards: new ort.Tensor('float32', message.board, [1, 18, 8, 8]),
        elo_self: new ort.Tensor('int64', BigInt64Array.from([BigInt(message.ratingSelf)]), [1]),
        elo_oppo: new ort.Tensor('int64', BigInt64Array.from([BigInt(message.ratingOpponent)]), [1]),
      };
      const output = await session.run(feeds);
      const logits = output.logits_maia.data;
      self.postMessage({ type: 'result', id: message.id, logits }, [logits.buffer]);
    } catch (error) {
      self.postMessage({ type: 'failed', id: message.id, message: String((error && error.message) || error) });
    }
  }
};
