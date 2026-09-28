(function () {
  "use strict";

  var galleryEl = document.querySelector(".gallery");
  if (!galleryEl) return;

  var items = Array.prototype.slice.call(galleryEl.querySelectorAll(".ph"));
  if (!items.length) return;

  var lb = document.createElement("div");
  lb.className = "lightbox";
  lb.setAttribute("role", "dialog");
  lb.setAttribute("aria-modal", "true");
  lb.setAttribute("aria-label", "Bild-Detailansicht");
  lb.innerHTML =
    '<div class="lightbox__stage">' +
      '<img class="lightbox__img" alt="">' +
      '<div class="lightbox__title"></div>' +
      '<div class="lightbox__counter"></div>' +
      '<button class="lightbox__close" aria-label="Schließen">✕</button>' +
      '<button class="lightbox__prev" aria-label="Vorheriges Bild">‹</button>' +
      '<button class="lightbox__next" aria-label="Nächstes Bild">›</button>' +
      '<button class="lightbox__zoom" aria-label="Zoom umschalten">＋</button>' +
      '<div class="lightbox__hint">← → zum Blättern · Esc zum Schließen</div>' +
    "</div>" +
    '<div class="lightbox__strip" role="listbox" aria-label="Vorschaubilder"></div>';
  document.body.appendChild(lb);

  var stage = lb.querySelector(".lightbox__stage");
  var imgEl = lb.querySelector(".lightbox__img");
  var titleEl = lb.querySelector(".lightbox__title");
  var counterEl = lb.querySelector(".lightbox__counter");
  var strip = lb.querySelector(".lightbox__strip");
  var btnClose = lb.querySelector(".lightbox__close");
  var btnPrev = lb.querySelector(".lightbox__prev");
  var btnNext = lb.querySelector(".lightbox__next");
  var btnZoom = lb.querySelector(".lightbox__zoom");

  var current = -1;
  var zoomed = false;
  var lastFocus = null;
  var hint = lb.querySelector(".lightbox__hint");

  items.forEach(function (it, i) {
    var t = document.createElement("img");
    var src = it.querySelector("img");
    if (src) { t.src = src.currentSrc || src.src; t.alt = ""; }
    t.addEventListener("click", function () { show(i); });
    strip.appendChild(t);
  });
  var thumbs = Array.prototype.slice.call(strip.children);

  var token = 0;

  function show(i, pushState) {
    current = (i + items.length) % items.length;
    var my = ++token;
    var f = items[current];
    var full = f.getAttribute("data-full") || "";
    var title = f.getAttribute("data-title") || "";
    var thumbNode = f.querySelector("img");
    var thumbSrc = thumbNode ? (thumbNode.currentSrc || thumbNode.src) : full;
    resetZoom();
    imgEl.src = thumbSrc;
    imgEl.alt = title;
    var pre = new Image();
    pre.onload = function () { if (my === token) imgEl.src = full; };
    pre.onerror = function () { if (my === token) imgEl.src = full; };
    pre.src = full;
    titleEl.textContent = title;
    counterEl.textContent = (current + 1) + " / " + items.length;
    thumbs.forEach(function (t, j) { t.classList.toggle("is-active", j === current); });
    var active = thumbs[current];
    if (active && active.scrollIntoView) active.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    if (!lb.classList.contains("is-open")) {
      lastFocus = document.activeElement;
      lb.classList.add("is-open");
      document.body.style.overflow = "hidden";
      btnClose.focus();
      if (hint) { hint.style.animation = "none"; void hint.offsetWidth; hint.style.animation = ""; }
    }
    var hash = f.id ? "#" + f.id : "";
    if (pushState !== false) {
      try { history.replaceState(null, "", location.pathname + hash); } catch (e) {}
    }
  }

  function close(pushState) {
    if (!lb.classList.contains("is-open")) return;
    lb.classList.remove("is-open");
    document.body.style.overflow = "";
    resetZoom();
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    if (pushState !== false) {
      try { history.replaceState(null, "", location.pathname); } catch (e) {}
    }
  }

  function toggleZoom() {
    if (zoomed) { resetZoom(); }
    else {
      zoomed = true;
      imgEl.dataset.scale = "2.2";
      touch.panX = 0; touch.panY = 0;
      imgEl.style.transition = "transform .25s ease";
      applyTransform();
      setTimeout(function () { imgEl.style.transition = ""; }, 260);
    }
  }

  galleryEl.addEventListener("click", function (ev) {
    var link = ev.target.closest ? ev.target.closest(".ph-link") : null;
    if (!link) return;
    ev.preventDefault();
    var f = link.closest(".ph");
    show(items.indexOf(f));
  });

  btnClose.addEventListener("click", function () { close(); });
  btnPrev.addEventListener("click", function () { show(current - 1); });
  btnNext.addEventListener("click", function () { show(current + 1); });
  btnZoom.addEventListener("click", toggleZoom);
  imgEl.addEventListener("click", toggleZoom);

  document.addEventListener("keydown", function (ev) {
    if (!lb.classList.contains("is-open")) return;
    switch (ev.key) {
      case "Escape": close(); break;
      case "ArrowLeft": ev.preventDefault(); show(current - 1); break;
      case "ArrowRight": ev.preventDefault(); show(current + 1); break;
      case "Home": show(0); break;
      case "End": show(items.length - 1); break;
      case "+": case "=": toggleZoom(); break;
      case "Tab":
        var f = [btnClose, btnPrev, btnNext, btnZoom];
        var idx = f.indexOf(document.activeElement);
        if (!ev.shiftKey && idx === f.length - 1) { ev.preventDefault(); f[0].focus(); }
        else if (ev.shiftKey && idx <= 0) { ev.preventDefault(); f[f.length - 1].focus(); }
        break;
    }
  });

  lb.addEventListener("click", function (ev) { if (ev.target === stage && !zoomed) close(); });

  stage.addEventListener("click", function (ev) { if (ev.target === stage && !zoomed) close(); });

  lb.addEventListener("click", function (ev) {
    if (Date.now() < suppressClickUntil) { ev.stopPropagation(); ev.preventDefault(); }
  }, true);

  // ---------- Touch: Pinch-Zoom, Pan im Zoom, Wischen nur ohne Zoom ----------
  // Modell: transform = translate(panX, panY) scale(s), Ursprung fix 50%/50%.
  // translate VOR scale => Pan läuft 1:1 mit dem Finger (Screen-Pixel).
  var touch = { mode: null, x1: 0, y1: 0, x2: 0, y2: 0, dist: 0, scale: 1, panX: 0, panY: 0 };
  var suppressClickUntil = 0;

  // Wahrheitsquelle für "gezoomt" ist immer der tatsächliche Scale,
  // nicht das zoomed-Flag (Finger heben auf echten Geräten asynchron ab,
  // dadurch kann der Pinch-Ende-Zweig mit zoomed=true übersprungen werden).
  function isZoomed() {
    return (parseFloat(imgEl.dataset.scale || "1") || 1) > 1.05;
  }

  function dist(t) {
    var dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function applyTransform() {
    var s = parseFloat(imgEl.dataset.scale || "1") || 1;
    imgEl.style.transformOrigin = "50% 50%";
    imgEl.style.transform = "translate(" + touch.panX + "px, " + touch.panY + "px) scale(" + s + ")";
  }

  stage.addEventListener("touchstart", function (ev) {
    if (ev.touches.length === 1) {
      touch.mode = isZoomed() ? "pan" : "swipe";
      touch.x1 = ev.touches[0].clientX;
      touch.y1 = ev.touches[0].clientY;
      touch.x2 = touch.x1; touch.y2 = touch.y1;
      touch.moved = false;
    } else if (ev.touches.length === 2) {
      touch.mode = "pinch";
      touch.dist = dist(ev.touches);
      touch.startScale = parseFloat(imgEl.dataset.scale || "1") || 1;
      touch.startPanX = touch.panX;
      touch.startPanY = touch.panY;
      touch.px = (ev.touches[0].clientX + ev.touches[1].clientX) / 2;
      touch.py = (ev.touches[0].clientY + ev.touches[1].clientY) / 2;
      if (navigator.vibrate) navigator.vibrate(10);
    }
  }, { passive: true });

  stage.addEventListener("touchmove", function (ev) {
    if (!touch.mode) return;
    if (touch.mode === "pinch" && ev.touches.length === 2) {
      ev.preventDefault();
      var d = dist(ev.touches) / touch.dist;
      var s = Math.min(4, Math.max(1, touch.startScale * d));
      // Punkt unter dem Finger-Mittelpunkt fixiert halten:
      // Anpassung von pan, damit der Anker trotz scale-Änderung ortsfest bleibt.
      var cx = (ev.touches[0].clientX + ev.touches[1].clientX) / 2;
      var cy = (ev.touches[0].clientY + ev.touches[1].clientY) / 2;
      var stageR = stage.getBoundingClientRect();
      // Bildschirm-Mittelpunkt relativ zum Finger-Anker bei Start:
      var ax = touch.px - stageR.left - stageR.width / 2 - touch.startPanX;
      var ay = touch.py - stageR.top - stageR.height / 2 - touch.startPanY;
      var bx = cx - stageR.left - stageR.width / 2 - touch.startPanX;
      var by = cy - stageR.top - stageR.height / 2 - touch.startPanY;
      // Bildpunkt unter dem Anker: p = (anchor - center - startPan) / startScale
      var px0 = ax / touch.startScale;
      var py0 = ay / touch.startScale;
      touch.panX = touch.startPanX + (bx / s - px0) * s;
      touch.panY = touch.startPanY + (by / s - py0) * s;
      imgEl.dataset.scale = String(s);
      applyTransform();
    } else if (touch.mode === "pan" && ev.touches.length === 1) {
      ev.preventDefault();
      touch.x2 = ev.touches[0].clientX;
      touch.y2 = ev.touches[0].clientY;
      var dx = touch.x2 - touch.x1, dy = touch.y2 - touch.y1;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) touch.moved = true;
      touch.panX += dx; touch.panY += dy;
      touch.x1 = touch.x2; touch.y1 = touch.y2;
      applyTransform();
    } else if (touch.mode === "swipe" && ev.touches.length === 1) {
      touch.x2 = ev.touches[0].clientX;
      touch.y2 = ev.touches[0].clientY;
      if (Math.abs(touch.x2 - touch.x1) > 10 || Math.abs(touch.y2 - touch.y1) > 10) touch.moved = true;
    }
  }, { passive: false });

  stage.addEventListener("touchend", function (ev) {
    if (touch.mode === "pinch") {
      if (ev.touches.length === 0) {
        if (isZoomed()) { zoomed = true; clampPan(); } else resetZoom();
        suppressClickUntil = Date.now() + 600;
        touch.mode = null;
      } else if (ev.touches.length === 1) {
        // Ein Finger bleibt: nahtlos in Pan übergehen.
        // Auf echten Geräten wird der zweite touchend oft NACH diesem
        // Zweig gefeuert — zoomed hier sofort synchron halten.
        zoomed = isZoomed();
        touch.mode = "pan";
        touch.fromPinch = true;
        touch.x1 = ev.touches[0].clientX;
        touch.y1 = ev.touches[0].clientY;
        touch.moved = true;
      }
      return;
    }
    if (touch.mode === "pan" && ev.touches.length === 0) {
      // Pan-Ende nach Pinch-Fingerwechsel: zoomed ist bereits synchron,
      // hier nur noch clampen — kein toggleZoom (Finger kam vom Pinch).
      if (!touch.moved && ev.target === imgEl && !touch.fromPinch) toggleZoom();
      zoomed = isZoomed();
      clampPan();
      suppressClickUntil = Date.now() + 600;
      touch.mode = null;
      touch.fromPinch = false;
      return;
    }
    if (touch.mode === "swipe" && ev.touches.length === 0) {
      var dx = touch.x2 - touch.x1, dy = touch.y2 - touch.y1;
      var wasMoved = touch.moved;
      touch.mode = null;
      if (wasMoved) suppressClickUntil = Date.now() + 600;
      if (touch.moved === false) return;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) show(current + 1); else show(current - 1);
      } else if (dy > 80 && Math.abs(dy) > Math.abs(dx)) {
        close();
      }
    }
  }, { passive: true });

  function panBounds() {
    var s = parseFloat(imgEl.dataset.scale || "1") || 1;
    var stageR = stage.getBoundingClientRect();
    var overX = Math.max(0, (stageR.width * (s - 1)) / 2);
    var overY = Math.max(0, (stageR.height * (s - 1)) / 2);
    return { x: overX, y: overY };
  }

  function clampPan() {
    var s = parseFloat(imgEl.dataset.scale || "1") || 1;
    if (s <= 1) { touch.panX = 0; touch.panY = 0; applyTransform(); return; }
    var b = panBounds();
    var nx = Math.min(b.x, Math.max(-b.x, touch.panX));
    var ny = Math.min(b.y, Math.max(-b.y, touch.panY));
    if (nx === touch.panX && ny === touch.panY) return;
    touch.panX = nx; touch.panY = ny;
    imgEl.style.transition = "transform .2s ease";
    applyTransform();
    setTimeout(function () { imgEl.style.transition = ""; }, 220);
  }

  function resetZoom() {
    zoomed = false;
    imgEl.dataset.scale = "1";
    touch.panX = 0; touch.panY = 0;
    imgEl.style.transition = "transform .25s ease";
    applyTransform();
    setTimeout(function () { imgEl.style.transition = ""; }, 260);
  }

  imgEl.addEventListener("touchcancel", function () { touch.mode = null; }, { passive: true });
  stage.addEventListener("touchcancel", function () { touch.mode = null; }, { passive: true });

  document.addEventListener("gesturestart", function (ev) { if (lb.classList.contains("is-open")) ev.preventDefault(); }, { passive: false });
  document.addEventListener("gesturechange", function (ev) { if (lb.classList.contains("is-open")) ev.preventDefault(); }, { passive: false });
  document.addEventListener("gestureend", function (ev) { if (lb.classList.contains("is-open")) ev.preventDefault(); }, { passive: false });


  window.addEventListener("popstate", function () {
    var m = location.hash.match(/^#(.+)-(\d+)$/);
    if (m) {
      var idx = parseInt(m[2], 10) - 1;
      if (items[idx]) show(idx, false);
    } else {
      close(false);
    }
  });

  window.addEventListener("hashchange", function () {
    if (!location.hash) { close(false); return; }
    var f = document.getElementById(location.hash.slice(1));
    if (f && f.classList.contains("ph")) show(items.indexOf(f), false);
  });

  var initial = location.hash ? document.getElementById(location.hash.slice(1)) : null;
  if (initial && initial.classList.contains("ph")) {
    setTimeout(function () { show(items.indexOf(initial), false); }, 60);
  }

  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
})();
