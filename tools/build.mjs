#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(".");
const IS_CHECK = process.argv.includes("--check");

function fail(msg) {
  console.error("BUILD FEHLER: " + msg);
  process.exit(1);
}

let sharp = null;
try { sharp = (await import("sharp")).default; } catch { sharp = null; }

const GALLERY_DIR = path.join(ROOT, "gallery");
if (!fs.existsSync(GALLERY_DIR)) fail("Kein 'gallery' Ordner gefunden: " + GALLERY_DIR);

const IMG_EXT = [".jpg", ".jpeg", ".png", ".webp", ".avif"];
const SUPPORTED_EXT = [...IMG_EXT, ".svg"];
const IMG_RE = /^(\d+)[-_ ]+(.+)\.(jpg|jpeg|png|webp|avif|svg)$/i;

const SITE = {
  name: "Robin Engel",
  titleSuffix: " — Robin Engel · Fotokunst",
  description: "Fotokunst von Robin Engel: Landschaften, Momente und Reisen in ausdrucksstarken Bildern.",
  baseUrl: "https://robinengel.de",
  contact: { email: "kontakt@robinengel.de", instagram: "https://www.instagram.com/" },
};

const siteFile = path.join(ROOT, "site.json");
if (fs.existsSync(siteFile)) {
  try { Object.assign(SITE, JSON.parse(fs.readFileSync(siteFile, "utf8"))); } catch (e) { fail("site.json ungültig: " + e.message); }
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
const slugify = s => s.toLowerCase().replace(/[äöüß]/g, c => ({ "ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss" }[c])).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "galerie";

const LAYOUTS = ["masonry", "grid", "rows", "featured"];
const LAYOUT_LABELS = { masonry: "Masonry", grid: "Raster", rows: "Zeilen", featured: "Feature" };

function svgSize(file) {
  try {
    const head = fs.readFileSync(file, { encoding: "utf8", flag: "r" }).slice(0, 2000);
    const m = head.match(/viewBox=["']0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)["']/) || head.match(/width=["'](\d+)/);
    const m2 = head.match(/width=["'](\d+)(?:\.\d+)?["'][^>]*height=["'](\d+)/);
    if (m2) return { w: +m2[1], h: +m2[2] };
    if (m) return { w: +m[1], h: +m[2] };
  } catch {}
  return { w: 3, h: 2 };
}

function imgDim(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".svg") return svgSize(file);
  if (sharp) {
    try {
      const m = sharp(file).metadata();
      return { w: m.width || 3, h: m.height || 2 };
    } catch {}
  }
  return { w: 3, h: 2 };
}

function readGalleries() {
  const entries = fs.readdirSync(GALLERY_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith("_") && !e.name.startsWith("."));
  const galleries = [];
  for (const e of entries) {
    const dir = path.join(GALLERY_DIR, e.name);
    let cfg = {};
    const metaFile = path.join(dir, "gallery.json");
    if (fs.existsSync(metaFile)) {
      try { cfg = JSON.parse(fs.readFileSync(metaFile, "utf8")); } catch (err) { fail(`gallery.json in "${e.name}" ungültig: ${err.message}`); }
    }
    const images = [];
    for (const f of fs.readdirSync(dir).sort((a, b) => a.localeCompare(b, "de"))) {
      const full = path.join(dir, f);
      if (!fs.statSync(full).isFile() || f.startsWith(".")) continue;
      const ext = path.extname(f).toLowerCase();
      if (!SUPPORTED_EXT.includes(ext)) continue;
      let order = 9000 + images.length, title = f.slice(0, -ext.length);
      const m = f.match(IMG_RE);
      if (m) { order = Number(m[1]); title = m[2]; }
      const titleFmt = title.replace(/[_-]+/g, " ");
      const dim = imgDim(full);
      images.push({
        file: path.relative(ROOT, full).split(path.sep).join("/"),
        origName: f,
        order,
        title: titleFmt,
        slug: slugify(titleFmt),
        aspect: dim.w / dim.h,
        isSvg: ext === ".svg",
        id: slugify(titleFmt),
      });
    }
    if (!images.length) continue;
    images.sort((a, b) => a.order - b.order || a.origName.localeCompare(b.origName, "de"));
    galleries.push({
      dir: e.name,
      title: cfg.title || e.name.replace(/[_-]+/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      subtitle: cfg.subtitle || "",
      description: cfg.description || "",
      layout: LAYOUTS.includes(cfg.layout) ? cfg.layout : "masonry",
      theme: cfg.theme === "dark" ? "dark" : "light",
      images,
    });
  }
  if (!galleries.length) fail("Keine Bilder gefunden. Lege Bilder in gallery/<name>/ ab.");
  return galleries;
}

async function buildDerivatives(galleries) {
  let n = 0;
  if (!sharp) return n;
  for (const g of galleries) {
    const outDir = path.join(GALLERY_DIR, g.dir, "img");
    fs.mkdirSync(outDir, { recursive: true });
    for (const img of g.images) {
      if (img.isSvg) continue;
      const base = img.origName.replace(/\.[^.]+$/, "");
      const thumb = path.join(outDir, base + "_thumb.webp");
      const full = path.join(outDir, base + "_full.webp");
      const src = path.join(ROOT, img.file);
      if (!fs.existsSync(thumb)) {
        await sharp(src).resize({ width: 720, height: 720, fit: "inside", withoutEnlargement: true }).webp({ quality: 78 }).toFile(thumb);
        n++;
      }
      if (!fs.existsSync(full)) {
        await sharp(src).resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 86 }).toFile(full);
        n++;
      }
    }
  }
  return n;
}

const THEME_CSS = {
  light: { "page-bg": "#faf9f7", "card-bg": "#ffffff", "text": "#1c1b1a", "text-muted": "#6f6a63", "accent": "#b08d57", "header-bg": "rgba(250,249,247,0.92)", "border": "rgba(28,27,26,0.12)", "media-bg": "rgba(28,27,26,0.05)" },
  dark: { "page-bg": "#131314", "card-bg": "#1c1c1e", "text": "#f0efec", "text-muted": "#a39d93", "accent": "#c9a86a", "header-bg": "rgba(19,19,20,0.9)", "border": "rgba(240,239,236,0.14)", "media-bg": "rgba(240,239,236,0.06)" },
};

function themeVars(theme) {
  return ":root{" + Object.entries(THEME_CSS[theme] || THEME_CSS.light).map(([k, v]) => `--${k}:${v};`).join("") + "}";
}

let PAGE_TPL = null;
function pageTpl() {
  if (!PAGE_TPL) PAGE_TPL = fs.readFileSync(path.join(ROOT, "partials", "page.html"), "utf8");
  return PAGE_TPL;
}

function applyTpl(vars) {
  let out = pageTpl();
  for (const [k, v] of Object.entries(vars)) out = out.split("{{" + k + "}}").join(v);
  return out;
}

function imgSrc(img) { return img.file; }

function fig(g, img, i) {
  const id = img.id + "-" + (i + 1);
  const src = encodeURIComponent(img.origName);
  const w = Math.round(img.aspect * 1000);
  return `<figure class="ph" data-full="${src}" data-title="${esc(img.title)}" id="${id}">
  <a href="#${id}" class="ph-link" aria-label="${esc(img.title)} vergrößern">
    <img src="${src}" alt="${esc(img.title)} — ${esc(g.title)}"${i > 3 ? ' loading="lazy"' : ""} width="${w}" height="1000">
    <span class="ph-overlay"><span class="ph-name">${esc(img.title)}</span></span>
  </a>
</figure>`;
}

function renderLayout(g) {
  const figs = g.images.map((img, i) => fig(g, img, i));
  switch (g.layout) {
    case "grid":
      return `<div class="layout-grid">\n${figs.join("\n")}\n</div>`;
    case "rows": {
      const rows = [];
      for (let i = 0; i < g.images.length; i += 2) {
        const pair = figs.slice(i, i + 2);
        rows.push(`<div class="layout-row${pair.length === 1 ? " layout-row--single" : ""}">\n${pair.join("\n")}\n</div>`);
      }
      return `<div class="layout-rows">\n${rows.join("\n")}\n</div>`;
    }
    case "featured":
      return `<div class="layout-featured">\n<div class="layout-featured__hero">\n${figs[0]}\n</div>\n${figs.length > 1 ? `<div class="layout-grid layout-grid--compact">\n${figs.slice(1).join("\n")}\n</div>` : ""}\n</div>`;
    default:
      return `<div class="layout-masonry">\n${figs.join("\n")}\n</div>`;
  }
}

function navHtml(galleries, current) {
  return galleries.map(g => `<a href="/${g.dir}/${current === g ? '" aria-current="page"' : '"'}>${esc(g.title)}</a>`).join("\n      ");
}

function buildGalleryPage(g, galleries) {
  return applyTpl({
    THEME_VARS: themeVars(g.theme),
    PAGE_TITLE: esc(g.title + SITE.titleSuffix),
    DESC: esc(g.description || g.subtitle || SITE.description),
    CANONICAL: esc(SITE.baseUrl + "/" + g.dir + "/"),
    OG_IMAGE: esc(SITE.baseUrl + "/" + g.dir + "/" + encodeURIComponent(g.images[0].origName)),
    NAV: navHtml(galleries, g),
    CRUMB: `<a href="/">Galerien</a> / ${esc(g.title)}`,
    TITLE: esc(g.title),
    SUBTITLE_BLOCK: g.subtitle ? `<p class="subtitle">${esc(g.subtitle)}</p>` : "",
    GALLERY_SLUG: g.dir,
    LAYOUT: renderLayout(g),
    SITE_NAME: esc(SITE.name),
    CONTACT_EMAIL: esc(SITE.contact.email),
    INSTAGRAM_URL: esc(SITE.contact.instagram),
  });
}

function buildLandingPage(galleries) {
  const cards = galleries.map(g => {
    const img0 = g.images[0];
    return `<a class="card" href="/${g.dir}/">
  <div class="card__media"><img src="/${g.dir}/${encodeURIComponent(img0.origName)}" alt="${esc(g.title)}" loading="lazy" width="${Math.round(img0.aspect * 1000)}" height="1000"></div>
  <div class="card__body">
    <h2>${esc(g.title)}</h2>
    ${g.subtitle ? `<p>${esc(g.subtitle)}</p>` : ""}
    <span class="card__meta">${g.images.length} ${g.images.length === 1 ? "Bild" : "Bilder"} · ${esc(LAYOUT_LABELS[g.layout])}</span>
  </div>
</a>`;
  }).join("\n");
  return applyTpl({
    THEME_VARS: themeVars("light"),
    PAGE_TITLE: esc("Robin Engel · Fotokunst"),
    DESC: esc(SITE.description),
    CANONICAL: esc(SITE.baseUrl + "/"),
    OG_IMAGE: esc(SITE.baseUrl + "/" + galleries[0].dir + "/" + encodeURIComponent(galleries[0].images[0].origName)),
    NAV: navHtml(galleries, null),
    CRUMB: "",
    TITLE: "Galerien",
    SUBTITLE_BLOCK: `<p class="subtitle">${esc(SITE.description)}</p>`,
    GALLERY_SLUG: "",
    LAYOUT: `<div class="cards">\n${cards}\n</div>`,
    SITE_NAME: esc(SITE.name),
    CONTACT_EMAIL: esc(SITE.contact.email),
    INSTAGRAM_URL: esc(SITE.contact.instagram),
  });
}

async function main() {
  const galleries = readGalleries();
  const deriv = await buildDerivatives(galleries);
  if (IS_CHECK) {
    console.log(`CHECK OK: ${galleries.length} Galerien, ${galleries.reduce((n, g) => n + g.images.length, 0)} Bilder`);
    return;
  }
  const out = path.join(ROOT, "dist");
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.join(out, "assets"), { recursive: true });
  fs.cpSync(path.join(ROOT, "assets"), path.join(out, "assets"), { recursive: true });
  for (const g of galleries) {
    const gDir = path.join(out, g.dir);
    fs.mkdirSync(gDir, { recursive: true });
    fs.cpSync(path.join(GALLERY_DIR, g.dir), gDir, { recursive: true, filter: f => path.basename(f) !== "gallery.json" });
    fs.writeFileSync(path.join(gDir, "index.html"), buildGalleryPage(g, galleries));
  }
  fs.writeFileSync(path.join(out, "index.html"), buildLandingPage(galleries));
  console.log(`OK: ${galleries.length} Galerien, ${galleries.reduce((n, g) => n + g.images.length, 0)} Bilder${deriv ? `, ${deriv} Derivate erzeugt` : ""}, dist/ geschrieben`);
}

main().catch(e => { console.error(e); fail(e.message); });
