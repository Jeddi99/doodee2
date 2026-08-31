/**
 * Copies the MediaPipe vision WASM runtime out of the installed
 * `@mediapipe/tasks-vision` package into `public/wasm/`, where the ported UI
 * loads it from (`WASM_CDN = "/wasm"` in dd/lib/mediapipe/{face-mesh,
 * hair-segmenter}.ts).
 *
 * Copied at build time rather than committed for two reasons. It is ~32 MB of
 * binaries that npm already puts on disk, and — the real reason — the runtime
 * has to match the JS wrapper that loads it. The pre-existing
 * `public/mediapipe/` in this repo is a checked-in copy from an older release
 * and no longer matches the pinned 0.10.35 package; deriving the files from
 * node_modules means that drift cannot happen again.
 *
 * `public/mediapipe/` is left exactly as it is: the pre-existing scan page
 * loads from it and this port does not touch that path.
 *
 * Runs from `predev` and `prebuild`. Output is gitignored.
 */
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dest = join(appRoot, "public", "wasm");

// Resolved via the package's main entry, not "<pkg>/package.json": the package
// declares an `exports` map that does not expose package.json, so resolving it
// directly throws ERR_PACKAGE_PATH_NOT_EXPORTED. The main entry sits at the
// package root, so its directory is the root.
const entry = require.resolve("@mediapipe/tasks-vision");
const src = join(dirname(entry), "wasm");

if (!existsSync(src)) {
  console.error(`[sync-mediapipe-wasm] no wasm/ in @mediapipe/tasks-vision at ${src}`);
  process.exit(1);
}

mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`[sync-mediapipe-wasm] ${src} -> ${dest}`);
