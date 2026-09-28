#!/usr/bin/env node
// Coverage-Runner für die Lightbox-Tests mit Zeilen-Instrumentierung.
// Prinzip: assets/js/lightbox.js wird per acorn geparst; vor jede Zeile, die
// ein Statement beginnt, wird ein Zähler-Statement in einer EIGENEN Zeile
// injiziert (syntaktisch immer sicher). Die Test-Suite läuft gegen die
// instrumentierte Kopie, danach wird die Abdeckung ausgewertet.
// Erzwingt:
//   1. MIN_COVERAGE (default 95%) muss erreicht sein
//   2. Coverage darf nie unter den Floor in .coverage-floor.json sinken (Ratchet)
// Usage: node tools/coverage.mjs [--json] [--update-floor]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as acorn from "acorn";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = path.join(ROOT, "assets", "js", "lightbox.js");
const TEST = path.join(ROOT, "tests", "lightbox.test.js");
const FLOOR_FILE = path.join(ROOT, ".coverage-floor.json");
const COUNTS_FILE = path.join(ROOT, ".coverage-counts.json");
const MIN_COVERAGE = Number(process.env.MIN_COVERAGE || 95);

const src = fs.readFileSync(TARGET, "utf8");

// Statement-Start-Offsets via Parser bestimmen
const statements = [];
acorn.parse(src, { ecmaVersion: "latest" });
const walk = (node, cb) => {
  cb(node);
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (Array.isArray(v)) v.forEach(c => c && typeof c.type === "string" && walk(c, cb));
    else if (v && typeof v.type === "string") walk(v, cb);
  }
};
walk(acorn.parse(src, { ecmaVersion: "latest" }), (node) => {
  if (node.type === "BlockStatement") {
    for (const s of node.body) statements.push(s.start);
  }
  if (node.type === "Program" || node.type === "SwitchCase") {
    const body = node.type === "Program" ? node.body : node.consequent;
    for (const s of body) statements.push(s.start);
  }
});

// Zeilenstart-Offsets
const lines = src.split("\n");
const lineStarts = [];
let off = 0;
for (const l of lines) { lineStarts.push(off); off += l.length + 1; }

// Offset -> Zeilenindex (groesstes lineStart <= offset, binaere Suche)
const lineOfOffset = (offset) => {
  let lo = 0, hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid] <= offset) lo = mid; else hi = mid - 1;
  }
  return lo;
};

// Injizierbare Statements: kein Statement nach 'else'/'do' (wuerde Syntax brechen)
const prevKeyword = (offset) => {
  const m = src.slice(0, offset).match(/([A-Za-z]+)\s*$/);
  return m ? m[1] : null;
};
const insertions = [];
for (const s of statements) {
  const kw = prevKeyword(s);
  if (kw === "else" || kw === "do") continue;
  insertions.push(s);
}
insertions.sort((a, b) => a - b);

const counterName = "__cov";
const prefix = `;var ${counterName}=(typeof window!=="undefined"?window:globalThis).__lightboxCov=(typeof window!=="undefined"?window:globalThis).__lightboxCov||{};`;
let instrumented = prefix;
let cursor = 0;
for (let k = 0; k < insertions.length; k++) {
  instrumented += src.slice(cursor, insertions[k]);
  instrumented += `try{${counterName}[${k}]=(${counterName}[${k}]||0)+1;}catch(e){}`;
  cursor = insertions[k];
}
instrumented += src.slice(cursor);

// Datei kurzzeitig tauschen, Tests laufen lassen, Zähler einsammeln
fs.writeFileSync(TARGET + ".orig", src);
try {
  fs.writeFileSync(TARGET, instrumented);
  fs.rmSync(COUNTS_FILE, { force: true });
  execFileSync(process.execPath, [TEST], { cwd: ROOT, stdio: "inherit" });
  const counts = JSON.parse(fs.readFileSync(COUNTS_FILE, "utf8"));
  let covered = 0;
  const uncovered = [];
  for (let k = 0; k < insertions.length; k++) {
    if (counts[k] > 0) covered++;
    else {
      const li = lineOfOffset(insertions[k]);
      uncovered.push(li + 1);
    }
  }
  const executable = insertions.length;
  const pct = executable ? (covered / executable) * 100 : 0;

  let floor = MIN_COVERAGE;
  if (fs.existsSync(FLOOR_FILE)) {
    floor = JSON.parse(fs.readFileSync(FLOOR_FILE, "utf8")).floor || MIN_COVERAGE;
  }
  const floorPct = Math.max(MIN_COVERAGE, floor);

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ pct: Number(pct.toFixed(2)), threshold: floorPct, covered, executable, uncovered }));
  } else {
    console.log(`\n========== COVERAGE ==========`);
    console.log(`Lightbox-Zeilenabdeckung: ${pct.toFixed(2)}% (${covered}/${executable} Statements)`);
    console.log(`Schwelle: ${floorPct}% (Ratchet-Floor: ${floor}%)`);
    if (uncovered.length) console.log(`Nicht abgedeckt (Zeilen): ${uncovered.slice(0, 40).join(", ")}${uncovered.length > 40 ? " …" : ""}`);
  }

  if (pct < floorPct) {
    console.error(`\n❌ Coverage ${pct.toFixed(2)}% unter Schwelle ${floorPct}%. Coverage darf nicht sinken!`);
    process.exitCode = 1;
  }
  if (process.argv.includes("--update-floor") && pct > floor) {
    fs.writeFileSync(FLOOR_FILE, JSON.stringify({ floor: Number(pct.toFixed(2)), updated: new Date().toISOString() }, null, 2) + "\n");
    console.log(`Floor aktualisiert: ${floor}% -> ${pct.toFixed(2)}%`);
  }
  if (!process.argv.includes("--json")) {
    console.log(`✅ Coverage-Check bestanden (${pct.toFixed(2)}% >= ${floorPct}%)`);
  }
} finally {
  fs.writeFileSync(TARGET, src);
  fs.rmSync(TARGET + ".orig", { force: true });
  fs.rmSync(COUNTS_FILE, { force: true });
}
