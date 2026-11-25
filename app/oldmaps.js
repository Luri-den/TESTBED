/* ETS Community Map: oldmaps.js
   Old-map overlays: scanned maps laid over today's map by their four corners, with a see-through slider.
   map.json "overlays": [ { "name": "1882", "file": "overlays/1882.webp", "corners": [[lng,lat] top-left, top-right, bottom-right, bottom-left], "opacity": 0.7 } ]
   Old maps are big pictures, so each one only downloads when a visitor chooses to show it.
   Site setting: OVERLAY_SLIDER (no turns this off). */
(function () {
  "use strict";
  const C = window.ETSCore; if (!C) return;
  const { esc, L, store } = C;
  C.words({ oldMaps: "Old Maps", oldMapsShow: "Show an Old Map", oldMapsHide: "Hide the Old Map", seeThrough: "See-Through", loadingMap: "Loading the old map…", pickMap: "Which old map" });

  const okCorners = c => Array.isArray(c) && c.length === 4 && c.every(p => Array.isArray(p) && isFinite(+p[0]) && isFinite(+p[1]));
  const MAPS = (C.DATA.map.overlays || []).filter(o => o && o.hidden !== true).filter(o => {
    if (o && o.file && okCorners(o.corners)) return true;
    C.warn("An old map in map.json (" + ((o && (o.name || o.file)) || "no name") + ") is missing its picture or its four corners, so it's skipped.");
    return false;
  });
  if (!MAPS.length) return;
  const urlOf = f => /^(https?:)?\/\//i.test(f) || f.startsWith("data:") ? f : C.BASE + (f.includes("/") ? f : "overlays/" + f);

  let active = -1;                                   // which old map is showing (-1 = none)
  let opacity = store.get("oldmap_opacity", 0.7);
  let choice = Math.min(store.get("oldmap_choice", 0), MAPS.length - 1);
  let loading = false;

  const ICON = '<path d="M4 6l5-2 6 2 5-2v14l-5 2-6-2-5 2z"></path><path d="M9 4v14M15 6v14"></path>';
  C.RENDER.oldmaps = () => {
    const b = document.createElement("button"); b.type = "button"; b.className = "round round-oldmaps" + (active >= 0 ? " on" : "");
    const lab = active >= 0 ? L("oldMapsHide") : L("oldMapsShow");
    b.setAttribute("aria-label", lab); b.title = lab; b.setAttribute("aria-pressed", active >= 0 ? "true" : "false");
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICON + "</svg>";
    b.addEventListener("click", () => (active >= 0 ? hide() : show(choice)));
    return b;
  };
  C.MENU_ITEMS.oldmaps = { show: () => true, label: () => active >= 0 ? L("oldMapsHide") : L("oldMaps"), run: () => (active >= 0 ? hide() : show(choice)) };

  /* ---------- on the map ---------- */
  const layerId = n => "ets-old-" + n;
  function beforeId(map) { return ["ets-outline", "ets-routes-solid", "ets-routes-dashed", "ets-routes-band", "ets-group-lines", "ets-here-acc"].find(id => map.getLayer(id)); }
  function addLayer(map, n) {
    if (map.getSource(layerId(n))) return;
    const o = MAPS[n];
    map.addSource(layerId(n), { type: "image", url: urlOf(o.file), coordinates: o.corners.map(p => [+p[0], +p[1]]) });
    map.addLayer({ id: layerId(n), type: "raster", source: layerId(n), paint: { "raster-opacity": opacity, "raster-fade-duration": 200 } }, beforeId(map));
  }
  function removeLayer(map, n) { if (map.getLayer(layerId(n))) map.removeLayer(layerId(n)); if (map.getSource(layerId(n))) map.removeSource(layerId(n)); }
  C.onStyle(map => { if (active >= 0) addLayer(map, active); });     // the background style changed: put it back

  function show(n) {
    const map = C.map; if (!map) return;
    if (active >= 0 && active !== n) removeLayer(map, active);
    active = n; choice = n; store.set("oldmap_choice", n);
    document.body.classList.add("oldmap-on");
    try { addLayer(map, n); } catch (e) { C.warn("The old map " + MAPS[n].name + " couldn't be shown: " + e.message); }
    loading = true; bar();
    const done = e => { if (e && e.sourceId === layerId(n) && e.isSourceLoaded) { map.off("sourcedata", done); loading = false; bar(); } };
    map.on("sourcedata", done);
    setTimeout(() => { if (loading) { loading = false; bar(); } }, 15000);     // never leave "Loading" showing forever
    C.renderControls();
  }
  function hide() {
    if (active >= 0 && C.map) removeLayer(C.map, active);
    active = -1; loading = false;
    document.body.classList.remove("oldmap-on");
    bar(); C.renderControls();
  }
  function setOpacity(v) {
    opacity = Math.max(0, Math.min(1, v)); store.set("oldmap_opacity", opacity);
    if (active >= 0 && C.map && C.map.getLayer(layerId(active))) C.map.setPaintProperty(layerId(active), "raster-opacity", opacity);
  }

  /* ---------- the slider bar ---------- */
  function bar() {
    let el = document.getElementById("oldBar");
    if (active < 0) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement("div"); el.id = "oldBar"; el.className = "old-bar"; el.setAttribute("role", "group"); el.setAttribute("aria-label", L("oldMaps")); document.body.appendChild(el); }
    const o = MAPS[active];
    el.innerHTML =
      '<span class="ob-icon"><svg viewBox="0 0 24 24" aria-hidden="true">' + ICON + "</svg></span>" +
      (MAPS.length > 1
        ? '<label class="ob-pick"><span class="sr">' + esc(L("pickMap")) + '</span><select>' + MAPS.map((m, i) => '<option value="' + i + '"' + (i === active ? " selected" : "") + ">" + esc(m.name || ("Map " + (i + 1))) + "</option>").join("") + "</select></label>"
        : '<b class="ob-name">' + esc(o.name || L("oldMaps")) + "</b>") +
      '<label class="ob-slide"><span class="ob-lab">' + esc(loading ? L("loadingMap") : L("seeThrough")) + '</span><input type="range" min="0" max="100" step="1" value="' + Math.round(opacity * 100) + '" aria-label="' + esc(L("seeThrough")) + '"></label>' +
      '<button type="button" class="ob-close" aria-label="' + esc(L("oldMapsHide")) + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg></button>';
    el.classList.toggle("loading", loading);
    el.querySelector("input").addEventListener("input", e => setOpacity(e.target.value / 100));
    const sel = el.querySelector("select"); if (sel) sel.addEventListener("change", () => show(+sel.value));
    el.querySelector(".ob-close").addEventListener("click", hide);
  }

  // ?oldmap=1882 (a name) or ?oldmap=1 (a number) opens with that old map showing
  const want = C.Q.get("oldmap");
  if (want) C.onStart(() => { const n = MAPS.findIndex(m => String(m.name).toLowerCase() === want.toLowerCase()); show(n >= 0 ? n : Math.max(0, Math.min(MAPS.length - 1, (parseInt(want, 10) || 1) - 1))); });
  window.ETSOldMaps = { list: MAPS, show, hide, get active() { return active; }, setOpacity };
  C.renderControls();
})();
