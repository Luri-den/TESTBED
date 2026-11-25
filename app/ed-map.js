/* ETS Community Map: ed-map.js. The Map panel: start view, allowed area, the area's outline (found by name or drawn),
   old maps pinned by their four corners, and the indoor plan used as a backdrop. */
(function () {
  "use strict";
  const ED = window.ETSEditor, { esc, ui, h } = ED;
  const S = k => ED.site(k), setS = (k, v, label) => ED.setSite(k, v, label);
  const mapData = () => ED.data.map || {};
  const editMap = (fn, label) => ED.change("map.json", f => { f.data = f.data || {}; fn(f.data); }, label);
  let pins = [], selOverlay = -1, outlineEdit = false, floorShown = 0;

  /* ---------- what the editor's map shows for this panel ---------- */
  ED.onStyle(map => { addLayers(map); });
  function addLayers(map) {
    if (!map.getSource("ed-outline")) {
      map.addSource("ed-outline", { type: "geojson", data: outlineData() });
      map.addLayer({ id: "ed-outline", type: "line", source: "ed-outline", paint: { "line-color": ["coalesce", ["get", "stroke"], "#0B7A75"], "line-width": 3, "line-dasharray": [2, 1.5] } });
      map.addSource("ed-bounds", { type: "geojson", data: boundsData() });
      map.addLayer({ id: "ed-bounds", type: "line", source: "ed-bounds", paint: { "line-color": "#B91C1C", "line-width": 2, "line-opacity": 0.7 } });
    }
    drawImages();
  }
  function outlineData() { const o = mapData().outline; return o || { type: "FeatureCollection", features: [] }; }
  function boundsData() {
    const b = ["BOUNDS_WEST", "BOUNDS_SOUTH", "BOUNDS_EAST", "BOUNDS_NORTH"].map(k => parseFloat(S(k)));
    if (!b.every(isFinite) || ED.current() !== "map") return { type: "FeatureCollection", features: [] };
    return { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]], [b[0], b[1]]] } };
  }
  function refresh() {
    const m = ED.map; if (!m || !m.getSource) return;
    const o = m.getSource("ed-outline"); if (o) o.setData(outlineData());
    const b = m.getSource("ed-bounds"); if (b) b.setData(boundsData());
    drawImages(); drawPins();
  }
  ED.onChange(n => { if (n === "map.json" || n === "site.csv" || n === "all") refresh(); });

  // pictures on the map: the old map being pinned, or the indoor plan
  const imgCache = {};
  async function picture(file, folder) {
    const key = (folder || "") + file;
    if (imgCache[key]) return imgCache[key];
    const src = /^(https?:)?\/\//.test(file) ? file : ED.mediaSrc(file.replace(/^overlays\//, ""), folder);
    const p = (async () => {
      let url = src;
      if (/\.svg(\?|$)/i.test(file)) {          // drawings are painted to a picture first
        const t = await (await fetch(src)).text(), d = new DOMParser().parseFromString(t, "image/svg+xml").documentElement;
        const vb = (d.getAttribute("viewBox") || "").split(/[\s,]+/).map(Number);
        const w = parseFloat(d.getAttribute("width")) || vb[2] || 1000, hh = parseFloat(d.getAttribute("height")) || vb[3] || 750;
        d.setAttribute("width", w * 2); d.setAttribute("height", hh * 2); if (vb.length !== 4) d.setAttribute("viewBox", "0 0 " + w + " " + hh);
        const bu = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(d)], { type: "image/svg+xml" }));
        const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = bu; });
        const c = document.createElement("canvas"); c.width = w * 2; c.height = hh * 2; c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        url = c.toDataURL("image/png"); return { url, w, h: hh };
      }
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("couldn't read " + file)); i.src = url; });
      return { url, w: img.naturalWidth, h: img.naturalHeight };
    })();
    imgCache[key] = p; p.catch(() => { delete imgCache[key]; });
    return p;
  }
  const overlayFolder = () => ED.BASE + "overlays/";
  const overlayPath = o => o.file.includes("/") ? ED.BASE + o.file : overlayFolder() + o.file;
  async function drawImages() {
    const m = ED.map; if (!m || !m.getSource || !ED.styleReady()) return;
    const want = [];
    if (ED.current() === "map") {
      const ov = (mapData().overlays || [])[selOverlay];
      if (ov && ov.corners) want.push({ id: "ed-img-ov", file: ov.file, folder: overlayPath(ov).slice(0, -ov.file.split("/").pop().length), name: ov.file.split("/").pop(), corners: ov.corners, opacity: 0.65 });
      const bd = mapData().backdrop;
      if (bd && (bd.floors || []).length) { const f = bd.floors[Math.min(floorShown, bd.floors.length - 1)]; want.push({ id: "ed-img-bd", file: f.image, folder: ED.mediaDir(), name: f.image, corners: bd.corners || null, opacity: 1, plan: true }); }
    }
    ["ed-img-ov", "ed-img-bd"].forEach(id => { if (!want.some(w => w.id === id)) { if (m.getLayer(id)) m.removeLayer(id); if (m.getSource(id)) m.removeSource(id); } });
    for (const w of want) {
      try {
        const pic = await picture(w.name, w.folder);
        const corners = w.corners || fiction(pic.w, pic.h);
        if (m.getLayer(w.id)) m.removeLayer(w.id); if (m.getSource(w.id)) m.removeSource(w.id);
        m.addSource(w.id, { type: "image", url: pic.url, coordinates: corners });
        m.addLayer({ id: w.id, type: "raster", source: w.id, paint: { "raster-opacity": w.opacity } }, m.getLayer("ed-outline") ? "ed-outline" : undefined);
        if (w.plan && !w.corners) ED.planCorners = corners;
      } catch (e) { ED.toast("A picture couldn't be shown: " + e.message); }
    }
  }
  const fiction = (w, hh) => { const hw = 0.003, k = hw * (hh / w); return [[-hw, k], [hw, k], [hw, -k], [-hw, -k]]; };

  // draggable pins: an old map's four corners, or the outline's points
  function drawPins() {
    pins.forEach(p => p.remove()); pins = [];
    if (!ED.map || !window.maplibregl || ED.current() !== "map") return;
    const ov = (mapData().overlays || [])[selOverlay];
    if (ov && ov.corners) ov.corners.forEach((c, i) => pins.push(pin(c, "ed-corner", ["Top Left", "Top Right", "Bottom Right", "Bottom Left"][i], ll => editMap(d => { d.overlays[selOverlay].corners[i] = ll; }, "moved a corner"))));
    const bd = mapData().backdrop;
    if (bd && bd.corners && selOverlay === -2) bd.corners.forEach((c, i) => pins.push(pin(c, "ed-corner", ["Top Left", "Top Right", "Bottom Right", "Bottom Left"][i], ll => editMap(d => { d.backdrop.corners[i] = ll; }, "moved a corner"))));
    if (outlineEdit) { const ring = outlineRing(); ring.slice(0, ring.length > 1 && same(ring[0], ring[ring.length - 1]) ? -1 : undefined).forEach((c, i) => pins.push(pin(c, "ed-vertex", "Drag to move", ll => editMap(d => { const r = ringOf(d.outline); r[i] = ll; if (i === 0 && r.length > 1) r[r.length - 1] = ll; }, "moved a point")))); }
  }
  const same = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];
  function pin(c, cls, title, onMove) {
    const el = document.createElement("div"); el.className = cls; el.title = title;
    if (cls === "ed-corner") el.textContent = title.split(" ").map(w => w[0]).join("");
    const m = new maplibregl.Marker({ element: el, draggable: true }).setLngLat(c).addTo(ED.map);
    m.on("dragend", () => { const p = m.getLngLat(); onMove([+p.lng.toFixed(6), +p.lat.toFixed(6)]); });
    return m;
  }
  function ringOf(o) {
    if (!o) return null;
    const f = o.type === "FeatureCollection" ? o.features[0] : o.type === "Feature" ? o : { geometry: o };
    const g = f && f.geometry; if (!g) return null;
    if (g.type === "Polygon") return g.coordinates[0];
    if (g.type === "MultiPolygon") return g.coordinates[0][0];
    if (g.type === "LineString") return g.coordinates;
    return null;
  }
  const outlineRing = () => ringOf(mapData().outline) || [];
  const outlineProps = () => { const o = mapData().outline; const f = o && (o.type === "FeatureCollection" ? o.features[0] : o); return (f && f.properties) || {}; };

  /* ---------- the panel ---------- */
  function render(side) {
    const D = mapData();
    ui.head(side, "Map", ED.EVENT && (ED.eventInfo() || {}).kind === "interior" ? "The indoor plan and where the map starts." : "Where the map starts, how far visitors can wander, the area's outline and old maps.");
    const bd = D.backdrop;
    const interior = ED.EVENT && (ED.eventInfo() || {}).kind === "interior";
    if (interior || bd) planSection(side, bd);

    const sv = ui.section(side, "Start View");
    const lat = parseFloat(S("CENTER_LAT")), lng = parseFloat(S("CENTER_LNG"));
    ui.note(sv, isFinite(lat) ? "Saved: zoom " + (S("ZOOM") || "13") + " around " + lat.toFixed(4) + ", " + lng.toFixed(4) + "." : "Not set yet.");
    ui.toggle(sv, "Fit to the Markers", ED.yes(S("FIT_TO_MARKERS"), true), v => setS("FIT_TO_MARKERS", v ? "yes" : "no", "fit to markers"), "On: the map opens showing every place. Off: it opens at the saved view.");
    ui.buttons(sv, [{ text: "Use the Current Map View", primary: true, onClick: () => { const c = ED.map.getCenter(); ED.change("site.csv", f => { [["CENTER_LAT", c.lat.toFixed(6)], ["CENTER_LNG", c.lng.toFixed(6)], ["ZOOM", ED.map.getZoom().toFixed(1)]].forEach(([k, v]) => { const r = f.rows.find(x => x.KEY === k); if (r) r.VALUE = v; else f.rows.push({ KEY: k, VALUE: v }); }); }, "start view"); ED.rerender(); ED.toast("Start view saved."); } },
      isFinite(lat) ? { text: "Go There", onClick: () => ED.map.easeTo({ center: [lng, lat], zoom: parseFloat(S("ZOOM")) || 13 }) } : null]);

    const aa = ui.section(side, "Allowed Area", { open: false });
    const b = ["BOUNDS_WEST", "BOUNDS_SOUTH", "BOUNDS_EAST", "BOUNDS_NORTH"].map(k => parseFloat(S(k)));
    ui.note(aa, b.every(isFinite) ? "Visitors can't scroll outside the red box." : "No limit: visitors can scroll anywhere.");
    const setB = arr => ED.change("site.csv", f => { ["BOUNDS_WEST", "BOUNDS_SOUTH", "BOUNDS_EAST", "BOUNDS_NORTH"].forEach((k, i) => { const v = arr ? (+arr[i]).toFixed(5) : ""; const r = f.rows.find(x => x.KEY === k); if (r) r.VALUE = v; else f.rows.push({ KEY: k, VALUE: v }); }); }, "allowed area");
    ui.buttons(aa, [{ text: "Use the Current Map View", onClick: () => { const bb = ED.map.getBounds(); setB([bb.getWest(), bb.getSouth(), bb.getEast(), bb.getNorth()]); ED.rerender(); } },
      { text: "Draw a Box", onClick: () => { let first = null; ED.setMode({ title: "Tap one corner of the area, then the opposite corner.", doneText: "Cancel", onMapClick: ll => { if (!first) { first = ll; ED.toast("Now tap the opposite corner."); return; } ED.setMode(null); setB([Math.min(first[0], ll[0]), Math.min(first[1], ll[1]), Math.max(first[0], ll[0]), Math.max(first[1], ll[1])]); ED.rerender(); } }); } },
      b.every(isFinite) ? { text: "No Limit", onClick: () => { setB(null); ED.rerender(); } } : null]);
    const g = h("div", "ed-grid2"); aa.appendChild(g);
    ui.number(g, "Farthest Out (Zoom)", S("MIN_ZOOM"), v => setS("MIN_ZOOM", v, "zoom limit"), "Blank = no limit.", { min: 0, max: 22, step: 0.5 });
    ui.number(g, "Closest In (Zoom)", S("MAX_ZOOM"), v => setS("MAX_ZOOM", v, "zoom limit"), "", { min: 0, max: 22, step: 0.5 });
    ui.buttons(aa, [{ text: "Use the Current Zoom as Farthest Out", onClick: () => { setS("MIN_ZOOM", ED.map.getZoom().toFixed(1), "zoom limit"); ED.rerender(); } }]);

    const ol = ui.section(side, "Area Outline", { open: !D.outline });
    const ring = outlineRing();
    ui.note(ol, ring.length ? "An outline with " + ring.length + " points. It also draws the badge in the search bar (unless the badge is set to something else)." : "A line around your county, town or grounds. It also becomes the badge in the search bar.");
    const find = h("div", "ed-pick-row"); find.innerHTML = '<input class="ed-input" placeholder="Find a county, city or town" aria-label="Find a place"><button type="button" class="ed-btn">Find</button>';
    const res = h("div", "ed-list"); ol.appendChild(find); ol.appendChild(res);
    const go = async () => {
      const q = find.querySelector("input").value.trim(); if (!q) return;
      res.innerHTML = '<div class="ed-empty">Looking…</div>';
      try {
        const r = await fetch("https://nominatim.openstreetmap.org/search?format=geojson&polygon_geojson=1&limit=6&q=" + encodeURIComponent(q), { headers: { Accept: "application/json" } });
        const j = await r.json(); const hits = (j.features || []).filter(f => /Polygon/.test(f.geometry.type));
        res.innerHTML = hits.length ? "" : '<div class="ed-empty">No outline found for that. Try adding the state, or draw it.</div>';
        hits.forEach(f => { const bt = h("button", "ed-row", '<span class="ed-rt"><b>' + esc(f.properties.display_name.split(",").slice(0, 3).join(",")) + "</b><small>" + esc(f.properties.type || "") + "</small></span>"); bt.type = "button"; bt.addEventListener("click", () => useOutline(f)); res.appendChild(bt); });
      } catch (e) { res.innerHTML = '<div class="ed-empty">The search service couldn\'t be reached. Draw the outline instead.</div>'; }
    };
    find.querySelector("button").addEventListener("click", go); find.querySelector("input").addEventListener("keydown", e => { if (e.key === "Enter") go(); });
    ui.note(ol, "Outlines found this way come from OpenStreetMap.");
    ui.buttons(ol, [{ text: ring.length ? "Redraw It" : "Draw It", onClick: drawOutline }, ring.length ? { text: outlineEdit ? "Stop Adjusting" : "Adjust the Points", onClick: () => { outlineEdit = !outlineEdit; drawPins(); ED.rerender(); } } : null, ring.length ? { text: "Remove It", danger: true, onClick: () => editMap(d => { d.outline = null; }, "removed outline") } : null]);
    if (ring.length) {
      const p = outlineProps();
      const setP = (k, v) => editMap(d => { const f = d.outline.type === "FeatureCollection" ? d.outline.features[0] : d.outline; f.properties = f.properties || {}; f.properties[k] = v; }, "outline style");
      ui.select(ol, "Line Style", p["stroke-dasharray"] || "", [["", "Solid"], ["dashed", "Dashed"], ["dotted", "Dotted"]], v => setP("stroke-dasharray", v));
      ui.color(ol, "Line Color", p.stroke, v => setP("stroke", v));
      ui.number(ol, "Line Width", p["stroke-width"], v => setP("stroke-width", +v || 3), "", { min: 1, max: 10 });
    }

    if (!interior) overlaysSection(side);
    else if (!bd) ui.note(side, "Start by adding the indoor plan above.");
  }
  ED.useOutline = f => useOutline(f);
  function useOutline(f) {
    let ring = f.geometry.type === "Polygon" ? f.geometry.coordinates[0] : f.geometry.coordinates.slice().sort((a, b) => b[0].length - a[0].length)[0][0];
    const step = Math.max(1, Math.ceil(ring.length / 400)); ring = ring.filter((_, i) => i % step === 0 || i === ring.length - 1).map(c => [+c[0].toFixed(5), +c[1].toFixed(5)]);
    editMap(d => { d.outline = { type: "FeatureCollection", features: [{ type: "Feature", properties: { stroke: S("BAR_COLOR") || "#0B7A75", "stroke-width": 4, "stroke-dasharray": "dotted" }, geometry: { type: "Polygon", coordinates: [ring] } }] }; }, "outline");
    ED.map.fitBounds(ED.bounds(ring), { padding: 40, duration: 600 });
    ED.rerender(); ED.toast("Outline added. Use Adjust the Points to fine-tune it.");
  }
  function drawOutline() {
    const pts = [];
    const save = () => editMap(d => { d.outline = { type: "FeatureCollection", features: [{ type: "Feature", properties: Object.assign({ stroke: S("BAR_COLOR") || "#0B7A75", "stroke-width": 4, "stroke-dasharray": "dotted" }, outlineProps()), geometry: pts.length > 2 ? { type: "Polygon", coordinates: [pts.concat([pts[0]])] } : { type: "LineString", coordinates: pts.slice() } }] }; }, "drew outline");
    ED.setMode({ title: "Tap around the area, point by point.", text: "Press Done to close the shape.", extra: '<button type="button" class="ed-btn" data-undo="1">Undo Point</button>',
      wire: box => box.querySelector("[data-undo]").addEventListener("click", () => { if (pts.length) { pts.pop(); save(); } }),
      onMapClick: ll => { pts.push([+ll[0].toFixed(5), +ll[1].toFixed(5)]); save(); }, onMarkerClick: it => { pts.push([+parseFloat(it.LONG).toFixed(5), +parseFloat(it.LAT).toFixed(5)]); save(); },
      onDone: () => ED.rerender() });
  }

  /* ---------- old maps ---------- */
  function overlaysSection(side) {
    const list = mapData().overlays || [];
    const sec = ui.section(side, "Old Maps", { badge: String(list.length), open: selOverlay >= 0 || !list.length });
    ui.note(sec, "Scanned old maps laid over today's map. Each one is pinned by its four corners. Big pictures are shrunk here to about 4,000 pixels.");
    ui.list(sec, list.map((o, i) => ({ id: String(i), title: o.name || o.file, sub: (o.hidden ? "Hidden · " : "") + o.file + (o.offline ? " · Saved for offline" : ""), color: "#8B6F47", on: i === selOverlay })), { empty: "No old maps yet.", onPick: id => { selOverlay = +id; outlineEdit = false; refresh(); ED.rerender(); fitOverlay(); } });
    ui.file(sec, "Add an Old Map", "image/*", files => addOverlay(files[0]), "JPEG, PNG or WebP.");
    const o = list[selOverlay];
    if (!o) return;
    const ed = ui.section(sec, "Pinning " + (o.name || o.file));
    ui.note(ed, "Drag the four corner pins (TL, TR, BR, BL) until the old streets line up with today's. Zoom in close for the last nudge.");
    const set = (k, v, label) => editMap(d => { if (v === "" || v == null || v === false) delete d.overlays[selOverlay][k]; else d.overlays[selOverlay][k] = v; }, label);
    ui.text(ed, "Name", o.name, v => { set("name", v, "old map name"); ED.rerender(); }, "Shown in the old-map picker, like 1882.");
    ui.buttons(ed, [{ text: "Fit to the Current View", onClick: () => { const b = ED.map.getBounds(), w = b.getWest(), e = b.getEast(), s = b.getSouth(), n = b.getNorth(), dx = (e - w) * 0.1, dy = (n - s) * 0.1; set("corners", [[w + dx, n - dy], [e - dx, n - dy], [e - dx, s + dy], [w + dx, s + dy]].map(c => [+c[0].toFixed(6), +c[1].toFixed(6)]), "fit old map"); } }, { text: "Show All of It", onClick: fitOverlay }]);
    ui.toggle(ed, "Hidden From Visitors", !!o.hidden, v => set("hidden", v ? true : "", "hide old map"), "Keep working on it without showing it yet.");
    ui.toggle(ed, "Include in Save for Offline", !!o.offline, v => set("offline", v ? true : "", "offline"), "Old maps are big, so they're left out unless you say so.");
    ui.buttons(ed, [{ text: "Done Pinning", primary: true, onClick: () => { selOverlay = -1; refresh(); ED.rerender(); } }, { text: "Remove…", danger: true, onClick: () => ED.confirm("Remove " + (o.name || o.file) + "?", "It comes off the map. The picture file stays in the overlays folder.", "Remove", () => { editMap(d => { d.overlays.splice(selOverlay, 1); }, "removed old map"); selOverlay = -1; ED.rerender(); }) }]);
  }
  function fitOverlay() { const o = (mapData().overlays || [])[selOverlay]; if (o && o.corners && ED.map) ED.map.fitBounds(ED.bounds(o.corners), { padding: 40, duration: 500 }); }
  async function addOverlay(file) {
    if (!file) return;
    ED.toast("Shrinking " + file.name + "…", 8000);
    try {
      const r = await ED.shrinkPhoto(file, 4096, 0);
      const name = ED.slug(file.name.replace(/\.[^.]+$/, "")) + "." + r.ext;
      ED.addPending(ED.BASE + "overlays/" + name, r.main);
      const b = ED.map.getBounds(), w = b.getWest(), e = b.getEast(), s = b.getSouth(), n = b.getNorth();
      const aspect = r.h / r.w, cx = (w + e) / 2, cy = (s + n) / 2, halfW = (e - w) * 0.35, halfH = halfW * aspect * Math.cos(cy * Math.PI / 180);
      editMap(d => { d.overlays = d.overlays || []; d.overlays.push({ name: file.name.replace(/\.[^.]+$/, ""), file: "overlays/" + name, corners: [[cx - halfW, cy + halfH], [cx + halfW, cy + halfH], [cx + halfW, cy - halfH], [cx - halfW, cy - halfH]].map(c => [+c[0].toFixed(6), +c[1].toFixed(6)]) }); }, "added old map");
      selOverlay = mapData().overlays.length - 1;
      ED.toast("Added (" + Math.round(r.main.size / 1024) + " KB). Now drag its corners into place.", 5000);
      refresh(); ED.rerender();
    } catch (e) { ED.toast(e.message); }
  }

  /* ---------- the indoor plan (backdrop) ---------- */
  function planSection(side, bd) {
    const sec = ui.section(side, "Indoor Plan");
    ui.note(sec, "A floor plan used as the whole map, instead of streets. Make one in Tools with the Building Designer and export it as a picture, or use a scan.");
    const set = (fn, label) => editMap(d => { d.backdrop = d.backdrop || { title: "", background: "#F4F1EA", floors: [] }; fn(d.backdrop); }, label);
    if (!bd) { ui.file(sec, "Add the Ground Floor Plan", "image/*,.svg", files => addFloor(files[0], set), "PNG, JPEG or SVG."); return; }
    (bd.floors || []).forEach((f, i) => {
      const row = h("div", "ed-media", '<span class="ed-mtype">' + (i + 1) + '</span><div class="mi"><input value="' + esc(f.name) + '" aria-label="Floor name"><small>' + esc(f.image) + "</small></div>" + (i ? '<button type="button" class="ed-btn" data-up="1" aria-label="Move down">↓</button>' : "") + '<button type="button" class="ed-btn" data-show="1">Show</button><button type="button" class="ed-btn ed-danger" data-x="1" aria-label="Remove">✕</button>');
      row.querySelector("input").addEventListener("change", e => set(b => { b.floors[i].name = e.target.value; }, "floor name"));
      row.querySelector("[data-show]").addEventListener("click", () => { floorShown = i; drawImages(); });
      const up = row.querySelector("[data-up]"); if (up) up.addEventListener("click", () => set(b => { [b.floors[i - 1], b.floors[i]] = [b.floors[i], b.floors[i - 1]]; }, "floor order"));
      row.querySelector("[data-x]").addEventListener("click", () => ED.confirm("Remove " + f.name + "?", "Places on this floor keep their floor setting.", "Remove", () => set(b => { b.floors.splice(i, 1); }, "removed floor")));
      sec.appendChild(row);
    });
    ui.file(sec, "Add Another Floor", "image/*,.svg", files => addFloor(files[0], set), "Ground floor first, then up.");
    ui.text(sec, "Title", bd.title, v => set(b => { b.title = v; }, "plan title"));
    ui.color(sec, "Color Around the Plan", bd.background, v => set(b => { b.background = v; }, "plan color"));
    const g = h("div", "ed-grid2"); sec.appendChild(g);
    ui.number(g, "Real Width of the Plan", bd.scale && bd.scale.across, v => set(b => { b.scale = v ? { across: +v, unit: (b.scale && b.scale.unit) || "ft" } : undefined; }, "scale"), "For the scale bar.");
    ui.select(g, "In", (bd.scale && bd.scale.unit) || "ft", [["ft", "Feet"], ["m", "Meters"]], v => set(b => { b.scale = Object.assign({ across: 100 }, b.scale || {}, { unit: v }); }, "scale"));
    ui.toggle(sec, "Pinned to the Real World", !!bd.corners, on => { if (on) { const b0 = ED.map.getBounds(), w = b0.getWest(), e = b0.getEast(), s = b0.getSouth(), n = b0.getNorth(), dx = (e - w) * .2, dy = (n - s) * .2; set(b => { b.corners = [[w + dx, n - dy], [e - dx, n - dy], [e - dx, s + dy], [w + dx, s + dy]].map(c => [+c[0].toFixed(6), +c[1].toFixed(6)]); }, "pin plan"); selOverlay = -2; } else set(b => { delete b.corners; }, "unpin plan"); ED.rerender(); },
      "On: the plan sits at its true place, so Near Me and Open in Maps work. Drag its corners to line it up. Off: it floats on its own, and those switch off.");
    ui.buttons(sec, [{ text: "Show the Plan", onClick: () => { const c = bd.corners || ED.planCorners; if (c) ED.map.fitBounds(ED.bounds(c), { padding: 30, duration: 500 }); } }]);
  }
  async function addFloor(file, set) {
    if (!file) return;
    let blob = file, ext = (file.name.split(".").pop() || "png").toLowerCase();
    if (!/svg/.test(file.type) && ext !== "svg") { const r = await ED.shrinkPhoto(file, 4096, 0); blob = r.main; ext = r.ext; }
    const name = "plans/" + ED.slug(file.name.replace(/\.[^.]+$/, "")) + "." + ext;
    ED.addPending(ED.mediaDir() + name, blob);
    set(b => { b.floors = b.floors || []; b.floors.push({ id: "floor" + (b.floors.length + 1), name: b.floors.length ? "Floor " + (b.floors.length + 1) : "Ground Floor", image: name }); }, "added floor");
    floorShown = (mapData().backdrop.floors || []).length - 1;
    ED.rerender(); setTimeout(() => { const c = (mapData().backdrop || {}).corners || ED.planCorners; if (c && ED.map) ED.map.fitBounds(ED.bounds(c), { padding: 30 }); }, 600);
  }

  ED.panel("map", { title: "Map", render, onShow: () => { selOverlay = -1; outlineEdit = false; refresh(); } });
  const show0 = ED.show; ED.show = id => { show0(id); if (id !== "map") { selOverlay = -1; outlineEdit = false; } refresh(); };
})();
