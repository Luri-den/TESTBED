/* ETS Community Map: core.js
   The map, its places, groups, cards, search, categories, share links and settings.
   Everything specific to one site comes from the data/ folder; nothing about a place is written here.

   Plain-language guide to this file:
     1. Small helpers (reading files, CSV, wording)
     2. Loading the site's data (and an event folder, if the link asks for one)
     3. Look: theme color, fonts, Day / Night, badge
     4. The map and its background styles
     5. Markers and groups
     6. The card (bottom sheet on phones, side panel on bigger screens)
     7. Controls: search, categories, map style, more menu, about, share
     8. Start-up
*/
(function () {
  "use strict";

  /* ---------- 1. Small helpers ---------- */
  const Q = new URLSearchParams(location.search);
  const EMBED = Q.get("embed") === "1";
  const SAFE = Q.get("safe") === "1";
  const DEBUG = Q.get("debug") === "1";
  const REDUCED = SAFE || matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = id => document.getElementById(id);
  const problems = [];
  const warn = msg => { problems.push(msg); if (DEBUG) showDebug(); console.warn("[ETS] " + msg); };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function yes(v, def) {
    if (v == null || v === "") return !!def;
    return /^(yes|y|true|1|on)$/i.test(String(v).trim());
  }
  const store = {
    get(k, d) { try { const v = localStorage.getItem("ets_" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("ets_" + k, JSON.stringify(v)); } catch (e) { /* storage blocked: fine */ } }
  };

  // CSV reader: handles quotes, commas and line breaks inside quotes. Returns a list of rows keyed by column name.
  function parseCSV(text) {
    text = String(text || "").replace(/^﻿/, "");
    const rows = []; let row = [], field = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
        else field += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); rows.push(row); row = []; field = "";
      } else field += c;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    const head = (rows.shift() || []).map(h => h.trim());
    return rows.filter(r => r.some(v => String(v).trim() !== "")).map(r => {
      const o = {}; head.forEach((h, i) => { if (h) o[h] = (r[i] == null ? "" : String(r[i])).trim(); }); return o;
    });
  }

  // Where files come from. With ?sample=demo the sample pack is used; with ?event=name, that event's changed files.
  const SAMPLE = (Q.get("sample") || "").replace(/[^a-z0-9_-]/gi, "");
  const BASE = SAMPLE ? "samples/" + SAMPLE + "/" : "";
  let EVENT = null; // { name, overrides: [] }
  function dataUrl(file) {
    if (EVENT && EVENT.overrides.includes(file)) return "events/" + EVENT.name + "/data/" + file;
    return BASE + "data/" + file;
  }
  function mediaUrl(file) {
    if (!file) return "";
    if (/^(https?:)?\/\//i.test(file) || file.startsWith("data:")) return file;
    if (EVENT && EVENT.media && EVENT.media.has(file)) return "events/" + EVENT.name + "/media/" + file;
    return BASE + "media/" + file;
  }
  async function getText(url) {
    try {
      const r = await fetch(url, { cache: "no-cache" });
      if (!r.ok) { if (r.status !== 404) warn(url + " could not be read (" + r.status + ")."); return null; }
      return await r.text();
    } catch (e) { warn(url + " could not be read: " + e.message); return null; }
  }
  async function getCSV(file) {
    const t = await getText(dataUrl(file));
    if (t == null) { warn("data/" + file + " is missing. The map carries on without it."); return []; }
    try { return parseCSV(t); } catch (e) { warn("data/" + file + " has a problem and was skipped: " + e.message); return []; }
  }
  async function getJSON(file, prefix) {
    const t = await getText(prefix != null ? prefix + file : dataUrl(file));
    if (t == null) return null;
    try { return JSON.parse(t); } catch (e) { warn(file + " is not valid and was skipped: " + e.message); return null; }
  }

  // Every phrase a visitor reads. Any of them can be reworded in site.csv as LABEL.<key>.
  const WORDS = {
    search: "Search places and events", noResults: "Nothing matches that search.",
    openMaps: "Open in Maps", website: "Website", call: "Call", share: "Share", close: "Close",
    includes: "Includes {n} places", includesOne: "Includes 1 place", partOf: "Part of", alsoKnown: "Also known as",
    source: "Source", credit: "Photo", all: "All", categories: "Categories", mapStyle: "Map Style",
    standard: "Standard", topo: "Topographic", aerial: "Aerial", dayMode: "Switch to Day Mode", nightMode: "Switch to Night Mode",
    linkCopied: "Link copied", more: "More", shareMap: "Share This Map", openFull: "Open Full Map",
    emptyTitle: "This map is ready to be set up", emptyText: "Open the editor to choose your area and add your first places.",
    since: "Since {y}", listen: "Listen", watch: "Watch", transcript: "Transcript", group: "Group",
    photoSpot: "Photo Spot", story: "Story", about: "About", usOnly: "Only available for places in the United States",
    hours: "Hours", address: "Address", home: "Back to Start View"
  };
  let SITE = {};
  const L = (k, vars) => {
    let s = SITE["LABEL." + k] || WORDS[k] || k;
    if (vars) Object.keys(vars).forEach(v => { s = s.split("{" + v + "}").join(vars[v]); });
    return s;
  };

  /* ---------- 2. Loading the site's data ---------- */
  const DATA = { items: [], byId: new Map(), cats: new Map(), media: new Map(), map: null, icons: { icons: {}, shapes: {} } };

  async function loadAll() {
    const ev = (Q.get("event") || "").replace(/[^a-z0-9_-]/gi, "");
    if (ev) {
      const ej = await getJSON("event.json", "events/" + ev + "/");
      if (ej) EVENT = { name: ev, overrides: ej.overrides || [], title: ej.title || ev, media: new Set() };
      else warn("The event \"" + ev + "\" wasn't found, so the main map is shown.");
    }
    const siteRows = await getCSV("site.csv");
    SITE = {};
    siteRows.forEach(r => { if (r.KEY) SITE[r.KEY.trim()] = r.VALUE || ""; });
    if (EVENT && EVENT.overrides.includes("site.csv")) {          // an event's site.csv only lists what changes
      const main = parseCSV(await getText(BASE + "data/site.csv") || "");
      const merged = {}; main.forEach(r => { if (r.KEY) merged[r.KEY.trim()] = r.VALUE || ""; });
      SITE = Object.assign(merged, SITE);
    }
    const [items, cats, media, map, icons] = await Promise.all([
      getCSV("items.csv"), getCSV("categories.csv"), getCSV("media.csv"), getJSON("map.json"), getJSON("icons.json")
    ]);
    if (EVENT) media.forEach(m => m.FILE && EVENT.media.add(m.FILE));
    DATA.map = map || { outline: null, overlays: [], backdrop: null };
    DATA.icons = icons || { icons: {}, shapes: {} };
    cats.forEach(c => { if (c.CODE) DATA.cats.set(c.CODE, c); });
    media.forEach(m => {
      if (!m.ITEM_ID) return;
      if (!DATA.media.has(m.ITEM_ID)) DATA.media.set(m.ITEM_ID, []);
      DATA.media.get(m.ITEM_ID).push(m);
    });
    DATA.media.forEach(list => list.sort((a, b) => (+a.ORDER || 999) - (+b.ORDER || 999)));
    items.forEach(it => {
      const lat = parseFloat(it.LAT), lng = parseFloat(it.LONG);
      if (!it.ID) return;
      if (DATA.byId.has(it.ID)) { warn("Two items share the ID " + it.ID + ". Only the first is shown."); return; }
      it.lat = lat; it.lng = lng; it.hasPos = isFinite(lat) && isFinite(lng);
      it.kind = (it.KIND || "place").toLowerCase();
      it.members = [];
      DATA.items.push(it); DATA.byId.set(it.ID, it);
    });
    DATA.items.forEach(it => {
      if (it.PART_OF) {
        const g = DATA.byId.get(it.PART_OF);
        if (g && g !== it && !g.PART_OF) g.members.push(it);
        else { warn(it.ID + " is part of " + it.PART_OF + ", which doesn't exist or is itself in a group. Shown on its own."); it.PART_OF = ""; }
      }
      if (it.CATEGORY && !DATA.cats.has(it.CATEGORY)) warn(it.ID + " uses category " + it.CATEGORY + ", which isn't in categories.csv.");
    });
  }

  /* ---------- 3. Look: theme color, fonts, Day / Night, badge ---------- */
  function hexToRgb(h) {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(h || "").trim());
    if (!m) return null;
    let s = m[1]; if (s.length === 3) s = s.split("").map(c => c + c).join("");
    return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16));
  }
  const luminance = rgb => { const a = rgb.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; };
  const mix = (rgb, to, t) => rgb.map((v, i) => Math.round(v + (to[i] - v) * t));
  const rgbStr = rgb => "rgb(" + rgb.join(",") + ")";

  const FONTS = {
    "": "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    system: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    book: "Georgia, 'Times New Roman', serif", serif: "Georgia, 'Times New Roman', serif",
    rounded: "ui-rounded, 'SF Pro Rounded', system-ui, sans-serif", mono: "ui-monospace, 'SF Mono', Menlo, monospace"
  };
  const fontFor = v => FONTS[String(v || "").toLowerCase()] || (v ? "'" + v.replace(/'/g, "") + "', system-ui, sans-serif" : FONTS[""]);

  function applyLook() {
    const root = document.documentElement.style;
    const accent = hexToRgb(SITE.BAR_COLOR) || [11, 122, 117];
    const night = mix(accent, [255, 255, 255], 0.35);
    root.setProperty("--accent-day", rgbStr(accent));
    root.setProperty("--accent-night", rgbStr(night));
    root.setProperty("--on-accent-day", luminance(accent) > 0.45 ? "#14181B" : "#FFFFFF");
    root.setProperty("--on-accent-night", luminance(night) > 0.45 ? "#0B1A1A" : "#FFFFFF");
    root.setProperty("--font-body", fontFor(SITE.FONT_BODY));
    root.setProperty("--font-head", fontFor(SITE.FONT_HEAD || SITE.FONT_BODY));
    const place = (SITE.PLACE || "").trim();
    const fill = s => String(s || "").split("{PLACE}").join(place).trim();
    document.title = fill(SITE.TAB_TITLE) || place || "Map";
    const tc = document.querySelector('meta[name="theme-color"]'); if (tc) tc.content = rgbStr(accent);
    if (EMBED) document.body.classList.add("embed");
    if (REDUCED) document.body.classList.add("reduced");
  }

  // Day / Night: the visitor's own choice is remembered; otherwise it follows the phone's setting.
  let NIGHT = false;
  function initTheme() {
    const saved = store.get("theme", null);
    NIGHT = saved ? saved === "night" : matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = NIGHT ? "night" : "day";
  }
  function setNight(on) {
    NIGHT = on; store.set("theme", on ? "night" : "day");
    document.documentElement.dataset.theme = on ? "night" : "day";
    renderControls(); setBaseStyle(STYLE_MODE, true);
  }

  // The badge at the start of the search bar: an uploaded logo, initials, an icon, or the area's own outline.
  function outlineRings() {
    const o = DATA.map && DATA.map.outline;
    if (!o) return [];
    const feats = o.type === "FeatureCollection" ? o.features : o.type === "Feature" ? [o] : [{ geometry: o }];
    const rings = [];
    feats.forEach(f => {
      const g = f && f.geometry; if (!g) return;
      if (g.type === "Polygon") rings.push(g.coordinates[0]);
      if (g.type === "MultiPolygon") g.coordinates.forEach(p => rings.push(p[0]));
      if (g.type === "LineString") rings.push(g.coordinates);
    });
    return rings.filter(r => r && r.length > 2);
  }
  function outlineSvgPath(size) {
    const rings = outlineRings(); if (!rings.length) return "";
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let latSum = 0, n = 0; rings.forEach(r => r.forEach(p => { latSum += p[1]; n++; }));
    const k = Math.cos((latSum / n) * Math.PI / 180);
    const proj = ([x, y]) => [x * k, -y];                              // keeps the shape from looking stretched
    rings.forEach(r => r.forEach(p => { const [x, y] = proj(p); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }));
    const pad = size * 0.08, s = (size - pad * 2) / Math.max(maxX - minX, maxY - minY || 1e-9);
    const ox = (size - (maxX - minX) * s) / 2, oy = (size - (maxY - minY) * s) / 2;
    return rings.map(r => {
      const step = Math.max(1, Math.floor(r.length / 160));            // trims fine detail that can't be seen at badge size
      const pts = r.filter((_, i) => i % step === 0).map(p => { const [x, y] = proj(p); return ((x - minX) * s + ox).toFixed(1) + " " + ((y - minY) * s + oy).toFixed(1); });
      return "M" + pts.join("L") + "Z";
    }).join("");
  }
  function iconDataUrl(key, size) {
    const ic = DATA.icons.icons[key]; if (!ic) return "";
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + (size || 120) + '" height="' + (size || 120) + '" viewBox="' + esc(ic.vb || "0 0 60 60") + '">' + (ic.art || "") + "</svg>";
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }
  function badgeHtml() {
    const kind = (SITE.BADGE || "").toLowerCase();
    const place = (SITE.PLACE || "").trim();
    const initials = (SITE.BADGE_TEXT || place.split(/[\s,]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("")).slice(0, 2).toUpperCase();
    if (kind === "logo" && SITE.BADGE_LOGO) return '<img src="' + esc(mediaUrl(SITE.BADGE_LOGO)) + '" alt="">';
    if (kind === "icon" && DATA.icons.icons[SITE.BADGE_ICON]) return '<img src="' + iconDataUrl(SITE.BADGE_ICON, 48) + '" alt="">';
    const path = (kind === "shape" || !kind) ? outlineSvgPath(48) : "";
    if (path) {
      const st = (SITE.BADGE_STYLE || "filled").toLowerCase();
      const attrs = st === "outline" ? 'fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"'
        : st === "line" ? 'fill="none" stroke="currentColor" stroke-width="3.5" stroke-dasharray="1 5" stroke-linecap="round" stroke-linejoin="round"'
        : 'fill="currentColor"';
      return '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="' + path + '" ' + attrs + "></path></svg>";
    }
    if (initials) return '<span class="badge-text">' + esc(initials) + "</span>";
    return '<svg viewBox="0 0 24 24" aria-hidden="true" class="badge-pin"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"></path><circle cx="12" cy="9.5" r="2.5"></circle></svg>';
  }

  /* ---------- 4. The map and its background styles ---------- */
  let map = null;
  let STYLE_MODE = store.get("mapstyle", "standard");
  const IN_US = () => { const c = map ? map.getCenter() : null; return !!c && c.lat > 17 && c.lat < 72 && c.lng > -180 && c.lng < -64; };

  function rasterStyle(sources) {
    const st = { version: 8, sources: {}, layers: [] };
    sources.forEach((s, i) => {
      st.sources["base" + i] = { type: "raster", tiles: [s.url], tileSize: 256, maxzoom: s.maxzoom || 19, attribution: s.credit || "" };
      st.layers.push({ id: "base" + i, type: "raster", source: "base" + i, minzoom: s.minzoom || 0 });
    });
    return st;
  }
  const USGS = n => "https://basemap.nationalmap.gov/arcgis/rest/services/" + n + "/MapServer/tile/{z}/{y}/{x}";
  const USGS_CREDIT = "U.S. Geological Survey, National Geospatial Program";
  function styleFor(mode) {
    if (mode === "topo") return rasterStyle([{ url: USGS("USGSTopo"), maxzoom: 16, credit: USGS_CREDIT }]);
    if (mode === "aerial") {
      const src = [{ url: USGS("USGSImageryOnly"), maxzoom: 16, credit: USGS_CREDIT }];
      if (SITE.LOCAL_IMAGERY_URL) src.push({ url: SITE.LOCAL_IMAGERY_URL, minzoom: +SITE.LOCAL_IMAGERY_MINZOOM || 13, maxzoom: 20, credit: SITE.LOCAL_IMAGERY_CREDIT || "" });
      return rasterStyle(src);
    }
    return "https://tiles.openfreemap.org/styles/" + (NIGHT ? "dark" : "liberty");
  }
  let currentStyleKey = "";
  function setBaseStyle(mode, force) {
    STYLE_MODE = mode;
    const key = mode + (mode === "standard" ? (NIGHT ? "-n" : "-d") : "");
    if (!map || key === currentStyleKey) return;
    currentStyleKey = key;
    map.setStyle(styleFor(mode), { diff: false });
  }

  function addOverlayLayers() {           // runs every time the background style changes
    if (!map) return;
    const o = DATA.map && DATA.map.outline;
    if (o && !map.getSource("ets-outline")) {
      try {
        map.addSource("ets-outline", { type: "geojson", data: o });
        const p = (o.features && o.features[0] && o.features[0].properties) || o.properties || {};
        const dash = String(p["stroke-dasharray"] || "").toLowerCase();
        const paint = { "line-color": p.stroke || cssVar("--accent"), "line-width": Math.min(+p["stroke-width"] || 3, 10), "line-opacity": 0.85 };
        if (dash === "dotted") paint["line-dasharray"] = [0.1, 2];
        else if (dash === "dashed") paint["line-dasharray"] = [3, 2];
        map.addLayer({ id: "ets-outline", type: "line", source: "ets-outline", paint, layout: { "line-cap": dash === "dotted" ? "round" : "butt", "line-join": "round" } });
      } catch (e) { warn("The area outline couldn't be drawn: " + e.message); }
    }
    if (!map.getSource("ets-group-lines")) {
      map.addSource("ets-group-lines", { type: "geojson", data: groupLinesData() });
      map.addLayer({ id: "ets-group-lines", type: "line", source: "ets-group-lines",
        paint: { "line-color": ["get", "color"], "line-width": 1.6, "line-opacity": 0.8, "line-dasharray": [2, 2] } });
    }
  }
  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#0B7A75"; }

  function startView() {
    const lat = parseFloat(SITE.CENTER_LAT), lng = parseFloat(SITE.CENTER_LNG), z = parseFloat(SITE.ZOOM);
    const view = { center: [0, 20], zoom: 1.4 };
    if (isFinite(lat) && isFinite(lng)) { view.center = [lng, lat]; view.zoom = isFinite(z) ? z : 13; }
    return view;
  }
  function boundsOf(points) {
    if (!points.length) return null;
    let w = 180, s = 90, e = -180, n = -90;
    points.forEach(([x, y]) => { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); });
    return [[w, s], [e, n]];
  }

  function makeMap() {
    if (!window.maplibregl) {
      warn("The map library didn't load (no connection, or it was blocked). Places are still listed in search.");
      document.body.classList.add("no-map");
      return;
    }
    const v = startView();
    const W = parseFloat(SITE.BOUNDS_WEST), S = parseFloat(SITE.BOUNDS_SOUTH), E = parseFloat(SITE.BOUNDS_EAST), N = parseFloat(SITE.BOUNDS_NORTH);
    const opts = {
      container: "map", style: styleFor(STYLE_MODE === "standard" ? "standard" : STYLE_MODE), center: v.center, zoom: v.zoom,
      attributionControl: { compact: true }, cooperativeGestures: EMBED, dragRotate: false, pitchWithRotate: false
    };
    currentStyleKey = STYLE_MODE + (STYLE_MODE === "standard" ? (NIGHT ? "-n" : "-d") : "");
    if ([W, S, E, N].every(isFinite)) opts.maxBounds = [[W, S], [E, N]];
    if (isFinite(parseFloat(SITE.MIN_ZOOM))) opts.minZoom = parseFloat(SITE.MIN_ZOOM);
    if (isFinite(parseFloat(SITE.MAX_ZOOM))) opts.maxZoom = parseFloat(SITE.MAX_ZOOM);
    map = new maplibregl.Map(opts);
    map.touchZoomRotate && map.touchZoomRotate.disableRotation && map.touchZoomRotate.disableRotation();
    const zp = (SITE.ZOOM_POS || "").toLowerCase();
    if (zp !== "off" && zp !== "none") map.addControl(new maplibregl.NavigationControl({ showCompass: false }), zp === "bottom" ? "bottom-right" : "top-right");
    map.on("style.load", addOverlayLayers);
    map.on("error", e => { if (e && e.error && /tiles|style/i.test(String(e.error.message))) warn("Map background: " + e.error.message); });
    map.on("zoomend", refreshMarkerVisibility);
    map.on("movestart", e => { if (e && e.originalEvent && GROUP_VIEW) GROUP_VIEW.moved = true; });   // the visitor moved it themselves
    map.on("click", e => {            // tapping empty map closes menus and the card
      if (!e.originalEvent || e.originalEvent.target !== map.getCanvas()) return;
      closeMenus();
      if (SHEET.state !== "closed") { closeSheet(); if (OPEN_GROUP) closeGroup(); }
    });
  }
  // The start view: the saved center and zoom, or else everything on the map, or else the area outline.
  function goHome(animate) {
    if (!map) return;
    const dur = animate && !REDUCED ? 700 : 0;
    const lat = parseFloat(SITE.CENTER_LAT), lng = parseFloat(SITE.CENTER_LNG), z = parseFloat(SITE.ZOOM);
    const pts = DATA.items.filter(i => i.hasPos && !i.PART_OF).map(i => [i.lng, i.lat]);
    if (yes(SITE.FIT_TO_MARKERS, true) && pts.length > 1) { map.fitBounds(boundsOf(pts), { padding: 70, maxZoom: 16, duration: dur }); return; }
    if (isFinite(lat) && isFinite(lng)) { map.easeTo({ center: [lng, lat], zoom: isFinite(z) ? z : 13, duration: dur }); return; }
    const rings = outlineRings();
    if (rings.length) map.fitBounds(boundsOf(rings.flat()), { padding: 40, duration: dur });
    else if (pts.length === 1) map.easeTo({ center: pts[0], zoom: 15, duration: dur });
  }
  function fitStart(hasDeepLink) { if (!hasDeepLink) goHome(false); }

  /* ---------- 5. Markers and groups ---------- */
  const SHAPES = {   // built-in marker outlines (corners as % of the marker box)
    diamond: "50 0;100 50;50 100;0 50", triangle: "50 3;100 92;0 92", shield: "50 0;100 10;100 60;50 100;0 60;0 10",
    flag1: "0 0;100 0;75 50;100 100;0 100", cross: "35 0;65 0;65 35;100 35;100 65;65 65;65 100;35 100;35 65;0 65;0 35;35 35",
    speechbubble: "10 10;90 10;100 20;100 60;90 70;60 70;50 100;40 70;10 70;0 60;0 20",
    starburst: "50 0;60 25;90 10;75 40;100 50;75 60;90 90;60 75;50 100;40 75;10 90;25 60;0 50;25 40;10 10;40 25",
    pentagon: "50 0;98 35;79 90;21 90;2 35", hexagon: "50 0;93 25;93 75;50 100;7 75;7 25",
    octagon: "29 0;71 0;100 29;100 71;71 100;29 100;0 71;0 29", star: "50 0;63 38;100 38;69 62;81 100;50 77;19 100;31 62;0 38;37 38",
    trapezoid: "20 0;80 0;100 100;0 100"
  };
  function clipFor(code) {
    code = String(code || "").toLowerCase();
    if (!code || code === "circle") return "";
    if (code === "square") return "inset(3% round 18%)";
    const pts = SHAPES[code] || (DATA.icons.shapes[code] && DATA.icons.shapes[code].points);
    if (!pts) return "";
    return "polygon(" + String(pts).split(";").map(p => p.trim().split(/\s+/).map(n => n + "%").join(" ")).join(",") + ")";
  }
  const FIXED = { photospot: { color: "#3F4A52", glyph: "camera" }, story: { color: "#C2410C", glyph: "sparkle" } };
  const GLYPHS = {
    camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"></path><circle cx="12" cy="13" r="3.5"></circle>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"></path>',
    pin: '<circle cx="12" cy="12" r="4"></circle>'
  };
  function colorFor(it) {
    if (it.ICON_COLOR) return it.ICON_COLOR;
    if (FIXED[it.kind] && !it.CATEGORY) return FIXED[it.kind].color;
    const c = DATA.cats.get(it.CATEGORY);
    return (c && c.COLOR) || (FIXED[it.kind] ? FIXED[it.kind].color : "#4A555E");
  }
  function iconKeyFor(it) { const c = DATA.cats.get(it.CATEGORY); return it.ICON || (c && c.ICON) || ""; }

  const MARKERS = new Map();     // item ID -> { marker, el }
  let OPEN_GROUP = null;
  let HIDDEN = new Set(store.get("hidden_cats", []));

  function markerEl(it) {
    const el = document.createElement("button");
    el.className = "mk mk-" + it.kind + (yes(it.MAJOR) ? " mk-major" : "") + (it.PART_OF ? " mk-member" : "") + (it.members.length ? " mk-group" : "");
    el.type = "button";
    el.setAttribute("aria-label", it.NAME || it.ID);
    const color = colorFor(it);
    const cat = DATA.cats.get(it.CATEGORY) || {};
    const shapeCode = it.members.length ? (it.SHAPE || SITE.GROUP_SHAPE || cat.SHAPE) : (it.SHAPE || cat.SHAPE);
    const clip = clipFor(shapeCode);
    const key = iconKeyFor(it);
    let inner;
    if (FIXED[it.kind] && !it.ICON) inner = '<svg viewBox="0 0 24 24" aria-hidden="true">' + GLYPHS[FIXED[it.kind].glyph] + "</svg>";
    else if (key && DATA.icons.icons[key]) inner = '<img src="' + iconDataUrl(key, 64) + '" alt="">';
    else inner = '<svg viewBox="0 0 24 24" aria-hidden="true">' + GLYPHS.pin + "</svg>";
    const effect = String(it.EFFECT || "").toLowerCase();
    el.innerHTML =
      (it.members.length ? '<span class="mk-stack" style="background:' + esc(color) + (clip ? ";clip-path:" + clip : "") + '"></span>' : "") +
      '<span class="mk-face' + (effect && effect !== "none" && !REDUCED ? " fx-" + esc(effect) : "") + '" style="background:' + esc(color) + (clip ? ";clip-path:" + clip : "") + '">' + inner + "</span>" +
      (it.members.length ? '<span class="mk-count">' + it.members.length + "</span>" : "");
    el.addEventListener("click", ev => { ev.stopPropagation(); onMarkerTap(it); });
    return el;
  }
  function buildMarkers() {
    if (!map) return;
    DATA.items.forEach(it => {
      if (!it.hasPos) return;
      const el = markerEl(it);
      const marker = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([it.lng, it.lat]).addTo(map);
      MARKERS.set(it.ID, { marker, el });
    });
    refreshMarkerVisibility();
  }
  function membersAlwaysShown(g) { return String(g.SHOW_MEMBERS || SITE.SHOW_MEMBERS || "").toLowerCase() === "always" && map && map.getZoom() >= 15; }
  function refreshMarkerVisibility() {
    MARKERS.forEach(({ el }, id) => {
      const it = DATA.byId.get(id);
      let show = !HIDDEN.has(it.CATEGORY || "");
      if (it.PART_OF) { const g = DATA.byId.get(it.PART_OF); show = show && (OPEN_GROUP === g || membersAlwaysShown(g)); }
      el.hidden = !show;
      el.classList.toggle("is-open", it === OPEN_GROUP);
    });
    updateGroupLines();
  }
  function groupLinesData() {
    const feats = [];
    if (OPEN_GROUP && OPEN_GROUP.hasPos) {
      OPEN_GROUP.members.filter(m => m.hasPos && !HIDDEN.has(m.CATEGORY || "")).forEach(m => feats.push({
        type: "Feature", properties: { color: colorFor(OPEN_GROUP) },
        geometry: { type: "LineString", coordinates: [[OPEN_GROUP.lng, OPEN_GROUP.lat], [m.lng, m.lat]] }
      }));
    }
    return { type: "FeatureCollection", features: feats };
  }
  function updateGroupLines() { const s = map && map.getSource && map.getSource("ets-group-lines"); if (s) s.setData(groupLinesData()); }

  function onMarkerTap(it) {
    closeMenus();
    if (it.members.length) {
      if (OPEN_GROUP === it && SHEET.item === it) { closeGroup(); closeSheet(); return; }
      openGroup(it);
    } else if (it.PART_OF) {
      OPEN_GROUP = DATA.byId.get(it.PART_OF); refreshMarkerVisibility();
    } else if (OPEN_GROUP) { GROUP_VIEW = null; closeGroup(); }
    openCard(it);
  }
  let GROUP_VIEW = null;   // where the map was before a group zoomed in
  function openGroup(g) {
    if (map && OPEN_GROUP !== g) { const c = map.getCenter(); GROUP_VIEW = { center: [c.lng, c.lat], zoom: map.getZoom(), moved: false }; }
    OPEN_GROUP = g; refreshMarkerVisibility();
    const pts = [g, ...g.members].filter(i => i.hasPos).map(i => [i.lng, i.lat]);
    if (map && pts.length > 1) map.fitBounds(boundsOf(pts), { padding: { top: 140, bottom: sheetPad(), left: 60, right: 60 }, maxZoom: 17, duration: REDUCED ? 0 : 700 });
  }
  function closeGroup() {
    OPEN_GROUP = null; refreshMarkerVisibility();
    if (map && GROUP_VIEW && !GROUP_VIEW.moved) map.easeTo({ center: GROUP_VIEW.center, zoom: GROUP_VIEW.zoom, duration: REDUCED ? 0 : 600 });
    GROUP_VIEW = null;
  }

  /* ---------- 6. The card ---------- */
  const SHEET = { item: null, state: "closed" };
  const desktop = () => matchMedia("(min-width: 900px)").matches;
  const sheetPad = () => desktop() ? 60 : 330;

  function photoRows(it) { return (DATA.media.get(it.ID) || []).filter(m => (m.KIND || "photo").toLowerCase() === "photo" && m.FILE); }
  function otherMedia(it) { return (DATA.media.get(it.ID) || []).filter(m => /^(audio|video)$/i.test(m.KIND || "")); }
  function yearsText(it) {
    const a = it.YEAR_START, b = it.YEAR_END;
    if (a && b) return a + " – " + b;
    if (a) return L("since", { y: a });
    return "";
  }
  function kindLabel(it) {
    if (it.members.length) return L("group");
    if (it.kind === "photospot") return L("photoSpot");
    if (it.kind === "story") return L("story");
    return "";
  }
  const ICON = {
    maps: '<path d="M14 3h7v7M21 3l-9 9"></path><path d="M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"></path>',
    web: '<circle cx="12" cy="12" r="9"></circle><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"></path>',
    call: '<path d="M5 3h4l2 5-3 2a12 12 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A18 18 0 0 1 3 5a2 2 0 0 1 2-2z"></path>',
    share: '<path d="M12 3v12M7 8l5-5 5 5"></path><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"></path>',
    clock: '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>',
    place: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"></path><circle cx="12" cy="9.5" r="2.5"></circle>',
    group: '<path d="M3 21h18M5 10h14M12 3l8 5H4z"></path>',
    play: '<path d="M7 4l13 8-13 8z"></path>'
  };
  const svgI = (k, cls) => '<svg class="' + (cls || "i") + '" viewBox="0 0 24 24" aria-hidden="true">' + ICON[k] + "</svg>";
  function paragraphs(t) { return String(t || "").split(/\n\s*\n/).map(p => "<p>" + esc(p).replace(/\n/g, "<br>") + "</p>").join(""); }
  function safeLink(u) { u = String(u || "").trim(); if (!u) return ""; if (!/^https?:\/\//i.test(u)) u = "https://" + u; return u; }

  function cardHtml(it) {
    const photos = photoRows(it);
    const color = colorFor(it);
    const cat = DATA.cats.get(it.CATEGORY);
    const parts = [];
    if (photos.length) {
      parts.push('<div class="gallery" data-count="' + photos.length + '">' + photos.map((p, i) =>
        '<figure class="g-item"><img ' + (i ? 'loading="lazy" ' : "") + 'src="' + esc(mediaUrl(p.FILE)) + '" alt="' + esc(p.CAPTION || it.NAME || "") + '" data-anim="' + esc(p.ANIMATION ? mediaUrl(p.ANIMATION) : "") + '">' +
        (p.CAPTION || p.CREDIT ? "<figcaption>" + esc(p.CAPTION || "") + (p.CREDIT ? ' <span class="credit">' + esc(L("credit")) + ": " + esc(p.CREDIT) + "</span>" : "") + "</figcaption>" : "") + "</figure>").join("") +
        (photos.length > 1 ? '<span class="g-count">1 / ' + photos.length + "</span>" : "") + "</div>");
    }
    const kl = kindLabel(it);
    parts.push('<div class="c-head">' + (kl ? '<div class="c-kind" style="color:' + esc(color) + '">' + esc(kl.toUpperCase()) + "</div>" : "") +
      '<h2 class="c-title">' + esc(it.NAME || it.ID) + "</h2></div>");
    const meta = [];
    if (cat) meta.push('<span class="dot" style="background:' + esc(cat.COLOR || color) + '"></span>' + esc(cat.LABEL || cat.CODE));
    const yt = yearsText(it); if (yt) meta.push(esc(yt));
    if (it.members.length) meta.push(esc(it.members.length === 1 ? L("includesOne") : L("includes", { n: it.members.length })));
    if (meta.length) parts.push('<div class="c-meta">' + meta.join('<span class="sep">·</span>') + "</div>");
    if (it.OTHER_NAMES) parts.push('<div class="c-aka">' + esc(L("alsoKnown")) + ": " + esc(it.OTHER_NAMES) + "</div>");

    const acts = [];
    if (it.hasPos && yes(SITE.MAPS_LINK, true)) acts.push('<a class="act act-main" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + it.lat + "," + it.lng + '">' + svgI("maps") + "<span>" + esc(L("openMaps")) + "</span></a>");
    if (it.WEBSITE) acts.push('<a class="act" target="_blank" rel="noopener" href="' + esc(safeLink(it.WEBSITE)) + '">' + svgI("web") + "<span>" + esc(L("website")) + "</span></a>");
    if (it.PHONE) acts.push('<a class="act" href="tel:' + esc(it.PHONE.replace(/[^\d+]/g, "")) + '">' + svgI("call") + "<span>" + esc(L("call")) + "</span></a>");
    acts.push('<button class="act" type="button" data-share="' + esc(it.ID) + '">' + svgI("share") + "<span>" + esc(L("share")) + "</span></button>");
    parts.push('<div class="c-acts">' + acts.join("") + "</div>");

    const info = [];
    if (it.HOURS) info.push('<div class="row">' + svgI("clock") + "<span>" + esc(it.HOURS) + "</span></div>");
    if (it.ADDRESS) info.push('<div class="row">' + svgI("place") + "<span>" + esc(it.ADDRESS) + "</span></div>");
    if (it.PART_OF) { const g = DATA.byId.get(it.PART_OF); if (g) info.push('<div class="row">' + svgI("group") + "<span>" + esc(L("partOf")) + ' <button type="button" class="linkish" data-open="' + esc(g.ID) + '">' + esc(g.NAME || g.ID) + "</button></span></div>"); }
    if (it.ORG) info.push('<div class="row">' + svgI("group") + "<span>" + esc(it.ORG) + "</span></div>");
    if (info.length) parts.push('<div class="c-info">' + info.join("") + "</div>");

    if (it.members.length) {
      parts.push('<div class="c-members">' + it.members.map(m =>
        '<button type="button" class="member" data-open="' + esc(m.ID) + '"><span class="m-dot" style="background:' + esc(colorFor(m)) + '"></span><span>' + esc(m.NAME || m.ID) + "</span></button>").join("") + "</div>");
    }
    const om = otherMedia(it);
    if (om.length) {
      parts.push('<div class="c-media">' + om.map((m, i) => {
        const isVid = /video/i.test(m.KIND);
        return '<div class="media-row"><button type="button" class="play" data-media="' + i + '" aria-label="' + esc(isVid ? L("watch") : L("listen")) + '">' + svgI("play") + "</button>" +
          '<div class="m-text"><div class="m-title">' + esc(m.CAPTION || (isVid ? L("watch") : L("listen"))) + (m.SECONDS ? ' · ' + esc(fmtSecs(m.SECONDS)) : "") + "</div>" +
          (m.CREDIT ? '<div class="m-sub">' + esc(m.CREDIT) + "</div>" : "") +
          (m.TRANSCRIPT ? '<details><summary>' + esc(L("transcript")) + "</summary>" + paragraphs(m.TRANSCRIPT) + "</details>" : "") +
          '<div class="m-player"></div></div></div>';
      }).join("") + "</div>");
    }
    if (it.TEXT) parts.push('<div class="c-text">' + paragraphs(it.TEXT) + "</div>");
    if (it.SOURCE) parts.push('<div class="c-source">' + esc(L("source")) + ": " + esc(it.SOURCE) + "</div>");
    if (it.CREDIT && !photos.length) parts.push('<div class="c-source">' + esc(it.CREDIT) + "</div>");
    return parts.join("");
  }
  const fmtSecs = s => { s = Math.round(+s || 0); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };

  function wireCard(it) {
    const body = $("sheetBody");
    body.querySelectorAll("[data-open]").forEach(b => b.addEventListener("click", () => {
      const t = DATA.byId.get(b.dataset.open); if (!t) return;
      if (t.members.length) openGroup(t);
      if (t.hasPos && map) map.easeTo({ center: [t.lng, t.lat], duration: REDUCED ? 0 : 500 });
      openCard(t);
    }));
    body.querySelectorAll("[data-share]").forEach(b => b.addEventListener("click", () => shareLink(it)));
    const om = otherMedia(it);
    body.querySelectorAll("[data-media]").forEach(b => b.addEventListener("click", () => {   // nothing plays or downloads until pressed
      const m = om[+b.dataset.media], box = b.parentElement.querySelector(".m-player");
      if (!m || box.firstChild) return;
      if (/video/i.test(m.KIND)) {
        const id = (/(?:youtu\.be\/|v=|embed\/)([\w-]{11})/.exec(m.FILE) || [])[1] || (/^[\w-]{11}$/.test(m.FILE) ? m.FILE : "");
        if (id) box.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1" title="' + esc(m.CAPTION || "Video") + '" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>';
        else warn("Video for " + it.ID + " isn't a YouTube link: " + m.FILE);
      } else {
        const a = document.createElement("audio"); a.controls = true; a.src = mediaUrl(m.FILE); box.appendChild(a); a.play().catch(() => {});
      }
    }));
    const gal = body.querySelector(".gallery");
    if (gal) {
      const counter = gal.querySelector(".g-count");
      gal.addEventListener("scroll", () => {
        if (!counter) return;
        const i = Math.round(gal.scrollLeft / Math.max(1, gal.clientWidth));
        counter.textContent = (i + 1) + " / " + gal.dataset.count;
      }, { passive: true });
      const first = gal.querySelector("img");
      first.addEventListener("error", () => { first.closest("figure").classList.add("missing"); warn("Photo not found: " + first.getAttribute("src")); }, { once: true });
      if (first.dataset.anim && !REDUCED) {                // an animated photo plays once, then rests on the still
        const v = document.createElement("video");
        v.muted = true; v.playsInline = true; v.src = first.dataset.anim; v.className = "g-anim";
        v.addEventListener("ended", () => v.remove()); v.addEventListener("error", () => v.remove());
        first.parentElement.appendChild(v); v.play().catch(() => v.remove());
      }
    }
  }

  function openCard(it) {
    SHEET.item = it;
    const body = $("sheetBody");
    body.innerHTML = cardHtml(it);
    body.scrollTop = 0;
    wireCard(it);
    setSheet(desktop() ? "open" : "peek");
    setUrl({ place: it.ID });
  }
  function closeSheet() { SHEET.item = null; setSheet("closed"); setUrl({ place: null }); }
  function setSheet(state) {
    SHEET.state = state;
    const s = $("sheet"); s.dataset.state = state;
    $("sheetHandle").setAttribute("aria-expanded", state === "open" ? "true" : "false");
    requestAnimationFrame(updateScrollLine);
  }

  // The thick scroll line: always visible when a card has more to read.
  function updateScrollLine() {
    const b = $("sheetBody"), t = $("scrollTrack"), th = $("scrollThumb");
    const ratio = b.clientHeight / Math.max(1, b.scrollHeight);
    if (ratio >= 0.995 || SHEET.state === "closed") { t.hidden = true; return; }
    t.hidden = false;
    const h = Math.max(36, t.clientHeight * ratio);
    th.style.height = h + "px";
    th.style.transform = "translateY(" + ((t.clientHeight - h) * (b.scrollTop / Math.max(1, b.scrollHeight - b.clientHeight))) + "px)";
  }

  function wireSheet() {
    const handle = $("sheetHandle"), sheet = $("sheet");
    $("sheetBody").addEventListener("scroll", updateScrollLine, { passive: true });
    addEventListener("resize", updateScrollLine);
    $("sheetClose").addEventListener("click", () => { closeSheet(); if (OPEN_GROUP) closeGroup(); });
    let startY = null, moved = false, startState = "peek";
    handle.addEventListener("pointerdown", e => { startY = e.clientY; moved = false; startState = SHEET.state; handle.setPointerCapture(e.pointerId); sheet.classList.add("dragging"); });
    handle.addEventListener("pointermove", e => {
      if (startY == null) return;
      const dy = e.clientY - startY; if (Math.abs(dy) > 6) moved = true;
      sheet.style.setProperty("--drag", dy + "px");
    });
    const end = e => {
      if (startY == null) return;
      const dy = e.clientY - startY; startY = null;
      sheet.classList.remove("dragging"); sheet.style.removeProperty("--drag");
      if (!moved) { setSheet(SHEET.state === "open" ? "peek" : "open"); return; }   // a tap toggles
      if (dy < -40) setSheet("open");
      else if (dy > 40) { if (startState === "open") setSheet("peek"); else { closeSheet(); if (OPEN_GROUP) closeGroup(); } }
      else setSheet(startState);
    };
    handle.addEventListener("pointerup", end);
    handle.addEventListener("click", e => { if (e.detail === 0) setSheet(SHEET.state === "open" ? "peek" : "open"); });   // keyboard
    handle.addEventListener("pointercancel", end);
    document.addEventListener("keydown", e => {
      if (e.key !== "Escape") return;
      if (!$("menuPop").hidden || !$("searchResults").hidden) { closeMenus(); return; }
      if (SHEET.state !== "closed") { closeSheet(); if (OPEN_GROUP) closeGroup(); }
    });
  }

  /* ---------- 7. Controls ---------- */
  // Zones (top row, second row, left and right stacks, bottom row, More menu) are set in site.csv
  // with LAYOUT_TOP, LAYOUT_TOP2, LAYOUT_LEFT, LAYOUT_RIGHT, LAYOUT_BOTTOM and LAYOUT_MORE.
  const OLD_NAMES = { chips: "categories", event: "about", tour: "tours", newrow: "", spacer: "" };
  const DEFAULT_LAYOUT = { TOP: "search,daynight", TOP2: "categories", LEFT: "", RIGHT: "mapstyle,home,more", BOTTOM: "", MORE: "share,about" };
  function zoneList(z) {
    let v = SITE["LAYOUT_" + z];
    if (z === "RIGHT" && !v && SITE.LAYOUT_FLOAT) v = SITE.LAYOUT_FLOAT;
    if (v == null || (v === "" && !("LAYOUT_" + z in SITE))) v = DEFAULT_LAYOUT[z];
    return String(v).split(",").map(s => s.trim().toLowerCase()).map(s => (s in OLD_NAMES ? OLD_NAMES[s] : s)).filter(Boolean);
  }
  const RENDER = {};   // control name -> function(zoneName) returning an element, or null if it has nothing to show yet

  RENDER.search = () => {
    const wrap = document.createElement("div");
    wrap.className = "ctl-search";
    const place = (SITE.PLACE || "").trim();
    wrap.innerHTML =
      '<button type="button" class="badge" aria-label="' + esc(L("about")) + '">' + badgeHtml() + "</button>" +
      '<label class="s-field">' + (place ? '<span class="s-place">' + esc(place.toUpperCase()) + "</span>" : "") +
      '<input id="searchInput" type="search" autocomplete="off" enterkeyhint="search" aria-controls="searchResults" placeholder="' + esc(L("search")) + '"></label>' +
      '<svg class="s-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-4-4"></path></svg>';
    wrap.querySelector(".badge").addEventListener("click", openAbout);
    const inp = wrap.querySelector("input");
    inp.addEventListener("input", () => runSearch(inp.value));
    inp.addEventListener("focus", () => { if (inp.value) runSearch(inp.value); });
    inp.addEventListener("keydown", e => {
      if (e.key === "Enter") { const f = $("searchResults").querySelector("button"); if (f) f.click(); }
      if (e.key === "ArrowDown") { const f = $("searchResults").querySelector("button"); if (f) { e.preventDefault(); f.focus(); } }
    });
    return wrap;
  };
  RENDER.daynight = () => roundBtn(NIGHT ? L("dayMode") : L("nightMode"), NIGHT
    ? '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path>'
    : '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"></path>', () => setNight(!NIGHT), "daynight");
  RENDER.mapstyle = () => roundBtn(L("mapStyle"), '<path d="M12 3l9 5-9 5-9-5z"></path><path d="M3 13l9 5 9-5"></path>', e => openMapStyleMenu(e.currentTarget));
  RENDER.aerial = () => roundBtn(L("aerial"), '<circle cx="12" cy="12" r="9"></circle><path d="M3 12h18"></path>', () => { setBaseStyle(STYLE_MODE === "aerial" ? "standard" : "aerial"); store.set("mapstyle", STYLE_MODE); });
  RENDER.more = () => { const items = zoneList("MORE").filter(n => MENU_ITEMS[n] && MENU_ITEMS[n].show()); return items.length ? roundBtn(L("more"), '<circle cx="5" cy="12" r="1.6"></circle><circle cx="12" cy="12" r="1.6"></circle><circle cx="19" cy="12" r="1.6"></circle>', e => openMoreMenu(e.currentTarget, items)) : null; };
  RENDER.home = () => roundBtn(L("home"), '<path d="M4 11l8-7 8 7"></path><path d="M6 10v10h12V10"></path>', () => { closeMenus(); if (SHEET.state !== "closed") closeSheet(); OPEN_GROUP = null; GROUP_VIEW = null; refreshMarkerVisibility(); goHome(true); });
  RENDER.share = () => roundBtn(L("shareMap"), ICON.share, () => shareLink(null));
  RENDER.about = () => (SITE.EVENT_TEXT || SITE.EVENT_TITLE) ? pillBtn(SITE.EVENT_BUTTON || L("about"), openAbout) : null;
  RENDER.categories = zone => {
    const cats = [...DATA.cats.values()].filter(c => DATA.items.some(i => i.CATEGORY === c.CODE));
    if (cats.length < 2) return null;
    if ((SITE.CATEGORY_STYLE || "").toLowerCase() === "dropdown" || zone === "RIGHT" || zone === "LEFT") return pillBtn(L("categories") + " ▾", e => openCategoryMenu(e.currentTarget, cats));
    const row = document.createElement("div"); row.className = "chips";
    const all = document.createElement("button"); all.type = "button"; all.className = "chip" + (HIDDEN.size ? "" : " on"); all.textContent = L("all");
    all.addEventListener("click", () => { HIDDEN.clear(); saveHidden(); });
    row.appendChild(all);
    cats.forEach(c => {
      const b = document.createElement("button"); b.type = "button";
      b.className = "chip" + (HIDDEN.has(c.CODE) ? " off" : "");
      b.setAttribute("aria-pressed", HIDDEN.has(c.CODE) ? "false" : "true");
      b.innerHTML = '<span class="dot" style="background:' + esc(c.COLOR || "#888") + '"></span>' + esc(c.LABEL || c.CODE);
      b.addEventListener("click", () => { HIDDEN.has(c.CODE) ? HIDDEN.delete(c.CODE) : HIDDEN.add(c.CODE); saveHidden(); });
      row.appendChild(b);
    });
    return row;
  };
  RENDER.openfull = () => { const a = document.createElement("a"); a.className = "pill pill-accent"; const u = new URL(location.href); u.searchParams.delete("embed"); a.href = u.toString(); a.target = "_blank"; a.rel = "noopener"; a.innerHTML = esc(L("openFull")) + svgI("maps"); return a; };

  const MENU_ITEMS = {
    share: { show: () => true, label: () => L("shareMap"), run: () => shareLink(null) },
    about: { show: () => !!(SITE.EVENT_TEXT || SITE.EVENT_TITLE), label: () => SITE.EVENT_BUTTON || L("about"), run: openAbout },
    categories: { show: () => DATA.cats.size > 1, label: () => L("categories"), run: () => openCategoryMenu($("zoneRight"), [...DATA.cats.values()]) },
    mapstyle: { show: () => true, label: () => L("mapStyle"), run: () => openMapStyleMenu($("zoneRight")) },
    home: { show: () => true, label: () => L("home"), run: () => RENDER.home().click() },
    daynight: { show: () => true, label: () => NIGHT ? L("dayMode") : L("nightMode"), run: () => setNight(!NIGHT) }
  };

  function roundBtn(label, path, onClick, extra) {
    const b = document.createElement("button"); b.type = "button"; b.className = "round" + (extra ? " round-" + extra : "");
    b.setAttribute("aria-label", label); b.title = label;
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + path + "</svg>";
    b.addEventListener("click", onClick); return b;
  }
  function pillBtn(label, onClick) { const b = document.createElement("button"); b.type = "button"; b.className = "pill"; b.textContent = label; b.addEventListener("click", onClick); return b; }

  function renderControls() {
    const zones = { TOP: "zoneTop", TOP2: "zoneTop2", LEFT: "zoneLeft", RIGHT: "zoneRight", BOTTOM: "zoneBottom" };
    const placed = new Set();
    Object.keys(zones).forEach(z => {
      const box = $(zones[z]); box.innerHTML = "";
      const names = zoneList(z);
      if (EMBED && z === "TOP2") names.push("openfull");
      names.forEach(n => {
        if (placed.has(n) || !RENDER[n]) return;
        const el = RENDER[n](z); if (!el) return;
        placed.add(n); box.appendChild(el);
      });
      box.hidden = !box.children.length;
    });
    if (!placed.has("search")) $("zoneTop").prepend(RENDER.search("TOP"));   // the badge and search are always reachable
    $("zoneTop").hidden = false;
  }

  function saveHidden() { store.set("hidden_cats", [...HIDDEN]); refreshMarkerVisibility(); renderControls(); refreshOpenMenu(); }

  // Pop-up menus
  let menuRefresh = null;
  function closeMenus() { $("menuPop").hidden = true; $("searchResults").hidden = true; menuRefresh = null; }
  function refreshOpenMenu() { if (menuRefresh && !$("menuPop").hidden) menuRefresh(); }
  function placePop(pop, anchor) {
    const r = anchor.getBoundingClientRect();
    pop.hidden = false;
    const w = pop.offsetWidth, h = pop.offsetHeight;
    let left = Math.min(Math.max(8, r.right - w), innerWidth - w - 8);
    let top = r.bottom + 8; if (top + h > innerHeight - 8) top = Math.max(8, r.top - h - 8);
    pop.style.left = left + "px"; pop.style.top = top + "px";
  }
  function showMenu(anchor, html, wire) {
    const pop = $("menuPop");
    const draw = () => { pop.innerHTML = html(); wire(pop); placePop(pop, anchor); };
    menuRefresh = draw; draw();
    const f = pop.querySelector("button"); if (f) f.focus({ preventScroll: true });
  }
  function openMapStyleMenu(anchor) {
    const us = IN_US() || !map;
    const opts = [["standard", L("standard"), true], ["topo", L("topo"), us], ["aerial", L("aerial"), us || !!SITE.LOCAL_IMAGERY_URL]];
    showMenu(anchor, () => '<div class="menu-title">' + esc(L("mapStyle")) + "</div>" + opts.map(([k, lab, ok]) =>
      '<button type="button" class="menu-item' + (STYLE_MODE === k ? " on" : "") + '" data-k="' + k + '"' + (ok ? "" : ' disabled title="' + esc(L("usOnly")) + '"') + ">" + esc(lab) + (STYLE_MODE === k ? '<span class="tick">✓</span>' : "") + "</button>").join(""),
      pop => pop.querySelectorAll("[data-k]").forEach(b => b.addEventListener("click", () => { setBaseStyle(b.dataset.k); store.set("mapstyle", b.dataset.k); closeMenus(); })));
  }
  function openCategoryMenu(anchor, cats) {
    showMenu(anchor, () => '<div class="menu-title">' + esc(L("categories")) + "</div>" +
      '<button type="button" class="menu-item" data-all="1">' + esc(L("all")) + (HIDDEN.size ? "" : '<span class="tick">✓</span>') + "</button>" +
      cats.map(c => '<button type="button" class="menu-item" data-c="' + esc(c.CODE) + '"><span class="dot" style="background:' + esc(c.COLOR || "#888") + '"></span>' + esc(c.LABEL || c.CODE) + (HIDDEN.has(c.CODE) ? "" : '<span class="tick">✓</span>') + "</button>").join(""),
      pop => {
        pop.querySelector("[data-all]").addEventListener("click", () => { HIDDEN.clear(); saveHidden(); });
        pop.querySelectorAll("[data-c]").forEach(b => b.addEventListener("click", () => { const c = b.dataset.c; HIDDEN.has(c) ? HIDDEN.delete(c) : HIDDEN.add(c); saveHidden(); }));
      });
  }
  function openMoreMenu(anchor, names) {
    showMenu(anchor, () => names.map(n => '<button type="button" class="menu-item" data-n="' + n + '">' + esc(MENU_ITEMS[n].label()) + "</button>").join(""),
      pop => pop.querySelectorAll("[data-n]").forEach(b => b.addEventListener("click", () => { closeMenus(); MENU_ITEMS[b.dataset.n].run(); })));
  }

  // Search: names, other names, addresses and text
  function runSearch(q) {
    const box = $("searchResults");
    q = String(q || "").trim().toLowerCase();
    if (!q) { box.hidden = true; return; }
    const words = q.split(/\s+/);
    const scored = DATA.items.map(it => {
      const name = (it.NAME || "").toLowerCase(), hay = [name, it.OTHER_NAMES, it.ADDRESS, it.TEXT, it.BLURB, (DATA.cats.get(it.CATEGORY) || {}).LABEL].join(" ").toLowerCase();
      if (!words.every(w => hay.includes(w))) return null;
      return { it, score: name.startsWith(q) ? 0 : name.includes(q) ? 1 : 2 };
    }).filter(Boolean).sort((a, b) => a.score - b.score || (a.it.NAME || "").localeCompare(b.it.NAME || "")).slice(0, 8);
    box.innerHTML = scored.length ? scored.map(({ it }) => {
      const sub = [kindLabel(it), (DATA.cats.get(it.CATEGORY) || {}).LABEL, it.PART_OF && DATA.byId.get(it.PART_OF) ? L("partOf") + " " + DATA.byId.get(it.PART_OF).NAME : ""].filter(Boolean).join(" · ");
      return '<button type="button" role="option" class="result" data-id="' + esc(it.ID) + '"><span class="m-dot" style="background:' + esc(colorFor(it)) + '"></span><span><b>' + esc(it.NAME || it.ID) + "</b>" + (sub ? "<small>" + esc(sub) + "</small>" : "") + "</span></button>";
    }).join("") : '<div class="empty">' + esc(L("noResults")) + "</div>";
    box.querySelectorAll("[data-id]").forEach(b => b.addEventListener("click", () => {
      const it = DATA.byId.get(b.dataset.id); closeMenus(); $("searchInput").blur(); goTo(it);
    }));
    const anchor = document.querySelector(".ctl-search");
    const r = anchor.getBoundingClientRect();
    box.style.left = r.left + "px"; box.style.top = (r.bottom + 8) + "px"; box.style.width = Math.max(260, r.width) + "px";
    box.hidden = false;
  }
  function goTo(it) {
    if (!it) return;
    if (it.CATEGORY && HIDDEN.has(it.CATEGORY)) { HIDDEN.delete(it.CATEGORY); saveHidden(); }
    if (it.PART_OF) OPEN_GROUP = DATA.byId.get(it.PART_OF);
    else if (it.members.length) OPEN_GROUP = it;
    else OPEN_GROUP = null;
    refreshMarkerVisibility();
    if (map && it.hasPos) map.easeTo({ center: [it.lng, it.lat], zoom: Math.max(map.getZoom(), 16), padding: { bottom: sheetPad(), top: 120, left: desktop() ? 420 : 0, right: 0 }, duration: REDUCED ? 0 : 700 });
    openCard(it);
  }

  // About panel (the "Event" or focus button)
  function openAbout() {
    closeMenus();
    const place = (SITE.PLACE || "").trim();
    const title = (SITE.EVENT_TITLE || L("about")).split("{PLACE}").join(place);
    SHEET.item = null;
    $("sheetBody").innerHTML = '<div class="c-head"><h2 class="c-title">' + esc(title) + "</h2></div>" +
      (DATA.items.length ? "" : '<div class="c-empty"><b>' + esc(L("emptyTitle")) + "</b><br>" + esc(L("emptyText")) + "</div>") +
      '<div class="c-text">' + paragraphs((SITE.EVENT_TEXT || "").split("{PLACE}").join(place)) + "</div>";
    setSheet(desktop() ? "open" : "open");
  }

  // Share links
  function setUrl(p) {
    const u = new URL(location.href);
    Object.keys(p).forEach(k => p[k] == null ? u.searchParams.delete(k) : u.searchParams.set(k, p[k]));
    try { history.replaceState(null, "", u.toString()); } catch (e) { /* some embeds block this: fine */ }
  }
  async function shareLink(it) {
    const u = new URL(location.href);
    u.searchParams.delete("embed");
    if (it) u.searchParams.set("place", it.ID); else u.searchParams.delete("place");
    const title = it ? (it.NAME || it.ID) : document.title;
    if (navigator.share) { try { await navigator.share({ title, url: u.toString() }); return; } catch (e) { if (e && e.name === "AbortError") return; } }
    try { await navigator.clipboard.writeText(u.toString()); toast(L("linkCopied")); }
    catch (e) { prompt(L("share"), u.toString()); }
  }
  let toastTimer = null;
  function toast(msg) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2200); }

  function showDebug() {
    const d = $("debug"); d.hidden = false;
    d.innerHTML = "<b>Problems found (" + problems.length + ")</b><ol>" + problems.map(p => "<li>" + esc(p) + "</li>").join("") + "</ol>";
  }

  /* ---------- 8. Start-up ---------- */
  async function start() {
    initTheme();
    await loadAll();
    applyLook();
    makeMap();
    renderControls();
    wireSheet();
    buildMarkers();
    document.addEventListener("click", e => {
      if (!e.target.closest(".pop, .ctl-search, .round, .pill")) closeMenus();
    });
    // Deep links: ?place=ID (older links used ?spot= or ?site=), ?cat=CODE shows only that category
    const want = Q.get("place") || Q.get("spot") || Q.get("site");
    const cat = Q.get("cat");
    if (cat && DATA.cats.has(cat)) { HIDDEN = new Set([...DATA.cats.keys()].filter(c => c !== cat)); refreshMarkerVisibility(); renderControls(); }
    const target = want && DATA.byId.get(want);
    if (want && !target) warn("The link asked for " + want + ", which isn't on this map.");
    const go = () => { fitStart(!!target); if (target) goTo(target); else if (!DATA.items.length) openAbout(); };
    if (map) map.once("load", () => {
      if (STYLE_MODE !== "standard" && !IN_US() && !(STYLE_MODE === "aerial" && SITE.LOCAL_IMAGERY_URL)) setBaseStyle("standard");
      go();
    });
    else go();
    if (EVENT) document.body.dataset.event = EVENT.name;
    if (DEBUG) showDebug();
    window.ETS = { SITE, DATA, map: () => map, problems, openCard, goTo };
  }
  start().catch(e => { warn("The map couldn't start: " + e.message); console.error(e); });
})();
