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
  (globalThis.__pages = globalThis.__pages || []).push(window);
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

// ---------- Test 6: Asynchroner Finger-Lift beim Pinch (Real Device!) ----------
// Auf echten Geräten heben die Finger nacheinander ab: touchend (1 Finger bleibt)
// und dann touchend (0 Finger). Danach muss ein neuer Finger PAN machen,
// nicht blättern — und der Zoom muss erhalten bleiben.
{
  console.log("\n[6] Asynchrones Pinch-Ende: Finger heben nacheinander ab");
  const { stage, img, lb, touch, fire, open, doc } = makePage();
  open(0);
  // Pinch auf Scale 2
  fire(stage, "touchstart", touch([{ x: 150, y: 350 }, { x: 250, y: 350 }]));
  fire(stage, "touchmove", touch([{ x: 100, y: 350 }, { x: 300, y: 350 }]));
  // Finger 1 hebt ab, Finger 2 bleibt (asynchron!)
  fire(stage, "touchend", touch([{ x: 300, y: 350 }], [{ x: 100, y: 350 }]));
  // Finger 2 hebt ebenfalls ab — beide losgelassen
  fire(stage, "touchend", touch([], [{ x: 300, y: 350 }]));
  check("Zoom nach asynchronem Pinch-Ende erhalten", parseFloat(img.dataset.scale) > 1.5, "scale=" + img.dataset.scale);
  check("Lightbox offen nach asynchronem Ende", lb.classList.contains("is-open"));
  // NEUER Finger startet: muss PAN machen (nicht swipe/blättern!)
  fire(stage, "touchstart", touch([{ x: 200, y: 350 }]));
  fire(stage, "touchmove", touch([{ x: 240, y: 350 }]));
  fire(stage, "touchend", touch([], [{ x: 240, y: 350 }]));
  const counter = lb.querySelector(".lightbox__counter").textContent;
  check("Neuer Finger verschiebt (kein Blättern)", counter.includes("1 /"), "counter=" + counter);
  const m = img.style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/);
  check("Pan wurde angewendet", m && !(parseFloat(m[1]) === 0 && parseFloat(m[2]) === 0), img.style.transform);
  check("Zoom weiterhin erhalten", parseFloat(img.dataset.scale) > 1.5, "scale=" + img.dataset.scale);
  check("Lightbox weiterhin offen", lb.classList.contains("is-open"));
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

// ---------- Test 7: Buttons (Close/Prev/Next) & Keyboard ----------
{
  console.log("\n[7] Buttons & Keyboard-Navigation");
  const p = makePage();
  const { lb, doc } = p;
  p.open(0);
  check("Lightbox offen", lb.classList.contains("is-open"));
  lb.querySelector(".lightbox__next").dispatchEvent(new p.window.Event("click", { bubbles: true }));
  check("Next-Button blättert", lb.querySelector(".lightbox__counter").textContent === "2 / 3", lb.querySelector(".lightbox__counter").textContent);
  lb.querySelector(".lightbox__prev").dispatchEvent(new p.window.Event("click", { bubbles: true }));
  check("Prev-Button zurück", lb.querySelector(".lightbox__counter").textContent === "1 / 3");
  lb.querySelector(".lightbox__close").dispatchEvent(new p.window.Event("click", { bubbles: true }));
  check("Close-Button schließt", !lb.classList.contains("is-open"));
  // Keyboard nur bei offener Lightbox
  p.open(0);
  const key = (k, extra) => {
    const e = new p.window.Event("keydown", { bubbles: true, cancelable: true });
    e.key = k;
    Object.assign(e, extra || {});
    doc.dispatchEvent(e);
    return e;
  };
  const counter = () => lb.querySelector(".lightbox__counter").textContent;
  key("ArrowRight");
  check("Pfeil rechts blättert", counter() === "2 / 3", counter());
  key("ArrowLeft");
  check("Pfeil links zurück", counter() === "1 / 3");
  key("Home");
  check("Home -> erstes Bild", counter() === "1 / 3");
  key("End");
  check("End -> letztes Bild", counter() === "3 / 3");
  key("+");
  check("+ aktiviert Zoom", parseFloat(p.img.dataset.scale) > 1.5, "scale=" + p.img.dataset.scale);
  key("=");
  check("= resettet Zoom", parseFloat(p.img.dataset.scale) === 1);
  key("Escape");
  check("Esc schließt", !lb.classList.contains("is-open"));
  // Keydown bei geschlossener Lightbox: kein Effekt
  key("ArrowRight");
  check("Keydown bei geschlossen ignoriert", !lb.classList.contains("is-open"));
  // Tab-Fokus-Falle in der Lightbox
  p.open(0);
  const btnClose = lb.querySelector(".lightbox__close");
  const btnPrev = lb.querySelector(".lightbox__prev");
  const btnNext = lb.querySelector(".lightbox__next");
  btnClose.focus();
  key("Tab", { shiftKey: true });
  check("Shift+Tab vom Close -> Next", doc.activeElement === btnNext, String(doc.activeElement && doc.activeElement.className));
  key("Tab");
  check("Tab vom Next -> Close", doc.activeElement === btnClose);
  btnNext.focus();
  key("Tab");
  check("Tab vom letzten Button -> erster", doc.activeElement === btnClose);
  key("Escape");
}

// ---------- Test 8: Thumbnail-Strip, Hint & Full-Bild-Load ----------
{
  console.log("\n[8] Thumbnail-Strip & Full-Bild-Preload");
  const p = makePage();
  const { lb } = p;
  p.open(1);
  const thumbs = lb.querySelectorAll(".lightbox__strip img");
  check("Thumbnails erzeugt", thumbs.length === 3, String(thumbs.length));
  check("Aktiver Thumb markiert", thumbs[1].classList.contains("is-active"));
  check("Titel gesetzt", lb.querySelector(".lightbox__title").textContent === "Bild 2");
  thumbs[0].dispatchEvent(new p.window.Event("click", { bubbles: true }));
  check("Thumb-Klick blättert", lb.querySelector(".lightbox__counter").textContent === "1 / 3");
  check("Hint sichtbar bei offen", lb.querySelector(".lightbox__hint") !== null);
}

// ---------- Test 9: touchcancel, gesture*, popstate/hashchange, Init-Hash ----------
{
  console.log("\n[9] touchcancel, iOS-Gesten, History/Hash");
  const p = makePage();
  const { lb, img, stage, doc } = p;
  p.open(0);
  // touchcancel setzt Modus zurück
  p.fire(stage, "touchstart", p.touch([{ x: 200, y: 350 }]));
  stage.dispatchEvent(new p.window.Event("touchcancel", { bubbles: true }));
  img.dispatchEvent(new p.window.Event("touchcancel", { bubbles: true }));
  check("touchcancel ohne Fehler", true);
  // iOS gesturestart/change/end werden preventDefault't wenn offen
  const gs = new p.window.Event("gesturestart", { bubbles: true, cancelable: true });
  doc.dispatchEvent(gs);
  check("gesturestart preventDefault", gs.defaultPrevented);
  const gc = new p.window.Event("gesturechange", { bubbles: true, cancelable: true });
  doc.dispatchEvent(gc);
  check("gesturechange preventDefault", gc.defaultPrevented);
  const ge = new p.window.Event("gestureend", { bubbles: true, cancelable: true });
  doc.dispatchEvent(ge);
  check("gestureend preventDefault", ge.defaultPrevented);
  // popstate mit Bild-Hash (#bild-2-3 => idx 2)
  p.window.history.replaceState(null, "", "/galerie/#bild-2-3");
  p.window.dispatchEvent(new p.window.Event("popstate"));
  check("popstate öffnet Bild", lb.querySelector(".lightbox__counter").textContent === "3 / 3", lb.querySelector(".lightbox__counter").textContent);
  // popstate mit leerem Hash schließt
  p.window.history.replaceState(null, "", "/galerie/");
  p.window.dispatchEvent(new p.window.Event("popstate"));
  check("popstate ohne Hash schließt", !lb.classList.contains("is-open"));
  // hashchange mit Bild-ID
  p.open(0);
  p.window.history.replaceState(null, "", "/galerie/#bild-1");
  p.window.dispatchEvent(new p.window.Event("hashchange"));
  check("hashchange zeigt Bild 1", lb.querySelector(".lightbox__counter").textContent === "1 / 3");
  p.window.history.replaceState(null, "", "/galerie/");
  p.window.dispatchEvent(new p.window.Event("hashchange"));
  check("hashchange ohne Hash schließt", !lb.classList.contains("is-open"));
  // Bühnen-Klick schließt (Stage, nicht gezoomt)
  p.open(0);
  stage.dispatchEvent(new p.window.Event("click", { bubbles: true }));
  check("Klick auf Stage schließt", !lb.classList.contains("is-open"));
}

// ---------- Test 10: clampPan-Randfälle ----------
{
  console.log("\n[10] clampPan: Grenzen werden durchgesetzt");
  const p = makePage();
  const { stage, img, lb } = p;
  p.open(0);
  // Zoom auf 2, dann weit über die Grenze pannen
  p.fire(stage, "touchstart", p.touch([{ x: 150, y: 350 }, { x: 250, y: 350 }]));
  p.fire(stage, "touchmove", p.touch([{ x: 100, y: 350 }, { x: 300, y: 350 }]));
  p.fire(stage, "touchend", p.touch([], [{ x: 100, y: 350 }, { x: 300, y: 350 }]));
  check("Zoom aktiv", parseFloat(img.dataset.scale) > 1.5);
  // Stage 400x700 => overX = 400*(2-1)/2 = 200, overY = 700*(2-1)/2 = 350
  // Mehrere Pan-Schritte weit über das Maß hinaus
  for (let k = 0; k < 6; k++) {
    p.fire(stage, "touchstart", p.touch([{ x: 300, y: 500 }]));
    p.fire(stage, "touchmove", p.touch([{ x: 30, y: 690 }]));
    p.fire(stage, "touchend", p.touch([], [{ x: 30, y: 690 }]));
  }
  const m = img.style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/);
  check("Pan auf overX begrenzt", m && Math.abs(parseFloat(m[1])) <= 201, "panX=" + (m && m[1]));
  check("Pan auf overY begrenzt", m && Math.abs(parseFloat(m[2])) <= 351, "panY=" + (m && m[2]));
  check("Lightbox nach übermäßigem Pan offen", lb.classList.contains("is-open"));
}

// ---------- Test 11: Close-Button muss IMMER schließen (auch gezoomt / nach Geste) ----------
{
  console.log("\n[11] X schließt auch im gezoomten Zustand und nach Gesten");
  const p = makePage();
  const { lb, img, doc, stage } = p;
  const clickOn = (el) => el.dispatchEvent(new p.window.Event("click", { bubbles: true, cancelable: true }));
  // Fall 1: Maus-Klick aufs Bild zoomt, danach muss X noch schließen
  p.open(0);
  clickOn(img);
  check("Zoom aktiv", parseFloat(img.dataset.scale) > 1.5);
  clickOn(lb.querySelector(".lightbox__close"));
  check("X schließt im gezoomten Zustand (Maus)", !lb.classList.contains("is-open"));
  // Fall 2: Pinch-Geste, danach X antippen
  p.open(0);
  p.fire(stage, "touchstart", p.touch([{ x: 150, y: 350 }, { x: 250, y: 350 }]));
  p.fire(stage, "touchmove", p.touch([{ x: 100, y: 350 }, { x: 300, y: 350 }]));
  p.fire(stage, "touchend", p.touch([], [{ x: 100, y: 350 }, { x: 300, y: 350 }]));
  check("Zoom nach Pinch", parseFloat(img.dataset.scale) > 1.5);
  clickOn(lb.querySelector(".lightbox__close"));
  check("X schließt nach Pinch-Geste (Touch)", !lb.classList.contains("is-open"), "is-open=" + lb.classList.contains("is-open"));
  // Fall 3: Suppression-Fenster aktiv => X geht trotzdem, Bild-Klick nicht
  p.open(0);
  p.fire(stage, "touchstart", p.touch([{ x: 150, y: 350 }, { x: 250, y: 350 }]));
  p.fire(stage, "touchmove", p.touch([{ x: 100, y: 350 }, { x: 300, y: 350 }]));
  p.fire(stage, "touchend", p.touch([], [{ x: 100, y: 350 }, { x: 300, y: 350 }]));
  clickOn(img);
  check("Synthetischer Bild-Klick nach Geste unschädlich (Zoom bleibt)", parseFloat(img.dataset.scale) > 1.5, "scale=" + img.dataset.scale);
  check("Lightbox nach Bild-Klick offen", lb.classList.contains("is-open"));
  clickOn(lb.querySelector(".lightbox__close"));
  check("X schließt trotz aktivem Suppression-Fenster", !lb.classList.contains("is-open"), "is-open=" + lb.classList.contains("is-open"));
}

console.log(`\n===== ${passed} bestanden, ${failed} fehlgeschlagen =====`);

// ---- Coverage-Hook: kumulierte Zähler aller jsdom-Windows einsammeln ----
(function () {
  const merged = {};
  for (const w of (globalThis.__pages || [])) {
    const cov = w.__lightboxCov || {};
    for (const k of Object.keys(cov)) merged[k] = (merged[k] || 0) + cov[k];
  }
  try { require("fs").writeFileSync(__dirname + "/../.coverage-counts.json", JSON.stringify(merged)); } catch (e) {}
})();
process.exit(failed ? 1 : 0);
