/* ETS Community Map: ed-setup.js. The tutorial: a guided walk-through that sets up a new map step by step
   (name, area, outline, visitor area, theme color, first place, its category and look), then explains everything
   else the editor can make, with Show Me buttons that point at the right button. It opens by itself whenever the map
   is completely empty, and the Help button reopens it (or any part of it) at any time. */
(function () {
  "use strict";
  const ED = window.ETSEditor, { esc } = ED;
  const COLORS = ["#0B7A75", "#1D4ED8", "#7C3AED", "#BE185D", "#C2410C", "#B45309", "#15803D", "#334155"];
  const S = k => ED.site(k);
  const store = { get: (k, d) => { try { const v = localStorage.getItem(ED.key(k)); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: (k, v) => { try { if (v == null) localStorage.removeItem(ED.key(k)); else localStorage.setItem(ED.key(k), JSON.stringify(v)); } catch (e) { /* fine */ } } };

  /* ---------- the visitor's marker, drawn here so every choice can be previewed ---------- */
  const SHAPES = {
    circle: "", square: "inset(3% round 18%)",
    diamond: "50 0;100 50;50 100;0 50", triangle: "50 3;100 92;0 92", shield: "50 0;100 10;100 60;50 100;0 60;0 10",
    flag1: "0 0;100 0;75 50;100 100;0 100", cross: "35 0;65 0;65 35;100 35;100 65;65 65;65 100;35 100;35 65;0 65;0 35;35 35",
    speechbubble: "10 10;90 10;100 20;100 60;90 70;60 70;50 100;40 70;10 70;0 60;0 20",
    starburst: "50 0;60 25;90 10;75 40;100 50;75 60;90 90;60 75;50 100;40 75;10 90;25 60;0 50;25 40;10 10;40 25",
    pentagon: "50 0;98 35;79 90;21 90;2 35", hexagon: "50 0;93 25;93 75;50 100;7 75;7 25",
    octagon: "29 0;71 0;100 29;100 71;71 100;29 100;0 71;0 29", star: "50 0;63 38;100 38;69 62;81 100;50 77;19 100;31 62;0 38;37 38",
    trapezoid: "20 0;80 0;100 100;0 100"
  };
  const SHAPE_NAMES = { flag1: "Flag", speechbubble: "Speech Bubble" };
  const shapeName = s => SHAPE_NAMES[s] || (ED.data.icons.shapes && ED.data.icons.shapes[s] && ED.data.icons.shapes[s].label) || s.charAt(0).toUpperCase() + s.slice(1);
  const PATTERNS = ["solid", "stripes", "lines", "diagonal", "checks", "dots", "grid", "waves", "zigzag", "crosses"];
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  function clip(code) {
    code = String(code || "circle").toLowerCase();
    if (code === "circle") return "circle(50%)";
    if (code === "square") return SHAPES.square;
    const pts = SHAPES[code] || (ED.data.icons.shapes && ED.data.icons.shapes[code] && ED.data.icons.shapes[code].points);
    return pts ? "polygon(" + String(pts).split(";").map(p => p.trim().split(/\s+/).map(n => n + "%").join(" ")).join(",") + ")" : "circle(50%)";
  }
  const hex = c => /^#[0-9a-f]{6}$/i.test(String(c || "")) ? c : "#0B7A75";
  const mixWhite = (c, k) => { c = hex(c); const n = [1, 3, 5].map(i => parseInt(c.substr(i, 2), 16)); return "#" + n.map(x => Math.round(x + (255 - x) * k).toString(16).padStart(2, "0")).join(""); };
  function patternUrl(p, c1, c2) {
    const t = 25, h = t / 2;
    const body = {
      stripes: '<rect width="' + h + '" height="' + t + '" fill="' + c2 + '"/>', diagonal: '<rect width="' + h + '" height="' + t + '" fill="' + c2 + '"/>',
      lines: '<rect width="' + t + '" height="' + h + '" fill="' + c2 + '"/>',
      checks: '<rect width="' + h + '" height="' + h + '" fill="' + c2 + '"/><rect x="' + h + '" y="' + h + '" width="' + h + '" height="' + h + '" fill="' + c2 + '"/>',
      dots: '<circle cx="' + h + '" cy="' + h + '" r="' + (t * 0.22) + '" fill="' + c2 + '"/>',
      grid: '<rect width="' + t + '" height="3" fill="' + c2 + '"/><rect width="3" height="' + t + '" fill="' + c2 + '"/>',
      waves: '<path d="M0 ' + h + " Q" + (t / 4) + " " + (t * 0.1) + " " + h + " " + h + " T" + t + " " + h + '" fill="none" stroke="' + c2 + '" stroke-width="3"/>',
      zigzag: '<path d="M0 ' + (t * 0.7) + " L" + (t / 4) + " " + (t * 0.3) + " L" + h + " " + (t * 0.7) + " L" + (t * 0.75) + " " + (t * 0.3) + " L" + t + " " + (t * 0.7) + '" fill="none" stroke="' + c2 + '" stroke-width="3"/>',
      crosses: '<rect x="' + (h - 1.5) + '" y="' + (h - 6) + '" width="3" height="12" fill="' + c2 + '"/><rect x="' + (h - 6) + '" y="' + (h - 1.5) + '" width="12" height="3" fill="' + c2 + '"/>'
    }[p];
    const def = body ? '<defs><pattern id="p" width="' + t + '" height="' + t + '" patternUnits="userSpaceOnUse"' + (p === "diagonal" ? ' patternTransform="rotate(45)"' : "") + ">" + body + "</pattern></defs>" : "";
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">' + def + '<rect width="100" height="100" fill="' + c1 + '"/>' + (body ? '<rect width="100" height="100" fill="url(#p)"/>' : "") + "</svg>");
  }
  // a marker as visitors see it: { color, shape, icon, fill, fill1, fill2 }, size in px
  function markerHtml(o, size) {
    size = size || 56;
    const color = hex(o.color), fill = PATTERNS.includes(o.fill) ? o.fill : "";
    let inner = "";
    if (fill) inner = '<span class="tm-fill" style="background-image:url(&quot;' + patternUrl(fill, hex(o.fill1 || mixWhite(color, 0.78)), hex(o.fill2 || color)) + '&quot;)"></span>';
    else if (o.icon && ED.iconUrl(o.icon)) inner = '<img src="' + ED.iconUrl(o.icon, 64) + '" alt="">';
    return '<span class="tut-mk" style="--c:' + color + ";width:" + size + "px;height:" + size + "px;clip-path:" + clip(o.shape) + '">' + inner + "</span>";
  }
  ED.markerPreview = markerHtml;

  /* ---------- tutorial state ---------- */
  let at = 0, open_ = false, picked = null, area = null, placeId = null, catCode = null, saved = null, lookTab = null;
  const cat = () => catCode && ED.data.cats.get(catCode);
  const place = () => placeId && ED.data.byId.get(placeId);
  const short = f => f.properties.display_name.split(",").slice(0, 3).join(",");
  const editMap = (fn, label) => ED.change("map.json", f => { f.data = f.data || {}; fn(f.data); }, label);
  const outlineFeature = () => { const o = ED.data.map && ED.data.map.outline; return o ? (o.type === "FeatureCollection" ? o.features[0] : o) : null; };
  const putSite = (pairs, label) => ED.change("site.csv", f => { Object.entries(pairs).forEach(([k, v]) => { const r = f.rows.find(x => x.KEY === k); if (r) r.VALUE = v; else f.rows.push({ KEY: k, VALUE: v }); }); }, label);
  const boundsNow = () => { const b = ["BOUNDS_WEST", "BOUNDS_SOUTH", "BOUNDS_EAST", "BOUNDS_NORTH"].map(k => parseFloat(S(k))); return b.every(isFinite) ? [[b[0], b[1]], [b[2], b[3]]] : null; };

  /* ---------- the red box on the map while the tutorial is open ---------- */
  ED.onStyle(map => {
    if (map.getSource("tut-bounds")) return;
    map.addSource("tut-bounds", { type: "geojson", data: boxData() });
    map.addLayer({ id: "tut-bounds", type: "line", source: "tut-bounds", paint: { "line-color": "#B91C1C", "line-width": 2.5, "line-opacity": 0.8, "line-dasharray": [2, 1] } });
  });
  function boxData() {
    const b = boundsNow();
    if (!open_ || !b || STEPS[at].box !== true) return { type: "FeatureCollection", features: [] };
    return { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[b[0][0], b[0][1]], [b[1][0], b[0][1]], [b[1][0], b[1][1]], [b[0][0], b[1][1]], [b[0][0], b[0][1]]] } };
  }
  const showBox = () => { const s = ED.map && ED.map.getSource && ED.map.getSource("tut-bounds"); if (s) s.setData(boxData()); };
  ED.onChange(() => { if (open_) showBox(); });

  /* ---------- moving the map ---------- */
  function fit(b, animate) {
    if (!b || !ED.map) return;
    const mapEl = document.getElementById("edMap"), md = document.querySelector(".ed-modal");
    const mr = mapEl.getBoundingClientRect(), pad = { top: 40, bottom: 40, left: 40, right: 40 };
    if (md) {
      const r = md.getBoundingClientRect();
      if (mr.width > 700) pad.right = Math.min(mr.width - 160, Math.max(40, mr.right - r.left + 24));
      else pad.bottom = Math.min(mr.height - 120, Math.max(40, mr.bottom - r.top + 24));
    }
    try { ED.map.fitBounds(b, { padding: pad, duration: animate && !matchMedia("(prefers-reduced-motion: reduce)").matches ? 900 : 0 }); } catch (e) { /* not ready */ }
  }
  const fitBox = animate => { const b = boundsNow(); fit(b && area ? [[Math.min(b[0][0], area[0][0]), Math.min(b[0][1], area[0][1])], [Math.max(b[1][0], area[1][0]), Math.max(b[1][1], area[1][1])]] : b || area, animate); };

  /* ---------- the area: outline, start view, visitor area ---------- */
  const SIZES = { snug: 0.1, roomy: 0.25, wide: 0.6 };
  function setArea(size) {
    if (!area) return;
    const k = SIZES[size], dx = (area[1][0] - area[0][0]) * k, dy = (area[1][1] - area[0][1]) * k;
    putSite({ BOUNDS_WEST: (area[0][0] - dx).toFixed(5), BOUNDS_SOUTH: (area[0][1] - dy).toFixed(5), BOUNDS_EAST: (area[1][0] + dx).toFixed(5), BOUNDS_NORTH: (area[1][1] + dy).toFixed(5), TUT_AREA: size }, "visitor area");
  }
  function useArea(f) {
    if (ED.useOutline) ED.useOutline(f, true);
    const rings = f.geometry.type === "Polygon" ? f.geometry.coordinates : f.geometry.coordinates.flat(1), pts = rings.flat(1);
    if (!pts.length) return;
    area = ED.bounds(pts); saved = null;
    let z = null; try { const cam = ED.map && ED.map.cameraForBounds && ED.map.cameraForBounds(area, { padding: 30 }); if (cam && isFinite(cam.zoom)) z = cam.zoom; } catch (e) { /* fine */ }
    const pairs = { CENTER_LAT: ((area[0][1] + area[1][1]) / 2).toFixed(6), CENTER_LNG: ((area[0][0] + area[1][0]) / 2).toFixed(6), TUT_AREA_BOUNDS: area.flat().map(n => n.toFixed(5)).join(",") };
    if (z != null) pairs.ZOOM = Math.max(3, z).toFixed(1);
    putSite(pairs, "start view");
    setArea("roomy");
  }
  function restoreArea() {       // after a reload, the picked area is remembered in site.csv
    if (area) return;
    const a = String(S("TUT_AREA_BOUNDS") || "").split(",").map(Number);
    if (a.length === 4 && a.every(isFinite)) area = [[a[0], a[1]], [a[2], a[3]]];
  }
  function styleOutline(k, v) { editMap(d => { const f = d.outline.type === "FeatureCollection" ? d.outline.features[0] : d.outline; f.properties = f.properties || {}; f.properties[k] = v; }, "outline style"); }

  /* ---------- small building blocks for the steps ---------- */
  const swatches = (cur, attr) => '<div class="su-colors">' + COLORS.map(c => '<button type="button" ' + attr + '="' + c + '" style="background:' + c + '" aria-label="' + c + '"' + (String(cur || "").toUpperCase() === c ? ' aria-pressed="true"' : "") + "></button>").join("") +
    '<label class="su-own">Your Own <input type="color" ' + attr + '-own value="' + hex(cur) + '"></label></div>';
  const seg = (attr, cur, opts) => '<div class="ed-seg tut-seg">' + opts.map(([v, t]) => '<button type="button" ' + attr + '="' + v + '"' + (String(cur) === v ? ' aria-pressed="true"' : "") + ">" + esc(t) + "</button>").join("") + "</div>";
  const tip = t => '<p class="tut-tip-line">' + t + "</p>";
  const wireColors = (m, attr, fn) => {
    m.querySelectorAll("[" + attr + "]").forEach(b => b.addEventListener("click", () => fn(b.getAttribute(attr))));
    const own = m.querySelector("[" + attr + "-own]"); if (own) own.addEventListener("change", e => fn(e.target.value.toUpperCase()));
  };
  const lookOf = () => { const c = cat() || {}; return { color: c.COLOR || S("BAR_COLOR"), shape: c.SHAPE || "circle", icon: c.ICON, fill: c.FILL, fill1: c.FILL_COLOR, fill2: c.FILL_COLOR2 }; };
  const preview = () => '<div class="tut-preview"><div class="tut-prev-map">' + markerHtml(lookOf(), 60) + '</div><small>What visitors see' + (cat() ? " for every place in <b>" + esc(cat().LABEL) + "</b>" : "") + "</small></div>";
  const setCat = (k, v, label) => { const c = cat(); if (!c) return; ED.change("categories.csv", () => { c[k] = v; }, label || "category look"); };

  /* ---------- the topics: what each thing is, and where its button is (also the Help list) ---------- */
  const T = {
    place: { title: "Place", text: "A spot on the map: a building, a grave, a business, a marker. It has a name, words, photos, audio and links.", panel: "items", btn: /^\+ Add a Place/ },
    group: { title: "Group", text: "One marker that holds other places, like Downtown, a cemetery or a campus. Visitors see one marker until they tap it, then the places inside spread out. In the place's panel, press Make This a Group, then tap places or Draw a Box around them.", panel: "items", group: true },
    story: { title: "Story", text: "A piece of history with or without a single spot: a flood, a fire, a family. Stories can be told in order as a series, and can be tour stops.", panel: "items", btn: /^\+ Story/ },
    photospot: { title: "Photo Spot", text: "A place to stand and take a picture, or a then-and-now view. It gets a camera marker.", panel: "items", btn: /^\+ Photo Spot/ },
    tour: { title: "Tour", text: "A walk or drive with stops in order. Visitors press Start and go stop to stop, with directions, audio and You've Arrived alerts. Draw the line, then add stops.", panel: "tours", btn: /^\+ New Tour/ },
    trail: { title: "Trail", text: "A path visitors can follow on their own, like a nature trail or a heritage loop. It can show all the time, with no stops needed.", panel: "tours", btn: /^\+ Trail/ },
    line: { title: "Line", text: "A plain line: an old railroad, a road that's gone, a boundary. It just shows on the map.", panel: "tours", btn: /^\+ Line/ },
    happening: { title: "Happening", text: "An event with dates and times: a festival, a walk, open hours. It shows a Now or Soon chip, a calendar, and can light up its places. It can even get its own map.", panel: "happenings", btn: /^\+ New Happening/ },
    oldmap: { title: "Old Map", text: "A scanned old map or plat laid over today's map, pinned by its four corners. Visitors slide between then and now.", panel: "map", sec: /^Old Maps/ },
    interior: { title: "Interior", text: "A floor plan inside a building, with rooms you can tap. Made from a place's panel under Inside This Place, and drawn in Tools → Building Designer.", panel: "items", interior: true },
    category: { title: "Categories", text: "Kinds of places, shown as filter chips and in the legend. A category holds the look: color, shape, icon or pattern. Every place in it matches.", panel: "items", sec: /^Categories/ },
    icons: { title: "Your Own Icons", text: "Draw icons with circles, rounded rectangles, lines and more, or bring in an SVG file. Open Tools, then the Icons tab.", tools: true },
    shapes: { title: "Your Own Marker Shapes", text: "Tap the corners of any outline to make a new marker shape. Open Tools, then the Marker Shapes tab.", tools: true },
    passport: { title: "Passport", text: "A game for visitors: stamps for finding places, stars for tasks, ranks and prizes. Set it up or switch it off in the Passport panel.", panel: "passport", tab: true },
    look: { title: "Look and Buttons", text: "Name, colors, fonts, welcome screen, which buttons show and where, and every word on the map.", panel: "look", tab: true },
    area: { title: "Visitor Area", text: "The box visitors can't scroll out of. Near Me (their own dot, distances and arrival alerts) only works inside it.", panel: "map", sec: /^Allowed Area/ },
    outline: { title: "Area Outline", text: "The line around your town or county. Change its style, color and width, or find a different place.", panel: "map", sec: /^Area Outline/ },
    preview: { title: "Preview", text: "Opens the map the way visitors will see it, with your unpublished changes.", el: "edPreview" },
    undo: { title: "Undo", text: "Takes back the last change. It goes back up to 60 steps.", el: "edUndo" },
    publish: { title: "Publish", text: "Nothing you do here is on the website until you press Publish. It checks the data first, then sends it to GitHub or makes a ZIP.", el: "edPublish" }
  };
  const MAKE = ["place", "group", "story", "photospot", "tour", "trail", "line", "happening", "oldmap", "interior"];

  /* ---------- Show Me: switch to the right panel and point at the button ---------- */
  function findIn(root, sel, re) { return [...(root || document).querySelectorAll(sel)].find(b => re.test(b.textContent.trim())); }
  function showMe(key) {
    const t = T[key]; let el = null;
    closeTutorial(true);
    if (t.el) el = document.getElementById(t.el);
    else if (t.tools) el = document.querySelector('a[href="tools.html"]');
    else {
      ED.show(t.panel);
      if (t.tab) el = document.querySelector('#edTabs [data-p="' + t.panel + '"]');
      if (t.btn) el = findIn(document.getElementById("edSide"), "button", t.btn);
      if (t.sec) { const s = findIn(document.getElementById("edSide"), "summary", t.sec); if (s) { s.parentElement.open = true; el = s; } }
      if (t.group || t.interior) {
        const it = ED.data.items.find(i => (i.KIND || "place") === "place" && !i.PART_OF && i.LAT);
        if (!it) { ED.toast("Add a place first. " + (t.group ? "Any place can become a group." : "Any place can have an interior."), 6000); el = findIn(document.getElementById("edSide"), "button", /^\+ Add a Place/); }
        else {
          ED.select(it);
          const insp = document.getElementById("edInsp");
          if (t.group) el = findIn(insp, "button", /^Make This a Group/);
          else { const s = findIn(insp, "summary", /^Inside This Place/); if (s) { s.parentElement.open = true; el = s; } }
        }
      }
    }
    coach(el, t.title, t.text + (t.tools ? "" : ""));
  }
  ED.showMe = showMe;
  function coach(el, title, text) {
    document.querySelectorAll(".tut-ring,.tut-bubble").forEach(x => x.remove());
    if (!el) { ED.toast(text, 7000); return; }
    el.scrollIntoView({ block: "center", behavior: "instant" });
    const r = el.getBoundingClientRect(), ring = document.createElement("div"), bub = document.createElement("div");
    ring.className = "tut-ring"; Object.assign(ring.style, { left: r.left - 6 + "px", top: r.top - 6 + "px", width: r.width + 12 + "px", height: r.height + 12 + "px" });
    bub.className = "tut-bubble"; bub.setAttribute("role", "dialog");
    bub.innerHTML = "<b>" + esc(title) + "</b><p>" + esc(text) + '</p><div class="ed-btnrow end"><button type="button" class="ed-btn ed-small" data-back>Back to the Tutorial</button><button type="button" class="ed-btn ed-small ed-primary" data-ok>Got It</button></div>';
    document.body.append(ring, bub);
    const bw = Math.min(320, innerWidth - 24), below = r.bottom + 14 + 170 < innerHeight;
    Object.assign(bub.style, { width: bw + "px", left: Math.max(12, Math.min(innerWidth - bw - 12, r.left + r.width / 2 - bw / 2)) + "px", top: (below ? r.bottom + 14 : Math.max(12, r.top - 14 - bub.offsetHeight)) + "px" });
    const done = () => { ring.remove(); bub.remove(); document.removeEventListener("pointerdown", away, true); };
    const away = e => { if (!bub.contains(e.target)) done(); };
    setTimeout(() => document.addEventListener("pointerdown", away, true), 0);
    bub.querySelector("[data-ok]").addEventListener("click", done);
    bub.querySelector("[data-back]").addEventListener("click", () => { done(); openTutorial(store.get("tut_at", 0)); });
  }

  /* ---------- the steps ---------- */
  const STEPS = [
    { part: "Your Area", title: "Let's Set Up Your Map", box: false,
      body: () => "<p>This tutorial builds your map with you, one choice at a time. Everything can be changed later, and the <b>Help</b> button at the top brings this back any time.</p>" +
        '<label class="ed-field"><span class="ed-label">What\'s It Called?</span><input class="ed-input" data-name value="' + esc(S("PLACE")) + '" placeholder="Union County, or Liberty Public Library"><small class="ed-help">A town, county or organization. It shows in the search bar and on the welcome screen.</small></label>',
      wire: m => setTimeout(() => m.querySelector("[data-name]").focus(), 30),
      next: m => { const v = m.querySelector("[data-name]").value.trim(); if (!v) { ED.toast("Type a name first."); return false; } if (v !== S("PLACE")) ED.setSite("PLACE", v, "name"); if (!S("TIME_ZONE")) ED.setSite("TIME_ZONE", Intl.DateTimeFormat().resolvedOptions().timeZone, "time zone"); } },

    { part: "Your Area", title: "Where Is It?",
      body: () => "<p>Search for your county, town or city. The map zooms to it and draws its outline.</p>" +
        '<div class="ed-pick-row"><input class="ed-input" data-q placeholder="Union County, Indiana" value="' + esc(picked ? "" : S("PLACE")) + '"><button type="button" class="ed-btn" data-find>Find</button></div><div class="ed-list su-res"></div>' +
        (picked || area ? '<p class="ed-alert good"><b>Got it' + (picked ? ": " + esc(short(picked)) : "") + ".</b> It's outlined on the map. Not the right one? Search again.</p>" : '<p class="ed-note">Can\'t find it? Skip this step and draw the outline later in the Map panel.</p>'),
      wire: (m, redraw) => {
        const go = async () => {
          const res = m.querySelector(".su-res"); res.innerHTML = '<div class="ed-empty">Looking…</div>';
          try {
            const r = await fetch("https://nominatim.openstreetmap.org/search?format=geojson&polygon_geojson=1&limit=6&q=" + encodeURIComponent(m.querySelector("[data-q]").value.trim()));
            const hits = ((await r.json()).features || []).filter(f => /Polygon/.test(f.geometry.type));
            res.innerHTML = hits.length ? "" : '<div class="ed-empty">Nothing found. Try adding the state, like "Union County, Indiana".</div>';
            hits.forEach(f => { const b = ED.h("button", "ed-row", '<span class="ed-rt"><b>' + esc(short(f)) + "</b><small>" + esc(f.properties.type || "") + "</small></span>"); b.type = "button"; b.addEventListener("click", () => { picked = f; useArea(f); redraw(); fitBox(true); }); res.appendChild(b); });
          } catch (e) { res.innerHTML = '<div class="ed-empty">The search service couldn\'t be reached. Skip this for now and draw the outline later in the Map panel.</div>'; }
        };
        m.querySelector("[data-find]").addEventListener("click", go); m.querySelector("[data-q]").addEventListener("keydown", e => { if (e.key === "Enter") go(); });
      } },

    { part: "Your Area", title: "Style the Outline", skip: () => !outlineFeature() && !saved,
      body: () => {
        const f = outlineFeature(), p = (f && f.properties) || (saved && saved.properties) || {};
        const style = f ? (p["stroke-dasharray"] || "solid") : "none", w = +p["stroke-width"] || 4;
        return "<p>This line shows visitors where your area is. Pick how it looks.</p>" +
          '<span class="ed-label">Line Style</span>' + seg("data-ls", style, [["dotted", "Dotted"], ["dashed", "Dashed"], ["solid", "Solid"], ["none", "No Line"]]) +
          (f ? '<span class="ed-label">Line Color</span>' + swatches(p.stroke, "data-lc") + '<span class="ed-label">Line Width</span>' + seg("data-lw", w <= 2 ? "2" : w >= 6 ? "6" : "4", [["2", "Thin"], ["4", "Medium"], ["6", "Thick"]]) : "") +
          tip("Change it later in the Map panel, under Area Outline. You can also drag its points to fix it.");
      },
      wire: (m, redraw) => {
        m.querySelectorAll("[data-ls]").forEach(b => b.addEventListener("click", () => {
          const v = b.dataset.ls;
          if (v === "none") { const f = outlineFeature(); if (f) { saved = JSON.parse(JSON.stringify(f)); editMap(d => { d.outline = null; }, "no outline"); } }
          else { if (!outlineFeature() && saved) { const keep = saved; editMap(d => { d.outline = { type: "FeatureCollection", features: [keep] }; }, "outline back"); } if (outlineFeature()) styleOutline("stroke-dasharray", v === "solid" ? "" : v); }
          redraw();
        }));
        wireColors(m, "data-lc", c => { styleOutline("stroke", c); redraw(); });
        m.querySelectorAll("[data-lw]").forEach(b => b.addEventListener("click", () => { styleOutline("stroke-width", +b.dataset.lw); redraw(); }));
      } },

    { part: "Your Area", title: "Where Visitors Can Go", box: true, fitTo: "box",
      body: () => {
        const b = boundsNow(), size = S("TUT_AREA") || (b ? "own" : "none");
        return "<p>The <b style=\"color:#B91C1C\">red box</b> is the visitor area. It does two things:</p>" +
          '<ul class="tut-list"><li><b>Scrolling stops at the box</b>, so visitors can\'t wander off to another state.</li><li><b>Near Me only works inside it.</b> The visitor\'s own dot, distances to places, and tour You\'ve Arrived alerts. Outside, they see "You\'re outside the map area."</li></ul>' +
          (area ? '<span class="ed-label">How Much Room Around Your Area</span>' + seg("data-sz", size, [["snug", "Snug"], ["roomy", "Roomy"], ["wide", "Wide"]]) : "") +
          '<div class="ed-btnrow"><button type="button" class="ed-btn" data-own>' + (size === "own" ? "Draw It Again" : "Draw My Own Box") + '</button><button type="button" class="ed-btn" data-screen>Use What\'s on Screen</button><button type="button" class="ed-btn" data-none' + (b ? "" : ' aria-pressed="true"') + ">No Limit</button></div>" +
          tip("Change it later in the Map panel, under Allowed Area.");
      },
      wire: (m, redraw) => {
        m.querySelectorAll("[data-sz]").forEach(b => b.addEventListener("click", () => { setArea(b.dataset.sz); redraw(); fitBox(true); }));
        m.querySelector("[data-none]").addEventListener("click", () => { putSite({ BOUNDS_WEST: "", BOUNDS_SOUTH: "", BOUNDS_EAST: "", BOUNDS_NORTH: "", TUT_AREA: "" }, "no visitor limit"); redraw(); });
        m.querySelector("[data-screen]").addEventListener("click", () => { const bb = ED.map.getBounds(); putSite({ BOUNDS_WEST: bb.getWest().toFixed(5), BOUNDS_SOUTH: bb.getSouth().toFixed(5), BOUNDS_EAST: bb.getEast().toFixed(5), BOUNDS_NORTH: bb.getNorth().toFixed(5), TUT_AREA: "own" }, "visitor area"); redraw(); });
        m.querySelector("[data-own]").addEventListener("click", () => {
          let first = null; hideCard(true);
          ED.setMode({ title: "Tap one corner of the visitor area, then the opposite corner.", doneText: "Cancel", onDone: () => hideCard(false),
            onMapClick: ll => { if (!first) { first = ll; ED.toast("Now tap the opposite corner."); return; } ED.setMode(null); hideCard(false);
              putSite({ BOUNDS_WEST: Math.min(first[0], ll[0]).toFixed(5), BOUNDS_SOUTH: Math.min(first[1], ll[1]).toFixed(5), BOUNDS_EAST: Math.max(first[0], ll[0]).toFixed(5), BOUNDS_NORTH: Math.max(first[1], ll[1]).toFixed(5), TUT_AREA: "own" }, "visitor area"); redraw(); } });
        });
      } },

    { part: "Your Area", title: "Pick a Theme Color", box: false,
      body: () => "<p>One color ties the map together. It's used for:</p>" +
        '<ul class="tut-list"><li>The <b>buttons</b>, and the <b>filter chips</b> when they\'re picked</li><li>The <b>small words above the search box</b> and the badge</li><li><b>Links and highlights</b> on place cards</li><li><b>Tour buttons</b>, the <b>passport ring</b> and the welcome screen</li><li>Lines and outlines that don\'t have their own color</li></ul>' +
        swatches(S("BAR_COLOR"), "data-c") + '<div class="tut-chips" style="--a:' + hex(S("BAR_COLOR")) + '"><span class="on">All</span><span>History</span><span class="btn">Start Tour</span></div>' +
        tip("Night Mode gets a lighter version automatically. Your categories keep their own colors.") +
        (outlineFeature() && (outlineFeature().properties || {}).stroke !== S("BAR_COLOR") ? '<div class="ed-btnrow"><button type="button" class="ed-btn" data-match>Make the Outline Match</button></div>' : ""),
      wire: (m, redraw) => {
        wireColors(m, "data-c", c => { ED.setSite("BAR_COLOR", c, "theme color"); redraw(); });
        const mt = m.querySelector("[data-match]"); if (mt) mt.addEventListener("click", () => { styleOutline("stroke", S("BAR_COLOR")); redraw(); });
      } },

    { part: "Your First Place", title: "Add Your First Place",
      body: () => {
        const p = place();
        return "<p>A <b>place</b> is anything with a spot on the map: a building, a grave, a business, a historical marker. Visitors tap it and a card slides up with its words, photos and audio.</p>" +
          (p ? '<label class="ed-field"><span class="ed-label">Its Name</span><input class="ed-input" data-pname value="' + esc(p.NAME === "New Place" ? "" : p.NAME) + '" placeholder="Old Courthouse"></label>' +
            '<label class="ed-field"><span class="ed-label">A Few Words (Optional)</span><textarea class="ed-input" rows="3" data-ptext placeholder="Built in 1890…">' + esc(p.TEXT || "") + '</textarea><small class="ed-help">Photos, audio, links and more go in its panel later.</small></label>' +
            '<div class="ed-btnrow"><button type="button" class="ed-btn" data-tap>Move It</button></div>'
            : '<div class="ed-btnrow"><button type="button" class="ed-btn ed-primary" data-tap>Tap the Map Where It Is</button></div>' + (ED.data.items.length ? '<p class="ed-note">You already have places, so you can also skip this.</p>' : ""));
      },
      wire: (m, redraw) => {
        m.querySelector("[data-tap]").addEventListener("click", () => {
          hideCard(true); if (area) fit(area, false);
          ED.setMode({ title: "Tap the map where your place is.", text: "Zoom in first if you want to be exact.", doneText: "Cancel", onDone: () => hideCard(false),
            onMapClick: ll => {
              ED.setMode(null); hideCard(false);
              const p = place();
              if (p) ED.change("items.csv", () => { p.LAT = ll[1].toFixed(6); p.LONG = ll[0].toFixed(6); }, "moved " + p.NAME);
              else {
                const id = ED.newId("PL"); placeId = id; store.set("tut_place", id);
                ED.change("items.csv", f => f.rows.push(Object.assign(Object.fromEntries(f.cols.map(c => [c, ""])), { ID: id, KIND: "place", NAME: "New Place", LAT: ll[1].toFixed(6), LONG: ll[0].toFixed(6), CATEGORY: catCode || "" })), "added the first place");
              }
              redraw(); setTimeout(() => { const n = document.querySelector(".ed-modal [data-pname]"); if (n) n.focus(); }, 40);
            } });
        });
      },
      next: m => {
        const p = place();
        if (!p) { if (ED.data.items.length) return; ED.toast("Tap the map to add a place first, or skip it."); return false; }
        const n = m.querySelector("[data-pname]").value.trim() || "New Place", t = m.querySelector("[data-ptext]").value.trim();
        if (n !== p.NAME || t !== (p.TEXT || "")) ED.change("items.csv", () => { p.NAME = n; p.TEXT = t; }, "named " + n);
      }, skippable: true },

    { part: "Your First Place", title: "Give It a Category", box: false,
      body: () => {
        const c = cat(), others = [...ED.data.cats.values()].filter(x => x !== c);
        return "<p>A <b>category</b> is a kind of place: Churches, Cemeteries, Food, Schools. Visitors see each one as a <b>filter chip</b> at the top and in the <b>legend</b>.</p>" +
          '<div class="ed-alert good"><b>The look belongs to the category.</b> Its color, shape, icon or pattern go on every place in it, so set it once and every new church looks like a church. Want one place to stand out? Each place can have its own icon, color and shape in its panel, which beats the category\'s.</div>' +
          '<label class="ed-field"><span class="ed-label">Category Name</span><input class="ed-input" data-cname value="' + esc(c ? c.LABEL : "") + '" placeholder="History"></label>' +
          '<div class="tut-sugg">' + ["History", "Churches", "Cemeteries", "Schools", "Food", "Shops", "Parks"].map(s => '<button type="button" class="ed-btn ed-small" data-sugg="' + s + '">' + s + "</button>").join("") + "</div>" +
          (others.length ? '<span class="ed-label">Or Use One You Have</span><div class="tut-sugg">' + others.map(x => '<button type="button" class="ed-btn ed-small" data-use="' + esc(x.CODE) + '"><span class="tut-dot" style="background:' + hex(x.COLOR) + '"></span>' + esc(x.LABEL) + "</button>").join("") + "</div>" : "") +
          '<span class="ed-label">Its Color</span>' + swatches(c ? c.COLOR : "", "data-cc") + (c ? preview() : "");
      },
      wire: (m, redraw) => {
        const ensure = () => {
          const label = m.querySelector("[data-cname]").value.trim(); if (!label) return null;
          let c = cat();
          if (c) { if (c.LABEL !== label) setCat("LABEL", label, "category name"); return c; }
          let code = label.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6) || "CAT";
          while (ED.data.cats.has(code)) code = code.slice(0, 5) + Math.floor(Math.random() * 9);
          ED.change("categories.csv", f => f.rows.push(Object.assign(Object.fromEntries(f.cols.map(x => [x, ""])), { CODE: code, LABEL: label, COLOR: COLORS[(f.rows.length + 1) % COLORS.length], SHAPE: "circle", ICON: "generic" })), "new category " + label);
          catCode = code; store.set("tut_cat", code); assign(); return cat();
        };
        m.querySelectorAll("[data-sugg]").forEach(b => b.addEventListener("click", () => { m.querySelector("[data-cname]").value = b.dataset.sugg; ensure(); redraw(); }));
        m.querySelectorAll("[data-use]").forEach(b => b.addEventListener("click", () => { catCode = b.dataset.use; store.set("tut_cat", catCode); assign(); redraw(); }));
        m.querySelector("[data-cname]").addEventListener("change", () => { ensure(); redraw(); });
        wireColors(m, "data-cc", col => { if (!ensure()) { ED.toast("Name the category first."); return; } setCat("COLOR", col, "category color"); redraw(); });
        m._ensure = ensure;
      },
      next: m => { const c = m._ensure(); if (!c) { ED.toast("Name a category, or pick a suggestion."); return false; } assign(); } },

    { part: "Your First Place", title: "Pick a Marker Shape", box: false, skip: () => !cat(),
      body: () => {
        const c = cat(), drawn = Object.keys((ED.data.icons && ED.data.icons.shapes) || {});
        return "<p>The <b>shape</b> is the outline of the marker. It belongs to the category too, so every <b>" + esc(c.LABEL) + "</b> place gets it.</p>" +
          '<div class="tut-shapes">' + Object.keys(SHAPES).concat(drawn).map(s => '<button type="button" data-sh="' + esc(s) + '"' + ((c.SHAPE || "circle") === s ? ' aria-pressed="true"' : "") + ' title="' + esc(shapeName(s)) + '">' + markerHtml({ color: c.COLOR, shape: s }, 34) + "<small>" + esc(shapeName(s)) + "</small></button>").join("") + "</div>" +
          tip("Want a shape that isn't here? Draw your own in <b>Tools → Marker Shapes</b> by tapping its corners.") + preview();
      },
      wire: (m, redraw) => m.querySelectorAll("[data-sh]").forEach(b => b.addEventListener("click", () => { setCat("SHAPE", b.dataset.sh, "category shape"); redraw(); })) },

    { part: "Your First Place", title: "Icon, Pattern or Plain Color", box: false, skip: () => !cat(),
      body: () => {
        const c = cat(), icons = Object.keys((ED.data.icons && ED.data.icons.icons) || {});
        const tab = lookTab || (PATTERNS.includes(c.FILL) ? (c.FILL === "solid" ? "plain" : "pattern") : "icon");
        let pane = "";
        if (tab === "icon") pane = icons.length ? '<div class="ed-iconpick">' + icons.map(k => '<button type="button" class="ed-ic' + (c.ICON === k && !c.FILL ? " on" : "") + '" data-icon="' + esc(k) + '" title="' + esc(ED.data.icons.icons[k].label || k) + '"><img src="' + ED.iconUrl(k, 36) + '" alt=""></button>').join("") + "</div>" : '<p class="ed-note">There are no icons yet. Make some in Tools → Icons.</p>';
        if (tab === "pattern") pane = '<div class="tut-shapes">' + PATTERNS.filter(p => p !== "solid").map(p => '<button type="button" data-pat="' + p + '"' + (c.FILL === p ? ' aria-pressed="true"' : "") + ">" + markerHtml({ color: c.COLOR, shape: c.SHAPE, fill: p, fill1: c.FILL_COLOR, fill2: c.FILL_COLOR2 }, 34) + "<small>" + cap(p) + "</small></button>").join("") + "</div>" +
          '<div class="ed-grid2"><label class="ed-field"><span class="ed-label">Background</span><input type="color" data-f1 value="' + hex(c.FILL_COLOR || mixWhite(c.COLOR, 0.78)) + '"></label><label class="ed-field"><span class="ed-label">Pattern</span><input type="color" data-f2 value="' + hex(c.FILL_COLOR2 || c.COLOR) + '"></label></div>';
        if (tab === "plain") pane = '<div class="ed-btnrow"><button type="button" class="ed-btn' + (c.FILL === "solid" ? " ed-primary" : "") + '" data-plain>Use the Plain Color</button></div>';
        return "<p>What goes <b>inside</b> the marker. Pick a picture icon, a pattern, or just the color. This belongs to the category as well.</p>" +
          seg("data-tab", tab, [["icon", "Icon"], ["pattern", "Pattern"], ["plain", "Plain Color"]]) + pane +
          tip("<b>Your own icons:</b> draw them in <b>Tools → Icons</b> with circles, rounded rectangles and lines, or bring in an SVG file. <b>Photos:</b> when a place has a photo, the photo can be its marker instead (Look → Feature Switches → Photos as Markers).") + preview();
      },
      wire: (m, redraw) => {
        m.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => { lookTab = b.dataset.tab; redraw(); }));
        m.querySelectorAll("[data-icon]").forEach(b => b.addEventListener("click", () => { ED.change("categories.csv", () => { const c = cat(); c.ICON = b.dataset.icon; c.FILL = ""; }, "category icon"); redraw(); }));
        m.querySelectorAll("[data-pat]").forEach(b => b.addEventListener("click", () => { setCat("FILL", b.dataset.pat, "category pattern"); redraw(); }));
        const f1 = m.querySelector("[data-f1]"), f2 = m.querySelector("[data-f2]"), pl = m.querySelector("[data-plain]");
        if (f1) f1.addEventListener("change", e => { setCat("FILL_COLOR", e.target.value.toUpperCase(), "pattern colors"); redraw(); });
        if (f2) f2.addEventListener("change", e => { setCat("FILL_COLOR2", e.target.value.toUpperCase(), "pattern colors"); redraw(); });
        if (pl) pl.addEventListener("click", () => { ED.change("categories.csv", () => { const c = cat(); c.FILL = "solid"; c.FILL_COLOR = c.COLOR; }, "plain color"); redraw(); });
      } },

    { part: "Your First Place", title: "Groups: Places Inside Places", box: false,
      body: () => "<p>A <b>group</b> is one marker that holds other places. Good for:</p>" +
        '<ul class="tut-list"><li><b>Downtown</b>, with its shops and buildings inside</li><li>A <b>cemetery</b>, with notable graves inside</li><li>A <b>campus, park or fairground</b>, with its buildings and spots</li></ul>' +
        "<p>Visitors see one marker until they tap it. Then the places inside spread out, joined by thin lines, and the card lists them all.</p>" +
        "<p><b>To make one:</b> open a place, press <b>Make This a Group</b>, then tap the places that belong in it, or <b>Draw a Box</b> around them all at once.</p>" +
        '<div class="ed-btnrow"><button type="button" class="ed-btn" data-show="group">Show Me How</button></div>',
      wire: m => m.querySelectorAll("[data-show]").forEach(b => b.addEventListener("click", () => showMe(b.dataset.show))) },

    { part: "Everything Else", title: "What Else You Can Add", box: false, wide: true,
      body: () => "<p>Here's everything else the map can hold. Press <b>Show Me</b> and it points at the button. You can come back here with <b>Help</b>.</p>" +
        '<div class="tut-cards">' + MAKE.map(k => '<div class="tut-card"><b>' + esc(T[k].title) + "</b><p>" + esc(T[k].text) + '</p><button type="button" class="ed-btn ed-small" data-show="' + k + '">Show Me</button></div>').join("") + "</div>",
      wire: m => m.querySelectorAll("[data-show]").forEach(b => b.addEventListener("click", () => showMe(b.dataset.show))) },

    { part: "Passport and Happenings", title: "The Passport Game", box: false,
      body: () => {
        const on = ED.yes(S("PASSPORT"));
        return "<p>The <b>Passport</b> turns the map into a game, mostly for families and school groups. It's <b>off</b> unless you switch it on.</p>" +
          '<ul class="tut-list"><li><b>Stamps:</b> visitors collect a stamp for each place they find. You choose how: opening its card, scanning a QR sign there, or walking up to it with Near Me.</li>' +
          "<li><b>Achievements:</b> tasks that earn stars, like \"Visit three churches\" or \"Finish the Downtown Walk.\"</li>" +
          "<li><b>Ranks:</b> titles visitors earn as stamps and stars add up, like Explorer, then Historian.</li>" +
          "<li><b>Prizes:</b> a reward code appears when a goal is reached. Visitors show it at your desk for a sticker or a pie.</li></ul>" +
          '<label class="ed-toggle"><input type="checkbox" data-pp' + (on ? " checked" : "") + '><span class="ed-switch"></span><span class="ed-tl"><b>Passport Switched On</b><small>Off: no passport button, and visitors don\'t download any of it.</small></span></label>' +
          (on ? '<label class="ed-toggle"><input type="checkbox" data-rk' + (ED.yes(S("PASSPORT_RANKS"), true) ? " checked" : "") + '><span class="ed-switch"></span><span class="ed-tl"><b>Ranks and Stars</b></span></label>' +
            '<label class="ed-toggle"><input type="checkbox" data-pz' + (ED.yes(S("PRIZES"), true) ? " checked" : "") + '><span class="ed-switch"></span><span class="ed-tl"><b>Prizes</b></span></label>' : "") +
          '<div class="ed-btnrow"><button type="button" class="ed-btn" data-show="passport">Show Me the Passport Panel</button></div>';
      },
      wire: (m, redraw) => {
        m.querySelector("[data-pp]").addEventListener("change", e => { ED.setSite("PASSPORT", e.target.checked ? "yes" : "no", "passport"); redraw(); });
        const rk = m.querySelector("[data-rk]"), pz = m.querySelector("[data-pz]");
        if (rk) rk.addEventListener("change", e => ED.setSite("PASSPORT_RANKS", e.target.checked ? "yes" : "no", "ranks"));
        if (pz) pz.addEventListener("change", e => ED.setSite("PRIZES", e.target.checked ? "yes" : "no", "prizes"));
        m.querySelectorAll("[data-show]").forEach(b => b.addEventListener("click", () => showMe(b.dataset.show)));
      } },

    { part: "Passport and Happenings", title: "Happenings: Events With Dates", box: false,
      body: () => "<p>A <b>happening</b> is anything with a date: a festival, a ghost walk, a museum's open hours, a cemetery cleanup.</p>" +
        '<ul class="tut-list"><li>While it\'s on, a <b>Now</b> chip appears at the top. A few days before, it says <b>Soon</b>.</li><li>Its places <b>light up</b> on the map, and it can start a tour.</li><li>Visitors get a <b>calendar</b> of what\'s coming.</li><li>A big event can get <b>its own map</b>, with its own places and look, that goes away when it\'s over.</li></ul>' +
        "<p>There's nothing to switch off: with no happenings, visitors never see any of it.</p>" +
        '<div class="ed-btnrow"><button type="button" class="ed-btn" data-show="happening">Show Me How</button></div>',
      wire: m => m.querySelectorAll("[data-show]").forEach(b => b.addEventListener("click", () => showMe(b.dataset.show))) },

    { part: "Finish", title: "You're Set", box: false,
      body: () => "<p>Three buttons at the top matter most:</p>" +
        '<ul class="tut-list"><li><b>Preview</b> shows the map the way visitors will see it.</li><li><b>Undo</b> takes back the last change.</li><li><b>Publish</b> puts it on the website. <b>Until you publish, nothing you did here is live.</b> Your work is kept in this browser in the meantime.</li></ul>' +
        "<p>Stuck later? Press <b>Help</b> at the top. It has every part of this tutorial and a Show Me for every button.</p>" +
        '<div class="ed-btnrow"><button type="button" class="ed-btn" data-pv>Preview My Map</button></div>',
      wire: m => m.querySelector("[data-pv]").addEventListener("click", () => document.getElementById("edPreview").click()) }
  ];
  const PARTS = [...new Set(STEPS.map(s => s.part))];
  function assign() { const p = place(); if (p && catCode && p.CATEGORY !== catCode) ED.change("items.csv", () => { p.CATEGORY = catCode; }, "category"); }

  /* ---------- the card ---------- */
  let closeCard = null;
  function hideCard(on) { const b = document.getElementById("edModal"); if (b) b.classList.toggle("tut-hidden", !!on); }
  function draw(animateFit) {
    const s = STEPS[at], partNo = PARTS.indexOf(s.part), inPart = STEPS.filter(x => x.part === s.part), k = inPart.indexOf(s);
    const head = '<div class="tut-head"><span class="tut-part">Part ' + (partNo + 1) + " of " + PARTS.length + " · " + esc(s.part) + '</span><div class="tut-bar"><span style="width:' + Math.round((at + 1) / STEPS.length * 100) + '%"></span></div></div>';
    const foot = '<div class="ed-btnrow end tut-foot"><button type="button" class="ed-btn tut-later" data-later>' + (at === STEPS.length - 1 ? "Close" : "Not Now") + "</button><span class=\"ed-grow\"></span>" +
      (at ? '<button type="button" class="ed-btn" data-back>Back</button>' : "") + (s.skippable || at === 1 ? '<button type="button" class="ed-btn" data-skip>Skip This</button>' : "") +
      '<button type="button" class="ed-btn ed-primary" data-next>' + (at === STEPS.length - 1 ? "Finish" : "Next") + "</button></div>";
    if (closeCard) closeCard();
    if (ED.rerender) ED.rerender();           // keep the panel behind (places, categories) up to date
    closeCard = ED.modal(head + "<h2>" + esc(s.title) + "</h2>" + '<small class="tut-count">Step ' + (k + 1) + " of " + inPart.length + "</small>" + s.body() + foot, (m, close) => {
      m.classList.add("tut-card-box"); if (s.wide) m.classList.add("tut-wide");
      const redraw = () => draw(false);
      s.wire && s.wire(m, redraw);
      m.querySelector(".ed-x").addEventListener("click", () => closeTutorial(false), { once: true });
      m.querySelector("[data-later]").addEventListener("click", () => closeTutorial(at === STEPS.length - 1 ? "done" : false));
      const back = m.querySelector("[data-back]"); if (back) back.addEventListener("click", () => go(-1));
      const skip = m.querySelector("[data-skip]"); if (skip) skip.addEventListener("click", () => go(1));
      m.querySelector("[data-next]").addEventListener("click", () => {
        if (s.next && s.next(m) === false) return;
        if (at === STEPS.length - 1) { closeTutorial("done"); ED.toast("All set. Press Help at the top any time.", 5000); return; }
        go(1);
      });
    });
    const back = document.getElementById("edModal");
    back.classList.add("su-peek", "tut-on");
    showBox();
    if (s.fitTo === "box") fitBox(animateFit); else if (area) fit(area, animateFit);
  }
  function go(d) {
    let n = at + d;
    while (n > 0 && n < STEPS.length - 1 && STEPS[n].skip && STEPS[n].skip()) n += d;
    at = Math.max(0, Math.min(STEPS.length - 1, n)); store.set("tut_at", at);
    draw(true);
  }
  function openTutorial(step) {
    restoreArea();
    placeId = store.get("tut_place", null); if (placeId && !ED.data.byId.get(placeId)) placeId = null;
    catCode = store.get("tut_cat", null); if (catCode && !ED.data.cats.get(catCode)) catCode = null;
    if (!catCode && place() && place().CATEGORY && ED.data.cats.get(place().CATEGORY)) catCode = place().CATEGORY;
    if (!placeId && !ED.data.items.length) placeId = null;
    lookTab = null; open_ = true;
    ED.closeInspector && ED.closeInspector();
    at = Math.max(0, Math.min(STEPS.length - 1, step || 0));
    while (at > 0 && STEPS[at].skip && STEPS[at].skip()) at--;
    store.set("tut_at", at);
    draw(true);
  }
  function closeTutorial(how) {
    open_ = false; showBox();
    if (closeCard) { closeCard(); closeCard = null; }
    const b = document.getElementById("edModal"); b.classList.remove("su-peek", "tut-on", "tut-hidden");
    if (how === "done") { store.set("setup_done", 1); store.set("tut_at", null); store.set("tut_place", null); store.set("tut_cat", null); }
    else if (how === false) { try { sessionStorage.setItem(ED.key("tut_later"), "1"); } catch (e) { /* fine */ } }
    ED.rerender && ED.rerender();
  }
  ED.runSetup = () => openTutorial(0);
  ED.tutorial = { open: openTutorial, close: closeTutorial, steps: STEPS, parts: PARTS, at: () => at, isOpen: () => open_ };

  /* ---------- Help: the tutorial's parts, and Show Me for everything ---------- */
  function openHelp() {
    const partBtns = PARTS.map((p, i) => '<button type="button" class="ed-btn" data-part="' + i + '">' + (i + 1) + ". " + esc(p) + "</button>").join("");
    const keys = ["place", "category", "group", "story", "photospot", "tour", "trail", "line", "happening", "oldmap", "interior", "icons", "shapes", "passport", "look", "area", "outline", "preview", "undo", "publish"];
    ED.modal("<h2>Help</h2><p>Take the tutorial again, jump to one part of it, or pick a topic and press Show Me.</p>" +
      '<div class="ed-btnrow"><button type="button" class="ed-btn ed-primary" data-start>Start the Tutorial From the Beginning</button></div><div class="ed-btnrow tut-parts">' + partBtns + "</div>" +
      '<input class="ed-input" data-hq placeholder="Search the topics: tour, photo, passport…"><div class="tut-cards help">' + keys.map(k => '<div class="tut-card" data-k="' + k + '"><b>' + esc(T[k].title) + "</b><p>" + esc(T[k].text) + '</p><button type="button" class="ed-btn ed-small" data-show="' + k + '">Show Me</button></div>').join("") + "</div>" +
      '<p class="ed-note">The full guide is GUIDE.md in the site\'s files.</p>', (m, close) => {
      m.querySelector("[data-start]").addEventListener("click", () => { close(); openTutorial(0); });
      m.querySelectorAll("[data-part]").forEach(b => b.addEventListener("click", () => { close(); openTutorial(STEPS.findIndex(s => s.part === PARTS[+b.dataset.part])); }));
      m.querySelectorAll("[data-show]").forEach(b => b.addEventListener("click", () => { close(); showMe(b.dataset.show); }));
      m.querySelector("[data-hq]").addEventListener("input", e => { const q = e.target.value.trim().toLowerCase(); m.querySelectorAll(".tut-card").forEach(c => { c.hidden = !!q && !c.textContent.toLowerCase().includes(q); }); });
    }, { wide: true });
  }
  ED.openHelp = openHelp;

  /* ---------- start-up: the Help button, and the tutorial on a completely empty map ---------- */
  const wait = setInterval(() => {
    if (!ED.ready) return; clearInterval(wait);
    const hb = document.getElementById("edHelp"); if (hb) hb.addEventListener("click", openHelp);
    if (ED.SAMPLE || ED.EVENT) return;
    const D = ED.data;
    const empty = !D.items.length && !D.cats.size && !((D.routes && D.routes.features) || []).length && !D.happenings.length && !(D.map && D.map.outline);
    const midway = store.get("tut_at", null) != null && !store.get("setup_done", 0);
    let later = false; try { later = !!sessionStorage.getItem(ED.key("tut_later")); } catch (e) { /* fine */ }
    if (later) return;
    // completely empty: always offer the tutorial again (picking up where it was left, if it was started)
    if (empty) { store.set("setup_done", null); openTutorial(midway ? store.get("tut_at", 0) : 0); }
  }, 200);
})();
