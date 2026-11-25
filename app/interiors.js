/* ETS Community Map: interiors.js
   An indoor plan used as the whole map (a museum, a festival ground, a library), with a button for each floor.
   It loads when map.json has a "backdrop". An interior usually lives in its own folder (events/<name>/, with
   "kind": "interior" in event.json); a place on the main map opens it with INSIDE = <name> ("Step Inside").

   map.json "backdrop":
     { "title": "...", "background": "#f4f1ea",
       "floors": [ { "id": "ground", "name": "Ground Floor", "image": "plans/ground.svg" }, ... ]   (or "image" for a single picture)
       "scale": { "across": 100, "unit": "ft" },        the real width of the picture, for the scale bar
       "corners": [[lng,lat] top-left, top-right, bottom-right, bottom-left],   ties the plan to the real world (optional)
       "credit": "..." }
   Without corners the plan sits on a made-up patch of the globe, and Open in Maps and Near Me switch off.
   In items.csv, FLOOR (a floor's id or name; several with |) shows a pin on that floor only. Blank = every floor. */
(function () {
  "use strict";
  const C = window.ETSCore; if (!C) return;
  const { esc, L } = C;
  C.words({ floors: "Floors" });

  const raw = C.DATA.map.backdrop || {};
  const norm = v => String(v == null ? "" : v).trim().toLowerCase();
  let floors = Array.isArray(raw.floors) ? raw.floors.filter(f => f && f.image).map((f, i) => ({ id: String(f.id || "floor" + (i + 1)), name: String(f.name || f.id || "Floor " + (i + 1)), image: String(f.image) })) : [];
  if (!floors.length && raw.image) floors = [{ id: "main", name: String(raw.title || ""), image: String(raw.image) }];
  if (!floors.length) { C.warn("map.json has a backdrop with no picture, so the indoor plan is skipped."); return; }
  const okC = c => Array.isArray(c) && c.length === 4 && c.every(p => Array.isArray(p) && isFinite(+p[0]) && isFinite(+p[1]));
  const anchored = okC(raw.corners) && raw.anchored !== false;
  C.noRealPlace = !anchored;
  const scale = raw.scale && +raw.scale.across > 0 ? { across: +raw.scale.across, unit: /^(m|meter|metre)s?$/i.test(raw.scale.unit || "") ? "m" : "ft" } : null;
  let floor = floors[0], corners = okC(raw.corners) ? raw.corners.map(p => [+p[0], +p[1]]) : null, ready = false, pendingHome = null;

  /* ---------- turning the plan into a picture the map can show ---------- */
  const MAX_SIDE = 4096;                                  // phones struggle with a single picture bigger than this
  const cache = {};
  const loadImg = url => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("couldn't read " + url)); i.src = url; });
  function candidates(file) {
    if (/^(https?:)?\/\//i.test(file) || file.startsWith("data:")) return [file];
    const list = [];
    if (C.EVENT) list.push(C.BASE + "events/" + C.EVENT.name + "/media/" + file);
    list.push(C.BASE + "media/" + file);
    return list;
  }
  async function rasterize(file) {
    let lastErr = null;
    for (const url of candidates(file)) {
      try {
        if (/\.svg(\?|#|$)/i.test(url)) {
          const r = await fetch(url); if (!r.ok) throw new Error(url + " (" + r.status + ")");
          const doc = new DOMParser().parseFromString(await r.text(), "image/svg+xml");
          if (doc.querySelector("parsererror")) throw new Error(url + " isn't a valid drawing");
          const el = doc.documentElement, vb = (el.getAttribute("viewBox") || "").split(/[\s,]+/).map(Number);
          let w = parseFloat(el.getAttribute("width")), h = parseFloat(el.getAttribute("height"));
          if (vb.length === 4 && vb[2] > 0) { if (!(w > 0) || /%/.test(el.getAttribute("width") || "")) w = vb[2]; if (!(h > 0) || /%/.test(el.getAttribute("height") || "")) h = vb[3]; }
          w = w > 0 ? w : 1000; h = h > 0 ? h : 750;
          const k = Math.min(2, MAX_SIDE / Math.max(w, h)), W = Math.round(w * k), H = Math.round(h * k);
          el.setAttribute("width", W); el.setAttribute("height", H); if (!(vb.length === 4)) el.setAttribute("viewBox", "0 0 " + w + " " + h);
          const bu = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(doc)], { type: "image/svg+xml;charset=utf-8" }));
          try { const img = await loadImg(bu), c = document.createElement("canvas"); c.width = W; c.height = H; c.getContext("2d").drawImage(img, 0, 0, W, H); return { url: c.toDataURL("image/png"), w: W, h: H }; }
          finally { URL.revokeObjectURL(bu); }
        }
        const img = await loadImg(url), nw = img.naturalWidth, nh = img.naturalHeight;
        if (Math.max(nw, nh) <= MAX_SIDE) return { url, w: nw, h: nh };
        const k = MAX_SIDE / Math.max(nw, nh), c = document.createElement("canvas"); c.width = Math.round(nw * k); c.height = Math.round(nh * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        return { url: c.toDataURL("image/jpeg", 0.88), w: c.width, h: c.height };
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error("couldn't read " + file);
  }
  const getFloor = f => cache[f.id] || (cache[f.id] = rasterize(f.image));

  // Without corners, the plan sits on a made-up patch near 0,0 about 670 m wide, keeping its proportions
  function fictionCorners(w, h) { const hw = 0.003, hh = hw * (h / w); return [[-hw, hh], [hw, hh], [hw, -hh], [-hw, -hh]]; }
  const bboxOf = cs => { const xs = cs.map(c => c[0]), ys = cs.map(c => c[1]); return [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]]; };

  /* ---------- on the map ---------- */
  const SRC = "ets-plan";
  async function draw() {
    const map = C.map; if (!map || !corners) return;
    let r; try { r = await getFloor(floor); } catch (e) { C.warn("The plan for " + floor.name + " couldn't be shown: " + e.message); return; }
    if (map.getLayer(SRC)) map.removeLayer(SRC);
    if (map.getSource(SRC)) map.removeSource(SRC);
    map.addSource(SRC, { type: "image", url: r.url, coordinates: corners });
    const above = map.getStyle && map.getStyle() && map.getStyle().layers ? map.getStyle().layers.map(l => l.id).find(id => id !== "ets-bg" && id !== SRC) : undefined;
    map.addLayer({ id: SRC, type: "raster", source: SRC, paint: { "raster-opacity": 1, "raster-fade-duration": 0 } }, above);
  }
  C.onStyle(() => { if (ready) draw(); });

  function home(dur) {
    if (!corners) { pendingHome = dur; return; }
    const map = C.map; if (!map) return;
    map.fitBounds(bboxOf(corners), { padding: { top: 150, bottom: 40, left: 40, right: 40 }, duration: dur || 0 });
  }
  C.setHome(home);

  (async function setUp() {
    try {
      const first = await getFloor(floor);
      if (!corners) corners = fictionCorners(first.w, first.h);
    } catch (e) { C.warn("The indoor plan couldn't be read: " + e.message); return; }
    ready = true;
    const map = C.map; if (!map) return;
    const b = bboxOf(corners), px = (b[1][0] - b[0][0]), py = (b[1][1] - b[0][1]);
    try { map.setMaxBounds && map.setMaxBounds([[b[0][0] - px, b[0][1] - py], [b[1][0] + px, b[1][1] + py]]); } catch (e) { /* fine */ }
    try { map.setMinZoom && map.setMinZoom(0); map.setMaxZoom && map.setMaxZoom(22); } catch (e) { /* fine */ }
    const go = () => { draw(); home(pendingHome != null ? pendingHome : 0); floorBar(); scaleBar(); C.refreshMarkers(); };
    let done = false; C.onStyle(() => { if (!done) { done = true; go(); } });      // runs now if the map's style has arrived, or as soon as it does
  })();

  /* ---------- floors ---------- */
  function onFloor(it) {
    const v = norm(it.FLOOR); if (!v || floors.length < 2) return true;
    return v.split(/[|,;]/).map(s => s.trim()).some(s => s === norm(floor.id) || s === norm(floor.name));
  }
  C.addFilter(onFloor);
  function setFloor(id) {
    const f = floors.find(x => norm(x.id) === norm(id) || norm(x.name) === norm(id)); if (!f || f === floor) return;
    floor = f; draw(); C.refreshMarkers(); floorBar();
    document.dispatchEvent(new CustomEvent("ets:floor", { detail: { id: f.id, name: f.name } }));
  }
  function showFloorFor(it) {
    const v = norm(it && it.FLOOR); if (!v) return;
    const f = v.split(/[|,;]/).map(s => s.trim()).map(s => floors.find(x => norm(x.id) === s || norm(x.name) === s)).find(Boolean);
    if (f) setFloor(f.id);
  }
  document.addEventListener("ets:goto", e => showFloorFor(e.detail.item));
  document.addEventListener("ets:tourstop", e => showFloorFor(C.DATA.byId.get(e.detail.item)));

  function floorBar() {
    let bar = document.getElementById("floorBar");
    if (floors.length < 2) { if (bar) bar.remove(); return; }
    if (!bar) { bar = document.createElement("div"); bar.id = "floorBar"; bar.className = "floor-bar"; bar.setAttribute("role", "group"); bar.setAttribute("aria-label", L("floors")); document.body.appendChild(bar); }
    bar.innerHTML = floors.slice().reverse().map(f => '<button type="button" data-f="' + esc(f.id) + '" aria-pressed="' + (f === floor) + '">' + esc(f.name) + "</button>").join("");
    bar.querySelectorAll("[data-f]").forEach(b => b.addEventListener("click", () => { setFloor(b.dataset.f); home(C.REDUCED ? 0 : 600); }));
  }

  /* ---------- scale bar, when the plan's real width is known ---------- */
  const NICE = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
  function scaleBar() {
    const map = C.map; if (!map || (!scale && !anchored)) return;
    const el = document.createElement("div"); el.className = "plan-scale"; el.setAttribute("aria-hidden", "true"); el.innerHTML = "<span></span><i></i>";
    document.body.appendChild(el);
    const mid = (corners[0][1] + corners[2][1]) / 2;
    const fictAcross = Math.abs(corners[1][0] - corners[0][0]) * 111319.49 * Math.cos(mid * Math.PI / 180);
    const realPer = anchored ? 1 : (scale.across * (scale.unit === "ft" ? 0.3048 : 1)) / fictAcross;
    const unit = scale ? scale.unit : "ft";
    const upd = () => {
      const mPerPx = 78271.517 * Math.cos(map.getCenter().lat * Math.PI / 180) / Math.pow(2, map.getZoom()) * realPer, perPx = unit === "ft" ? mPerPx / 0.3048 : mPerPx;
      const n = NICE.filter(v => v <= perPx * 110).pop() || NICE[0];
      el.querySelector("i").style.width = Math.max(20, n / perPx) + "px"; el.querySelector("span").textContent = n + " " + unit;
    };
    map.on("move", upd); upd();
  }

  window.ETSInterior = { floors, get floor() { return floor; }, setFloor, showFloorFor, get corners() { return corners; }, anchored };
})();
