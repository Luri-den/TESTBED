/* ETS Community Map: tours.js
   Tours (ordered stops), trails (a route you can join anywhere) and plain map lines (old rail lines, canals).
   Reads data/routes.geojson. Loads only when that file has routes.

   Each route is one feature. Its properties:
     ID, TYPE (tour | trail | line), TITLE, INTRO, SUMMARY, CATEGORY,
     MODES (walk | hike | bike | drive | virtual, separated by |), LENGTH_MI, MINUTES (blank = worked out), EFFORT,
     STYLE (solid | dashed | rail), COLOR, WIDTH (pixels), OPACITY (0 to 1),
     SPIN (yes | no | blank = the site setting), AVAILABILITY (blank = always; "event" = only while a happening features it),
     SHOW_ALWAYS (yes = keep the line on the map even when the tour isn't open; plain lines always show),
     VEHICLE (the moving picture between stops: walk, bike, car, train, trainmodern, boat, or any icon; blank = picked from MODES),
     STOPS: [ { ITEM, NOTE, VEHICLE }, ... ] in order. A stop's VEHICLE is what carries you TO that stop.
   Site settings: TOUR_SPIN (yes/no), TOUR_SPIN_SPEED (slow | medium | fast), TOUR_TILT (0 to 60), TOUR_TIME_BUTTONS (minutes, like 30,60,120). */
(function () {
  "use strict";
  const C = window.ETSCore; if (!C) return;
  const { esc, L } = C;

  C.words({
    tours: "Tours", tourWord: "Tour", trailWord: "Trail", startTour: "Start the Tour", startTrail: "Start the Trail", showRoute: "Show the Route",
    endTour: "End Tour", stopOf: "Stop {n} of {total}", youreHere: "You're Here", next: "Next Stop", back: "Back", finish: "Finish",
    finished: "You finished the tour!", finishedText: "Thanks for walking with us.", aboutPlace: "More About This Place",
    anyLength: "Any Length", under: "Under {t}", stops: "{n} stops", oneStop: "1 stop", joinAnywhere: "Join anywhere along the trail",
    noTours: "No tours of that length.", walk: "Walking", hike: "Hiking", bike: "Biking", drive: "Driving", virtual: "From Home",
    walkVerb: "Walk", hikeVerb: "Hike", bikeVerb: "Bike", driveVerb: "Drive", minShort: "{m} min", hrShort: "{h} hr", backToTours: "All Tours",
    onlyDuring: "Only during {name}", tourRoute: "Route", resume: "Back to the Tour"
  });

  /* ---------- reading routes ---------- */
  const PACE = { walk: 20, hike: 30, bike: 6, drive: 2 };          // minutes per mile (3, 2, 10 and 30 mph)
  const STOP_MIN = { walk: 5, hike: 5, bike: 4, drive: 5, virtual: 3 };
  const list = v => String(v || "").split(/[|;,]/).map(s => s.trim().toLowerCase()).filter(Boolean);
  const R = 6371008.8, rad = d => d * Math.PI / 180;
  const meters = (a, b) => { const dLat = rad(b[1] - a[1]), dLng = rad(b[0] - a[0]); const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  function lineCoords(g) { if (!g) return []; if (g.type === "LineString") return g.coordinates; if (g.type === "MultiLineString") return g.coordinates.flat(); return []; }
  const pathMiles = coords => { let m = 0; for (let i = 1; i < coords.length; i++) m += meters(coords[i - 1], coords[i]); return m / 1609.344; };

  const ROUTES = C.DATA.routes.map(f => {
    const p = f.properties, coords = lineCoords(f.geometry);
    const type = String(p.TYPE || "tour").toLowerCase();
    const stops = (Array.isArray(p.STOPS) ? p.STOPS : []).map(s => ({ item: C.DATA.byId.get(s.ITEM), id: s.ITEM, note: s.NOTE || "", vehicle: s.VEHICLE || "" }))
      .filter(s => { if (s.item) return true; C.warn("Route " + p.ID + " stops at " + s.id + ", which isn't on the map. That stop is skipped."); return false; });
    return {
      id: String(p.ID), type, title: p.TITLE || p.NAME || p.ID, intro: p.INTRO || "", summary: p.SUMMARY || "", category: p.CATEGORY || "",
      modes: list(p.MODES), length: parseFloat(p.LENGTH_MI) || (coords.length > 1 ? Math.round(pathMiles(coords) * 10) / 10 : 0),
      minutesSet: parseFloat(p.MINUTES) || 0, effort: p.EFFORT || "", spin: String(p.SPIN || "").toLowerCase(),
      eventOnly: String(p.AVAILABILITY || "").toLowerCase() === "event", always: /^(y|yes|true|1)$/i.test(p.SHOW_ALWAYS || ""),
      vehicle: String(p.VEHICLE || "").trim().toLowerCase(), coords, stops, feature: f
    };
  });
  const TOURS = ROUTES.filter(r => r.type !== "line");

  const mode = t => t.modes.find(m => PACE[m]) || (t.modes.includes("virtual") ? "virtual" : "walk");
  function minutes(t) {
    if (t.minutesSet) return Math.round(t.minutesSet);
    const m = mode(t), n = t.stops.length;
    if (PACE[m] && t.length > 0) return Math.max(5, Math.round(t.length * PACE[m] + (t.type === "trail" ? 0 : n * (STOP_MIN[m] || 5))));
    if (m === "virtual" && n) return n * STOP_MIN.virtual;
    return null;
  }
  const dur = m => m == null ? "" : m < 60 ? L("minShort", { m }) : L("hrShort", { h: Math.floor(m / 60) }) + (m % 60 ? " " + L("minShort", { m: m % 60 }) : "");
  const meta = t => [L(mode(t)), dur(minutes(t)), t.length > 0 ? t.length + " mi" : "", t.effort, t.stops.length ? (t.stops.length === 1 ? L("oneStop") : L("stops", { n: t.stops.length })) : ""].filter(Boolean).join(" · ");
  const dist = m => { const mi = m / 1609.344; return mi < 0.1 ? Math.max(10, Math.round(m * 3.28084 / 10) * 10) + " ft" : (Math.round(mi * 10) / 10) + " mi"; };

  // A tour marked AVAILABILITY=event is only open while a happening that features it is on.
  function featuringNow(t) {
    const H = window.ETSHappenings; if (!H) return null;
    return H.list.find(h => h.tour === t.id && H.status(h).state === "now") || null;
  }
  const isOpen = t => !t.eventOnly || !!featuringNow(t);

  /* ---------- drawing the lines: solid, dashed, or rail (two thin lines with a see-through band) ---------- */
  const W = f => ["*", ["to-number", ["get", "WIDTH"], 4], f];
  const width = ["interpolate", ["exponential", 1.6], ["zoom"], 10, W(0.3), 15, W(1), 19, W(3)];
  const color = ["coalesce", ["get", "COLOR"], "#0B7A75"];
  const opac = ["to-number", ["coalesce", ["get", "OPACITY"], 1]];
  const isStyle = s => ["==", ["coalesce", ["get", "STYLE"], "solid"], s];
  function routesData(activeId) {
    // Plain lines always show. A tour or trail shows only while it's open (or marked SHOW_ALWAYS).
    return { type: "FeatureCollection", features: ROUTES.filter(r => r.coords.length > 1 && (r.type === "line" || r.id === activeId || r.id === PREVIEW || (r.always && isOpen(r)))).map(r => {
      const p = Object.assign({}, r.feature.properties); delete p.STOPS;
      p._active = ACTIVE ? (r.id === activeId ? 1 : 0) : 1;
      return { type: "Feature", properties: p, geometry: r.feature.geometry };
    }) };
  }
  let ACTIVE = null, PREVIEW = null;
  const fade = ["case", ["==", ["get", "_active"], 0], 0.25, 1];
  C.onStyle(map => {
    if (map.getSource("ets-routes")) return;
    map.addSource("ets-routes", { type: "geojson", data: routesData(ACTIVE ? ACTIVE.t.id : PREVIEW) });
    map.addLayer({ id: "ets-routes-solid", type: "line", source: "ets-routes", filter: isStyle("solid"), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": color, "line-width": width, "line-opacity": ["*", opac, fade] } });
    map.addLayer({ id: "ets-routes-dashed", type: "line", source: "ets-routes", filter: isStyle("dashed"), layout: { "line-cap": "butt", "line-join": "round" }, paint: { "line-color": color, "line-width": width, "line-opacity": ["*", opac, fade], "line-dasharray": [2, 1.5] } });
    map.addLayer({ id: "ets-routes-band", type: "line", source: "ets-routes", filter: isStyle("rail"), layout: { "line-join": "round" }, paint: { "line-color": color, "line-width": width, "line-opacity": ["*", opac, fade] } });
    const off = s => ["interpolate", ["exponential", 1.6], ["zoom"], 10, ["*", W(0.3), s / 2], 15, ["*", W(1), s / 2], 19, ["*", W(3), s / 2]];
    map.addLayer({ id: "ets-routes-railA", type: "line", source: "ets-routes", filter: isStyle("rail"), layout: { "line-join": "round" }, paint: { "line-color": color, "line-width": 1.6, "line-offset": off(1), "line-opacity": fade } });
    map.addLayer({ id: "ets-routes-railB", type: "line", source: "ets-routes", filter: isStyle("rail"), layout: { "line-join": "round" }, paint: { "line-color": color, "line-width": 1.6, "line-offset": off(-1), "line-opacity": fade } });
  });
  function refreshLines() { const s = C.map && C.map.getSource && C.map.getSource("ets-routes"); if (s) s.setData(routesData(ACTIVE ? ACTIVE.t.id : PREVIEW)); }

  /* ---------- the Tours button and list ---------- */
  const ROUTE_ICON = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="18" r="2.5"></circle><circle cx="18" cy="6" r="2.5"></circle><path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5"></path></svg>';
  const BACK_ICON = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"></path></svg>';
  C.RENDER.tours = () => {
    if (!TOURS.some(isOpen)) return null;
    const b = document.createElement("button"); b.type = "button"; b.className = "pill pill-tours";
    b.innerHTML = ROUTE_ICON + esc(L("tours"));
    b.addEventListener("click", () => openList());
    return b;
  };
  C.MENU_ITEMS.tours = { show: () => TOURS.some(isOpen), label: () => L("tours"), run: () => openList() };

  const timeButtons = String(C.SITE.TOUR_TIME_BUTTONS || "30,60,120").split(",").map(n => parseInt(n, 10)).filter(n => n > 0);
  let limit = 0;
  function listHtml() {
    const open = TOURS.filter(isOpen);
    const shown = open.filter(t => !limit || (minutes(t) != null && minutes(t) <= Math.round(limit * 1.1)));
    const chips = timeButtons.length && open.length > 2 ? '<div class="tour-times">' + [0, ...timeButtons].map(m =>
      '<button type="button" class="chip' + (limit === m ? " on" : "") + '" data-lim="' + m + '">' + esc(m ? L("under", { t: dur(m) }) : L("anyLength")) + "</button>").join("") + "</div>" : "";
    return '<div class="c-head"><h2 class="c-title">' + esc(L("tours")) + "</h2></div>" + chips +
      (shown.length ? '<div class="hap-list">' + shown.map(t => {
        const ev = t.eventOnly ? featuringNow(t) : null;
        return '<div class="tour-card">' +
          (ev ? '<span class="hap-pill" style="color:' + esc(ev.color || "var(--accent)") + '">' + esc(L("onlyDuring", { name: ev.tag || ev.name }).toUpperCase()) + "</span>" : "") +
          '<button type="button" class="tour-open" data-ov="' + esc(t.id) + '"><b>' + esc(t.title) + '</b><span class="tour-kind">' + esc(t.type === "trail" ? L("trailWord") : L("tourWord")) + "</span></button>" +
          '<small>' + esc(meta(t)) + "</small>" + (t.type === "trail" ? "<small>" + esc(L("joinAnywhere")) + "</small>" : "") +
          ((t.summary || t.intro) ? "<p>" + esc((t.summary || t.intro).length > 150 ? (t.summary || t.intro).slice(0, 147) + "…" : (t.summary || t.intro)) + "</p>" : "") +
          '<button type="button" class="act act-main" data-go="' + esc(t.id) + '">' + C.svgI("play") + "<span>" + esc(goText(t)) + "</span></button></div>";
      }).join("") + "</div>" : '<div class="hap-empty">' + esc(L("noTours")) + "</div>");
  }
  const goText = t => !t.stops.length ? L("showRoute") : t.type === "trail" ? L("startTrail") : L("startTour");
  function wireList(body) {
    body.querySelectorAll("[data-lim]").forEach(b => b.addEventListener("click", () => { limit = +b.dataset.lim; openList(); }));
    body.querySelectorAll("[data-ov]").forEach(b => b.addEventListener("click", () => overview(byId(b.dataset.ov))));
    body.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => start(b.dataset.go)));
  }
  const byId = id => TOURS.find(t => t.id === id);
  function openList() { if (ACTIVE) endTour(true); PREVIEW = null; refreshLines(); C.highlight(null); C.openSheetHtml(listHtml(), wireList, "open"); C.setUrl({ place: null, happening: null, tour: null }); }

  function overview(t) {
    if (!t) return;
    const parts = ['<button type="button" class="linkish hap-back" data-back="1">' + BACK_ICON + esc(L("backToTours")) + "</button>",
      '<div class="c-head"><div class="c-kind" style="color:var(--accent)">' + esc((t.type === "trail" ? L("trailWord") : L("tourWord")).toUpperCase()) + '</div><h2 class="c-title">' + esc(t.title) + "</h2></div>",
      '<div class="c-meta">' + esc(meta(t)) + "</div>",
      '<div class="c-acts"><button type="button" class="act act-main" data-go="1">' + C.svgI("play") + "<span>" + esc(goText(t)) + '</span></button><button type="button" class="act" data-share="1">' + C.svgI("share") + "<span>" + esc(L("share")) + "</span></button></div>"];
    if (t.intro) parts.push('<div class="c-text">' + t.intro.split(/\n\s*\n/).map(p => "<p>" + esc(p) + "</p>").join("") + "</div>");
    if (t.stops.length) parts.push('<ol class="tour-stops">' + t.stops.map(s => "<li>" + esc(s.item.NAME || s.id) + "</li>").join("") + "</ol>");
    C.openSheetHtml(parts.join(""), body => {
      body.querySelector("[data-back]").addEventListener("click", () => openList());
      body.querySelector("[data-go]").addEventListener("click", () => start(t.id));
      body.querySelector("[data-share]").addEventListener("click", () => shareTour(t));
    }, "open");
    PREVIEW = t.id; refreshLines();
    C.onSheetClose = () => { if (!ACTIVE) { PREVIEW = null; refreshLines(); } };
    frame(t, false);
    C.setUrl({ place: null, happening: null, tour: t.id });
  }
  async function shareTour(t) {
    const u = new URL(location.href); ["embed", "place", "happening"].forEach(k => u.searchParams.delete(k)); u.searchParams.set("tour", t.id);
    if (navigator.share) { try { await navigator.share({ title: t.title, url: u.toString() }); return; } catch (e) { if (e && e.name === "AbortError") return; } }
    try { await navigator.clipboard.writeText(u.toString()); C.toast(L("linkCopied")); } catch (e) { prompt(L("share"), u.toString()); }
  }

  /* ---------- the camera: frame the tour, and (if turned on) slowly turn around it ---------- */
  let spinRaf = null;
  function stopSpin() { if (spinRaf) cancelAnimationFrame(spinRaf); spinRaf = null; }
  function framePoints(t) {
    const pts = t.coords.length > 1 ? t.coords.slice() : [];
    t.stops.forEach(s => { if (s.item.hasPos) pts.push([s.item.lng, s.item.lat]); });
    return pts;
  }
  function frame(t, touring) {
    const map = C.map; if (!map) return;
    const pts = framePoints(t); if (!pts.length) return;
    const tilt = Math.max(0, Math.min(60, parseFloat(C.SITE.TOUR_TILT) || 0));
    const pad = { top: touring ? 110 : 150, bottom: C.sheetPad() + 10, left: C.desktop() ? 460 : 50, right: 50 };
    if (C.Q.get("camdebug") === "1") camBox(pad);     // ?camdebug=1 outlines the part of the screen the tour is framed in
    if (pts.length === 1) map.easeTo({ center: pts[0], zoom: 16, pitch: touring ? tilt : 0, bearing: 0, padding: pad, duration: C.REDUCED ? 0 : 700 });
    else map.fitBounds(C.boundsOf(pts), { padding: pad, maxZoom: 17, pitch: touring ? tilt : 0, bearing: 0, duration: C.REDUCED ? 0 : 700 });
    const spinOn = t.spin === "yes" || (t.spin !== "no" && /^(y|yes|true|1)$/i.test(C.SITE.TOUR_SPIN || ""));
    if (touring && spinOn && !C.REDUCED && map.setBearing) {
      const speed = { slow: 4, medium: 8, fast: 15 }[String(C.SITE.TOUR_SPIN_SPEED || "medium").toLowerCase()] || 8;
      setTimeout(() => {
        if (!ACTIVE) return;
        let last = performance.now();
        const step = now => { map.setBearing((map.getBearing() + speed * (now - last) / 1000) % 360); last = now; spinRaf = requestAnimationFrame(step); };
        stopSpin(); spinRaf = requestAnimationFrame(step);
      }, 900);
    }
  }
  function camBox(pad) {
    let el = document.getElementById("camDebug");
    if (!el) { el = document.createElement("div"); el.id = "camDebug"; el.className = "cam-debug"; document.body.appendChild(el); }
    Object.assign(el.style, { top: pad.top + "px", bottom: pad.bottom + "px", left: pad.left + "px", right: pad.right + "px" });
    el.textContent = "Tour frame: top " + pad.top + ", bottom " + pad.bottom + ", left " + pad.left + ", right " + pad.right;
  }
  if (C.map) ["mousedown", "touchstart", "wheel", "dragstart"].forEach(ev => C.map.on(ev, stopSpin));   // stops the moment the visitor touches the map

  /* ---------- a tour in progress ---------- */
  let stopMarkers = [];
  function drawStops() {
    stopMarkers.forEach(m => m.remove()); stopMarkers = [];
    if (!ACTIVE || !C.map || !window.maplibregl) return;
    ACTIVE.t.stops.forEach((s, i) => {
      if (!s.item.hasPos) return;
      const el = document.createElement("button"); el.type = "button";
      el.className = "tour-stop" + (i < ACTIVE.i ? " done" : i === ACTIVE.i ? " here" : "");
      el.setAttribute("aria-label", L("stopOf", { n: i + 1, total: ACTIVE.t.stops.length }) + ": " + (s.item.NAME || s.id));
      el.innerHTML = i < ACTIVE.i ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10"></path></svg>' : String(i + 1);
      el.addEventListener("click", e => { e.stopPropagation(); TRAVEL++; clearVehicle(); showStop(i); });
      stopMarkers.push(new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([s.item.lng, s.item.lat]).addTo(C.map));
    });
  }
  function tourBar() {
    let bar = document.getElementById("tourBar");
    if (!ACTIVE) { if (bar) bar.remove(); return; }
    if (!bar) { bar = document.createElement("div"); bar.id = "tourBar"; bar.className = "tour-bar"; document.body.appendChild(bar); }
    const t = ACTIVE.t;
    bar.innerHTML = '<span class="tb-icon">' + ROUTE_ICON + '</span><button type="button" class="tb-text" data-resume="1"><b>' + esc(t.title) + "</b><small>" + esc(meta(t)) + "</small></button>" +
      '<button type="button" class="tb-end">' + esc(L("endTour")) + "</button>";
    bar.querySelector(".tb-end").addEventListener("click", () => endTour());
    bar.querySelector("[data-resume]").addEventListener("click", () => showStop(ACTIVE.i));
  }
  function start(id) {
    const t = byId(id);
    if (!t) { C.warn("Tour " + id + " isn't listed."); return; }
    if (!isOpen(t)) { C.warn("Tour " + id + " is only open during its happening."); return; }
    stopSpin();
    ACTIVE = { t, i: 0 }; PREVIEW = null; TRAVEL++;
    C.setTouring(true); C.highlight(null);
    refreshLines(); tourBar(); drawStops();
    frame(t, true);
    C.setUrl({ place: null, happening: null, tour: t.id });
    if (t.stops.length) showStop(0, true); else showRouteOnly(t);
  }
  function showRouteOnly(t) {
    C.setPeek(260);
    C.openSheetHtml('<div class="c-head"><div class="c-kind" style="color:var(--accent)">' + esc(L("tourRoute").toUpperCase()) + '</div><h2 class="c-title">' + esc(t.title) + '</h2></div><div class="c-meta">' + esc(meta(t)) + "</div>" +
      (t.type === "trail" ? '<div class="c-aka">' + esc(L("joinAnywhere")) + "</div>" : "") +
      (t.intro ? '<div class="c-text">' + esc(t.intro) + "</div>" : ""), null, "peek");
  }
  function showStop(i, keepCamera) {
    if (!ACTIVE) return;
    const t = ACTIVE.t, n = t.stops.length;
    ACTIVE.i = Math.max(0, Math.min(n - 1, i));
    const s = t.stops[ACTIVE.i], it = s.item;
    drawStops();
    const next = t.stops[ACTIVE.i + 1];
    let nextLine = "";
    if (next) {
      const m = mode(t);
      if (it.hasPos && next.item.hasPos && PACE[m]) {
        const d = meters([it.lng, it.lat], [next.item.lng, next.item.lat]);
        nextLine = (next.item.NAME || next.id) + " · " + dist(d) + ", " + L("minShort", { m: Math.max(1, Math.round(d / 1609.344 * PACE[m])) });
      } else nextLine = next.item.NAME || next.id;
    }
    const media = (C.DATA.media.get(it.ID) || []).filter(x => /^audio$/i.test(x.KIND || ""));
    const photo = (C.DATA.media.get(it.ID) || []).find(x => (x.KIND || "photo").toLowerCase() === "photo" && x.FILE);
    const text = s.note || it.BLURB || it.TEXT || "";
    const html =
      '<div class="tour-progress" aria-label="' + esc(L("stopOf", { n: ACTIVE.i + 1, total: n })) + '">' + t.stops.map((_, k) => '<span class="' + (k <= ACTIVE.i ? "on" : "") + '"></span>').join("") + "</div>" +
      '<div class="c-kind tour-step">' + esc(L("stopOf", { n: ACTIVE.i + 1, total: n }).toUpperCase()) + "</div>" +
      '<h2 class="c-title">' + esc(it.NAME || it.ID) + "</h2>" +
      (it.hasPos && !C.noRealPlace ? '<div class="c-near" data-near-ll="' + it.lng + "," + it.lat + '" hidden></div>' : "") +
      (photo ? '<img class="tour-photo" src="' + esc(C.mediaUrl(photo.FILE)) + '" alt="">' : "") +
      (text ? '<p class="tour-note">' + esc(text.length > 220 ? text.slice(0, 217) + "…" : text) + "</p>" : "") +
      (media.length ? '<div class="media-row tour-audio"><button type="button" class="play" data-audio="1" aria-label="' + esc(L("listen")) + '">' + C.svgI("play") + '</button><div class="m-text"><div class="m-title">' + esc(media[0].CAPTION || L("listen")) + (media[0].SECONDS ? " · " + esc(fmtSecs(media[0].SECONDS)) : "") + '</div>' + (media[0].TRANSCRIPT ? '<details><summary>' + esc(L("transcript")) + "</summary><p>" + esc(media[0].TRANSCRIPT) + "</p></details>" : "") + '<div class="m-player"></div></div></div>' : "") +
      '<div class="tour-nav">' + (ACTIVE.i > 0 ? '<button type="button" class="act" data-prev="1">' + esc(L("back")) + "</button>" : "") +
      (next ? '<button type="button" class="act act-main tour-next" data-next="1"><span>' + esc(L("next")) + "</span><small>" + esc(nextLine) + "</small></button>"
            : '<button type="button" class="act act-main" data-done="1"><span>' + esc(L("finish")) + "</span></button>") + "</div>" +
      '<button type="button" class="linkish tour-more" data-more="1">' + esc(L("aboutPlace")) + "</button>";
    C.setPeek(Math.min(innerHeight * 0.62, (photo ? 470 : 340) + (media.length ? 70 : 0)));
    C.openSheetHtml(html, body => {
      const p = body.querySelector("[data-prev]"); if (p) p.addEventListener("click", () => { TRAVEL++; clearVehicle(); showStop(ACTIVE.i - 1); });
      const nx = body.querySelector("[data-next]"); if (nx) nx.addEventListener("click", () => goNext(nx));
      const dn = body.querySelector("[data-done]"); if (dn) dn.addEventListener("click", finish);
      body.querySelector("[data-more]").addEventListener("click", () => { C.setPeek(null); C.openCard(it); addResume(); });
      const au = body.querySelector("[data-audio]");
      if (au) au.addEventListener("click", () => { const box = au.parentElement.querySelector(".m-player"); if (box.firstChild) return; const a = document.createElement("audio"); a.controls = true; a.src = C.mediaUrl(media[0].FILE); box.appendChild(a); a.play().catch(() => {}); });
    }, "peek");
    if (!keepCamera && it.hasPos && C.map) { stopSpin(); C.map.easeTo({ center: [it.lng, it.lat], zoom: Math.max(C.map.getZoom(), 16), padding: { top: 110, bottom: Math.min(innerHeight * 0.62, 360) + 20, left: C.desktop() ? 460 : 0, right: 0 }, duration: C.REDUCED ? 0 : 700 }); }
    document.dispatchEvent(new CustomEvent("ets:tourstop", { detail: { tour: t.id, stop: ACTIVE.i, item: it.ID } }));
  }
  /* ---------- the travel animation: a little vehicle rides the route to the next stop ---------- */
  let TRAVEL = 0, vehicleMarker = null;
  const MODE_VEHICLE = { walk: "walk", hike: "walk", bike: "bike", drive: "car" };
  function clearVehicle() { if (vehicleMarker) vehicleMarker.remove(); vehicleMarker = null; }
  function nearOnLine(line, p) {      // the closest spot on the line to a point
    const k = Math.cos(rad(p[1])); let best = null;
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i], b = line[i + 1], dx = (b[0] - a[0]) * k, dy = b[1] - a[1], LL = dx * dx + dy * dy;
      const u = LL ? Math.max(0, Math.min(1, ((p[0] - a[0]) * k * dx + (p[1] - a[1]) * dy) / LL)) : 0;
      const pt = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
      const d = meters(p, pt);
      if (!best || d < best.d) best = { i, u, d, pt };
    }
    return best;
  }
  function legPath(line, from, to) {  // the piece of the route between two stops, in travel order
    if (!line || line.length < 2) return [from, to];
    const a = nearOnLine(line, from), b = nearOnLine(line, to);
    if (a.d > 800 || b.d > 800) return [from, to];          // stop is far from the drawn line: go straight
    const fwd = a.i < b.i || (a.i === b.i && a.u <= b.u), s0 = fwd ? a : b, e0 = fwd ? b : a;
    const path = [s0.pt].concat(line.slice(s0.i + 1, e0.i + 1), [e0.pt]);
    if (!fwd) path.reverse();
    return [from].concat(path, [to]);
  }
  function alongPath(path, segs, total, f) {
    let want = f * total;
    for (let i = 0; i < segs.length; i++) {
      if (want <= segs[i] || i === segs.length - 1) { const g = segs[i] ? Math.min(1, want / segs[i]) : 0, a = path[i], b = path[i + 1]; return [a[0] + (b[0] - a[0]) * g, a[1] + (b[1] - a[1]) * g]; }
      want -= segs[i];
    }
    return path[path.length - 1];
  }
  const SCENE = { rail: "rail", water: "boat", road: "car" };
  function vehicleEl(key) {
    const ic = C.DATA.icons.icons[key] || C.DATA.icons.icons.walk;
    const wrap = document.createElement("div");
    if (!ic) { wrap.className = "travel-dot"; return wrap; }
    wrap.className = "travel-clip " + (SCENE[ic.scene] || "");
    wrap.innerHTML = '<div class="scene"><div class="env"></div><div class="vehicle"><svg viewBox="' + esc(ic.vb || "0 0 60 30") + '" width="60" height="30" aria-hidden="true">' + (ic.art || "") + "</svg></div>" +
      (ic.puff ? '<div class="puff"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="6" cy="10" r="4" fill="#fff" opacity=".85"></circle><circle cx="10" cy="7" r="3" fill="#fff" opacity=".6"></circle></svg></div>' : "") + "</div>";
    return wrap;
  }
  function travel(from, to, key) {
    return new Promise(done => {
      const map = C.map, my = ++TRAVEL;
      const pad = { top: 110, bottom: C.sheetPad() + 10, left: C.desktop() ? 460 : 0, right: 0 };
      if (C.REDUCED || !map || !window.maplibregl) { if (map) map.easeTo({ center: to, zoom: Math.max(map.getZoom(), 16), padding: pad, duration: 0 }); return done(true); }
      const path = legPath(ACTIVE.t.coords, from, to), segs = [];
      let total = 0; for (let i = 1; i < path.length; i++) { const d = meters(path[i - 1], path[i]); segs.push(d); total += d; }
      const ms = Math.min(4500, Math.max(1400, total * 3));
      clearVehicle();
      vehicleMarker = new maplibregl.Marker({ element: vehicleEl(key), anchor: "center" }).setLngLat(from).addTo(map);
      map.jumpTo({ center: from, zoom: Math.max(Math.min(map.getZoom(), 17), 15.5), padding: pad });
      const t0 = performance.now();
      const step = now => {
        if (my !== TRAVEL) { clearVehicle(); return done(false); }   // the tour ended or something else moved on
        const f = Math.min(1, (now - t0) / ms), e = f < .5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;   // gentle start and stop
        const pos = alongPath(path, segs, total, e);
        vehicleMarker.setLngLat(pos); map.jumpTo({ center: pos });
        if (f < 1) requestAnimationFrame(step);
        else { clearVehicle(); map.easeTo({ center: to, zoom: Math.max(map.getZoom(), 16.5), padding: pad, duration: 500 }); setTimeout(() => done(my === TRAVEL), 500); }
      };
      requestAnimationFrame(step);
    });
  }
  async function goNext(btn) {
    if (!ACTIVE || btn.disabled) return;
    const t = ACTIVE.t, a = t.stops[ACTIVE.i], b = t.stops[ACTIVE.i + 1];
    if (!b) return;
    stopSpin();
    const key = (b.vehicle || t.vehicle || MODE_VEHICLE[mode(t)] || "").toLowerCase();
    if (a.item.hasPos && b.item.hasPos && mode(t) !== "virtual") {
      btn.disabled = true; btn.classList.add("busy");
      const ok = await travel([a.item.lng, a.item.lat], [b.item.lng, b.item.lat], key);
      if (!ok || !ACTIVE) return;
    }
    showStop(ACTIVE.i + 1, true);
  }
  const fmtSecs = s => { s = Math.round(+s || 0); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
  function addResume() {          // when a stop's full card is open, offer a way back to the tour
    const body = document.getElementById("sheetBody");
    const b = document.createElement("button"); b.type = "button"; b.className = "act act-main tour-resume"; b.innerHTML = "<span>" + esc(L("resume")) + "</span>";
    b.addEventListener("click", () => showStop(ACTIVE.i));
    body.prepend(b);
  }
  function finish() {
    const t = ACTIVE.t;
    document.dispatchEvent(new CustomEvent("ets:tourdone", { detail: { tour: t.id } }));   // the passport listens for this
    C.setPeek(240);
    C.openSheetHtml('<div class="tour-done"><div class="td-badge">' + ROUTE_ICON + '</div><h2 class="c-title">' + esc(L("finished")) + "</h2><p>" + esc(L("finishedText")) + '</p><button type="button" class="act act-main" data-end="1"><span>' + esc(L("endTour")) + "</span></button></div>",
      body => body.querySelector("[data-end]").addEventListener("click", () => endTour()), "peek");
  }
  function endTour(quiet) {
    stopSpin(); TRAVEL++; clearVehicle();
    ACTIVE = null; PREVIEW = null;
    C.setTouring(false); C.setPeek(null);
    stopMarkers.forEach(m => m.remove()); stopMarkers = [];
    tourBar(); refreshLines();
    if (C.map && C.map.easeTo) C.map.easeTo({ bearing: 0, pitch: 0, duration: C.REDUCED ? 0 : 500 });
    C.setUrl({ tour: null });
    if (!quiet) C.closeSheet();
  }

  // ?tour=ID opens the tour's overview
  const want = C.Q.get("tour");
  if (want) C.onStart(() => { const t = byId(want); if (t && isOpen(t)) overview(t); else C.warn("The link asked for tour " + want + ", which isn't open right now."); });
  window.ETSTours = { list: TOURS, has: id => !!byId(id), start, openList, end: endTour, get active() { return ACTIVE && { tour: ACTIVE.t.id, stop: ACTIVE.i }; } };
  C.renderControls();
})();
