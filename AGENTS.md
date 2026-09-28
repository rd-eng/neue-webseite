# AGENTS.md — Hinweise für Coding-Agenten (Mensch & KI)

## Projekt

Statische Foto-Portfolio-Website (Robin Engel · Fotokunst), Ersatz für robinengel.de.
Kein Framework, kein Build-Tooling außer eigenen Node-Skripten.

## Befehle

| Befehl | Zweck |
|---|---|
| `npm test` | Lightbox-Test-Suite (jsdom, muss immer grün sein) |
| `npm run build` | Seite nach `dist/` bauen |
| `npm run check` | Build-Validierung ohne dist zu schreiben |
| `npm run dev` | lokaler Server `http://localhost:4173` |
| `node tools/new-gallery.mjs <name> [layout] [titel]` | neue Galerie anlegen |

## Verpflichtende Regeln

1. **`npm test` muss vor jedem Commit/Deploy grün sein.** Die Tests liegen in
   `tests/lightbox.test.js` und simulieren echte Touch-Gesten-Sequenzen im DOM.
   CI (`.github/workflows/deploy.yml`) führt sie bei jedem Push aus — ein roter
   Test blockiert den Deploy.

2. **Touch-Gesten der Lightbox dürfen nicht brechen.** Die Lightbox
   (`assets/js/lightbox.js`) muss **dauerhaft** alle folgenden Verhalten
   gewährleisten (Test 1–5 in der Suite decken das ab):
   - Pinch-Zoom (2 Finger, 1×–4×) um den Finger-Mittelpunkt, Anker bleibt fixiert
   - Nach Gesten-Ende dürfen **synthetische Click-Events** die Lightbox weder
     schließen noch den Zoom resetten (`suppressClickUntil`-Mechanismus)
   - **Asynchroner Finger-Lift**: Auf echten Geräten heben die Finger beim
     Pinch NACHEINANDER ab. Die Wahrheitsquelle für „gezoomt" ist daher immer
     `isZoomed()` (der tatsächliche Scale), NIE das `zoomed`-Flag allein —
     sonst wertet ein neuer Finger den Zustand als „nicht gezoomt" und
     blättert statt zu verschieben (Test 6).
   - Pan im Zoom verschiebt das Bild **1:1 mit dem Finger** (Transform-Modell:
     `translate(pan) scale(s)`, Ursprung fix 50%/50% — nicht ändern!)
   - Pinch-Ende mit einem verbleibenden Finger geht nahtlos in Pan über
   - Wisch-Blättern (1 Finger, kein Zoom) und Wisch-unten-Schließen nur ohne Zoom
   - Maus-Klick aufs Bild toggelt Zoom weiterhin normal

3. **Bei Änderungen an der Lightbox:** neue Verhalten zuerst als Test in
   `tests/lightbox.test.js` festschreiben (jsdom-Simulation), dann implementieren.
   Bei einem Bug: zuerst einen Test schreiben, der den Bug reproduziert
   (rot), dann fixen (grün) — so bleibt das Verhalten dauerhaft verifiziert.

4. **Layouts:** pro Galerie in `gallery/<name>/gallery.json` konfigurierbar
   (`masonry`, `grid`, `rows`, `featured`) plus `theme: light|dark`.
   Bilder: `01-titel.jpg`, `02-titel.jpg`, … (Nummer = Reihenfolge).

6. **Coverage-Ratchet:** `npm run coverage` (`tools/coverage.mjs`) muss bei
   jedem Commit grün sein. Erzwingt zweierlei:
   - Mindestens **95 %** Statement-Abdeckung in `assets/js/lightbox.js`
   - Coverage darf **nie sinken**: der Floor in `.coverage-floor.json`
     (aktuell 96.19 %) ist die Untergrenze. Nach neuen Tests mit
     `node tools/coverage.mjs --update-floor` hochsetzen und committen.
   CI führt den Check bei jedem Push aus (eigener Workflow-Step). Wenn ein
   Ratchet einen Change blockiert: zuerst die fehlenden Tests ergänzen,
   nicht den Floor senken.
7. **Testing-Agent / Skill:** Bei JEDER Änderung an `assets/js/`, `tools/`
   oder `tests/` vor dem Commit verpflichtend ausführen (entspricht einem
   viel benutzten Testing-Skill):
   1. `npm test` → alle Tests grün
   2. `npm run coverage` → Schwelle erfüllt, Coverage nicht gesunken
   3. Bei neuem Verhalten: zuerst Test schreiben (rot), dann fixen (grün),
      dann Floor updaten
   Nur wenn beides grün ist, gilt ein Change als fertig.
5. **Deploy:** GitHub Pages, Workflow baut bei Push auf `main` mit
   `BASE_PATH=/neue-webseite`. Für Custom Domain (robinengel.de) BASE_PATH
   entfernen.

## Architektur-Kontext (warum die Touch-Logik so ist)

- Der Transform ist bewusst `translate(pan) scale(s)` mit fixem Ursprung:
  translate VOR scale => Pan in Screen-Pixeln (1:1 mit dem Finger);
  würde scale zuerst angewendet, multipliciert der Zoomfaktor die Pan-Bewegung.
- `transform-origin` darf **nie** während der Geste geändert werden:
  Origin-Änderungen werden vom Browser nicht animiert => sichtbare Sprünge
  beim Rückzoomen. Pinch-Ankerung läuft stattdessen über Pan-Kompensation.
- Browser feuern nach Touch-Gesten oft synthetische Click-Events; ohne
  `suppressClickUntil` würden diese toggleZoom/close triggern.
- touchend-Sequenzen auf echten Geräten sind asynchron (Finger heben
  nacheinander ab). jsdom-Tests müssen diese Sequenz explizit simulieren
  (touchend mit 1 verbleibenden Finger, dann touchend mit 0) — ein Test,
  der beide Finger simultan hebt, deckt den realen Bug NICHT ab.
