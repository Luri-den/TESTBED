/* ETS Community Map: ed-setup.js. First-time setup on a blank map: the name, where it is, a color, then the first place.
   It opens by itself when the map has no name and no places yet, and can be run again from the Look panel. */
(function () {
  "use strict";
  const ED = window.ETSEditor, { esc } = ED;
  const COLORS = ["#0B7A75", "#1D4ED8", "#7C3AED", "#BE185D", "#C2410C", "#B45309", "#15803D", "#334155"];
  let step = 0, picked = null;

  function open() {
    step = 0; picked = null;
    draw();
  }
  function draw() {
    const steps = ["Name", "Where", "Color", "First Place"];
    const dots = '<div class="su-steps">' + steps.map((s, i) => '<span class="' + (i === step ? "on" : i < step ? "done" : "") + '">' + (i + 1) + ". " + s + "</span>").join("") + "</div>";
    let body = "";
    if (step === 0) body = "<h2>Let's Set Up Your Map</h2><p>Four quick steps. Everything can be changed later.</p>" +
      '<label class="ed-field"><span class="ed-label">What\'s It Called?</span><input class="ed-input" data-name value="' + esc(ED.site("PLACE")) + '" placeholder="Millbrook, or Union County Library"><small class="ed-help">A town, county or organization. It shows in the search bar and on the welcome screen.</small></label>';
    if (step === 1) body = "<h2>Where Is It?</h2><p>Find your county, town or city. Its outline goes on the map, the map starts there, and visitors can't scroll far away.</p>" +
      '<div class="ed-pick-row"><input class="ed-input" data-q placeholder="Fayette County, Indiana" value="' + esc(ED.site("PLACE")) + '"><button type="button" class="ed-btn" data-find="1">Find</button></div><div class="ed-list su-res"></div>' + (picked ? '<p class="ed-alert good">Using ' + esc(picked.properties.display_name.split(",").slice(0, 3).join(",")) + ".</p>" : "");
    if (step === 2) body = "<h2>Pick a Color</h2><p>Buttons, chips and highlights use it. Night Mode gets a lighter version automatically.</p>" +
      '<div class="su-colors">' + COLORS.map(c => '<button type="button" data-c="' + c + '" style="background:' + c + '" aria-label="' + c + '"' + (ED.site("BAR_COLOR").toUpperCase() === c ? ' aria-pressed="true"' : "") + "></button>").join("") + '<label class="su-own">Your Own <input type="color" data-own value="' + (/^#[0-9a-f]{6}$/i.test(ED.site("BAR_COLOR")) ? ED.site("BAR_COLOR") : "#0B7A75") + '"></label></div>';
    if (step === 3) body = "<h2>Add Your First Place</h2><p>Press the button, then tap the map where it is. Give it a name, a photo and a few words. That's all a place needs.</p><p class=\"ed-note\">Have a spreadsheet of places already? Use Bring In From a Spreadsheet in the Items panel instead.</p>";
    const close = ED.modal(dots + body + '<div class="ed-btnrow end">' + (step ? '<button type="button" class="ed-btn" data-back="1">Back</button>' : "") + (step === 1 ? '<button type="button" class="ed-btn" data-skip="1">Skip This</button>' : "") +
      '<button type="button" class="ed-btn ed-primary" data-next="1">' + (step === 3 ? "Add My First Place" : "Next") + "</button></div>", (m, closeM) => {
      const q = s => m.querySelector(s);
      if (step === 0) setTimeout(() => q("[data-name]").focus(), 30);
      if (step === 1) {
        const find = async () => {
          const res = q(".su-res"); res.innerHTML = '<div class="ed-empty">Looking…</div>';
          try {
            const r = await fetch("https://nominatim.openstreetmap.org/search?format=geojson&polygon_geojson=1&limit=6&q=" + encodeURIComponent(q("[data-q]").value.trim()));
            const hits = ((await r.json()).features || []).filter(f => /Polygon/.test(f.geometry.type));
            res.innerHTML = hits.length ? "" : '<div class="ed-empty">Nothing found. Try adding the state, or skip this and draw it later in the Map panel.</div>';
            hits.forEach(f => { const b = ED.h("button", "ed-row", '<span class="ed-rt"><b>' + esc(f.properties.display_name.split(",").slice(0, 3).join(",")) + "</b><small>" + esc(f.properties.type || "") + "</small></span>"); b.type = "button"; b.addEventListener("click", () => { picked = f; closeM(); draw(); }); res.appendChild(b); });
          } catch (e) { res.innerHTML = '<div class="ed-empty">The search service couldn\'t be reached. Skip this for now and draw the outline later in the Map panel.</div>'; }
        };
        q("[data-find]").addEventListener("click", find); q("[data-q]").addEventListener("keydown", e => { if (e.key === "Enter") find(); });
      }
      if (step === 2) {
        m.querySelectorAll("[data-c]").forEach(b => b.addEventListener("click", () => { ED.setSite("BAR_COLOR", b.dataset.c, "theme color"); closeM(); draw(); }));
        q("[data-own]").addEventListener("change", e => { ED.setSite("BAR_COLOR", e.target.value.toUpperCase(), "theme color"); closeM(); draw(); });
      }
      const back = q("[data-back]"); if (back) back.addEventListener("click", () => { step--; closeM(); draw(); });
      const skip = q("[data-skip]"); if (skip) skip.addEventListener("click", () => { step++; closeM(); draw(); });
      q("[data-next]").addEventListener("click", () => {
        if (step === 0) { const v = q("[data-name]").value.trim(); if (!v) { ED.toast("Type a name first."); return; } ED.setSite("PLACE", v, "name"); if (!ED.site("TIME_ZONE")) ED.setSite("TIME_ZONE", Intl.DateTimeFormat().resolvedOptions().timeZone, "time zone"); }
        if (step === 1 && picked) useArea(picked);
        if (step === 3) { closeM(); try { localStorage.setItem(ED.key("setup_done"), "1"); } catch (e) { /* fine */ } ED.show("items"); const b = [...document.querySelectorAll("#edSide button")].find(x => /Add a Place/.test(x.textContent)); if (b) b.click(); return; }
        step++; closeM(); draw();
      });
    });
    return close;
  }
  // the area: its outline, the start view around it, and an allowed area a little bigger than it
  function useArea(f) {
    if (ED.useOutline) ED.useOutline(f);
    const ring = f.geometry.type === "Polygon" ? f.geometry.coordinates[0] : f.geometry.coordinates.flat(2).length ? f.geometry.coordinates[0][0] : [];
    if (!ring.length) return;
    const b = ED.bounds(ring), dx = (b[1][0] - b[0][0]) * 0.25, dy = (b[1][1] - b[0][1]) * 0.25;
    ED.change("site.csv", fl => {
      const put = (k, v) => { const r = fl.rows.find(x => x.KEY === k); if (r) r.VALUE = v; else fl.rows.push({ KEY: k, VALUE: v }); };
      put("CENTER_LAT", ((b[0][1] + b[1][1]) / 2).toFixed(6)); put("CENTER_LNG", ((b[0][0] + b[1][0]) / 2).toFixed(6));
      put("BOUNDS_WEST", (b[0][0] - dx).toFixed(5)); put("BOUNDS_SOUTH", (b[0][1] - dy).toFixed(5)); put("BOUNDS_EAST", (b[1][0] + dx).toFixed(5)); put("BOUNDS_NORTH", (b[1][1] + dy).toFixed(5));
      if (ED.map) put("ZOOM", ED.map.getZoom().toFixed(1));
    }, "area");
  }
  ED.runSetup = open;
  // opens by itself on a brand-new map
  const wait = setInterval(() => {
    if (!ED.ready) return; clearInterval(wait);
    let done = false; try { done = !!localStorage.getItem(ED.key("setup_done")); } catch (e) { /* fine */ }
    if (!ED.SAMPLE && !ED.EVENT && !ED.data.items.length && !ED.site("PLACE") && !done) open();
  }, 200);
})();
