/* ETS Community Map: nearme.js
   "You are here": the visitor's own dot, shown only after they say yes (asked once, remembered on their phone).
   Their location never leaves their phone.
     - a blue dot with an accuracy circle; the button's second press keeps the map on them, the third turns it off
     - "0.3 mi away, north-east" lines on cards and tour stops
     - Keep Screen On while walking (their choice)
     - Discover a place by being near it: an item with a RADIUS (in meters) says so when the visitor walks within it
     - ?pretend=1 on the address puts a dot you can drag, to try all of this from a desk
   Site settings: NEAR_ME (no turns it off), UNITS (mi or km). */
(function () {
  "use strict";
  const C = window.ETSCore; if (!C) return;
  const { esc, L, store } = C;

  C.words({
    near: "Show Where I Am", nearFollow: "Keep the Map on Me", nearStop: "Stop Showing Where I Am",
    askTitle: "Show where you are?", askText: "The map can show your own dot and how far away places are. Your location stays on your phone and is never sent anywhere.",
    askYes: "Show Me", askNo: "Not Now", looking: "Finding you…", youAre: "You are here", accuracy: "within {d}", poorFix: "Your location is rough right now",
    outside: "You're outside the map area", denied: "Location is turned off for this site. You can turn it on in your browser's settings.",
    unsupported: "This device can't share its location.", unavailable: "Can't find you right now. Still trying…", pretend: "Pretend Walk: drag the dot",
    keepAwake: "Keep Screen On", away: "{d} away", toward: "toward the {dir}", youreAt: "You're at {name}", stop: "Stop",
    "dir.0": "north", "dir.1": "north-east", "dir.2": "east", "dir.3": "south-east", "dir.4": "south", "dir.5": "south-west", "dir.6": "west", "dir.7": "north-west"
  });

  const PRETEND = C.Q.get("pretend") === "1";
  const KM = String(C.SITE.UNITS || "").toLowerCase() === "km";
  const R = 6371008.8, rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
  const distance = (a, b) => { const dLat = rad(b[1] - a[1]), dLng = rad(b[0] - a[0]); const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  const bearing = (a, b) => { const f1 = rad(a[1]), f2 = rad(b[1]), dl = rad(b[0] - a[0]); return (deg(Math.atan2(Math.sin(dl) * Math.cos(f2), Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl))) + 360) % 360; };
  const fmt = m => KM ? (m < 1000 ? Math.max(10, Math.round(m / 10) * 10) + " m" : (Math.round(m / 100) / 10) + " km")
                      : (m < 160 ? Math.max(10, Math.round(m * 3.28084 / 10) * 10) + " ft" : (Math.round(m / 160.9344) / 10) + " mi");
  function circle(lng, lat, meters) {
    const out = [], dLat = meters / 111320, dLng = meters / (111320 * Math.max(0.01, Math.cos(rad(lat))));
    for (let i = 0; i <= 48; i++) { const a = i / 48 * 2 * Math.PI; out.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]); }
    return out;
  }
  const W = parseFloat(C.SITE.BOUNDS_WEST), S = parseFloat(C.SITE.BOUNDS_SOUTH), E = parseFloat(C.SITE.BOUNDS_EAST), N = parseFloat(C.SITE.BOUNDS_NORTH);
  const inArea = ll => ![W, S, E, N].every(isFinite) || (ll[0] >= W && ll[0] <= E && ll[1] >= S && ll[1] <= N);

  let state = "off", watchId = null, last = null, marker = null, centered = false, lock = null;
  let keepAwake = !!store.get("keep_awake", false);
  const subs = new Set(), reached = new Set();

  /* ---------- the button ---------- */
  const ICON = '<circle cx="12" cy="12" r="3.2" fill="currentColor"></circle><circle cx="12" cy="12" r="7.5"></circle><path d="M12 1.5v3.5M12 19v3.5M1.5 12H5M19 12h3.5"></path>';
  C.RENDER.near = () => {
    const b = document.createElement("button"); b.type = "button"; b.className = "round round-near" + (state !== "off" ? " on" : "") + (state === "follow" ? " follow" : "");
    const label = state === "off" ? L("near") : state === "on" ? L("nearFollow") : L("nearStop");
    b.setAttribute("aria-label", label); b.title = label; b.setAttribute("aria-pressed", state === "off" ? "false" : "true");
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICON + "</svg>";
    b.addEventListener("click", press);
    return b;
  };
  C.MENU_ITEMS.near = { show: () => true, label: () => state === "off" ? L("near") : L("nearStop"), run: press };
  const paint = () => C.renderControls();

  function press() {
    if (state === "off") { if (PRETEND || store.get("here_ok", false)) begin(); else ask(); }
    else if (state === "on") { state = "follow"; paint(); if (last && C.map) C.map.easeTo({ center: [last.lng, last.lat], duration: C.REDUCED ? 0 : 500 }); }
    else stop();
  }

  /* ---------- ask first, once ---------- */
  function ask() {
    const box = document.createElement("div"); box.className = "ask-back"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-labelledby", "askT");
    box.innerHTML = '<div class="ask-card"><div class="ask-icon"><svg viewBox="0 0 24 24" aria-hidden="true">' + ICON + '</svg></div><h2 id="askT">' + esc(L("askTitle")) + "</h2><p>" + esc(L("askText")) + "</p>" +
      '<div class="ask-btns"><button type="button" class="act" data-no="1">' + esc(L("askNo")) + '</button><button type="button" class="act act-main" data-yes="1">' + esc(L("askYes")) + "</button></div></div>";
    const close = () => { box.remove(); document.removeEventListener("keydown", key, true); };
    const key = e => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    box.querySelector("[data-yes]").onclick = () => { close(); store.set("here_ok", true); begin(); };
    box.querySelector("[data-no]").onclick = close;
    box.addEventListener("click", e => { if (e.target === box) close(); });
    document.addEventListener("keydown", key, true);
    document.body.appendChild(box); box.querySelector("[data-yes]").focus();
  }

  /* ---------- the little status line at the bottom ---------- */
  function chip(text, opts) {
    let el = document.getElementById("hereChip");
    if (!text) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement("div"); el.id = "hereChip"; el.className = "here-chip"; el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite"); document.body.appendChild(el); }
    el.classList.toggle("pretend", PRETEND);
    const canAwake = !!(navigator.wakeLock && navigator.wakeLock.request) && !(opts && opts.error);
    el.innerHTML = '<span class="hc-dot"></span><span class="hc-text">' + esc(text) + "</span>" +
      (canAwake ? '<label class="hc-awake"><input type="checkbox"' + (keepAwake ? " checked" : "") + "> " + esc(L("keepAwake")) + "</label>" : "") +
      (opts && opts.error ? "" : '<button type="button" class="hc-stop">' + esc(L("stop")) + "</button>");
    const cb = el.querySelector("input"); if (cb) cb.onchange = () => { keepAwake = cb.checked; store.set("keep_awake", keepAwake); awake(keepAwake && state !== "off"); };
    const sb = el.querySelector(".hc-stop"); if (sb) sb.onclick = stop;
  }
  let errTimer = 0;

  /* ---------- keep the screen on (the phone drops this when the page is hidden, so it's asked for again) ---------- */
  async function awake(on) {
    if (!(navigator.wakeLock && navigator.wakeLock.request)) return;
    try {
      if (on && !lock) { lock = await navigator.wakeLock.request("screen"); lock.addEventListener && lock.addEventListener("release", () => { lock = null; }); }
      else if (!on && lock) { const l = lock; lock = null; await l.release(); }
    } catch (e) { lock = null; }
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && state !== "off" && keepAwake) awake(true); });

  /* ---------- start and stop ---------- */
  function begin() {
    clearTimeout(errTimer); centered = false; reached.clear();
    state = "on"; paint();
    chip(PRETEND ? L("pretend") : L("looking"));
    if (keepAwake) awake(true);
    if (PRETEND) { const c = C.map ? C.map.getCenter() : { lng: 0, lat: 0 }; fix({ lng: c.lng, lat: c.lat, acc: 8, heading: null, speed: null }); return; }
    if (!navigator.geolocation) { fail("unsupported"); return; }
    watchId = navigator.geolocation.watchPosition(
      p => fix({ lng: p.coords.longitude, lat: p.coords.latitude, acc: p.coords.accuracy || 0, heading: isFinite(p.coords.heading) ? p.coords.heading : null, speed: isFinite(p.coords.speed) ? p.coords.speed : null }),
      err => fail(err && err.code === 1 ? "denied" : err && err.code === 3 ? "timeout" : "unavailable"),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  }
  function stop() {
    if (watchId != null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
    watchId = null; last = null; state = "off";
    if (marker) { marker.remove(); marker = null; }
    setAcc(null); awake(false); chip(null); paint(); refresh();
    subs.forEach(f => { try { f(null); } catch (e) { /* fine */ } });
  }
  function fail(code) {
    if (code === "timeout") { chip(L("looking")); return; }
    if (code === "unavailable") { chip(L("unavailable")); return; }        // a blip indoors or in a tunnel; the phone keeps trying
    stop();
    chip(L(code === "denied" ? "denied" : "unsupported"), { error: true });
    clearTimeout(errTimer); errTimer = setTimeout(() => chip(null), 9000);
  }

  /* ---------- the dot and its accuracy circle ---------- */
  C.onStyle(map => {
    if (map.getSource("ets-here-acc")) return;
    map.addSource("ets-here-acc", { type: "geojson", data: accData() });
    map.addLayer({ id: "ets-here-acc", type: "fill", source: "ets-here-acc", paint: { "fill-color": "#2F7DE1", "fill-opacity": 0.12 } });
    map.addLayer({ id: "ets-here-acc-line", type: "line", source: "ets-here-acc", paint: { "line-color": "#2F7DE1", "line-width": 1, "line-opacity": 0.5 } });
  });
  function accData() { return last && last.acc >= 3 && inArea([last.lng, last.lat]) ? { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [circle(last.lng, last.lat, last.acc)] } } : { type: "FeatureCollection", features: [] }; }
  function setAcc() { const s = C.map && C.map.getSource && C.map.getSource("ets-here-acc"); if (s) s.setData(accData()); }

  function ensureMarker(ll) {
    if (marker || !C.map || !window.maplibregl) return;
    const dot = document.createElement("div"); dot.className = "here-dot" + (PRETEND ? " pretend" : "");
    dot.innerHTML = '<span class="hd-wedge"></span>';
    marker = new maplibregl.Marker({ element: dot, draggable: PRETEND, anchor: "center" }).setLngLat(ll).addTo(C.map);
    if (PRETEND) marker.on("drag", () => { const p = marker.getLngLat(); fix({ lng: p.lng, lat: p.lat, acc: 8, heading: null, speed: null }, true); });
    else dot.addEventListener("click", e => { e.stopPropagation(); if (last) C.map.easeTo({ center: [last.lng, last.lat], zoom: Math.max(C.map.getZoom(), 16) }); });
  }
  function fix(f, fromDrag) {
    last = f;
    const ll = [f.lng, f.lat];
    ensureMarker(ll);
    const inside = inArea(ll);
    if (marker) { marker.getElement().hidden = !inside; if (!fromDrag) marker.setLngLat(ll); }
    const moving = f.heading != null && (f.speed == null || f.speed > 0.5);   // the little pointer only shows while they're moving
    if (marker) { marker.getElement().classList.toggle("has-heading", moving); if (moving) marker.getElement().style.setProperty("--h", Math.round(f.heading - (C.map.getBearing ? C.map.getBearing() : 0)) + "deg"); }
    setAcc();
    if (!inside) chip(L("outside"));
    else {
      if (!centered && !PRETEND && C.map) { centered = true; C.map.easeTo({ center: ll, zoom: Math.max(C.map.getZoom(), 16), duration: C.REDUCED ? 0 : 900 }); }
      else if (state === "follow" && C.map) C.map.easeTo({ center: ll, duration: C.REDUCED ? 0 : 500 });
      chip(PRETEND ? L("pretend") : f.acc <= 100 ? L("youAre") + " (" + L("accuracy", { d: fmt(f.acc) }) + ")" : L("poorFix"));
      discover(ll, f.acc);
    }
    refresh();
    subs.forEach(fn => { try { fn(f); } catch (e) { /* a listener's mistake must not stop the others */ } });
  }
  if (C.map) C.map.on("dragstart", e => { if (state === "follow" && e && e.originalEvent) { state = "on"; paint(); } });   // they moved the map themselves

  /* ---------- discover a place by being near it ---------- */
  function discover(ll, acc) {
    C.DATA.items.forEach(it => {
      const r = parseFloat(it.RADIUS) || (/^(near|gps|either|both)$/i.test(String(it.CHECKIN || "").trim()) ? 75 : 0);
      if (!it.hasPos || !(r > 0) || reached.has(it.ID)) return;
      if (distance(ll, [it.lng, it.lat]) <= r + Math.min(acc || 0, 50)) {
        reached.add(it.ID);
        if (navigator.vibrate && !C.REDUCED && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) { try { navigator.vibrate(60); } catch (e) { /* fine */ } }
        nearToast(it);
        document.dispatchEvent(new CustomEvent("ets:near", { detail: { item: it } }));   // the passport listens for this
      }
    });
  }
  function nearToast(it) {
    let el = document.getElementById("nearToast"); if (el) el.remove();
    el = document.createElement("button"); el.type = "button"; el.id = "nearToast"; el.className = "near-toast";
    el.innerHTML = '<span class="nt-dot" style="background:' + esc(C.colorFor(it)) + '"></span><span>' + esc(L("youreAt", { name: it.NAME || it.ID })) + "</span>";
    el.onclick = () => { el.remove(); C.goTo(it); };
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 8000);
  }

  /* ---------- distance lines on cards and tour stops ---------- */
  document.addEventListener("ets:card", e => {
    const it = e.detail.item; if (!it.hasPos) return;
    const line = document.createElement("div"); line.className = "c-near"; line.dataset.nearLl = it.lng + "," + it.lat; line.hidden = true;
    const after = e.detail.body.querySelector(".c-meta") || e.detail.body.querySelector(".c-head");
    if (after) after.after(line);
    refresh();
  });
  function refresh() {
    document.querySelectorAll("[data-near-ll]").forEach(el => {
      if (!last || state === "off" || last.acc > 150 || !inArea([last.lng, last.lat])) { el.hidden = true; return; }
      const to = el.dataset.nearLl.split(",").map(Number), from = [last.lng, last.lat], d = distance(from, to), b = bearing(from, to);
      el.hidden = false;
      el.innerHTML = '<span class="cn-arrow" style="transform:rotate(' + Math.round(b - (C.map && C.map.getBearing ? C.map.getBearing() : 0)) + 'deg)" aria-hidden="true">↑</span>' +
        "<span>" + esc(L("away", { d: fmt(d) })) + ", " + esc(L("toward", { dir: L("dir." + (Math.round(b / 45) % 8)) })) + "</span>";
    });
  }
  const body = document.getElementById("sheetBody");
  if (body && window.MutationObserver) new MutationObserver(() => { if (state !== "off") setTimeout(refresh, 0); }).observe(body, { childList: true });

  window.ETSNear = { distance, fmt, last: () => (state === "off" ? null : last), active: () => state !== "off", on: f => { subs.add(f); return () => subs.delete(f); }, start: () => { if (state === "off") press(); },
    simulate: (lng, lat) => { if (!PRETEND) return; if (marker) marker.setLngLat([lng, lat]); fix({ lng, lat, acc: 8, heading: null, speed: null }, true); } };   // Pretend Walk only
  C.renderControls();
})();
