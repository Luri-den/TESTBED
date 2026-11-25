/* ETS Community Map: welcome.js
   The welcome screen ("Welcome to" the site's name), then a short showcase of places and what's on, until the visitor taps.
   Visitors who arrive by a QR code or a shared link skip it, and so do embedded maps. ?intro=1 replays it (for the curator).
   Site settings:
     WELCOME (no turns it off)   WELCOME_TEXT (lines with |, like "Welcome to|{PLACE}")
     WELCOME_THEME (halloween, fall or winter: animated drawings; blank = a plain welcome in the site's colors)
     WELCOME_GIF (a picture in media/ to use instead, if a client wants their own)
     INTRO_STYLE (blank = the map stays still, zoom = flies to each place, spin = flies and slowly turns)
     INTRO_FEATURES (blank = places, mixed = places and stories or photo spots, spots = stories and photo spots)
     INTRO_CARD (bottom or top: where the showcase card sits; off = welcome screen only) */
(function () {
  "use strict";
  const C = window.ETSCore; if (!C || document.querySelector(".welcome")) return;
  const { esc, L } = C;
  C.words({ welcomeTo: "Welcome to", skip: "Tap or Click to Skip", goThere: "Go There", seeIt: "See It", startTour: "Start the Tour", happeningNow: "Happening Now", learnMore: "Learn More", inGroup: "In {name}", since: "Since {y}" });

  const S = C.SITE, place = (S.PLACE || "").trim();
  const STEP = 3000, FADE = 650;
  const motion = C.REDUCED ? "" : ({ spin: "spin", zoom: "zoom" })[String(S.INTRO_STYLE || "").toLowerCase()] || "";
  const SLIDE = motion ? 6500 : 4200;
  const cardPos = String(S.INTRO_CARD || "").toLowerCase();
  const features = motion ? String(S.INTRO_FEATURES || "").toLowerCase() : "";

  const ov = document.createElement("div");
  ov.className = "welcome"; ov.setAttribute("role", "button"); ov.setAttribute("aria-label", L("skip")); ov.tabIndex = 0;
  ov.innerHTML = '<div class="w-screen"></div><svg class="w-line" aria-hidden="true"></svg><div class="w-card" hidden></div><div class="w-skip">' + esc(L("skip").toUpperCase()) + "</div>";
  document.body.appendChild(ov);
  document.body.classList.add("welcoming");
  const screen = ov.querySelector(".w-screen"), card = ov.querySelector(".w-card"), line = ov.querySelector(".w-line");
  let stopped = false, timer = 0, current = null, startCam = null, aim = null, gen = 0, n = 0, last = null;

  /* ---------- step 1: the welcome screen ---------- */
  const text = S.WELCOME_TEXT || L("welcomeTo") + "|{PLACE}";
  function welcomeHtml() {
    const theme = String(S.WELCOME_THEME || "").toLowerCase();
    if (theme && window.WelcomeThemes && window.WelcomeThemes.list[theme]) return '<img class="w-art" alt="' + esc(text.replace(/\{PLACE\}/g, place).replace(/\|/g, " ")) + '" src="' + window.WelcomeThemes.url(theme, text, place, !C.REDUCED) + '">';
    if (S.WELCOME_GIF) return '<img class="w-art w-gif" alt="' + esc(text.replace(/\{PLACE\}/g, place).replace(/\|/g, " ")) + '" src="' + esc(C.mediaUrl(S.WELCOME_GIF)) + '">';
    const lines = text.replace(/\{PLACE\}/g, place).split("|").map(s => s.trim()).filter(Boolean);
    const big = lines.pop() || place || "Welcome";
    return '<div class="w-plain">' + lines.map(l => "<span>" + esc(l) + "</span>").join("") + "<b>" + esc(big) + "</b></div>";
  }
  async function begin() {
    const theme = String(S.WELCOME_THEME || "").toLowerCase();
    if (theme && !window.WelcomeThemes) await new Promise(res => { const sc = document.createElement("script"); sc.src = "app/welcome-themes.js"; sc.onload = sc.onerror = res; document.head.appendChild(sc); });
    if (stopped) return;
    screen.innerHTML = welcomeHtml();
    requestAnimationFrame(() => ov.classList.add("show"));
    timer = setTimeout(() => {
      if (stopped) return;
      ov.classList.add("away");
      timer = setTimeout(() => { if (stopped) return; screen.remove(); if (cardPos === "off") finish(); else showcase(); }, FADE);
    }, STEP);
  }

  /* ---------- step 2: the showcase ---------- */
  const photoOf = it => (C.DATA.media.get(it.ID) || []).find(m => (m.KIND || "photo").toLowerCase() === "photo" && m.FILE);
  const places = () => C.DATA.items.filter(i => i.hasPos && i.kind === "place" && (!C.markerEl(i.ID) || !C.markerEl(i.ID).hidden || i.PART_OF));
  const spots = () => C.DATA.items.filter(i => i.hasPos && (i.kind === "story" || i.kind === "photospot") && photoOf(i));
  const nowOn = () => (window.ETSHappenings ? window.ETSHappenings.list.filter(h => window.ETSHappenings.status(h).state === "now") : []);
  let hi = 0;
  function showcase() {
    ov.classList.add("cards");
    next();
  }
  function next() {
    if (stopped) return;
    clearMotion();
    const haps = nowOn();
    if (haps.length && n++ % 2 === 0) { showHappening(haps[hi++ % haps.length]); return; }
    const withPhotos = places().filter(photoOf);
    let pool = withPhotos.length ? withPhotos : places();
    const sp = spots();
    if (sp.length && (features === "spots" || (features === "mixed" && Math.random() < 0.4))) pool = sp;
    if (!pool.length) { finish(); return; }
    const choices = pool.length > 1 ? pool.filter(i => i !== last) : pool;
    const it = choices[Math.floor(Math.random() * choices.length)];
    last = it;
    const ph = photoOf(it), g = C.groupOf(it);
    const blurb = shortText(it.BLURB || it.TEXT || "");
    const meta = it.kind === "story" ? L("story") : it.kind === "photospot" ? L("photoSpot") : [g ? L("inGroup", { name: g.NAME || g.ID }) : "", it.YEAR_START ? L("since", { y: it.YEAR_START }) : ""].filter(Boolean).join(" · ");
    present({ item: it, color: C.colorFor(it), html:
      (ph ? '<img class="wc-photo" src="' + esc(C.mediaUrl(ph.FILE)) + '" alt="">' : "") +
      '<div class="wc-body"><h2>' + esc(it.NAME || it.ID) + "</h2>" + (blurb ? "<p>" + esc(blurb) + "</p>" : "") + (meta ? "<small>" + esc(meta) + "</small>" : "") +
      '<button type="button" class="act act-main wc-go">' + esc(it.kind === "place" ? L("goThere") : L("seeIt")) + "</button></div>",
      go: () => { finish(true); C.goTo(it); } });
  }
  function showHappening(h) {
    const venue = (h.features || []).map(id => C.DATA.byId.get(id)).find(i => i && i.hasPos) || null;
    const tour = h.tour && window.ETSTours && window.ETSTours.has(h.tour) ? h.tour : "";
    present({ item: venue, color: h.color || "var(--accent)", html:
      '<div class="wc-body"><span class="wc-tag" style="background:' + esc(h.color || "var(--accent)") + '">' + esc((h.tag || L("happeningNow")).toUpperCase()) + "</span><h2>" + esc(h.name) + "</h2>" +
      (h.text ? "<p>" + esc(shortText(h.text)) + "</p>" : "") + (venue ? "<small>" + esc(venue.NAME || venue.ID) + "</small>" : "") +
      '<button type="button" class="act act-main wc-go">' + esc(tour ? L("startTour") : venue ? L("goThere") : L("learnMore")) + "</button></div>",
      go: () => { finish(true); if (tour) window.ETSTours.start(tour); else if (window.ETSHappenings.openOne) window.ETSHappenings.openOne(h); } });
  }
  const shortText = t => { t = String(t).trim(); const m = /[.!?](\s|$)/.exec(t); let s = m && m.index < 170 ? t.slice(0, m.index + 1) : t; return s.length > 170 ? s.slice(0, 167) + "…" : s; };

  function present(slide) {
    current = slide;
    document.querySelectorAll(".mk-spot").forEach(e => e.classList.remove("mk-spot"));
    const it = slide.item, map = C.map;
    card.style.setProperty("--c", slide.color);
    card.innerHTML = slide.html; card.hidden = false;
    card.querySelector(".wc-go").addEventListener("click", e => { e.stopPropagation(); slide.go(); });
    let pos = cardPos === "top" ? "top" : "bottom";
    if (it && map && !cardPos && !motion) { const p = map.project([it.lng, it.lat]); if (p.y > innerHeight - 380 && p.y > 360) pos = "top"; }
    card.classList.toggle("top", pos === "top");
    card.classList.remove("in"); void card.offsetWidth; card.classList.add("in");
    line.innerHTML = "";
    if (it && map) {
      document.dispatchEvent(new CustomEvent("ets:goto", { detail: { item: it } }));   // an indoor plan shows the right floor
      const target = (C.markerEl(it.ID) && !C.markerEl(it.ID).hidden) ? it : (C.groupOf(it) || it);
      const el = C.markerEl(target.ID); if (el) el.classList.add("mk-spot");
      aim = () => pointer(target);
      if (motion) {
        const my = ++gen;
        if (!startCam) { const c = map.getCenter(); startCam = { center: [c.lng, c.lat], zoom: map.getZoom() }; }
        const clear = pos === "bottom" ? Math.max(180, innerHeight * 0.33) : innerHeight * 0.7;
        const off = [0, clear - innerHeight / 2];
        map.on("move", aim);
        map.flyTo({ center: [target.lng, target.lat], zoom: Math.max(map.getZoom(), C.noRealPlace ? map.getZoom() + 0.8 : 16.3), pitch: C.noRealPlace ? 0 : 50, offset: off, duration: 2200, essential: true });
        if (motion === "spin" && !C.noRealPlace) map.once("moveend", () => { if (stopped || my !== gen) return; map.easeTo({ center: [target.lng, target.lat], offset: off, bearing: map.getBearing() + 50, duration: Math.max(1500, SLIDE - 2600), easing: t => t, essential: true }); });
      }
      requestAnimationFrame(aim);
    }
    timer = setTimeout(next, SLIDE);
  }
  function pointer(t) {                 // a soft triangle from the card to the pin, redrawn while the camera moves
    if (!C.map || stopped) return;
    const q = C.map.project([t.lng, t.lat]), r = card.getBoundingClientRect();
    if (!r.width) return;
    const sx = Math.max(r.left + 20, Math.min(q.x, r.right - 20)), sy = q.y < r.top ? r.top : q.y > r.bottom ? r.bottom : null;
    if (sy == null) { line.innerHTML = ""; return; }
    let dx = q.x - sx, dy = q.y - sy; const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    const w = 14;
    line.innerHTML = '<path style="fill:' + esc(current ? current.color : "var(--accent)") + '" d="M' + (sx - dy * w) + "," + (sy + dx * w) + "L" + q.x + "," + q.y + "L" + (sx + dy * w) + "," + (sy - dx * w) + 'Z"></path>';
  }
  function clearMotion() { if (aim && C.map) C.map.off("move", aim); aim = null; gen++; }

  /* ---------- finishing ---------- */
  function finish(toItem) {
    if (stopped) return;
    stopped = true; clearTimeout(timer); clearMotion();
    document.querySelectorAll(".mk-spot").forEach(e => e.classList.remove("mk-spot"));
    if (motion && startCam && !toItem && C.map) C.map.easeTo({ center: startCam.center, zoom: startCam.zoom, bearing: 0, pitch: 0, duration: 900, essential: true });
    else if (motion && toItem && C.map) C.map.easeTo({ bearing: 0, pitch: 0, duration: 600 });
    ov.classList.add("exit");
    document.body.classList.remove("welcoming");
    setTimeout(() => ov.remove(), C.REDUCED ? 0 : FADE);
    document.removeEventListener("keydown", key, true);
  }
  const key = e => { if (e.key === "Escape" || e.key === "Enter" || e.key === " ") { if (e.target.closest && e.target.closest(".wc-go")) return; e.preventDefault(); e.stopPropagation(); finish(); } };
  ov.addEventListener("click", e => {
    if (current && current.item) {           // tapping the highlighted pin itself goes there
      const hit = [C.markerEl((C.groupOf(current.item) || current.item).ID), C.markerEl(current.item.ID)].some(m => { if (!m) return false; const r = m.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; });
      if (hit) { current.go(); return; }
    }
    finish();
  });
  document.addEventListener("keydown", key, true);
  window.ETSWelcome = { finish, get running() { return !stopped; } };
  begin();
})();
