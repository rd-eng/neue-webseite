// Tests für die Lightbox-Touch-Logik (Gesten-Konflikte).
// Läuft mit: npm test  (benötigt jsdom, nur devDependency)
// Simuliert echte touchstart/touchmove/touchend/click-Sequenzen gegen die
// echte lightbox.js im DOM und verifiziert die Invarianten:
//   1. Nach Pinch-Zoom darf kein synthetischer Click die Box schließen/Zoom resetten.
//   2. Pan im Zoom verschiebt 1:1 (translate in Screen-Pixeln, unabhängig vom Scale).
//   3. Pinch-Ende mit verbleibendem Finger geht nahtlos in Pan über (Zoom bleibt).
//   4. Wischen ohne Zoom blättert; nach unten wischen schließt.
//   5. Maus-Klick aufs Bild toggelt Zoom weiterhin (kein Touch-Suppress für echte Klicks).
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const lbSrc = fs.readFileSync(path.join(__dirname, "..", "assets", "js", "lightbox.js"), "utf8");

function makePage() {
  const dom = new JSDOM(`<!doctype html><html><body>
    <section class="gallery">
      ${[1, 2, 3].map(i => `
        <figure class="ph" data-full="img${i}.jpg" data-title="Bild ${i}" id="bild-${i}">
          <a href="#bild-${i}" class="ph-link"><img src="t${i}.jpg" alt=""></a>
        </figure>`).join("")}
    </section>
  </body></html>`, { runScripts: "outside-only", pretendToBeVisual: true, url: "https://example.test/galerie/" });
  const { window } = dom;
  window.eval(lbSrc);
  const doc = window.document;
  const lb = doc.querySelector(".lightbox");
  const stage = lb.querySelector(".lightbox__stage");
  const img = lb.querySelector(".lightbox__img");
  function touch(t, rects) {
    return { touches: t.map(p => ({ clientX: p.x, clientY: p.y, target: img })), ...rects };
  }
  function fire(el, type, ev) {
    const e = new window.Event(type, { bubbles: true, cancelable: true });
    Object.assign(e, ev);
    Object.defineProperty(e, "touches", { get: () => ev.touches || [] });
    Object.defineProperty(e, "changedTouches", { get: () => ev.changedTouches || ev.touches || [] });
    el.dispatchEvent(e);
    return e;
  }
  const open = i => {
    const fig = doc.querySelectorAll(".ph")[i];
    fig.querySelector(".ph-link").dispatchEvent(new window.Event("click", { bubbles: true, cancelable: true }));
  };
  // Stage-Geometrie festnageln (jsdom hat kein Layout)
  stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 700, right: 400, bottom: 700 });
  img.getBoundingClientRect = () => ({ left: 100, top: 200, width: 200, height: 300, right: 300, bottom: 500 });
  return { window, doc, lb, stage, img, touch, fire, open };
}

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log("  ✓ " + name); }
  else { failed++; console.log("  ✗ " + name + (detail ? " — " + detail : "")); }
}

// ---------- Test 1: Pinch-Zoom, loslassen, dann Verschieben ----------
{
  console.log("\n[1] Pinch-Zoom → loslassen → Pan: Lightbox bleibt offen, Zoom bleibt");
  const { stage, img, lb, touch, fire, open } = makePage();
  open(0);
  check("Lightbox offen nach Klick", lb.classList.contains("is-open"));
  // Pinch: 2 Finger von 100px Abstand auf 200px Abstand => Scale 2
  fire(stage, "touchstart", touch([{ x: 150, y: 350 }, { x: 250, y: 350 }]));
  fire(stage, "touchmove", touch([{ x: 100, y: 350 }, { x: 300, y: 350 }]));
  fire(stage, "touchend", touch([], [{ x: 100, y: 350 }, { x: 300, y: 350 }]));
  check("Zoom aktiv nach Pinch (scale ~2)", parseFloat(img.dataset.scale) > 1.5, "scale=" + img.dataset.scale);
  check("Lightbox noch offen", lb.classList.contains("is-open"));
  // Synthetisierter Click (Browser feuert nach Touch-Ende einen Click aufs Bild)
  const click = new (lb.ownerDocument.defaultView.Event)("click", { bubbles: true, cancelable: true });
  img.dispatchEvent(click);
  check("Zoom nach synthetischem Click erhalten", parseFloat(img.dataset.scale) > 1.5, "scale=" + img.dataset.scale);
  check("Lightbox nach synthetischem Click offen", lb.classList.contains("is-open"));
  // Jetzt mit 1 Finger verschieben
  fire(stage, "touchstart", touch([{ x: 200, y: 350 }]));
  fire(stage, "touchmove", touch([{ x: 230, y: 350 }]));
  fire(stage, "touchend", touch([], [{ x: 230, y: 350 }]));
  check("Pan akkumuliert (Bild verschoben)", img.style.transform.includes("translate"), img.style.transform);
  check("Zoom beim Pan erhalten", parseFloat(img.dataset.scale) > 1.5, "scale=" + img.dataset.scale);
  check("Lightbox nach Pan offen", lb.classList.contains("is-open"));
}

// ---------- Test 2: Pan läuft 1:1 mit dem Finger ----------
{
  console.log("\n[2] Pan-Distanz entspricht Finger-Distanz (Screen-Pixel, unabhängig vom Scale)");
  const { stage, img, touch, fire, open } = makePage();
  open(0);
  fire(stage, "touchstart", touch([{ x: 150, y: 350 }, { x: 250, y: 350 }]));
  fire(stage, "touchmove", touch([{ x: 100, y: 350 }, { x: 300, y: 350 }]));
  fire(stage, "touchend", touch([], [{ x: 100, y: 350 }, { x: 300, y: 350 }]));
  // Pinch-Anker-Kompensation beachten: erste Pan-Position übernehmen
  const startPanX = parseFloat(img.style.transform.match(/translate\((-?[\d.]+)px/)[1]);
  fire(stage, "touchstart", touch([{ x: 200, y: 350 }]));
  fire(stage, "touchmove", touch([{ x: 260, y: 350 }])); // +60px Finger
  fire(stage, "touchend", touch([], [{ x: 260, y: 350 }]));
  const endPanX = parseFloat(img.style.transform.match(/translate\((-?[\d.]+)px/)[1]);
  const delta = endPanX - startPanX;
  check("Finger +60px => Pan ~+60px (nicht skaliert)", Math.abs(delta - 60) < 25, "delta=" + delta.toFixed(1) + "px (inkl. clampPan-Rückfederung)");
}

// ---------- Test 3: Pinch-Ende mit 1 Finger -> nahtloser Pan ----------
{
  console.log("\n[3] Ein Finger beim Pinch-Ende bleibt => nahtloser Pan, Zoom bleibt");
  const { stage, img, lb, touch, fire, open } = makePage();
  open(0);
  fire(stage, "touchstart", touch([{ x: 150, y: 350 }, { x: 250, y: 350 }]));
  fire(stage, "touchmove", touch([{ x: 100, y: 350 }, { x: 300, y: 350 }]));
  // Erster Finger weg, zweiter bleibt
  fire(stage, "touchend", touch([{ x: 300, y: 350 }], [{ x: 100, y: 350 }]));
  fire(stage, "touchmove", touch([{ x: 340, y: 350 }]));
  fire(stage, "touchend", touch([], [{ x: 340, y: 350 }]));
  check("Zoom nach Fingerwechsel erhalten", parseFloat(img.dataset.scale) > 1.5, "scale=" + img.dataset.scale);
  check("Lightbox offen", lb.classList.contains("is-open"));
  check("Pan hat stattgefunden", img.style.transform.includes("translate"), img.style.transform);
}

// ---------- Test 4: Wischen ohne Zoom blättert, unten schließen ----------
{
  console.log("\n[4] Wisch-Blättern & Schließen nur ohne Zoom");
  const { stage, lb, touch, fire, open, doc } = makePage();
  open(0);
  const t0 = lb.querySelector(".lightbox__counter").textContent;
  fire(stage, "touchstart", touch([{ x: 200, y: 350 }]));
  fire(stage, "touchmove", touch([{ x: 100, y: 350 }])); // 100px nach links
  fire(stage, "touchend", touch([], [{ x: 100, y: 350 }]));
  const t1 = lb.querySelector(".lightbox__counter").textContent;
  check("Wisch links blättert", t0 !== t1, t0 + " -> " + t1);
  fire(stage, "touchstart", touch([{ x: 200, y: 300 }]));
  fire(stage, "touchmove", touch([{ x: 200, y: 420 }])); // 120px nach unten
  fire(stage, "touchend", touch([], [{ x: 200, y: 420 }]));
  check("Wisch unten schließt", !lb.classList.contains("is-open"));
}

// ---------- Test 5: Echter Mausklick toggelt Zoom weiter ----------
{
  console.log("\n[5] Mausklick aufs Bild toggelt Zoom (Suppression betrifft nur Touch)");
  const { img, lb, open } = makePage();
  open(0);
  img.dispatchEvent(new (lb.ownerDocument.defaultView.Event)("click", { bubbles: true }));
  check("Klick aktiviert Zoom", parseFloat(img.dataset.scale) > 1.5, "scale=" + img.dataset.scale);
  img.dispatchEvent(new (lb.ownerDocument.defaultView.Event)("click", { bubbles: true }));
  check("Zweiter Klick resettet Zoom", parseFloat(img.dataset.scale) === 1, "scale=" + img.dataset.scale);
}

console.log(`\n===== ${passed} bestanden, ${failed} fehlgeschlagen =====`);
process.exit(failed ? 1 : 0);
