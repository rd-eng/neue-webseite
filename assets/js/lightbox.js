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
      applyZoom(2.2, 0, 0, true);
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

  lb.addEventListener("click", function (ev) { if (ev.target === stage) close(); });

  stage.addEventListener("click", function (ev) { if (ev.target === stage) close(); });

  // ---------- Touch: Pinch-Zoom, Pan im Zoom, Wischen nur ohne Zoom ----------
  var touch = { mode: null, x1: 0, y1: 0, x2: 0, y2: 0, dist: 0, scale: 1, panX: 0, panY: 0 };

  function dist(t) {
    var dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  stage.addEventListener("touchstart", function (ev) {
    if (ev.touches.length === 1) {
      touch.mode = zoomed ? "pan" : "swipe";
      touch.x1 = ev.touches[0].clientX;
      touch.y1 = ev.touches[0].clientY;
      touch.x2 = touch.x1; touch.y2 = touch.y1;
      touch.moved = false;
    } else if (ev.touches.length === 2) {
      touch.mode = "pinch";
      touch.dist = dist(ev.touches);
      touch.scale = parseFloat(imgEl.dataset.scale || "1") || 1;
      touch.startScale = touch.scale;
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
      touch.scale = s;
      imgEl.dataset.scale = String(s);
      applyZoom(s, touch.px, touch.py, false);
    } else if (touch.mode === "pan" && ev.touches.length === 1) {
      ev.preventDefault();
      touch.x2 = ev.touches[0].clientX;
      touch.y2 = ev.touches[0].clientY;
      var dx = touch.x2 - touch.x1, dy = touch.y2 - touch.y1;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) touch.moved = true;
      touch.panX += dx; touch.panY += dy;
      touch.x1 = touch.x2; touch.y1 = touch.y2;
      applyPan(touch.panX, touch.panY);
    } else if (touch.mode === "swipe" && ev.touches.length === 1) {
      touch.x2 = ev.touches[0].clientX;
      touch.y2 = ev.touches[0].clientY;
      if (Math.abs(touch.x2 - touch.x1) > 10 || Math.abs(touch.y2 - touch.y1) > 10) touch.moved = true;
    }
  }, { passive: false });

  stage.addEventListener("touchend", function (ev) {
    if (touch.mode === "pinch") {
      if (ev.touches.length === 0) {
        var s = parseFloat(imgEl.dataset.scale || "1");
        if (s <= 1.05) resetZoom();
        else zoomed = true;
        touch.mode = null;
      }
      return;
    }
    if (touch.mode === "pan" && ev.touches.length === 0) {
      if (!touch.moved && !zoomed) {
        toggleZoom();
      }
      clampPan();
      touch.mode = null;
      return;
    }
    if (touch.mode === "swipe" && ev.touches.length === 0) {
      var dx = touch.x2 - touch.x1, dy = touch.y2 - touch.y1;
      touch.mode = null;
      if (touch.moved === false) return;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) show(current + 1); else show(current - 1);
      } else if (dy > 80 && Math.abs(dy) > Math.abs(dx)) {
        close();
      }
    }
  }, { passive: true });

  function applyZoom(scale, cx, cy, reset) {
    var r = stage.getBoundingClientRect();
    var ox = reset ? 0.5 : (cx - r.left) / r.width;
    var oy = reset ? 0.5 : (cy - r.top) / r.height;
    imgEl.style.transformOrigin = (ox * 100) + "% " + (oy * 100) + "%";
    imgEl.style.transform = "scale(" + scale + ")";
  }

  function applyPan(dx, dy) {
    var base = imgEl.style.transformOrigin || "50% 50%";
    imgEl.style.transform = "scale(" + (parseFloat(imgEl.dataset.scale) || 1) + ") translate(" + dx + "px, " + dy + "px)";
  }

  function clampPan() {
    var s = parseFloat(imgEl.dataset.scale || "1");
    if (s <= 1) { touch.panX = 0; touch.panY = 0; applyPan(0, 0); return; }
    var r = imgEl.getBoundingClientRect();
    var stageR = stage.getBoundingClientRect();
    var overX = Math.max(0, (r.width - stageR.width) / 2);
    var overY = Math.max(0, (r.height - stageR.height) / 2);
    var nx = Math.min(overX, Math.max(-overX, touch.panX));
    var ny = Math.min(overY, Math.max(-overY, touch.panY));
    touch.panX = nx; touch.panY = ny;
    imgEl.style.transition = "transform .2s ease";
    applyPan(nx, ny);
    setTimeout(function () { imgEl.style.transition = ""; }, 220);
  }

  function resetZoom() {
    zoomed = false;
    imgEl.dataset.scale = "1";
    touch.panX = 0; touch.panY = 0;
    imgEl.style.transition = "transform .25s ease";
    imgEl.style.transform = "scale(1)";
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
