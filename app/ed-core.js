/* ETS Community Map: ed-core.js
   The editor's foundation: loading the data files, keeping changes in this browser, the map, the panels,
   the form pieces every panel uses, photo shrinking, the data check, Publish (GitHub or ZIP) and Restore.
   The editor only ever writes data files and media. It never changes code.

   Plain-language guide:
     1. Helpers           2. The data files and changes       3. Photos and other uploads (kept until Publish)
     4. The map           5. Panels and the form pieces       6. The data check
     7. Publish, ZIP and Restore                               8. Start-up */
(function () {
  "use strict";
  const ED = window.ETSEditor = {};

  /* ---------- 1. Helpers ---------- */
  const Q = new URLSearchParams(location.search);
  // storage is labeled with this map's folder: every map on one GitHub account shares the browser's storage
  const SCOPE = location.pathname.replace(/[^/]*$/, "");
  const KEY = k => "ets:" + SCOPE + ":" + k;
  ED.key = KEY;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const yes = (v, d) => (v == null || v === "") ? !!d : /^(yes|y|true|1|on)$/i.test(String(v).trim());
  const slug = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  function parseCSV(text) {
    text = String(text || "").replace(/^﻿/, "");
    const rows = []; let row = [], field = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
      else if (c === '"') q = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(field); rows.push(row); row = []; field = ""; }
      else field += c;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    const head = (rows.shift() || []).map(h => h.trim()).filter((h, i, a) => h || i < a.length - 1);
    const data = rows.filter(r => r.some(v => String(v).trim() !== "")).map(r => { const o = {}; head.forEach((h, i) => { if (h) o[h] = r[i] == null ? "" : String(r[i]); }); return o; });
    return { cols: head.filter(Boolean), rows: data };
  }
  const cell = v => { v = v == null ? "" : String(v); return /[",\r\n]/.test(v) || /^\s|\s$/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  function toCSV(cols, rows) { return [cols.map(cell).join(",")].concat(rows.map(r => cols.map(c => cell(r[c])).join(","))).join("\r\n") + "\r\n"; }
  ED.esc = esc; ED.yes = yes; ED.slug = slug; ED.parseCSV = parseCSV; ED.toCSV = toCSV; ED.Q = Q;

  let toastT = 0;
  ED.toast = (msg, ms) => { const t = $("edToast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, ms || 2600); };

  /* ---------- 2. The data files and changes ---------- */
  const SAMPLE = (Q.get("sample") || "").replace(/[^a-z0-9_-]/gi, "");
  const BASE = SAMPLE ? "samples/" + SAMPLE + "/" : "";
  const EVENT = (Q.get("event") || "").replace(/[^a-z0-9_-]/gi, "").toLowerCase() || null;
  ED.BASE = BASE; ED.EVENT = EVENT; ED.SAMPLE = SAMPLE;
  const COLS = {
    "site.csv": ["KEY", "VALUE"],
    "items.csv": ["ID", "KIND", "PART_OF", "NAME", "OTHER_NAMES", "ADDRESS", "YEAR_START", "YEAR_END", "LAT", "LONG", "CATEGORY", "MAJOR", "TEXT", "BLURB", "SOURCE", "CREDIT", "SERIES", "ORDER", "CHECKIN", "RADIUS", "INSIDE", "FLOOR", "ICON", "ICON_COLOR", "EFFECT", "WEBSITE", "PHONE", "HOURS", "ORG", "SHAPE", "SHOW_MEMBERS", "MEMORY_LINK", "STAFF_NOTE"],
    "categories.csv": ["CODE", "LABEL", "COLOR", "ICON", "SHAPE", "FILL", "FILL_COLOR", "FILL_COLOR2", "RANKED"],
    "media.csv": ["ITEM_ID", "ORDER", "KIND", "FILE", "THUMB", "CAPTION", "CREDIT", "TRANSCRIPT", "SECONDS", "ANIMATION"],
    "passport.csv": ["TYPE", "ID", "TITLE", "CATEGORY", "ICON", "STARS", "RANKS", "NEEDS", "HINT", "BUTTON", "SCOPE", "TARGET", "COUNT", "REWARD", "CODE", "ORDER"],
    "happenings.csv": ["ID", "NAME", "TAG", "COLOR", "TEXT", "FEATURES", "TOUR_ID", "LINK", "LINK_TEXT", "ENABLED", "REPEAT", "START", "END", "START_DAY", "END_DAY", "DAYS", "START_TIME", "END_TIME", "SOON_DAYS", "FOLDER", "KIND", "PUBLIC"]
  };
  const JSON_BLANK = { "map.json": () => ({ outline: null, overlays: [], backdrop: null }), "icons.json": () => ({ icons: {}, shapes: {} }), "routes.geojson": () => ({ type: "FeatureCollection", features: [] }) };
  const FILES = ["site.csv", "items.csv", "categories.csv", "media.csv", "map.json", "icons.json", "routes.geojson", "passport.csv", "happenings.csv"];
  ED.FILES = FILES;
  const F = {};            // name -> { name, kind, cols, rows | data, orig (published text), text (current), path }
  let eventInfo = null;    // event.json when designing an event
  ED.F = F;

  const eventDir = () => BASE + "events/" + EVENT + "/";
  function pathFor(name) {
    if (EVENT && eventInfo && (eventInfo.overrides || []).includes(name)) return eventDir() + "data/" + name;
    return BASE + "data/" + name;
  }
  ED.pathFor = pathFor;
  ED.mediaDir = () => (EVENT ? eventDir() : BASE) + "media/";
  const serialize = f => f.kind === "csv" ? toCSV(f.cols, f.rows) : JSON.stringify(f.data, null, 2) + "\n";
  ED.serialize = serialize;

  async function fetchText(url) {
    try { const r = await fetch(url, { cache: "no-cache" }); return r.ok ? await r.text() : null; } catch (e) { return null; }
  }
  const draftKey = path => KEY("draft:" + path);
  const getDraft = path => { try { return localStorage.getItem(draftKey(path)); } catch (e) { return null; } };
  const setDraft = (path, text) => { try { if (text == null) localStorage.removeItem(draftKey(path)); else localStorage.setItem(draftKey(path), text); } catch (e) { ED.toast("This browser is full, so changes can't be kept here. Publish soon."); } };
  ED.setDraft = setDraft; ED.getDraft = getDraft;
  const getJust = path => { try { return JSON.parse(localStorage.getItem(KEY("published:" + path)) || "null"); } catch (e) { return null; } };
  const setJust = (path, text) => { try { if (text == null) localStorage.removeItem(KEY("published:" + path)); else localStorage.setItem(KEY("published:" + path), JSON.stringify({ text, t: Date.now() })); } catch (e) { /* fine */ } };

  function load1(name, text) {
    const kind = name.endsWith(".csv") ? "csv" : "json";
    const f = { name, kind, path: pathFor(name) };
    if (kind === "csv") {
      const p = parseCSV(text || "");
      const cols = p.cols.length ? p.cols.slice() : (COLS[name] || []).slice();
      (COLS[name] || []).forEach(c => { if (!cols.includes(c)) cols.push(c); });      // older files get the newer columns
      f.cols = cols; f.rows = p.rows;
    } else {
      try { f.data = text ? JSON.parse(text) : JSON_BLANK[name](); } catch (e) { f.data = JSON_BLANK[name](); ED.problems.push(name + " couldn't be read, so it starts empty: " + e.message); }
    }
    return f;
  }
  ED.problems = [];
  async function loadAll() {
    if (EVENT) {
      const t = getDraft(eventDir() + "event.json") || await fetchText(eventDir() + "event.json");
      try { eventInfo = t ? JSON.parse(t) : null; } catch (e) { eventInfo = null; }
      if (!eventInfo) { ED.problems.push("The event folder " + EVENT + " wasn't found. Make it from the Happenings panel first."); eventInfo = { title: EVENT, kind: "event", overrides: [] }; }
      eventInfo.overrides = eventInfo.overrides || [];
      ED.eventOrig = JSON.stringify(eventInfo, null, 2) + "\n";
    }
    await Promise.all(FILES.map(async name => {
      const path = pathFor(name);
      let published = await fetchText(path);
      // GitHub Pages can keep serving the old copy for about 10 minutes after a publish. Until it catches up,
      // the editor uses what it just published, so recent edits never look lost.
      const jp = getJust(path);
      if (jp) { if (published === jp.text || Date.now() - jp.t > 20 * 60000) setJust(path, null); else { published = jp.text; ED.catchingUp = true; } }
      let text = published;
      // an event's site.csv only lists what changes, so the main one is read underneath it
      const draft = getDraft(path);
      const f = load1(name, draft != null ? draft : text);
      f.orig = published == null ? null : serialize(load1(name, published));
      f.raw = published;            // exactly what the website has, to spot someone else's changes before publishing
      f.text = serialize(f);
      if (EVENT && name === "site.csv") {
        const main = load1(name, await fetchText(BASE + "data/site.csv"));
        f.base = {}; main.rows.forEach(r => { f.base[r.KEY] = r.VALUE; });
      }
      F[name] = f;
    }));
    if (FILES.some(n => F[n].orig != null && F[n].text !== F[n].orig) && FILES.some(n => getDraft(F[n].path) != null)) ED.restoredDrafts = true;
  }

  // Every change goes through here: it remembers the old version (for Undo), keeps the new one in this browser, and redraws.
  const UNDO = [];
  ED.change = function (name, fn, label) {
    const f = F[name];
    if (EVENT && !eventInfo.overrides.includes(name)) {          // the first change to a file in an event copies it into the event's folder
      eventInfo.overrides.push(name); f.path = pathFor(name); saveEventInfo();
    }
    UNDO.push({ name, text: f.text, label });
    if (UNDO.length > 60) UNDO.shift();
    fn(f);
    f.text = serialize(f);
    setDraft(f.path, f.text === f.orig ? null : f.text);
    afterChange(name);
  };
  function saveEventInfo() { const t = JSON.stringify(eventInfo, null, 2) + "\n"; setDraft(eventDir() + "event.json", t === ED.eventOrig ? null : t); }
  ED.eventInfo = () => eventInfo; ED.saveEventInfo = saveEventInfo;
  function afterChange(name) {
    ED.data = view();
    ED.refreshMarkers();
    updateCount();
    LISTENERS.forEach(fn => { try { fn(name); } catch (e) { console.error(e); } });
    const s = $("edSaved"); s.hidden = false; s.textContent = "Saved on This Device";
  }
  const LISTENERS = []; ED.onChange = fn => LISTENERS.push(fn);
  ED.undo = function () {
    const u = UNDO.pop(); if (!u) return;
    const f = F[u.name]; const fresh = load1(u.name, u.text); Object.assign(f, { cols: fresh.cols, rows: fresh.rows, data: fresh.data });
    f.text = serialize(f); setDraft(f.path, f.text === f.orig ? null : f.text);
    if (ED.selected && ED.selected.ID) { ED.data = view(); ED.selected = ED.data.byId.get(ED.selected.ID) || null; }
    afterChange(u.name); ED.toast("Undone" + (u.label ? ": " + u.label : ""));
    PANELS[current] && PANELS[current].render && rerender();
    rerenderInspector();
  };
  function changedFiles() {
    const list = FILES.filter(n => F[n].text !== (F[n].orig == null ? serialize(load1(n, null)) : F[n].orig)).map(n => ({ path: F[n].path, text: F[n].text, name: n }));
    if (EVENT) { const t = JSON.stringify(eventInfo, null, 2) + "\n"; if (t !== ED.eventOrig) list.push({ path: eventDir() + "event.json", text: t, name: "event.json" }); }
    EXTRA_FILES.forEach((text, path) => list.push({ path, text, name: path.split("/").pop() }));
    return list;
  }
  const EXTRA_FILES = new Map();     // other text files to publish (a new event folder's event.json)
  ED.addExtraFile = (path, text) => { EXTRA_FILES.set(path, text); setDraft(path, text); updateCount(); };
  ED.changedFiles = changedFiles;
  function updateCount() {
    const n = changedFiles().length + PENDING.size;
    const c = $("edCount"); c.hidden = !n; c.textContent = n;
    $("edUndo").disabled = !UNDO.length;
  }
  ED.updateCount = updateCount;

  // A friendlier view of the data for the panels
  function view() {
    const site = {}; F["site.csv"].rows.forEach(r => { if (r.KEY) site[r.KEY] = r.VALUE; });
    if (F["site.csv"].base) Object.keys(F["site.csv"].base).forEach(k => { if (!(k in site)) site[k] = F["site.csv"].base[k]; });
    const byId = new Map(); F["items.csv"].rows.forEach(r => { if (r.ID) byId.set(r.ID, r); });
    const cats = new Map(); F["categories.csv"].rows.forEach(r => { if (r.CODE) cats.set(r.CODE, r); });
    return { site, items: F["items.csv"].rows, byId, cats, media: F["media.csv"].rows, map: F["map.json"].data, icons: F["icons.json"].data, routes: F["routes.geojson"].data, passport: F["passport.csv"].rows, happenings: F["happenings.csv"].rows };
  }
  ED.site = k => (ED.data.site[k] == null ? "" : ED.data.site[k]);
  ED.setSite = function (k, v, label) {
    ED.change("site.csv", f => {
      const r = f.rows.find(x => x.KEY === k);
      if (r) r.VALUE = v; else f.rows.push({ KEY: k, VALUE: v });
    }, label || k);
  };
  ED.newId = function (prefix) {
    const used = new Set(F["items.csv"].rows.map(r => r.ID).concat(F["passport.csv"].rows.map(r => r.ID), F["happenings.csv"].rows.map(r => r.ID), (F["routes.geojson"].data.features || []).map(f => f.properties && f.properties.ID)));
    for (let n = 1; n < 100000; n++) { const id = prefix + "-" + String(n).padStart(3, "0"); if (!used.has(id)) return id; }
    return prefix + "-" + Date.now();
  };
  ED.colorFor = it => { if (it.ICON_COLOR) return it.ICON_COLOR; const c = ED.data.cats.get(it.CATEGORY); if (c && c.COLOR) return c.COLOR; return it.KIND === "story" ? "#C2410C" : it.KIND === "photospot" ? "#3F4A52" : "#4A555E"; };
  ED.iconUrl = (key, size) => { const ic = ED.data.icons.icons && ED.data.icons.icons[key]; if (!ic) return ""; return "data:image/svg+xml;charset=utf-8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="' + (size || 64) + '" height="' + (size || 64) + '" viewBox="' + (ic.vb || "0 0 60 60") + '">' + (ic.art || "") + "</svg>"); };

  /* ---------- 3. Photos and other uploads (kept in this browser until Publish) ---------- */
  const PENDING = new Map();       // path from the site's folder -> Blob
  const URLS = new Map();
  ED.PENDING = PENDING;
  const idb = (() => {
    let dbp = null;
    const open = () => dbp || (dbp = new Promise((res, rej) => { const r = indexedDB.open("ets-editor:" + SCOPE, 1); r.onupgradeneeded = () => r.result.createObjectStore("files"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
    const tx = (mode, fn) => open().then(db => new Promise((res, rej) => { const t = db.transaction("files", mode); const s = t.objectStore("files"); const out = fn(s); t.oncomplete = () => res(out && out.result); t.onerror = () => rej(t.error); }));
    return { put: (k, v) => tx("readwrite", s => s.put(v, k)).catch(() => {}), del: k => tx("readwrite", s => s.delete(k)).catch(() => {}), all: () => open().then(db => new Promise(res => { const out = []; const t = db.transaction("files"); const c = t.objectStore("files").openCursor(); c.onsuccess = () => { const cur = c.result; if (cur) { out.push([cur.key, cur.value]); cur.continue(); } else res(out); }; c.onerror = () => res([]); })).catch(() => []) };
  })();
  ED.addPending = function (path, blob) { PENDING.set(path, blob); if (URLS.has(path)) URL.revokeObjectURL(URLS.get(path)); URLS.delete(path); idb.put(path, blob); updateCount(); };
  // where a media file can be seen right now: a fresh upload's in-browser copy, or the published file
  ED.mediaSrc = function (file, folder) {
    if (!file) return "";
    if (/^(https?:)?\/\//i.test(file) || file.startsWith("data:")) return file;
    const path = (folder || ED.mediaDir()) + file;
    if (PENDING.has(path)) { if (!URLS.has(path)) URLS.set(path, URL.createObjectURL(PENDING.get(path))); return URLS.get(path); }
    if (EVENT && !folder) { const main = BASE + "media/" + file; if (PENDING.has(main)) return ED.mediaSrc(file, BASE + "media/"); }
    return path;
  };
  ED.pendingUrl = file => {          // used by the Preview page
    for (const p of [ED.mediaDir() + file, BASE + "media/" + file]) if (PENDING.has(p)) return ED.mediaSrc(file, p.slice(0, p.length - file.length));
    return "";
  };
  const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("That file isn't a picture this browser can read.")); i.src = src; });
  const canvasBlob = (c, type, q) => new Promise(res => c.toBlob(b => res(b), type, q));
  // Shrink a photo on this device: the photo (longest side maxSide) and a small thumbnail, both WebP (JPEG on old browsers)
  ED.shrinkPhoto = async function (file, maxSide, thumbSide) {
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImg(url);
      const out = async side => {
        const k = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        let b = await canvasBlob(c, "image/webp", 0.82);
        if (!b || b.type !== "image/webp") b = await canvasBlob(c, "image/jpeg", 0.85);
        return b;
      };
      const main = await out(maxSide || 1600);
      const thumb = thumbSide === 0 ? null : await out(thumbSide || 200);
      return { main, thumb, ext: main.type === "image/webp" ? "webp" : "jpg", w: img.naturalWidth, h: img.naturalHeight };
    } finally { URL.revokeObjectURL(url); }
  };
  ED.fileName = (base, ext) => {
    const s = slug(base) || "file";
    const taken = new Set(F["media.csv"].rows.map(r => r.FILE).concat([...PENDING.keys()].map(p => p.split("/").slice(-1)[0])));
    let name = s + "." + ext, n = 2;
    while (taken.has(name)) name = s + "-" + (n++) + "." + ext;
    return name;
  };

  /* ---------- 4. The map ---------- */
  let map = null, aerial = false;
  const MARKERS = new Map();
  ED.selected = null;              // the item shown in the inspector
  let MODE = null;                 // a map mode: { text, onMapClick, onMarkerClick, onDone }
  const USGS = n => "https://basemap.nationalmap.gov/arcgis/rest/services/" + n + "/MapServer/tile/{z}/{y}/{x}";
  const styleFor = () => aerial ? { version: 8, sources: { a: { type: "raster", tiles: [USGS("USGSImageryOnly")], tileSize: 256, maxzoom: 16, attribution: "USGS" } }, layers: [{ id: "a", type: "raster", source: "a" }] } : "https://tiles.openfreemap.org/styles/liberty";
  const HOOKS = [];
  let STYLE_READY = false;
  ED.styleReady = () => STYLE_READY;
  ED.onStyle = f => { HOOKS.push(f); if (map && STYLE_READY) try { f(map); } catch (e) { console.error(e); } };
  function makeMap() {
    if (!window.maplibregl) { $("edMap").innerHTML = '<div class="ed-nomap">The map library didn\'t load. Check the connection and reload.</div>'; return; }
    const s = ED.data.site, lat = parseFloat(s.CENTER_LAT), lng = parseFloat(s.CENTER_LNG);
    map = new maplibregl.Map({ container: "edMap", style: styleFor(), center: isFinite(lng) ? [lng, lat] : [-96, 39], zoom: isFinite(lng) ? (parseFloat(s.ZOOM) || 14) : 3.4, attributionControl: { compact: true }, dragRotate: false });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("style.load", () => { STYLE_READY = true; HOOKS.forEach(f => { try { f(map); } catch (e) { console.error(e); } }); });
    map.on("click", e => {
      if (!e.originalEvent || e.originalEvent.target !== map.getCanvas()) return;
      if (MODE && MODE.onMapClick) MODE.onMapClick([e.lngLat.lng, e.lngLat.lat], e);
    });
    ED.map = map;
    map.once("load", () => { fitAll(false); });
  }
  function fitAll(anim) {
    if (!map) return;
    const pts = ED.data.items.filter(i => isFinite(parseFloat(i.LAT)) && isFinite(parseFloat(i.LONG)) && !i.PART_OF).map(i => [parseFloat(i.LONG), parseFloat(i.LAT)]);
    if (pts.length > 1) map.fitBounds(bounds(pts), { padding: 60, maxZoom: 16, duration: anim ? 600 : 0 });
    else if (pts.length === 1) map.jumpTo({ center: pts[0], zoom: 15 });
  }
  ED.fitAll = fitAll;
  function bounds(pts) { let w = 180, s = 90, e = -180, n = -90; pts.forEach(([x, y]) => { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }); return [[w, s], [e, n]]; }
  ED.bounds = bounds;
  ED.toggleAerial = () => { aerial = !aerial; $("edAerial").textContent = aerial ? "Street Map" : "Aerial"; if (map) { STYLE_READY = false; map.setStyle(styleFor()); } };

  ED.refreshMarkers = function () {
    if (!map || !window.maplibregl) return;
    const seen = new Set();
    const sel = ED.selected, selGroup = sel ? (sel.PART_OF || (ED.data.items.some(x => x.PART_OF === sel.ID) ? sel.ID : "")) : "";
    ED.data.items.forEach(it => {
      const lat = parseFloat(it.LAT), lng = parseFloat(it.LONG);
      if (!it.ID || !isFinite(lat) || !isFinite(lng)) return;
      seen.add(it.ID);
      let m = MARKERS.get(it.ID);
      const isGroup = ED.data.items.some(x => x.PART_OF === it.ID);
      const sig = [ED.colorFor(it), it.KIND, isGroup, it.PART_OF, (ED.data.cats.get(it.CATEGORY) || {}).ICON, it.ICON, it.NAME].join("|");
      if (!m || m.sig !== sig) {
        if (m) m.marker.remove();
        const el = document.createElement("button"); el.type = "button"; el.className = "edm edm-" + (it.KIND || "place") + (it.PART_OF ? " edm-member" : "") + (isGroup ? " edm-group" : "");
        el.setAttribute("aria-label", it.NAME || it.ID); el.title = it.NAME || it.ID;
        const key = it.ICON || (ED.data.cats.get(it.CATEGORY) || {}).ICON;
        const glyph = it.KIND === "story" ? "✦" : it.KIND === "photospot" ? "◉" : "";
        el.innerHTML = '<span class="edm-face" style="background:' + esc(ED.colorFor(it)) + '">' + (key && ED.iconUrl(key) ? '<img src="' + ED.iconUrl(key, 48) + '" alt="">' : glyph ? "<b>" + glyph + "</b>" : "") + "</span>" + (isGroup ? '<span class="edm-n">' + ED.data.items.filter(x => x.PART_OF === it.ID).length + "</span>" : "");
        el.addEventListener("click", ev => { ev.stopPropagation(); const cur = ED.data.byId.get(it.ID); if (!cur) return; if (MODE && MODE.onMarkerClick) MODE.onMarkerClick(cur); else ED.select(cur); });
        const marker = new maplibregl.Marker({ element: el, draggable: true, anchor: "center" }).setLngLat([lng, lat]).addTo(map);
        marker.on("dragend", () => {
          const p = marker.getLngLat(), cur = ED.data.byId.get(it.ID); if (!cur) return;
          ED.change("items.csv", () => { cur.LAT = p.lat.toFixed(6); cur.LONG = p.lng.toFixed(6); }, "moved " + (cur.NAME || cur.ID));
          if (ED.selected === cur) rerenderInspector();
        });
        m = { marker, el, sig }; MARKERS.set(it.ID, m);
      } else m.marker.setLngLat([lng, lat]);
      m.el.classList.toggle("sel", sel === it);
      m.el.classList.toggle("in-group", !!selGroup && (it.PART_OF === selGroup || it.ID === selGroup));
      m.el.classList.toggle("picked", !!(MODE && MODE.picked && MODE.picked.has(it.ID)));
      m.el.classList.toggle("dim", !!(MODE && MODE.dim && !MODE.dim(it)) || (!!HL && !HL.has(it.ID)));
      m.el.classList.toggle("hl", !!HL && HL.has(it.ID));
    });
    MARKERS.forEach((m, id) => { if (!seen.has(id)) { m.marker.remove(); MARKERS.delete(id); } });
  };

  let HL = null;          // places lit up (a happening's featured places)
  ED.setHighlight = ids => { HL = ids && ids.length ? new Set(ids) : null; ED.refreshMarkers(); };
  // Map modes: "tap the map to place it", "tap markers to add them", "tap to draw the route"
  ED.setMode = function (mode) {
    MODE = mode;
    const box = $("edMode");
    if (!mode) { box.hidden = true; document.body.classList.remove("ed-moding"); ED.refreshMarkers(); return; }
    box.hidden = false; document.body.classList.add("ed-moding");
    box.innerHTML = '<span class="em-text"><b>' + esc(mode.title || "") + "</b>" + (mode.text ? "<small>" + esc(mode.text) + "</small>" : "") + "</span>" +
      (mode.extra || "") + '<button type="button" class="ed-btn ed-primary" data-done="1">' + esc(mode.doneText || "Done") + "</button>";
    box.querySelector("[data-done]").addEventListener("click", () => { const m = MODE; ED.setMode(null); if (m && m.onDone) m.onDone(); });
    if (mode.wire) mode.wire(box);
    ED.refreshMarkers();
  };
  ED.mode = () => MODE;

  /* ---------- 5. Panels and the form pieces ---------- */
  const PANELS = {}; const ORDER = []; let current = null;
  ED.panel = (id, def) => { PANELS[id] = def; ORDER.push(id); };
  ED.show = function (id) {
    if (!PANELS[id]) return;
    if (MODE) ED.setMode(null);
    current = id; ED.selected = null; HL = null;
    document.querySelectorAll("#edTabs button").forEach(b => b.setAttribute("aria-current", b.dataset.p === id ? "page" : "false"));
    try { history.replaceState(null, "", setParam("panel", id)); } catch (e) { /* fine */ }
    closeInspector();
    rerender();
    if (PANELS[id].onShow) PANELS[id].onShow();
    ED.refreshMarkers();
  };
  function setParam(k, v) { const u = new URL(location.href); if (v == null) u.searchParams.delete(k); else u.searchParams.set(k, v); return u.toString(); }
  function rerender() { const side = $("edSide"); const top = side.scrollTop; side.innerHTML = ""; PANELS[current].render(side); side.scrollTop = top; }
  ED.rerender = rerender;
  ED.current = () => current;
  // The inspector (right column on a computer; a sheet over the map on a phone)
  let INSP = null;
  ED.inspect = function (render) { INSP = render; rerenderInspector(); };
  function rerenderInspector() {
    const box = $("edInsp");
    if (!INSP) { box.hidden = true; document.body.classList.remove("ed-has-insp"); return; }
    const top = box.scrollTop; box.hidden = false; document.body.classList.add("ed-has-insp"); box.innerHTML = "";
    INSP(box); box.scrollTop = top;
  }
  ED.rerenderInspector = rerenderInspector;
  function closeInspector() { INSP = null; rerenderInspector(); }
  ED.closeInspector = () => { closeInspector(); ED.selected = null; ED.refreshMarkers(); if (PANELS[current] && PANELS[current].onClose) PANELS[current].onClose(); };
  ED.select = it => { if (PANELS[current] && PANELS[current].selectItem) PANELS[current].selectItem(it); else if (PANELS.items) { ED.show("items"); PANELS.items.selectItem(it); } };
  ED.flyTo = it => { const lat = parseFloat(it.LAT), lng = parseFloat(it.LONG); if (map && isFinite(lat) && isFinite(lng)) map.easeTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 16), duration: 500 }); };

  // Form pieces. Each one takes a label, the current value, a change handler and plain-language help.
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  ED.h = h;
  ED.ui = {
    section(parent, title, opts) {
      const d = h("details", "ed-sec"); d.open = !opts || opts.open !== false;
      d.innerHTML = "<summary>" + esc(title) + (opts && opts.badge ? ' <span class="ed-pill">' + esc(opts.badge) + "</span>" : "") + "</summary>";
      const body = h("div", "ed-sec-body"); d.appendChild(body); parent.appendChild(d); return body;
    },
    head(parent, title, sub) { const e = h("div", "ed-head", "<h2>" + esc(title) + "</h2>" + (sub ? "<p>" + esc(sub) + "</p>" : "")); parent.appendChild(e); return e; },
    note(parent, text, cls) { const e = h("p", "ed-note " + (cls || ""), esc(text)); parent.appendChild(e); return e; },
    field(parent, label, input, help) {
      const w = h("label", "ed-field"); w.innerHTML = '<span class="ed-label">' + esc(label) + "</span>";
      w.appendChild(input); if (help) w.appendChild(h("small", "ed-help", esc(help)));
      parent.appendChild(w); return input;
    },
    text(parent, label, value, onChange, help, opts) {
      opts = opts || {};
      const i = opts.multi ? h("textarea", "ed-input") : h("input", "ed-input");
      if (!opts.multi) i.type = opts.type || "text";
      if (opts.multi) i.rows = opts.rows || 4;
      i.value = value == null ? "" : value; if (opts.placeholder) i.placeholder = opts.placeholder;
      let last = i.value;
      const commit = () => { if (i.value !== last) { last = i.value; onChange(i.value); } };
      i.addEventListener("change", commit); i.addEventListener("blur", commit);
      if (opts.live) i.addEventListener("input", () => opts.live(i.value));
      return ED.ui.field(parent, label, i, help);
    },
    number(parent, label, value, onChange, help, opts) { return ED.ui.text(parent, label, value, onChange, help, Object.assign({ type: "number" }, opts || {})); },
    select(parent, label, value, options, onChange, help) {
      const s = h("select", "ed-input");
      options.forEach(o => { const [v, t] = Array.isArray(o) ? o : [o, o]; const op = h("option"); op.value = v; op.textContent = t; if (String(v) === String(value == null ? "" : value)) op.selected = true; s.appendChild(op); });
      s.addEventListener("change", () => onChange(s.value));
      return ED.ui.field(parent, label, s, help);
    },
    toggle(parent, label, on, onChange, help) {
      const w = h("label", "ed-toggle");
      w.innerHTML = '<input type="checkbox"' + (on ? " checked" : "") + '><span class="ed-switch"></span><span class="ed-tl"><b>' + esc(label) + "</b>" + (help ? "<small>" + esc(help) + "</small>" : "") + "</span>";
      w.querySelector("input").addEventListener("change", e => onChange(e.target.checked));
      parent.appendChild(w); return w;
    },
    color(parent, label, value, onChange, help) {
      const w = h("div", "ed-colorrow");
      const c = h("input", "ed-color"); c.type = "color"; c.value = /^#[0-9a-f]{6}$/i.test(value || "") ? value : "#0B7A75";
      const t = h("input", "ed-input ed-hex"); t.value = value || ""; t.placeholder = "#0B7A75";
      c.addEventListener("change", () => { t.value = c.value.toUpperCase(); onChange(t.value); });
      t.addEventListener("change", () => { if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(t.value) || !t.value) { if (t.value.length === 7) c.value = t.value; onChange(t.value.toUpperCase()); } else ED.toast("A color looks like #0B7A75."); });
      w.appendChild(c); w.appendChild(t);
      return ED.ui.field(parent, label, w, help);
    },
    // A searchable list to pick from: never typed by hand, so IDs can't be wrong
    picker(parent, label, value, options, onChange, help, opts) {
      opts = opts || {};
      const w = h("div", "ed-picker");
      const multi = !!opts.multi;
      const vals = () => multi ? String(value || "").split("|").map(s => s.trim()).filter(Boolean) : [value].filter(Boolean);
      const name = v => { const o = options.find(o => o[0] === v); return o ? o[1] : v + " (missing)"; };
      const draw = () => {
        const vs = vals();
        w.innerHTML = (multi ? '<div class="ed-chips">' + vs.map((v, i) => '<span class="ed-chip' + (options.some(o => o[0] === v) ? "" : " bad") + '">' + (opts.ordered ? '<span class="ed-ord">' + (i + 1) + "</span>" : "") + esc(name(v)) +
          (opts.ordered && i ? '<button type="button" data-up="' + i + '" aria-label="Move up">↑</button>' : "") + '<button type="button" data-x="' + i + '" aria-label="Remove">✕</button></span>').join("") + "</div>" : "") +
          '<div class="ed-pick-row"><input class="ed-input" placeholder="' + esc(multi ? "Add…" : (vs[0] ? name(vs[0]) : (opts.none || "None"))) + '" aria-label="' + esc(label) + '">' + (!multi && vs[0] && !opts.required ? '<button type="button" class="ed-btn ed-small" data-clear="1">Clear</button>' : "") + '</div><div class="ed-pick-list" hidden></div>';
        const inp = w.querySelector("input"), list = w.querySelector(".ed-pick-list");
        const show = () => {
          const q = inp.value.trim().toLowerCase();
          const hits = options.filter(o => (!multi || !vs.includes(o[0])) && (!q || (o[1] + " " + o[0]).toLowerCase().includes(q))).slice(0, 40);
          list.innerHTML = hits.length ? hits.map(o => '<button type="button" data-v="' + esc(o[0]) + '">' + esc(o[1]) + (o[2] ? "<small>" + esc(o[2]) + "</small>" : "") + "</button>").join("") : '<div class="ed-empty">Nothing matches.</div>';
          list.hidden = false;
          list.querySelectorAll("[data-v]").forEach(b => b.addEventListener("mousedown", e => { e.preventDefault(); const v = b.dataset.v; value = multi ? vs.concat(v).join("|") : v; onChange(value); draw(); }));
        };
        inp.addEventListener("focus", show); inp.addEventListener("input", show); inp.addEventListener("blur", () => setTimeout(() => { list.hidden = true; inp.value = ""; }, 150));
        w.querySelectorAll("[data-x]").forEach(b => b.addEventListener("click", () => { const a = vals(); a.splice(+b.dataset.x, 1); value = a.join("|"); onChange(value); draw(); }));
        w.querySelectorAll("[data-up]").forEach(b => b.addEventListener("click", () => { const a = vals(), i = +b.dataset.up; [a[i - 1], a[i]] = [a[i], a[i - 1]]; value = a.join("|"); onChange(value); draw(); }));
        const cl = w.querySelector("[data-clear]"); if (cl) cl.addEventListener("click", () => { value = ""; onChange(""); draw(); });
      };
      draw();
      return ED.ui.field(parent, label, w, help);
    },
    buttons(parent, list) {
      const w = h("div", "ed-btnrow");
      list.forEach(b => { if (!b) return; const e = h("button", "ed-btn" + (b.primary ? " ed-primary" : "") + (b.danger ? " ed-danger" : "")); e.type = "button"; e.textContent = b.text; if (b.title) e.title = b.title; e.addEventListener("click", b.onClick); w.appendChild(e); });
      parent.appendChild(w); return w;
    },
    list(parent, rows, opts) {    // a list of rows to pick from: [{ id, title, sub, color, icon, on }]
      const w = h("div", "ed-list");
      w.innerHTML = rows.length ? rows.map(r => '<button type="button" class="ed-row' + (r.on ? " on" : "") + (r.bad ? " bad" : "") + '" data-id="' + esc(r.id) + '"><span class="ed-dot" style="background:' + esc(r.color || "#9AA5AD") + '">' + (r.icon ? '<img src="' + r.icon + '" alt="">' : "") + '</span><span class="ed-rt"><b>' + esc(r.title) + "</b>" + (r.sub ? "<small>" + esc(r.sub) + "</small>" : "") + "</span>" + (r.badge ? '<span class="ed-pill">' + esc(r.badge) + "</span>" : "") + "</button>").join("") : '<div class="ed-empty">' + esc((opts && opts.empty) || "Nothing here yet.") + "</div>";
      w.querySelectorAll("[data-id]").forEach(b => b.addEventListener("click", () => opts.onPick(b.dataset.id)));
      parent.appendChild(w); return w;
    },
    file(parent, label, accept, onFiles, help, multiple) {
      const z = h("label", "ed-drop");
      z.innerHTML = '<input type="file" accept="' + esc(accept) + '"' + (multiple ? " multiple" : "") + '><b>' + esc(label) + "</b><small>" + esc(help || "or tap to choose") + "</small>";
      const inp = z.querySelector("input");
      inp.addEventListener("change", () => { if (inp.files.length) onFiles([...inp.files]); inp.value = ""; });
      z.addEventListener("dragover", e => { e.preventDefault(); z.classList.add("over"); });
      z.addEventListener("dragleave", () => z.classList.remove("over"));
      z.addEventListener("drop", e => { e.preventDefault(); z.classList.remove("over"); if (e.dataTransfer.files.length) onFiles([...e.dataTransfer.files]); });
      parent.appendChild(z); return z;
    }
  };
  // A window over the editor (Publish, confirmations)
  ED.modal = function (html, wire, opts) {
    const back = $("edModal"); back.hidden = false;
    back.innerHTML = '<div class="ed-modal' + (opts && opts.wide ? " wide" : "") + '" role="dialog" aria-modal="true"><button type="button" class="ed-x" aria-label="Close">✕</button>' + html + "</div>";
    const close = () => { back.hidden = true; back.innerHTML = ""; document.removeEventListener("keydown", key, true); };
    const key = e => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    back.querySelector(".ed-x").addEventListener("click", close);
    document.addEventListener("keydown", key, true);
    if (wire) wire(back.querySelector(".ed-modal"), close);
    return close;
  };
  ED.confirm = (title, text, yesText, onYes, noText, onNo) => ED.modal("<h2>" + esc(title) + "</h2><p>" + esc(text) + '</p><div class="ed-btnrow"><button type="button" class="ed-btn" data-no="1">' + esc(noText || "Cancel") + '</button><button type="button" class="ed-btn ed-primary" data-yes="1">' + esc(yesText) + "</button></div>",
    (m, close) => { m.querySelector("[data-yes]").addEventListener("click", () => { close(); onYes(); }); m.querySelector("[data-no]").addEventListener("click", () => { close(); if (onNo) onNo(); }); });

  /* ---------- 6. The data check ---------- */
  // Errors would break the map, so Publish refuses them. Warnings are worth a look but don't stop Publish.
  ED.check = async function (opts) {
    const D = ED.data, out = [];
    const err = (where, msg, go) => out.push({ level: "error", where, msg, go });
    const warn = (where, msg, go) => out.push({ level: "warn", where, msg, go });
    const ids = new Map();
    D.items.forEach((it, i) => {
      const where = "Items: " + (it.NAME || it.ID || "row " + (i + 2));
      if (!it.ID) return err(where, "This item has no ID.");
      if (ids.has(it.ID)) err(where, "Two items share the ID " + it.ID + ".");
      ids.set(it.ID, it);
      if (!it.NAME) warn(where, "This item has no name.", it.ID);
      const lat = parseFloat(it.LAT), lng = parseFloat(it.LONG), hasPos = isFinite(lat) && isFinite(lng);
      if ((it.LAT || it.LONG) && !hasPos) err(where, "Its location isn't a number. Drag its marker to fix it.", it.ID);
      if (!hasPos && it.KIND !== "story") warn(where, "It has no location, so it won't show on the map.", it.ID);
      if (hasPos && (Math.abs(lat) > 90 || Math.abs(lng) > 180)) err(where, "Its location is off the edge of the world.", it.ID);
      if (it.CATEGORY && !D.cats.has(it.CATEGORY)) err(where, "Its category " + it.CATEGORY + " doesn't exist.", it.ID);
      if (it.PART_OF) { const g = D.byId.get(it.PART_OF); if (!g) err(where, "It's part of " + it.PART_OF + ", which doesn't exist.", it.ID); else if (g.PART_OF) err(where, "It's part of a group that is itself in a group. Groups only go one level deep.", it.ID); }
      if (it.ICON && !(D.icons.icons || {})[it.ICON]) warn(where, "Its icon " + it.ICON + " isn't in the icon set.", it.ID);
    });
    D.cats.forEach(c => { if (c.ICON && !(D.icons.icons || {})[c.ICON]) warn("Categories: " + (c.LABEL || c.CODE), "Its icon " + c.ICON + " isn't in the icon set."); });
    const mediaPaths = [];
    D.media.forEach((m, i) => {
      const where = "Media: " + (m.CAPTION || m.FILE || "row " + (i + 2));
      if (!ids.has(m.ITEM_ID)) err(where, "It belongs to " + (m.ITEM_ID || "nothing") + ", which isn't an item.");
      if (!m.FILE) err(where, "It has no file.");
      else if (!/video/i.test(m.KIND || "")) { mediaPaths.push([where, m.FILE]); if (m.THUMB) mediaPaths.push([where, m.THUMB]); }
    });
    const routeIds = new Set();
    ((D.routes && D.routes.features) || []).forEach(f => {
      const p = f.properties || {}, where = "Tours: " + (p.TITLE || p.ID);
      if (!p.ID) return err(where, "A route has no ID.");
      if (routeIds.has(p.ID)) err(where, "Two routes share the ID " + p.ID + ".");
      routeIds.add(p.ID);
      (p.STOPS || []).forEach((s, i) => { if (!ids.has(s.ITEM)) err(where, "Stop " + (i + 1) + " is " + s.ITEM + ", which isn't an item."); });
      if (!f.geometry || !(f.geometry.coordinates || []).length) { if (String(p.TYPE) !== "tour" || !(p.STOPS || []).length) warn(where, "It has no line drawn yet."); }
    });
    const tasks = new Set(D.passport.filter(r => r.TYPE === "task").map(r => r.ID)), stamps = new Set(D.passport.filter(r => r.TYPE === "stamp").map(r => r.ID));
    D.passport.forEach(r => {
      const where = "Passport: " + (r.TITLE || r.ID);
      String(r.NEEDS || "").split("|").map(s => s.trim()).filter(Boolean).forEach(n => {
        if (r.TYPE === "stamp" && !tasks.has(n)) err(where, "It needs task " + n + ", which doesn't exist.");
        if (r.TYPE === "prize" && !tasks.has(n) && !stamps.has(n.split(":")[0]) && !ids.has(n)) err(where, "It needs " + n + ", which isn't a stamp, task or item.");
      });
      if (r.TYPE === "task" && r.SCOPE === "item" && r.TARGET && !ids.has(r.TARGET)) err(where, "It points at " + r.TARGET + ", which isn't an item.");
      if (r.TYPE === "task" && r.SCOPE === "category" && r.TARGET && !D.cats.has(r.TARGET)) err(where, "It points at category " + r.TARGET + ", which doesn't exist.");
    });
    D.happenings.forEach(r => {
      const where = "Happenings: " + (r.NAME || r.ID);
      String(r.FEATURES || "").split("|").map(s => s.trim()).filter(Boolean).forEach(n => { if (!ids.has(n)) err(where, "It features " + n + ", which isn't an item."); });
      if (r.TOUR_ID && !routeIds.has(r.TOUR_ID)) err(where, "It features tour " + r.TOUR_ID + ", which doesn't exist.");
      const rep = String(r.REPEAT || "once").toLowerCase();
      if (!["once", "yearly", "monthly", "weekly", "ongoing", ""].includes(rep)) err(where, "Its repeat setting \"" + r.REPEAT + "\" isn't one the map knows.");
      if ((rep === "once" || rep === "yearly" || rep === "") && !r.START) warn(where, "It has no start date.");
    });
    // are the photos and audio really there?
    if (!opts || opts.files !== false) {
      const missing = [];
      await Promise.all(mediaPaths.slice(0, 400).map(async ([where, file]) => {
        if (/^(https?:)?\/\//i.test(file) || file.startsWith("data:")) return;
        const paths = [ED.mediaDir() + file, BASE + "media/" + file];
        if (paths.some(p => PENDING.has(p))) return;
        for (const p of paths) { try { const r = await fetch(p, { method: "HEAD", cache: "no-cache" }); if (r.ok) return; } catch (e) { /* offline */ } }
        missing.push([where, file]);
      }));
      missing.forEach(([where, file]) => err(where, "The file " + file + " isn't on the website and wasn't uploaded here."));
    }
    return out;
  };

  /* ---------- 7. Publish, ZIP and Restore ---------- */
  const GH = { get: () => { try { return JSON.parse(localStorage.getItem(KEY("gh")) || "{}"); } catch (e) { return {}; } }, set: v => { try { localStorage.setItem(KEY("gh"), JSON.stringify(v)); } catch (e) { /* fine */ } } };
  function summary() {
    const lines = [];
    changedFiles().forEach(c => {
      const f = F[c.name];
      if (f && f.kind === "csv") {
        const key = f.cols.includes("ID") ? "ID" : f.cols.includes("CODE") ? "CODE" : f.cols.includes("KEY") ? "KEY" : null;
        const before = f.orig ? parseCSV(f.orig).rows : [];
        if (key) {
          const b = new Map(before.map(r => [r[key], JSON.stringify(r)])), a = new Map(f.rows.map(r => [r[key], JSON.stringify(r)]));
          const added = [...a.keys()].filter(k => !b.has(k)), removed = [...b.keys()].filter(k => !a.has(k)), changed = [...a.keys()].filter(k => b.has(k) && b.get(k) !== a.get(k));
          const nm = k => { const r = f.rows.find(x => x[key] === k) || before.find(x => x[key] === k) || {}; return r.NAME || r.TITLE || r.LABEL || k; };
          const bits = [];
          if (added.length) bits.push("added " + added.map(nm).slice(0, 4).join(", ") + (added.length > 4 ? " and " + (added.length - 4) + " more" : ""));
          if (changed.length) bits.push("changed " + changed.map(nm).slice(0, 4).join(", ") + (changed.length > 4 ? " and " + (changed.length - 4) + " more" : ""));
          if (removed.length) bits.push("removed " + removed.map(nm).slice(0, 4).join(", ") + (removed.length > 4 ? " and " + (removed.length - 4) + " more" : ""));
          lines.push([c.path, bits.join("; ") || "reordered"]);
        } else lines.push([c.path, "changed"]);
      } else lines.push([c.path, c.name === "event.json" ? "event folder settings" : "changed"]);
    });
    PENDING.forEach((b, p) => lines.push([p, "new file (" + Math.max(1, Math.round(b.size / 1024)) + " KB)"]));
    return lines;
  }
  ED.summary = summary;
  ED.openPublish = async function () {
    const close = ED.modal('<h2>Publish</h2><p class="ed-note">Checking the data first…</p>', null, { wide: true });
    const problems = await ED.check();
    const errors = problems.filter(p => p.level === "error"), warns = problems.filter(p => p.level === "warn");
    const lines = summary();
    const gh = GH.get();
    const target = localStorage.getItem(KEY("target")) || "github";
    const html = "<h2>Publish</h2>" +
      (errors.length ? '<div class="ed-alert bad"><b>' + errors.length + " problem" + (errors.length > 1 ? "s" : "") + " must be fixed first.</b> These would break the map.</div>" + probList(errors) : '<div class="ed-alert good"><b>The data check passed.</b></div>') +
      (problems.length ? '<div class="ed-btnrow"><button type="button" class="ed-btn ed-small" data-copy="1">Copy Report</button></div>' : "") +
      (warns.length ? "<details class=\"ed-sec\"><summary>" + warns.length + " thing" + (warns.length > 1 ? "s" : "") + " worth a look (they won't stop Publish)</summary>" + probList(warns) + "</details>" : "") +
      "<h3>What Changed</h3>" + (lines.length ? '<ul class="ed-changes">' + lines.map(l => "<li><b>" + esc(l[0]) + "</b> " + esc(l[1]) + "</li>").join("") + "</ul>" : '<p class="ed-note">Nothing has changed since the last publish.</p>') +
      '<h3>Where to Publish</h3><div class="ed-seg" role="radiogroup"><button type="button" data-t="github"' + (target === "github" ? ' aria-pressed="true"' : "") + '>GitHub</button><button type="button" data-t="zip"' + (target === "zip" ? ' aria-pressed="true"' : "") + ">Download as ZIP</button></div>" +
      '<div class="ed-target" data-for="github"><div class="ed-grid2">' +
      '<label class="ed-field"><span class="ed-label">Owner</span><input class="ed-input" name="owner" value="' + esc(gh.owner || "") + '" placeholder="your-github-name"></label>' +
      '<label class="ed-field"><span class="ed-label">Repository</span><input class="ed-input" name="repo" value="' + esc(gh.repo || "") + '" placeholder="my-map"></label>' +
      '<label class="ed-field"><span class="ed-label">Branch</span><input class="ed-input" name="branch" value="' + esc(gh.branch || "main") + '"></label>' +
      '<label class="ed-field"><span class="ed-label">Folder in the Repository</span><input class="ed-input" name="folder" value="' + esc(gh.folder || "") + '" placeholder="blank if the map is at the top"></label></div>' +
      '<label class="ed-field"><span class="ed-label">Access Token</span><input class="ed-input" name="token" type="password" value="' + esc(gh.token || "") + '" autocomplete="off"><small class="ed-help">A GitHub fine-grained token with Contents: Read and Write for this repository. It stays on this device only.</small></label>' +
      '<div class="ed-btnrow"><button type="button" class="ed-btn" data-test="1">Test the Connection</button><button type="button" class="ed-btn" data-restore="1">Restore…</button></div></div>' +
      '<div class="ed-target" data-for="zip"><p class="ed-note">A ZIP works with any web host: upload its files through your host\'s file manager or FTP, keeping the folders.</p>' +
      '<label class="ed-toggle"><input type="checkbox" name="whole"><span class="ed-switch"></span><span class="ed-tl"><b>The Whole Site</b><small>Off: only the changed files. On: every file, for a brand-new host.</small></span></label></div>' +
      '<div class="ed-prog" hidden><div class="pp-bar"><span></span></div><small></small></div>' +
      '<div class="ed-btnrow end"><button type="button" class="ed-btn ed-danger" data-discard="1"' + (lines.length ? "" : " hidden") + '>Discard All Changes…</button><button type="button" class="ed-btn ed-primary" data-go="1"' + (errors.length || (!lines.length && target === "github") ? " disabled" : "") + ">Publish Now</button></div>";
    close();
    ED.modal(html, (m, closeM) => {
      const cp = m.querySelector("[data-copy]");
      if (cp) cp.addEventListener("click", async () => { const txt = "Data check, " + new Date().toLocaleString() + "\n" + problems.map(p => (p.level === "error" ? "PROBLEM: " : "Worth a look: ") + p.where + ": " + p.msg).join("\n"); try { await navigator.clipboard.writeText(txt); ED.toast("Report copied."); } catch (e) { ED.modal('<h2>Report</h2><textarea class="ed-code" rows="10">' + esc(txt) + "</textarea>"); } });
      m.querySelectorAll("[data-goto]").forEach(b => b.addEventListener("click", () => { closeM(); const it = ED.data.byId.get(b.dataset.goto); if (it) ED.select(it); }));
      const seg = () => m.querySelector('.ed-seg [aria-pressed="true"]').dataset.t;
      const syncT = () => { m.querySelectorAll(".ed-target").forEach(t => { t.hidden = t.dataset.for !== seg(); }); m.querySelector("[data-go]").disabled = !!errors.length || (!lines.length && seg() === "github" ); };
      m.querySelectorAll(".ed-seg button").forEach(b => b.addEventListener("click", () => { m.querySelectorAll(".ed-seg button").forEach(x => x.removeAttribute("aria-pressed")); b.setAttribute("aria-pressed", "true"); localStorage.setItem(KEY("target"), b.dataset.t); syncT(); }));
      syncT();
      const read = () => { const v = {}; ["owner", "repo", "branch", "folder", "token"].forEach(k => { v[k] = m.querySelector('[name="' + k + '"]').value.trim(); }); v.folder = v.folder.replace(/^\/+|\/+$/g, ""); GH.set(v); return v; };
      const prog = m.querySelector(".ed-prog"), bar = prog.querySelector("span"), msg = prog.querySelector("small");
      const say = (t, pct) => { prog.hidden = false; msg.textContent = t; if (pct != null) bar.style.width = pct + "%"; };
      m.querySelector("[data-test]").addEventListener("click", async () => { const v = read(); try { await gh(v, "GET", ""); say("Connected to " + v.owner + "/" + v.repo + ".", 100); } catch (e) { say(e.message, 0); } });
      m.querySelector("[data-restore]").addEventListener("click", () => { const v = read(); closeM(); openRestore(v); });
      m.querySelector("[data-discard]").addEventListener("click", () => { closeM(); ED.confirm("Discard All Changes?", "Every change since the last publish will be thrown away, including uploaded photos that weren't published.", "Discard Them", ED.discardAll); });
      let force = false;
      m.querySelector("[data-go]").addEventListener("click", async e => {
        e.target.disabled = true;
        try {
          if (seg() === "zip") { await publishZip(m.querySelector('[name="whole"]').checked, say); }
          else { const v = read(); if (!v.owner || !v.repo || !v.token) throw new Error("Fill in Owner, Repository and Access Token first."); await publishGitHub(v, say, force); }
          finishPublish(seg() !== "zip");
          say(seg() === "zip" ? "The ZIP is downloading. Upload its files to your host to finish." : "Published. The website updates in about a minute.", 100);
        } catch (err) {
          if (err.conflicts) { force = true; say("Someone else changed " + err.conflicts.join(", ") + " on GitHub since this editor opened. Publishing now would replace their changes. Reload the editor to get them first, or press Publish Anyway.", 0); e.target.textContent = "Publish Anyway"; }
          else say("Publish didn't finish: " + err.message, 0);
          e.target.disabled = false;
        }
      });
    }, { wide: true });
  };
  function probList(list) { return '<ul class="ed-probs">' + list.map(p => "<li><b>" + esc(p.where) + "</b> " + esc(p.msg) + (p.go ? ' <button type="button" class="ed-btn ed-small" data-goto="' + esc(p.go) + '">Show Me</button>' : "") + "</li>").join("") + "</ul>"; }
  function finishPublish(toGitHub) {            // what was published is now the new starting point
    if (toGitHub) changedFiles().forEach(c => setJust(c.path, c.text));
    FILES.forEach(n => { const f = F[n]; f.orig = f.text; if (toGitHub) f.raw = f.text; setDraft(f.path, null); });
    if (EVENT) { ED.eventOrig = JSON.stringify(eventInfo, null, 2) + "\n"; setDraft(eventDir() + "event.json", null); }
    EXTRA_FILES.forEach((t, p) => setDraft(p, null)); EXTRA_FILES.clear();
    PENDING.forEach((b, p) => idb.del(p)); PENDING.clear();
    UNDO.length = 0; updateCount();
    $("edSaved").textContent = "Published";
  }

  // GitHub: every publish is one commit, so Restore can always go back one step
  async function gh(v, method, path, body) {
    const r = await fetch("https://api.github.com/repos/" + encodeURIComponent(v.owner) + "/" + encodeURIComponent(v.repo) + path, { method, headers: { Authorization: "Bearer " + v.token, Accept: "application/vnd.github+json", "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      if (r.status === 401) throw new Error("GitHub didn't accept the access token.");
      if (r.status === 404) throw new Error("GitHub couldn't find that repository or branch, or the token can't see it.");
      if (r.status === 403 || r.status === 422) throw new Error("GitHub refused: " + (t.slice(0, 160) || r.status));
      throw new Error("GitHub said " + r.status);
    }
    return r.status === 204 ? null : r.json();
  }
  const b64 = async blob => { const buf = new Uint8Array(await blob.arrayBuffer()); let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000)); return btoa(s); };
  async function gitSha(text) {      // the fingerprint GitHub gives a file's contents
    const body = new TextEncoder().encode(text), head = new TextEncoder().encode("blob " + body.length + "\0"), all = new Uint8Array(head.length + body.length);
    all.set(head); all.set(body, head.length);
    return [...new Uint8Array(await crypto.subtle.digest("SHA-1", all))].map(b => b.toString(16).padStart(2, "0")).join("");
  }
  async function publishGitHub(v, say, force) {
    const pre = v.folder ? v.folder + "/" : "";
    const files = changedFiles(), media = [...PENDING.entries()];
    if (!files.length && !media.length) throw new Error("Nothing has changed.");
    say("Connecting to GitHub…", 5);
    if (!force) {                     // has anyone else changed these files since this editor opened?
      const conflicts = [];
      for (const fl of files) {
        const f = F[fl.name]; if (!f || f.path !== fl.path || f.raw == null) continue;
        try { const cur = await gh(v, "GET", "/contents/" + (pre + fl.path).split("/").map(encodeURIComponent).join("/") + "?ref=" + encodeURIComponent(v.branch || "main")); if (cur && cur.sha && cur.sha !== await gitSha(f.raw)) conflicts.push(fl.path); } catch (e) { /* a new file, or not readable: nothing to compare */ }
      }
      if (conflicts.length) { const er = new Error("conflict"); er.conflicts = conflicts; throw er; }
    }
    const ref = await gh(v, "GET", "/git/ref/heads/" + encodeURIComponent(v.branch || "main"));
    const head = ref.object.sha;
    const commit = await gh(v, "GET", "/git/commits/" + head);
    const tree = []; const total = files.length + media.length; let n = 0;
    for (const f of files) { const b = await gh(v, "POST", "/git/blobs", { content: f.text, encoding: "utf-8" }); tree.push({ path: pre + f.path, mode: "100644", type: "blob", sha: b.sha }); say("Sending " + f.path, 10 + 80 * (++n) / total); }
    for (const [p, blob] of media) { const b = await gh(v, "POST", "/git/blobs", { content: await b64(blob), encoding: "base64" }); tree.push({ path: pre + p, mode: "100644", type: "blob", sha: b.sha }); say("Sending " + p, 10 + 80 * (++n) / total); }
    const t = await gh(v, "POST", "/git/trees", { base_tree: commit.tree.sha, tree });
    const msg = "Map editor: " + summary().slice(0, 6).map(l => l[0].split("/").pop() + " " + l[1]).join("; ").slice(0, 300);
    const c = await gh(v, "POST", "/git/commits", { message: msg, tree: t.sha, parents: [head] });
    await gh(v, "PATCH", "/git/refs/heads/" + encodeURIComponent(v.branch || "main"), { sha: c.sha });
    say("Published.", 100);
  }
  function openRestore(v) {
    ED.modal("<h2>Restore</h2><p class=\"ed-note\">Loading the recent publishes…</p>", async (m, close) => {
      try {
        const list = await gh(v, "GET", "/commits?sha=" + encodeURIComponent(v.branch || "main") + "&per_page=8");
        m.innerHTML = '<button type="button" class="ed-x" aria-label="Close">✕</button><h2>Restore</h2><p class="ed-note">Each publish is one step. Undoing a step puts every file back the way it was before it, as a new publish (so it can be undone too).</p><ul class="ed-changes">' +
          list.map((c, i) => "<li><b>" + esc(new Date(c.commit.author.date).toLocaleString()) + "</b> " + esc(c.commit.message.split("\n")[0]) + (i === 0 && c.parents.length && /^Map editor:/.test(c.commit.message) ? ' <button type="button" class="ed-btn ed-small" data-undo="1">Undo This Publish</button>' : i === 0 ? ' <small class="ed-help">This newest change wasn\'t made by the editor (an upload on GitHub, say), so it can\'t be undone from here.</small>' : "") + "</li>").join("") + "</ul>";
        m.querySelector(".ed-x").addEventListener("click", close);
        const u = m.querySelector("[data-undo]");
        if (u) u.addEventListener("click", async () => {
          u.disabled = true;
          try {
            const head = list[0], parent = await gh(v, "GET", "/git/commits/" + head.parents[0].sha);
            const c = await gh(v, "POST", "/git/commits", { message: "Map editor: restored the version from before \"" + head.commit.message.split("\n")[0].slice(0, 80) + "\"", tree: parent.tree.sha, parents: [head.sha] });
            await gh(v, "PATCH", "/git/refs/heads/" + encodeURIComponent(v.branch || "main"), { sha: c.sha });
            ED.toast("Restored. The website updates in about a minute; reload the editor then.", 6000);
            close();
          } catch (e) { ED.toast(e.message, 6000); u.disabled = false; }
        });
      } catch (e) { m.querySelector(".ed-note").textContent = e.message; }
    });
  }

  // ZIP: a plain (uncompressed) ZIP built right here, which any host's file manager can unpack
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u8 => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  ED.makeZip = function (entries) {       // [{ path, data: Uint8Array }]
    const enc = new TextEncoder(), parts = [], central = []; let offset = 0;
    const d = new Date(), dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)), dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate());
    entries.forEach(e => {
      const name = enc.encode(e.path), crc = crc32(e.data), size = e.data.length;
      const loc = new DataView(new ArrayBuffer(30));
      [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, dt, 2], [12, dd, 2], [14, crc, 4], [18, size, 4], [22, size, 4], [26, name.length, 2], [28, 0, 2]].forEach(([o, v, n]) => n === 4 ? loc.setUint32(o, v, true) : loc.setUint16(o, v, true));
      parts.push(new Uint8Array(loc.buffer), name, e.data);
      const cen = new DataView(new ArrayBuffer(46));
      [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, dt, 2], [14, dd, 2], [16, crc, 4], [20, size, 4], [24, size, 4], [28, name.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, offset, 4]].forEach(([o, v, n]) => n === 4 ? cen.setUint32(o, v, true) : cen.setUint16(o, v, true));
      central.push(new Uint8Array(cen.buffer), name);
      offset += 30 + name.length + size;
    });
    const csize = central.reduce((a, b) => a + b.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, entries.length, 2], [10, entries.length, 2], [12, csize, 4], [16, offset, 4], [20, 0, 2]].forEach(([o, v, n]) => n === 4 ? end.setUint32(o, v, true) : end.setUint16(o, v, true));
    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: "application/zip" });
  };
  const APP_FILES = ["index.html", "edit.html", "tools.html", "sw.js", "manifest.json", "icon-192.png", "icon-512.png",
    "app/core.js", "app/style.css", "app/happenings.js", "app/tours.js", "app/nearme.js", "app/oldmaps.js", "app/passport.js", "app/interiors.js", "app/welcome.js", "app/welcome-themes.js", "app/offline.js",
    "app/editor.css", "app/ed-core.js", "app/ed-items.js", "app/ed-tours.js", "app/ed-haps.js", "app/ed-passport.js", "app/ed-look.js", "app/ed-map.js", "app/tools.js", "app/building.html"];
  ED.APP_FILES = APP_FILES;
  async function publishZip(whole, say) {
    const enc = new TextEncoder(), entries = [], have = new Set();
    const add = (path, data) => { if (have.has(path)) return; have.add(path); entries.push({ path: BASE && path.startsWith(BASE) ? path.slice(BASE.length) : path, data }); };
    changedFiles().forEach(f => add(f.path, enc.encode(f.text)));
    for (const [p, blob] of PENDING) add(p, new Uint8Array(await blob.arrayBuffer()));
    if (whole) {
      const want = APP_FILES.map(p => p).concat(FILES.map(n => BASE + "data/" + n));
      const D = ED.data;
      D.media.forEach(m => { if (!/video/i.test(m.KIND || "") && m.FILE && !/^https?:/i.test(m.FILE)) { want.push(ED.mediaDir() + m.FILE); if (m.THUMB) want.push(ED.mediaDir() + m.THUMB); if (m.ANIMATION) want.push(ED.mediaDir() + m.ANIMATION); } });
      ((D.map && D.map.overlays) || []).forEach(o => o.file && want.push(BASE + (o.file.includes("/") ? o.file : "overlays/" + o.file)));
      ["BADGE_LOGO", "WELCOME_GIF"].forEach(k => D.site[k] && want.push(BASE + "media/" + D.site[k]));
      let n = 0;
      for (const p of want) {
        n++; say("Gathering " + p, 5 + 85 * n / want.length);
        if (have.has(p)) continue;
        try { const r = await fetch(p, { cache: "no-cache" }); if (r.ok) add(p, new Uint8Array(await r.arrayBuffer())); } catch (e) { /* skipped */ }
      }
    }
    if (!entries.length) throw new Error("Nothing to put in the ZIP.");
    const blob = ED.makeZip(entries);
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = (slug(ED.site("PLACE")) || "map") + (whole ? "-site" : "-changes") + ".zip";
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    ED.lastZip = { names: entries.map(e => e.path), size: blob.size };
  }

  /* ---------- 8. Start-up ---------- */
  ED.preview = function () {
    const u = new URL("index.html", location.href);
    u.searchParams.set("draft", "1"); u.searchParams.set("intro", "0");
    if (SAMPLE) u.searchParams.set("sample", SAMPLE);
    if (EVENT) u.searchParams.set("event", EVENT);
    if (ED.selected && ED.selected.ID) u.searchParams.set("place", ED.selected.ID);
    window.open(u.toString(), "ets-preview");
  };
  function badge() {
    const s = ED.data.site, place = s.PLACE || "Your Map";
    $("edName").textContent = place + (EVENT ? " · " + (eventInfo.title || EVENT) : "");
    document.title = "Editor: " + place;
    const initials = (s.BADGE_TEXT || place.split(/[\s,]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("")).slice(0, 2).toUpperCase();
    $("edBadge").textContent = initials;
    document.documentElement.style.setProperty("--accent", /^#[0-9a-f]{6}$/i.test(s.BAR_COLOR || "") ? s.BAR_COLOR : "#0B7A75");
  }
  ED.onChange(n => { if (n === "site.csv") badge(); });
  ED.start = async function () {
    try { if (localStorage.getItem(KEY("ed_theme")) === "night") document.documentElement.dataset.theme = "night"; } catch (e) { /* fine */ }
    await loadAll();
    (await idb.all()).forEach(([p, b]) => { if (BASE ? p.startsWith(BASE) : !p.startsWith("samples/")) PENDING.set(p, b); });   // the sample's uploads stay in the sample
    ED.data = view();
    badge();
    if (EVENT) {
      const bar = $("edEvent"); bar.hidden = false; document.body.classList.add("ed-designing");
      const kind = eventInfo.kind === "interior" ? "an interior" : "an event";
      bar.innerHTML = "<b>Designing " + kind + ": " + esc(eventInfo.title || EVENT) + "</b><span>Changes go into its own folder, not the live map. Anything you don't change comes from the live map.</span>" +
        '<button type="button" class="ed-btn ed-small" data-link="1">Copy Its Link</button><button type="button" class="ed-btn ed-small" data-live="1">Use the Live Version…</button><button type="button" class="ed-btn ed-small" data-apply="1">Apply to Live Site…</button><a class="ed-btn ed-small" href="' + esc(setParam("event", null)) + '">Back to the Live Map</a>';
      bar.querySelector("[data-apply]").addEventListener("click", applyToLive);
      bar.querySelector("[data-live]").addEventListener("click", useLive);
      bar.querySelector("[data-link]").addEventListener("click", async () => { const u = new URL("index.html", location.href); u.searchParams.set("event", EVENT); if (SAMPLE) u.searchParams.set("sample", SAMPLE); try { await navigator.clipboard.writeText(u.toString()); ED.toast("Link copied: " + u.toString(), 4000); } catch (e) { prompt("The event's link", u.toString()); } });
    }
    const tabs = $("edTabs");
    ORDER.forEach(id => { const b = h("button"); b.type = "button"; b.dataset.p = id; b.textContent = PANELS[id].title; b.addEventListener("click", () => ED.show(id)); tabs.appendChild(b); });
    $("edUndo").addEventListener("click", ED.undo);
    $("edPreview").addEventListener("click", ED.preview);
    $("edPublish").addEventListener("click", ED.openPublish);
    $("edAerial").addEventListener("click", ED.toggleAerial);
    if (PANELS.look) $("edBrand").addEventListener("click", () => ED.show("look"));
    const keep = ["sample", "event"].filter(k => Q.get(k)).map(k => k + "=" + encodeURIComponent(Q.get(k))).join("&");     // links between the editor and Tools keep the sample or event
    document.querySelectorAll('a[href="edit.html"], a[href="tools.html"]').forEach(a => { if (keep) a.href += "?" + keep; });
    document.addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.key === "z" && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); ED.undo(); } });
    addEventListener("beforeunload", e => { if (changedFiles().length || PENDING.size) { e.preventDefault(); e.returnValue = ""; } });   // unpublished changes are kept here, but say so
    if (!document.body.classList.contains("ed-tools")) makeMap();
    ED.show(PANELS[Q.get("panel")] ? Q.get("panel") : ORDER[0]);
    updateCount();
    if (ED.restoredDrafts) ED.toast("Your unpublished changes from before are still here. Publish when ready, or throw them away with Discard All Changes in the Publish window.", 6000);
    if (ED.catchingUp) ED.toast("GitHub is still updating the website with your last publish. You're seeing what you published.", 6000);
    if (ED.problems.length) ED.toast(ED.problems[0], 6000);
    ED.ready = true;
  };
  // Copy an event's changed files over the live map's files (asks first)
  function applyToLive() {
    const files = (eventInfo.overrides || []).filter(n => FILES.includes(n));
    ED.confirm("Apply to Live Site?", "This copies " + (files.length ? files.join(", ") : "nothing") + " from this event's folder onto the live map, replacing what's there. Publish afterwards to make it real.", "Apply", () => {
      files.forEach(n => { const p = BASE + "data/" + n; const text = F[n].text; ED.addExtraFile(p, n === "site.csv" ? mergedSite() : text); });
      ED.toast("Ready. Press Publish to put it on the live site.");
    });
  }
  // Re-save from the live site: a file this event changed goes back to following the live map
  function useLive() {
    const files = (eventInfo.overrides || []).filter(n => FILES.includes(n));
    if (!files.length) { ED.toast("This event doesn't change any files yet, so it already follows the live map."); return; }
    ED.modal("<h2>Use the Live Version</h2><p>Pick a file this event changed. It goes back to following the live map, and this event's copy is dropped when you publish.</p>" + files.map(n => '<button type="button" class="ed-btn" data-f="' + esc(n) + '">' + esc(n) + "</button>").join(" "), (m, close) => {
      m.querySelectorAll("[data-f]").forEach(b => b.addEventListener("click", () => {
        const n = b.dataset.f; eventInfo.overrides = eventInfo.overrides.filter(x => x !== n); saveEventInfo();
        setDraft(F[n].path, null); close(); ED.toast(n + " now follows the live map. Reloading…"); setTimeout(() => location.reload(), 900);
      }));
    });
  }
  function mergedSite() { const f = F["site.csv"], base = Object.assign({}, f.base || {}); f.rows.forEach(r => { base[r.KEY] = r.VALUE; }); return toCSV(["KEY", "VALUE"], Object.keys(base).map(k => ({ KEY: k, VALUE: base[k] }))); }
  ED.discardAll = function () {
    FILES.forEach(n => { const f = F[n]; setDraft(f.path, null); const fresh = load1(n, f.orig); Object.assign(f, { cols: fresh.cols, rows: fresh.rows, data: fresh.data }); f.text = serialize(f); });
    PENDING.forEach((b, p) => idb.del(p)); PENDING.clear(); EXTRA_FILES.forEach((t, p) => setDraft(p, null)); EXTRA_FILES.clear(); UNDO.length = 0;
    afterChange("all"); rerender(); ED.closeInspector(); ED.toast("Changes discarded. Back to the published map.");
  };
})();
