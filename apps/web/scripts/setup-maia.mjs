/**
 * Installs what the sparring bot needs into public/: the Maia-2 model and the
 * ONNX runtime that runs it in the browser. Neither is kept in the
 * repository (the model alone is 93 MB), so run this once after cloning:
 *
 *   npm run setup:maia
 *
 * Or, with a model file you already have:
 *
 *   node scripts/setup-maia.mjs path/to/maia_rapid.onnx
 *
 * The model is Maia-2 (rapid) by the CSSLab at the University of Toronto,
 * MIT licensed (https://github.com/CSSLab/maia2), in the ONNX form its authors
 * published for their own web app. The runtime is onnxruntime-web, MIT.
 * Without these files the app works as before and the Sparring tab explains
 * what is missing.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MODEL_URL =
  'https://raw.githubusercontent.com/CSSLab/maia-platform-frontend/ea5496cc8c2e10d57b6a1fda9db6a039411bf37c/public/maia2/maia_rapid.onnx';
const MODEL_SHA256 = '027ddb8c1a8b7235b6e51827cffe325f9cb95fd4523dce65a131547c034ccfc9';
const RUNTIME_FILES = ['ort.wasm.min.js', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm'];

const at = (relative) => fileURLToPath(new URL(relative, import.meta.url));
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

// The runtime, from the installed package.
mkdirSync(at('../public/ort/'), { recursive: true });
for (const name of RUNTIME_FILES) {
  copyFileSync(at(`../node_modules/onnxruntime-web/dist/${name}`), at(`../public/ort/${name}`));
}
console.log(`Copied the ONNX runtime to public/ort/ (${RUNTIME_FILES.length} files)`);

// The model.
mkdirSync(at('../public/maia/'), { recursive: true });
const target = at('../public/maia/maia_rapid.onnx');
if (existsSync(target) && sha256(readFileSync(target)) === MODEL_SHA256) {
  console.log('The model is already installed');
} else {
  const local = process.argv[2];
  let model;
  if (local) {
    model = readFileSync(local);
  } else {
    console.log('Downloading the Maia-2 model (93 MB)...');
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    model = Buffer.from(await res.arrayBuffer());
  }
  if (sha256(model) !== MODEL_SHA256) throw new Error('The model file does not match the expected checksum');
  writeFileSync(target, model);
  console.log(`Installed the model to public/maia/maia_rapid.onnx (${(model.length / 1024 / 1024).toFixed(0)} MB)`);
}
