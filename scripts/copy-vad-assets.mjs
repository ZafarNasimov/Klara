// Copies the browser VAD files (Silero model, audio worklet, onnxruntime wasm)
// to public/vad so the call screen loads them from this app, not a CDN.
// Runs on `npm install` (postinstall); public/vad is gitignored.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const out = join(process.cwd(), "public", "vad");
const files = [
  ["node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js", "vad.worklet.bundle.min.js"],
  ["node_modules/@ricky0123/vad-web/dist/silero_vad_v5.onnx", "silero_vad_v5.onnx"],
  ["node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.wasm"],
  ["node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.mjs"],
];

mkdirSync(out, { recursive: true });
let copied = 0;
for (const [from, to] of files) {
  if (!existsSync(from)) {
    console.warn(`[vad] missing ${from}; hands-free mode will fall back to push-to-talk`);
    continue;
  }
  copyFileSync(from, join(out, to));
  copied++;
}
console.log(`[vad] ${copied}/${files.length} files in public/vad`);
