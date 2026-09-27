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

  function figAt(i) { return items[(i + items.length) % items.length]; }

  var token = 0;

  function show(i, pushState) {
    current = (i + items.length) % items.length;
    var my = ++token;
    var f = items[current];
    var full = f.getAttribute("data-full") || "";
    var title = f.getAttribute("data-title") || "";
    var thumbNode = f.querySelector("img");
    var thumbSrc = thumbNode ? (thumbNode.currentSrc || thumbNode.src) : full;
    imgEl.classList.remove("is-zoomed");
    zoomed = false;
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
    imgEl.classList.remove("is-zoomed");
    zoomed = false;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    if (pushState !== false) {
      try { history.replaceState(null, "", location.pathname); } catch (e) {}
    }
  }

  function toggleZoom() {
    zoomed = !zoomed;
    imgEl.classList.toggle("is-zoomed", zoomed);
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

  var touchX = null, touchY = null;
  stage.addEventListener("touchstart", function (ev) {
    if (ev.touches.length === 1) { touchX = ev.touches[0].clientX; touchY = ev.touches[0].clientY; }
  }, { passive: true });
  stage.addEventListener("touchend", function (ev) {
    if (touchX === null) return;
    var dx = ev.changedTouches[0].clientX - touchX;
    var dy = ev.changedTouches[0].clientY - touchY;
    touchX = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) show(current + 1); else show(current - 1);
    } else if (dy > 80 && Math.abs(dy) > Math.abs(dx)) {
      close();
    }
  });

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
