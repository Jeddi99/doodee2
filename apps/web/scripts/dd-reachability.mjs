/**
 * Walks the import graph of the ported `src/dd` tree from a set of entry
 * components and prints which files are reachable, which are dead, and which
 * bare npm packages the reachable set needs.
 *
 * Used to decide what actually had to come across from the Next.js app, rather
 * than deleting modules by name and finding out at build time. Not part of the
 * build — a diagnostic, kept because the answer changes as more pages are wired.
 *
 *   node scripts/dd-reachability.mjs [entry ...]
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const DD = resolve(here, "../src/dd");

const EXTS = [".ts", ".tsx", ".js", ".jsx"];

function resolveModule(spec, fromFile) {
  let base;
  if (spec.startsWith("@/")) base = join(DD, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return { external: spec };

  for (const candidate of [base, ...EXTS.map((e) => base + e), ...EXTS.map((e) => join(base, "index" + e))]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return { file: candidate };
  }
  return { missing: spec, from: fromFile };
}

// Deliberately regex-based rather than a real parser: the ported tree is
// ordinary ESM with static imports, and a parser dependency is not worth it for
// a diagnostic. Catches `import ... from "x"`, `export ... from "x"` and
// `import("x")`.
const IMPORT_RE = /(?:import|export)[\s\S]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

function importsOf(file) {
  const src = readFileSync(file, "utf8");
  const out = [];
  for (const m of src.matchAll(IMPORT_RE)) out.push(m[1] ?? m[2]);
  return out;
}

function walkDir(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walkDir(p));
    else if (EXTS.includes(extname(p))) out.push(p);
  }
  return out;
}

const entries = process.argv.slice(2);
const roots = entries.length
  ? entries.map((e) => resolve(process.cwd(), e))
  : walkDir(join(DD, "components"));

const seen = new Set();
const externals = new Set();
const missing = [];
const queue = [...roots];

while (queue.length) {
  const file = queue.pop();
  if (seen.has(file)) continue;
  seen.add(file);
  for (const spec of importsOf(file)) {
    const r = resolveModule(spec, file);
    if (r.file) queue.push(r.file);
    else if (r.external) externals.add(r.external.split("/").slice(0, r.external.startsWith("@") ? 2 : 1).join("/"));
    else missing.push(`${relative(DD, r.from)} → ${r.missing}`);
  }
}

const all = walkDir(DD).filter((f) => !f.includes("/shims/"));
const dead = all.filter((f) => !seen.has(f));

console.log(`reachable: ${seen.size}   dead: ${dead.length}   of ${all.length}`);
console.log(`\n--- external packages (${externals.size}) ---`);
console.log([...externals].sort().join("\n"));
if (missing.length) {
  console.log(`\n--- unresolved (${missing.length}) ---`);
  console.log([...new Set(missing)].sort().join("\n"));
}
console.log(`\n--- dead files (${dead.length}) ---`);
console.log(dead.map((f) => relative(DD, f)).sort().join("\n"));
