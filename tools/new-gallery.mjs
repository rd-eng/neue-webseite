#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const [, , cmd, ...args] = process.argv;

function usage() {
  console.log(`Verwendung:
  node tools/new-gallery.mjs <name> [layout] [titel]

Beispiele:
  node tools/new-gallery.mjs landschaften
  node tools/new-gallery.mjs landschaften featured "Meine Landschaften"

Layouts: masonry (Standard) | grid | rows | featured
Danach Bilder in gallery/<name>/ ablegen und 'npm run build' ausführen.`);
  process.exit(1);
}

function slugify(s) {
  return s.toLowerCase().replace(/[äöüß]/g, c => ({ "ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss" }[c])).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "galerie";
}

if (!cmd || cmd === "-h" || cmd === "--help") usage();

const layouts = ["masonry", "grid", "rows", "featured"];
const layout = layouts.includes(args[0]) ? args[0] : "masonry";
const titleArg = layouts.includes(args[0]) ? args[1] : args[0];
const name = slugify(cmd);
const title = titleArg || cmd.replace(/[-_]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());

const dir = path.join("gallery", name);
if (fs.existsSync(dir)) {
  console.error(`Galerie "${name}" existiert bereits: ${dir}`);
  process.exit(1);
}

fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "gallery.json"), JSON.stringify({
  title,
  subtitle: "",
  description: "",
  layout,
  theme: "light",
}, null, 2) + "\n");

console.log(`Galerie "${title}" angelegt: ${dir}/
Layout: ${layout}
Nächste Schritte:
  1. Bilder nach ${dir}/ kopieren (Namensformat: 01-titel.jpg, 02-titel.jpg, …)
  2. npm run build
  3. Fertig — die Galerie erscheint automatisch in der Navigation.`);
