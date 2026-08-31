/**
 * Route smoke test. Loads each route in a real headless Chrome, waits for the
 * app to settle, and reports what rendered plus any console error, uncaught
 * exception or failed request.
 *
 * Exists because a green `vite build` proves the ported tree *compiles* and
 * nothing more. Every defect this pass actually found was invisible to the
 * build: navigation escaping the /ui mount prefix, a missing .tflite that the
 * dev server answered with index.html (MediaPipe then reported it as "not a
 * valid Flatbuffer buffer"), and styled-jsx props reaching the DOM.
 *
 * Usage — the dev server must already be running:
 *
 *   node scripts/smoke-routes.mjs http://localhost:5173 [--auth] <route>...
 *
 *   --auth          seed the ported tree's local-dev session (see
 *                   src/dd/lib/local-dev-auth.ts) so AuthGate admits the run
 *                   and the signed-in screens render instead of bouncing to
 *                   login. Dev builds on localhost only.
 *   SMOKE_WAIT_MS   per-route settle time, default 4500.
 *
 * A route PASSes when it rendered a non-trivial DOM, logged no unexpected
 * error, and mounted the correct UI: `.dd-ui` present for a /ui route and
 * absent everywhere else. That last check is the one that matters — a /ui route
 * quietly rendering the pre-existing app means its navigation escaped the mount
 * prefix, which looks fine in a screenshot.
 *
 * Chrome runs on a throwaway --user-data-dir, so the developer's own profile
 * and sessions are never touched. It also runs on SwiftShader: MediaPipe builds
 * a GPU graph, and with --disable-gpu it fails on kGpuService before any app
 * code runs.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const argv = process.argv.slice(2);
// `--auth` seeds the ported tree's local-dev session flag (see
// dd/lib/local-dev-auth.ts) so AuthGate admits us and the signed-in screens
// actually render instead of bouncing to login.
const AUTH = argv.includes("--auth");
const [baseUrl, ...routes] = argv.filter((a) => a !== "--auth");

const profile = mkdtempSync(join(tmpdir(), "dd-smoke-"));
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    // Port 0 = let the OS pick, then read the real port out of the profile's
    // DevToolsActivePort file. A fixed port meant a leftover Chrome from an
    // earlier run owned it, and the next run attached to that stale browser and
    // hung waiting for a page that was never going to appear.
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--window-size=1440,900",
    "about:blank",
  ],
  // Own process group: Chrome forks renderer/GPU children, and killing only the
  // launcher leaves those holding the debugging port and the temp profile.
  { stdio: "ignore", detached: true },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function endpoint() {
  // Chrome writes "<port>\n<ws path>" here once the debugger is listening.
  const portFile = join(profile, "DevToolsActivePort");
  for (let i = 0; i < 100; i++) {
    try {
      const [port] = readFileSync(portFile, "utf8").split("\n");
      const res = await fetch(`http://127.0.0.1:${port.trim()}/json/version`);
      return (await res.json()).webSocketDebuggerUrl;
    } catch {
      await sleep(200);
    }
  }
  throw new Error("Chrome did not expose a debugger endpoint");
}

function cdp(ws) {
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    } else if (msg.method) {
      for (const l of listeners) l(msg);
    }
  });
  return {
    send(method, params = {}, sessionId) {
      const mid = ++id;
      ws.send(JSON.stringify({ id: mid, method, params, sessionId }));
      return new Promise((resolve, reject) => pending.set(mid, { resolve, reject }));
    },
    on(fn) {
      listeners.push(fn);
    },
  };
}

/**
 * Noise that is not a regression, so a real one is not buried in it.
 *  - the Django beacon: fired by the PRE-EXISTING App.jsx visit counter on every
 *    route; aborts because the backend is not running in this harness.
 *  - large media/model aborts: the harness navigates away after a few seconds,
 *    cancelling in-flight multi-MB downloads. Verified separately that each of
 *    these serves HTTP 200.
 */
const EXPECTED = [
  /api\/v1\/visit\//,
  /ERR_ABORTED .*\.(mp4|onnx|task|wasm)$/,
];


/**
 * Resolves once the rendered node count has held steady across two consecutive
 * polls (and at least `minMs` has passed), or when `maxMs` runs out. Returns
 * the time waited so a slow route is visible in the output.
 */
async function settle(c, sessionId, minMs = 0, maxMs = 25_000) {
  const step = 500;
  const started = Date.now();
  let previous = -1;
  let stableFor = 0;
  while (Date.now() - started < maxMs) {
    await sleep(step);
    const { result } = await c.send(
      "Runtime.evaluate",
      {
        expression: "document.querySelectorAll('*').length",
        returnByValue: true,
      },
      sessionId,
    );
    const count = result.value ?? 0;
    stableFor = count === previous ? stableFor + step : 0;
    previous = count;
    if (stableFor >= 1000 && Date.now() - started >= minMs) break;
  }
  return Date.now() - started;
}

const results = [];

try {
  const wsUrl = await endpoint();
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  const c = cdp(ws);

  const { targetId } = await c.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await c.send("Target.attachToTarget", { targetId, flatten: true });

  await c.send("Page.enable", {}, sessionId);
  await c.send("Runtime.enable", {}, sessionId);
  await c.send("Log.enable", {}, sessionId);
  await c.send("Network.enable", {}, sessionId);
  if (AUTH) {
    await c.send(
      "Page.addScriptToEvaluateOnNewDocument",
      { source: `try{localStorage.setItem("doodee.local_dev_auth.v1","1")}catch(e){}` },
      sessionId,
    );
  }

  let logs = [];
  const netUrls = new Map();
  c.on((msg) => {
    if (msg.method === "Network.requestWillBeSent") netUrls.set(msg.params.requestId, msg.params.request.url);
    if (msg.sessionId !== sessionId) return;
    if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params.exceptionDetails;
      logs.push(`EXCEPTION: ${d.exception?.description ?? d.text}`);
    }
    if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
      {
        const parts = msg.params.args.map((a) => a.value ?? a.description);
        const frames = (msg.params.stackTrace?.callFrames ?? [])
          .slice(0, 4)
          .map((f) => `${f.url.split("/").pop()}:${f.lineNumber}`)
          .join(" < ");
        logs.push(`console.error: ${parts.join(" | ")}${frames ? `  @ ${frames}` : ""}`);
      }
    }
    if (msg.method === "Network.responseReceived" && msg.params.response.status >= 400) {
      logs.push(`HTTP ${msg.params.response.status}: ${msg.params.response.url}`);
    }
    if (msg.method === "Network.loadingFailed") {
      logs.push(`NETFAIL: ${msg.params.errorText} ${netUrls.get(msg.params.requestId) ?? "?"}`);
    }
  });

  for (const route of routes) {
    logs = [];
    await c.send("Page.navigate", { url: baseUrl + route }, sessionId);
    // Wait for the DOM to stop growing rather than sleeping a fixed amount.
    // The ported routes lazy-load their chunk and several then pull a 3-16 MB
    // model before they finish painting, so a fixed wait that suited one route
    // was flaky on another: the same page passed alone and failed when run
    // after two heavy ones.
    await settle(c, sessionId, Number(process.env.SMOKE_WAIT_MS ?? 0));

    const { result } = await c.send(
      "Runtime.evaluate",
      {
        expression: `(() => {
          const root = document.getElementById('root');
          const dd = document.querySelector('.dd-ui');
          const text = (dd ?? root)?.innerText ?? '';
          return JSON.stringify({
            nodes: root ? root.querySelectorAll('*').length : 0,
            ddMounted: !!dd,
            ddNodes: dd ? dd.querySelectorAll('*').length : 0,
            bodyBg: getComputedStyle(document.body).backgroundColor,
            htmlClass: document.documentElement.className,
            title: document.title,
            text: text.replace(/\\s+/g, ' ').trim().slice(0, 220),
          });
        })()`,
        returnByValue: true,
      },
      sessionId,
    );
    const all = [...new Set(logs)];
    results.push({
      route,
      ...JSON.parse(result.value),
      errors: all.filter((e) => !EXPECTED.some((re) => re.test(e))),
      expected: all.filter((e) => EXPECTED.some((re) => re.test(e))),
    });
  }
} finally {
  try {
    // Negative pid = the whole process group, so the renderer and GPU children
    // go down with the launcher.
    process.kill(-chrome.pid, "SIGKILL");
  } catch {
    chrome.kill("SIGKILL");
  }
  await new Promise((r) => chrome.once("exit", r));
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // A leftover temp profile is harmless; never fail the run over cleanup.
  }
}

let failed = 0;
for (const r of results) {
  const wantsDd = r.route === "/ui" || r.route.startsWith("/ui/");
  const ok = r.nodes > 10 && r.errors.length === 0 && r.ddMounted === wantsDd;
  if (!ok) failed++;
  console.log(`\n${ok ? "PASS" : "FAIL"}  ${r.route}`);
  console.log(`   nodes=${r.nodes} ddMounted=${r.ddMounted} ddNodes=${r.ddNodes}`);
  console.log(`   bodyBg=${r.bodyBg}  html.class="${r.htmlClass}"`);
  console.log(`   text: ${r.text || "(empty)"}`);
  for (const e of r.errors) console.log(`   ! ${e.slice(0, 300)}`);
  for (const e of r.expected) console.log(`   . (expected) ${e.slice(0, 110)}`);
}

// Non-zero on any failure so this can gate a release rather than just being read.
if (failed) {
  console.log(`\n${failed}/${results.length} route(s) failed`);
  process.exit(1);
}
console.log(`\nall ${results.length} route(s) passed`);
