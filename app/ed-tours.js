/* ETS Community Map: ed-tours.js. The Tours panel: tours (ordered stops), trails, and plain lines like old rail lines.
   Draw the line by tapping the map (with Undo Point), drag its dots to adjust, tap markers to add stops. */
(function () {
  "use strict";
  const ED = window.ETSEditor, { esc, ui, h } = ED;
  const TYPES = [["tour", "Tour (Stops in Order)"], ["trail", "Trail (Join Anywhere)"], ["line", "Line Only (Rail Line, Canal)"]];
  const typeName = t => ({ tour: "Tour", trail: "Trail", line: "Line" }[t] || "Tour");
  const MODES = [["walk", "Walking"], ["hike", "Hiking"], ["bike", "Biking"], ["drive", "Driving"], ["virtual", "From Home"]];
  const PACE = { walk: 20, hike: 30, bike: 6, drive: 2 };
  let selId = null, vertexMarkers = [];

  const routes = () => ((ED.data.routes && ED.data.routes.features) || []);
  const byId = id => routes().find(f => f.properties && f.properties.ID === id);
  const R = 6371008.8, rad = d => d * Math.PI / 180;
  const meters = (a, b) => { const dLat = rad(b[1] - a[1]), dLng = rad(b[0] - a[0]); const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
  const coordsOf = f => (f.geometry && f.geometry.type === "LineString" ? f.geometry.coordinates : f.geometry && f.geometry.type === "MultiLineString" ? f.geometry.coordinates.flat() : []);
  const miles = f => { const c = coordsOf(f); let m = 0; for (let i = 1; i < c.length; i++) m += meters(c[i - 1], c[i]); return Math.round(m / 160.9344) / 10; };
  const edit = (f, fn, label) => ED.change("routes.geojson", () => fn(f.properties, f), label || (f.properties.TITLE || f.properties.ID));

  /* ---------- the lines on the editor's map ---------- */
  ED.onStyle(map => {
    if (map.getSource("ed-routes")) return;
    map.addSource("ed-routes", { type: "geojson", data: lineData() });
    map.addLayer({ id: "ed-routes", type: "line", source: "ed-routes", layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": ["coalesce", ["get", "COLOR"], "#0B7A75"], "line-width": ["case", ["==", ["get", "_sel"], 1], ["max", 5, ["to-number", ["coalesce", ["get", "WIDTH"], 4], 4]], ["to-number", ["coalesce", ["get", "WIDTH"], 4], 4]],
        "line-opacity": ["case", ["==", ["get", "_sel"], 0], 0.35, ["to-number", ["coalesce", ["get", "OPACITY"], 1], 1]], "line-dasharray": [1, 0] } });
    map.addLayer({ id: "ed-routes-dash", type: "line", source: "ed-routes", filter: ["==", ["get", "STYLE"], "dashed"], paint: { "line-color": "#FFFFFF", "line-width": 2, "line-dasharray": [2, 2] } });
  });
  function lineData() {
    const showAll = ED.current() === "tours";
    return { type: "FeatureCollection", features: routes().filter(f => coordsOf(f).length > 1 && (showAll || String(f.properties.TYPE) === "line")).map(f => {
      const p = Object.assign({}, f.properties); delete p.STOPS; p._sel = selId ? (p.ID === selId ? 1 : 0) : -1;
      return { type: "Feature", properties: p, geometry: f.geometry };
    }) };
  }
  function redrawLines() { const s = ED.map && ED.map.getSource && ED.map.getSource("ed-routes"); if (s) s.setData(lineData()); drawVertices(); }
  ED.onChange(n => { if (n === "routes.geojson" || n === "all") redrawLines(); });

  // The dots along the selected line: drag one to move that bend
  function drawVertices() {
    vertexMarkers.forEach(m => m.remove()); vertexMarkers = [];
    const f = selId && byId(selId);
    if (!f || !ED.map || !window.maplibregl || ED.current() !== "tours") return;
    coordsOf(f).forEach((c, i) => {
      const el = document.createElement("div"); el.className = "ed-vertex"; el.title = "Drag to move this point";
      const m = new maplibregl.Marker({ element: el, draggable: true }).setLngLat(c).addTo(ED.map);
      m.on("dragend", () => { const p = m.getLngLat(); edit(f, (pr, ft) => { ft.geometry.coordinates[i] = [+p.lng.toFixed(6), +p.lat.toFixed(6)]; }, "moved a point"); });
      vertexMarkers.push(m);
    });
  }

  /* ---------- the list ---------- */
  function render(side) {
    ui.head(side, "Tours and Trails", "Tours have stops in order. Trails are routes to join anywhere. Lines are just drawn on the map, like an old rail line.");
    ui.buttons(side, [{ text: "+ New Tour", primary: true, onClick: () => create("tour") }, { text: "+ Trail", onClick: () => create("trail") }, { text: "+ Line", onClick: () => create("line") }]);
    ui.list(side, routes().map(f => {
      const p = f.properties, n = (p.STOPS || []).length;
      return { id: p.ID, title: p.TITLE || p.ID, sub: [typeName(p.TYPE), n ? n + " stops" : "", coordsOf(f).length > 1 ? miles(f) + " mi" : "No line yet", String(p.AVAILABILITY).toLowerCase() === "event" ? "During a happening" : ""].filter(Boolean).join(" · "), color: p.COLOR || "#0B7A75", on: p.ID === selId };
    }), { empty: "No tours yet. Press New Tour.", onPick: id => select(id, true) });
    redrawLines();
  }
  function create(type) {
    const id = ED.newId(type === "tour" ? "TOUR" : type === "trail" ? "TRAIL" : "LINE");
    const f = { type: "Feature", properties: { ID: id, TYPE: type, TITLE: type === "tour" ? "New Tour" : type === "trail" ? "New Trail" : "New Line", MODES: type === "line" ? "" : "walk", STYLE: type === "trail" ? "rail" : type === "line" ? "dashed" : "solid", COLOR: type === "trail" ? "#8B6F47" : type === "line" ? "#555555" : "#0B7A75", WIDTH: type === "trail" ? 12 : type === "line" ? 3 : 6, OPACITY: type === "trail" ? 0.4 : 0.9, STOPS: [] }, geometry: { type: "LineString", coordinates: [] } };
    ED.change("routes.geojson", F => F.data.features.push(f), "new " + type);
    select(id);
    draw(byId(id));
  }
  function select(id, fly) {
    selId = id; ED.selected = null;
    const f = byId(id); if (!f) return;
    if (fly && ED.map) { const c = coordsOf(f).concat((f.properties.STOPS || []).map(s => ED.data.byId.get(s.ITEM)).filter(i => i && isFinite(parseFloat(i.LAT))).map(i => [parseFloat(i.LONG), parseFloat(i.LAT)])); if (c.length > 1) ED.map.fitBounds(ED.bounds(c), { padding: 80, maxZoom: 17, duration: 500 }); }
    ED.inspect(box => inspector(box));
    ED.rerender();
  }

  /* ---------- one route ---------- */
  function inspector(box) {
    const f = byId(selId); if (!f) { ED.closeInspector(); return; }
    const p = f.properties, type = String(p.TYPE || "tour");
    const top = h("div", "ed-insp-top", '<span class="ed-kind">' + typeName(type) + '</span><button type="button" class="ed-x" aria-label="Close">✕</button>');
    top.querySelector(".ed-x").addEventListener("click", () => { selId = null; ED.closeInspector(); ED.rerender(); redrawLines(); }); box.appendChild(top);
    const set = (k, v, label) => edit(f, pr => { if (v === "" || v == null) delete pr[k]; else pr[k] = v; }, label);
    ui.text(box, "Title", p.TITLE, v => { set("TITLE", v); ED.rerender(); });
    ui.select(box, "Type", type, TYPES, v => { set("TYPE", v); ED.rerenderInspector(); ED.rerender(); });

    const ln = ui.section(box, "The Line");
    const n = coordsOf(f).length;
    ui.note(ln, n > 1 ? n + " points, about " + miles(f) + " mi. Drag a dot on the map to move it." : "No line drawn yet.");
    ui.buttons(ln, [{ text: n ? "Keep Drawing" : "Draw the Route", primary: !n, onClick: () => draw(f) }, n ? { text: "Clear the Line", danger: true, onClick: () => ED.confirm("Clear the line?", "Every point of this line is removed. Undo brings it back.", "Clear", () => edit(f, (pr, ft) => { ft.geometry.coordinates = []; }, "cleared line")) } : null, n > 1 ? { text: "Reverse Direction", onClick: () => edit(f, (pr, ft) => { ft.geometry.coordinates.reverse(); }, "reversed") } : null]);
    ui.select(ln, "Line Style", p.STYLE || "solid", [["solid", "Solid"], ["dashed", "Dashed"], ["rail", "Rail (two lines with a band)"]], v => set("STYLE", v, "style"));
    ui.color(ln, "Color", p.COLOR, v => set("COLOR", v, "color"));
    const g = h("div", "ed-grid2"); ln.appendChild(g);
    ui.number(g, "Width (Pixels)", p.WIDTH, v => set("WIDTH", v === "" ? "" : Math.max(1, Math.min(30, +v)), "width"), "", { min: 1, max: 30 });
    ui.number(g, "See-Through (0 to 1)", p.OPACITY, v => set("OPACITY", v === "" ? "" : Math.max(0, Math.min(1, +v)), "opacity"), "1 = solid", { step: 0.05, min: 0, max: 1 });
    if (type === "line") return endButtons(box, f);

    if (type === "tour" || type === "trail") stopsSection(box, f);
    const ab = ui.section(box, "About It");
    ui.text(ab, "Introduction", p.INTRO, v => set("INTRO", v, "intro"), "Shown on the tour's first card.", { multi: true, rows: 4 });
    ui.text(ab, "Summary", p.SUMMARY, v => set("SUMMARY", v, "summary"), "One line for the tour list.");
    const modes = String(p.MODES || "").split(/[|;,]/).map(s => s.trim()).filter(Boolean);
    const mw = h("div", "ed-filters"); mw.innerHTML = MODES.map(([k, t]) => '<button type="button" data-m="' + k + '" aria-pressed="' + modes.includes(k) + '">' + t + "</button>").join("");
    mw.querySelectorAll("button").forEach(b => b.addEventListener("click", () => { const m = new Set(modes); m.has(b.dataset.m) ? m.delete(b.dataset.m) : m.add(b.dataset.m); set("MODES", [...m].join("|"), "travel modes"); ED.rerenderInspector(); }));
    ui.field(ab, "How People Get Around", mw, "The first one picks the time estimate: walking 3 mph, hiking 2, biking 10, driving 30.");
    const g2 = h("div", "ed-grid2"); ab.appendChild(g2);
    const m0 = modes.find(m => PACE[m]);
    const est = m0 && miles(f) ? Math.round(miles(f) * PACE[m0] + (type === "trail" ? 0 : (p.STOPS || []).length * 5)) : "";
    ui.number(g2, "Minutes", p.MINUTES, v => set("MINUTES", v, "minutes"), est ? "Blank = about " + est + " min, worked out for you." : "Blank = worked out for you.");
    ui.number(g2, "Length in Miles", p.LENGTH_MI, v => set("LENGTH_MI", v, "length"), "Blank = measured from the line.", { step: 0.1 });
    ui.select(ab, "Effort", p.EFFORT, [["", "Not Said"], ["Easy", "Easy"], ["Moderate", "Moderate"], ["Hard", "Hard"]], v => set("EFFORT", v, "effort"));
    const icons = (ED.data.icons && ED.data.icons.icons) || {};
    ui.select(ab, "Vehicle Between Stops", p.VEHICLE, [["", "Picked From How People Get Around"]].concat(["walk", "bike", "car", "train", "trainmodern", "boat"].filter(k => icons[k]).map(k => [k, icons[k].label || k]), Object.keys(icons).filter(k => !["walk", "bike", "car", "train", "trainmodern", "boat"].includes(k)).map(k => [k, icons[k].label || k])), v => set("VEHICLE", v, "vehicle"), "The little picture that rides the route when a visitor presses Next Stop. Each stop can have its own.");
    const sh = ui.section(box, "When and How It Shows", { open: false });
    const haps = ED.data.happenings.filter(r => r.TOUR_ID === p.ID);
    ui.select(sh, "Available", String(p.AVAILABILITY || "").toLowerCase() === "event" ? "event" : "", [["", "Always"], ["event", "Only While a Happening Features It"]], v => { set("AVAILABILITY", v, "availability"); ED.rerenderInspector(); },
      String(p.AVAILABILITY).toLowerCase() === "event" ? (haps.length ? "Featured by " + haps.map(r => r.NAME).join(", ") + "." : "No happening features it yet. Pick this tour in a happening's Featured Tour.") : "");
    if (type === "trail") ui.toggle(sh, "Keep It on the Map", ED.yes(p.SHOW_ALWAYS), on => set("SHOW_ALWAYS", on ? "yes" : "", "show always"), "Off: the line only shows while someone has the trail open.");
    ui.select(sh, "Slow Spin Around It", p.SPIN || "", [["", "Site Default"], ["yes", "Yes"], ["no", "No"]], v => set("SPIN", v, "spin"), "Turns slowly while touring, until the visitor touches the map. Never with Reduce Motion.");
    endButtons(box, f);
  }
  function endButtons(box, f) {
    const p = f.properties;
    const sec = ui.section(box, "Try It, Copy or Remove", { open: false });
    const open = extra => { const u = new URL("index.html", location.href); u.searchParams.set("draft", "1"); u.searchParams.set("intro", "0"); u.searchParams.set("tour", p.ID); if (ED.SAMPLE) u.searchParams.set("sample", ED.SAMPLE); if (ED.EVENT) u.searchParams.set("event", ED.EVENT); if (extra) u.searchParams.set(extra, "1"); window.open(u.toString(), "ets-preview"); };
    ui.buttons(sec, [p.TYPE !== "line" ? { text: "Preview", onClick: () => open() } : null, p.TYPE !== "line" ? { text: "Try a Pretend Walk", onClick: () => open("pretend"), title: "Opens the map with a dot you can drag along the tour" } : null,
      { text: "Duplicate", onClick: () => { const id = ED.newId(String(p.TYPE || "tour").toUpperCase()); ED.change("routes.geojson", F => { const c = JSON.parse(JSON.stringify(f)); c.properties.ID = id; c.properties.TITLE = (p.TITLE || "") + " (Copy)"; F.data.features.push(c); }, "duplicated"); select(id); } },
      { text: "Delete…", danger: true, onClick: () => ED.confirm("Delete " + (p.TITLE || p.ID) + "?", ED.data.happenings.some(r => r.TOUR_ID === p.ID) ? "A happening features it; that link will be cleared." : "It comes off the map.", "Delete", () => {
        ED.change("routes.geojson", F => { F.data.features = F.data.features.filter(x => x !== f); }, "deleted tour");
        if (ED.data.happenings.some(r => r.TOUR_ID === p.ID)) ED.change("happenings.csv", F => F.rows.forEach(r => { if (r.TOUR_ID === p.ID) r.TOUR_ID = ""; }), "tour link");
        selId = null; ED.closeInspector(); ED.rerender();
      }) }]);
    ui.note(sec, "ID: " + p.ID + ". Share links use this.");
  }

  /* ---------- stops ---------- */
  function stopsSection(box, f) {
    const p = f.properties, stops = p.STOPS || (p.STOPS = []);
    const sec = ui.section(box, "Stops (" + stops.length + ")");
    if (p.TYPE === "trail") ui.note(sec, "Stops are optional on a trail.");
    const list = h("div", "ed-stops");
    list.innerHTML = stops.map((s, i) => { const it = ED.data.byId.get(s.ITEM); return '<div class="ed-stop' + (it ? "" : " bad") + '"><span class="ed-ord">' + (i + 1) + '</span><div class="mi"><b>' + esc(it ? it.NAME || it.ID : s.ITEM + " (missing)") + '</b><input data-note="' + i + '" placeholder="A note for this stop (optional)" value="' + esc(s.NOTE || "") + '"></div>' +
      (i ? '<button type="button" class="ed-btn ed-small" data-up="' + i + '" aria-label="Move up">↑</button>' : "") + (i < stops.length - 1 ? '<button type="button" class="ed-btn ed-small" data-down="' + i + '" aria-label="Move down">↓</button>' : "") + '<button type="button" class="ed-x" data-x="' + i + '" aria-label="Remove stop">✕</button></div>'; }).join("") || '<div class="ed-empty">No stops yet.</div>';
    list.querySelectorAll("[data-note]").forEach(inp => inp.addEventListener("change", () => edit(f, pr => { pr.STOPS[+inp.dataset.note].NOTE = inp.value; }, "stop note")));
    const move = (i, d) => edit(f, pr => { const a = pr.STOPS; [a[i], a[i + d]] = [a[i + d], a[i]]; }, "reordered stops");
    list.querySelectorAll("[data-up]").forEach(b => b.addEventListener("click", () => { move(+b.dataset.up, -1); ED.rerenderInspector(); }));
    list.querySelectorAll("[data-down]").forEach(b => b.addEventListener("click", () => { move(+b.dataset.down, 1); ED.rerenderInspector(); }));
    list.querySelectorAll("[data-x]").forEach(b => b.addEventListener("click", () => { edit(f, pr => { pr.STOPS.splice(+b.dataset.x, 1); }, "removed stop"); ED.rerenderInspector(); }));
    sec.appendChild(list);
    ui.buttons(sec, [{ text: "Add Stops", primary: true, onClick: () => addStops(f) }]);
    const orphans = ED.data.items.filter(i => i.KIND === "story" && !isFinite(parseFloat(i.LAT)));
    if (orphans.length) ui.picker(sec, "Add a Tour-Only Story", "", orphans.map(i => [i.ID, i.NAME || i.ID, "No location"]), v => { if (!v) return; edit(f, pr => { pr.STOPS.push({ ITEM: v }); }, "added stop"); ED.rerenderInspector(); }, "Stories with no location only appear inside tours.");
  }
  function addStops(f) {
    const p = f.properties;
    const picked = () => new Set((p.STOPS || []).map(s => s.ITEM));
    ED.setMode({
      title: "Tap markers to add them as stops, in order.", text: "Tap a stop again to take it out.", picked: picked(),
      onMarkerClick: it => {
        const has = (p.STOPS || []).findIndex(s => s.ITEM === it.ID);
        edit(f, pr => { pr.STOPS = pr.STOPS || []; if (has >= 0) pr.STOPS.splice(has, 1); else pr.STOPS.push({ ITEM: it.ID }); }, has >= 0 ? "removed stop" : "added stop");
        ED.mode().picked = picked(); ED.refreshMarkers(); ED.rerenderInspector();
      },
      onDone: () => ED.rerenderInspector()
    });
  }

  /* ---------- drawing the line ---------- */
  function draw(f) {
    const count = () => coordsOf(f).length;
    ED.setMode({
      title: "Tap the map to draw the route, point by point.", text: "Follow the streets or paths. Drag a dot later to adjust it.",
      extra: '<button type="button" class="ed-btn" data-undo="1">Undo Point</button>',
      wire: box => box.querySelector("[data-undo]").addEventListener("click", () => { if (count()) edit(f, (pr, ft) => { ft.geometry.coordinates.pop(); }, "removed point"); }),
      onMapClick: ll => edit(f, (pr, ft) => { if (!ft.geometry || ft.geometry.type !== "LineString") ft.geometry = { type: "LineString", coordinates: coordsOf(ft) }; ft.geometry.coordinates.push([+ll[0].toFixed(6), +ll[1].toFixed(6)]); }, "drew a point"),
      onMarkerClick: it => { const ll = [parseFloat(it.LONG), parseFloat(it.LAT)]; edit(f, (pr, ft) => { ft.geometry.coordinates.push(ll); }, "drew a point"); },
      onDone: () => { ED.rerenderInspector(); ED.rerender(); }
    });
  }

  ED.panel("tours", { title: "Tours", render, onShow: () => { selId = null; redrawLines(); }, onClose: () => { selId = null; redrawLines(); ED.rerender(); } });
  // leaving the panel hides the dots
  const show0 = ED.show; ED.show = id => { show0(id); if (id !== "tours") { selId = null; drawVertices(); } redrawLines(); };
})();
