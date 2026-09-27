# Robin Engel · Fotokunst — Neue Website

Statische, schnelle Foto-Portfolio-Website als Ersatz für robinengel.de.
Keine Datenbank, kein CMS-Overhead — Bilder ablegen, bauen, fertig.

## Schnellstart

```bash
npm run build     # baut die Seite nach dist/
npm run dev       # lokaler Testserver auf http://localhost:4173
```

Der `dist/`-Ordner ist komplett eigenständig und kann auf jeden Webserver
gehostet werden (Netlify, Vercel, GitHub Pages, klassisches Webhosting …).

## Bilder hinzufügen (das ganze "System")

1. Bilder in einen Galerie-Ordner legen: `gallery/<name>/`
2. Bilder mit Nummern prefix benennen, um die Reihenfolge zu bestimmen:
   `01-sonnenaufgang.jpg`, `02-nebelschlucht.jpg`, `03-reflexion.jpg`
   (auch `.jpeg`, `.png`, `.webp`, `.avif` möglich)
3. `npm run build`
4. Fertig. Neue Galerie erscheint automatisch auf der Startseite und in der Navigation.

### Neue Galerie anlegen

```bash
node tools/new-gallery.mjs landschaften
node tools/new-gallery.mjs landschaften featured "Meine Landschaften"
```

### Galerie konfigurieren — `gallery/<name>/gallery.json`

```json
{
  "title": "Portfolio",
  "subtitle": "Ausgewählte Arbeiten",
  "description": "Kurzer Text für Suchmaschinen (optional)",
  "layout": "masonry",
  "theme": "light"
}
```

| Feld | Werte | Wirkung |
|---|---|---|
| `layout` | `masonry`, `grid`, `rows`, `featured` | Masonry = Pinterest-Stil (wie jamespopsys.com), Raster = gleichmäßige Kacheln, Zeilen = 2er-Paare untereinander, Feature = großes Hero-Bild + Rest als Raster |
| `theme` | `light`, `dark` | Farbschema der Galerie |
| `title` | Text | Überschrift & Navigation |
| `subtitle` | Text | Untertitel unter der Überschrift |
| `description` | Text | Meta-Description (SEO) |

## Detailansicht (Lightbox)

- Klick auf ein Bild öffnet die große Ansicht
- **← / →** Blättern · **Esc** Schließen · **+** Zoom umschalten · **Home/End** Erstes/Letztes Bild
- Touch: Wischen blättert, nach unten wischen schließt
- Klick auf Hintergrund schließt
- Thumbnail-Leiste unten zum direkten Springen
- Deep-Link: Jedes Bild hat eine eigene URL (`/portfolio/#sonnenaufgang-2`) — verlinkbar und nach dem Reload öffnet sich die Detailansicht wieder

## Struktur

```
gallery/            Deine Bilder, ein Ordner pro Galerie
  <name>/             01-bildname.jpg … + optional gallery.json
assets/            CSS & JS (Lightbox)
partials/          HTML-Template
tools/             build.mjs, serve.mjs, new-gallery.mjs
dist/              Fertige Website (generiert)
```

## Bilder-Optimierung

Wenn `sharp` installiert ist (`npm i sharp`), erzeugt der Build automatisch
WebP-Versionen (720px Thumbnails, 1600px Vollansicht) — deutlich schnellere
Ladezeiten. Ohne sharp werden die Originalbilder verwendet.

## Website-Titel & Kontakt

`site.json` (optional, Werte überschreiben die Defaults):

```json
{
  "name": "Robin Engel",
  "description": "Fotokunst von Robin Engel",
  "baseUrl": "https://robinengel.de",
  "contact": { "email": "kontakt@robinengel.de", "instagram": "https://instagram.com/deinname" }
}
```

## Hinweis zu den Demo-Bildern

Die mitgelieferten SVG-Dateien sind Platzhalter für das Layout-Testing.
Sie können einfach durch echte Fotos ersetzt (gleiche Dateinamen oder eigene +
`npm run build`) oder gelöscht werden.
