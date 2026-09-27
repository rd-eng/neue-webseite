#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(".");
const DIST = path.join(ROOT, "dist");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const BASE = process.env.BASE_PATH ? process.env.BASE_PATH.replace(/\/$/, "") : "";

function rebuild() {
  process.stdout.write("[serve] rebuild... ");
  const r = spawnSync(process.execPath, [path.join(ROOT, "tools", "build.mjs")], {
    stdio: "inherit",
    env: { ...process.env, BASE_PATH: process.env.BASE_PATH || "" },
  });
  if (r.status !== 0) throw new Error("build failed");
}

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    let pathname = decodeURIComponent(url.pathname);
    if (BASE && pathname.startsWith(BASE + "/")) pathname = pathname.slice(BASE.length) || "/";
    if (pathname.endsWith("/") || !path.extname(pathname)) {
      pathname = path.posix.join(pathname, "index.html");
    }
    let file = path.normalize(path.join(DIST, pathname));
    if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
    if (!fs.existsSync(file)) {
      rebuild();
      if (!fs.existsSync(file)) { res.writeHead(404); res.end("404"); return; }
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    console.error(e);
    res.writeHead(500); res.end("500");
  }
});

const PORT = Number(process.env.PORT || 4173);
server.listen(PORT, "127.0.0.1", () => {
  console.log(`Foto-Website: http://localhost:${PORT}${BASE}/`);
  rebuild();
});
