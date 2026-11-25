/* ETS Community Map: ed-look.js. The Look panel: name, badge and colors, the buttons (dragged onto a phone, snapping into place),
   fonts, the welcome screen, feature switches, every visitor phrase, the embed snippet and the rest of the settings. */
(function () {
  "use strict";
  const ED = window.ETSEditor, { esc, ui, h } = ED;
  const S = k => ED.site(k), setS = (k, v, label) => ED.setSite(k, v, label);

  /* ---------- the controls a curator can place ---------- */
  const CTL = {
    search: { name: "Search", fixed: true, wide: true }, daynight: { name: "Day / Night" }, categories: { name: "Categories", wide: true, opts: true },
    happenings: { name: "Happenings" }, tours: { name: "Tours" }, near: { name: "Near Me" }, passport: { name: "Passport" }, oldmaps: { name: "Old Maps" },
    mapstyle: { name: "Map Style" }, aerial: { name: "Aerial Button" }, home: { name: "Back to Start" }, more: { name: "More Menu (•••)" }, legend: { name: "Legend" },
    share: { name: "Share This Map" }, about: { name: "About" }, offline: { name: "Save for Offline", moreOnly: true }, spacer: { name: "Gap", multi: true }
  };
  const ZONES = [["TOP", "Top Row"], ["TOP2", "Second Row"], ["TOP3", "Third Row"], ["LEFT", "Left Stack"], ["RIGHT", "Right Stack"], ["BOTTOM", "Bottom Row"]];
  const DEFAULT = { TOP: "search,daynight", TOP2: "categories", TOP3: "happenings,tours", LEFT: "", RIGHT: "near,passport,oldmaps,mapstyle,home,more", BOTTOM: "", MORE: "share,legend,offline,about" };
  const OLD = { chips: "categories", event: "about", tour: "tours", newrow: "" };
  function zoneList(z) {
    let v = ED.data.site["LAYOUT_" + z];
    if (z === "RIGHT" && !v && ED.data.site.LAYOUT_FLOAT) v = ED.data.site.LAYOUT_FLOAT;
    if (v == null) v = DEFAULT[z];
    return String(v).split(",").map(s => s.trim().toLowerCase()).map(s => (s in OLD ? OLD[s] : s)).filter(s => s && CTL[s]);
  }
  function layout() { const L = {}; ZONES.forEach(([z]) => { L[z] = zoneList(z); }); L.MORE = zoneList("MORE"); return L; }
  function saveLayout(L) {
    ED.change("site.csv", f => {
      Object.keys(L).forEach(z => { const k = "LAYOUT_" + z, v = L[z].join(","); const r = f.rows.find(x => x.KEY === k); if (r) r.VALUE = v; else f.rows.push({ KEY: k, VALUE: v }); });
      const fl = f.rows.find(x => x.KEY === "LAYOUT_FLOAT"); if (fl) fl.VALUE = "";
    }, "button layout");
  }
  let previewDesk = false;

  function render(side) {
    ui.head(side, "Look", "How the map looks and which buttons it has. Press Preview at the top to see the real thing.");
    ui.buttons(side, [{ text: "Preview on a Phone", onClick: () => framePreview(false) }, { text: "Preview on a Computer", onClick: () => framePreview(true) }]);

    const n = ui.section(side, "Name, Badge and Colors");
    ui.text(n, "Place or Organization Name", S("PLACE"), v => setS("PLACE", v, "name"), "Shown in the search bar and the welcome screen, like Millbrook or UCDC.");
    ui.text(n, "Header Text", S("HEADER"), v => setS("HEADER", v, "header"), "The small words above the search box. {PLACE} is the name. Blank = the name.", { placeholder: "Explore {PLACE}" });
    ui.text(n, "Browser Tab Title", S("TAB_TITLE"), v => setS("TAB_TITLE", v, "tab title"), "", { placeholder: "Explore {PLACE}" });
    ui.color(n, "Theme Color", S("BAR_COLOR"), v => setS("BAR_COLOR", v, "theme color"), "Buttons, chips and highlights. A lighter version is made for Night Mode automatically.");
    ui.select(n, "Badge", S("BADGE"), [["", "The Area's Outline (Drawn in Map)"], ["initials", "Two Letters"], ["icon", "An Icon"], ["logo", "Your Logo"]], v => { setS("BADGE", v, "badge"); ED.rerender(); }, "The little picture at the start of the search bar that says where this is.");
    const b = S("BADGE");
    if (!b || b === "outline") ui.select(n, "Outline Style", S("BADGE_STYLE"), [["filled", "Filled"], ["outline", "Outline"], ["line", "Dotted Line"]], v => setS("BADGE_STYLE", v, "badge style"));
    if (b === "initials") ui.text(n, "Letters", S("BADGE_TEXT"), v => setS("BADGE_TEXT", v.slice(0, 2).toUpperCase(), "badge letters"), "Two letters, like LP or FC. Blank = from the name.");
    if (b === "icon") ED.iconPicker(n, "Badge Icon", S("BADGE_ICON"), v => setS("BADGE_ICON", v, "badge icon"));
    if (b === "logo") ui.file(n, S("BADGE_LOGO") ? "Replace the Logo (now " + S("BADGE_LOGO") + ")" : "Drop Your Logo Here", "image/*", async files => { const r = await ED.shrinkPhoto(files[0], 256, 0); const name = ED.fileName("logo", r.ext); ED.addPending(ED.BASE + "media/" + name, r.main); setS("BADGE_LOGO", name, "logo"); ED.rerender(); }, "A square picture works best.");
    ui.select(n, "Button Shape", S("BAR_STYLE"), [["", "Round"], ["bar", "Squarer Corners"]], v => setS("BAR_STYLE", v, "button shape"));
    ui.select(n, "Top of the Screen", S("LAYOUT_STYLE"), [["", "Floating Over the Map"], ["band", "A Solid Colored Band"]], v => setS("LAYOUT_STYLE", v, "layout style"));

    const a = ui.section(side, "Arrange the Controls");
    arrange(a);

    const fo = ui.section(side, "Fonts", { open: false });
    const FONTS = [["", "The Phone's Own (Recommended)"], ["book", "Book (Serif)"], ["rounded", "Rounded"], ["mono", "Typewriter"]];
    const fsel = (label, key) => { const v = S(key); ui.select(fo, label, FONTS.some(f => f[0] === v) ? v : "__other", FONTS.concat([["__other", "Another Font Installed on Phones…"]]), x => { if (x !== "__other") setS(key, x, "font"); ED.rerender(); }); if (!FONTS.some(f => f[0] === v)) ui.text(fo, label + " Name", v, x => setS(key, x, "font"), "Only fonts already on visitors' phones work, like Georgia or Verdana."); };
    fsel("Body Font", "FONT_BODY"); fsel("Heading Font", "FONT_HEAD");

    const w = ui.section(side, "Welcome Screen", { open: false });
    ui.toggle(w, "Show a Welcome Screen", ED.yes(S("WELCOME"), true), v => setS("WELCOME", v ? "yes" : "no", "welcome"), "Visitors arriving by a QR code or a shared link always skip it.");
    ui.text(w, "Words", S("WELCOME_TEXT"), v => setS("WELCOME_TEXT", v, "welcome words"), "Lines separated by |. The last line is big. {PLACE} is the name.", { placeholder: "Welcome to|{PLACE}" });
    ui.select(w, "Theme", S("WELCOME_THEME"), [["", "Plain, in Your Colors"], ["fall", "Fall Leaves"], ["winter", "Winter Snow"], ["halloween", "Halloween Ghosts"]], v => setS("WELCOME_THEME", v, "welcome theme"), "Animated drawings, picked by hand. No picture files needed.");
    ui.file(w, S("WELCOME_GIF") ? "Replace the Welcome Picture (now " + S("WELCOME_GIF") + ")" : "Or Use Your Own Picture or GIF", "image/*", files => { const f = files[0]; const name = ED.fileName("welcome", (f.name.split(".").pop() || "gif").toLowerCase()); ED.addPending(ED.BASE + "media/" + name, f); setS("WELCOME_GIF", name, "welcome picture"); ED.rerender(); }, "Used when the theme is Plain. Keep it small.");
    if (S("WELCOME_GIF")) ui.buttons(w, [{ text: "Stop Using the Picture", onClick: () => { setS("WELCOME_GIF", "", "welcome picture"); ED.rerender(); } }]);
    ui.select(w, "After the Welcome", S("INTRO_CARD"), [["", "Show Off Some Places (Card at the Bottom)"], ["top", "Show Off Some Places (Card at the Top)"], ["off", "Go Straight to the Map"]], v => setS("INTRO_CARD", v, "intro card"));
    ui.select(w, "Camera During the Show", S("INTRO_STYLE"), [["", "Stays Still"], ["zoom", "Flies to Each Place"], ["spin", "Flies and Slowly Turns"]], v => setS("INTRO_STYLE", v, "intro style"), "Never moves for visitors with Reduce Motion on.");
    ui.select(w, "What It Shows", S("INTRO_FEATURES"), [["", "Places"], ["mixed", "Places, Stories and Photo Spots"], ["spots", "Stories and Photo Spots"]], v => setS("INTRO_FEATURES", v, "intro features"), "Stories and Photo Spots only show when the camera flies.");
    ui.buttons(w, [{ text: "Replay the Intro", onClick: () => { const u = new URL("index.html", location.href); u.searchParams.set("draft", "1"); u.searchParams.set("intro", "1"); if (ED.SAMPLE) u.searchParams.set("sample", ED.SAMPLE); window.open(u.toString(), "ets-preview"); } }]);

    const fs = ui.section(side, "Feature Switches", { open: false });
    [["PASSPORT", "Passport", false, "Stamps, ranks and prizes. Set them up in the Passport panel."], ["OVERLAY_SLIDER", "Old Maps", true, "The old-map button and its see-through slider."], ["AERIAL_BUTTON", "Aerial Photos", true, "Offer Aerial in Map Style."],
      ["MAPS_LINK", "Open in Maps", true, "Sends a place to the phone's own maps app."], ["NEAR_ME", "Near Me", true, "The visitor's own dot and distances."], ["PHOTO_MARKERS", "Photos as Markers", true, "A place's first photo becomes its marker."]].forEach(([k, label, def, help]) => ui.toggle(fs, label, ED.yes(S(k), def), v => setS(k, v ? "yes" : "no", label), help));
    ui.toggle(fs, "Bottom Row on Computers Too", String(S("BOTTOM_ON")).toLowerCase() === "all", v => setS("BOTTOM_ON", v ? "all" : "", "bottom row"), "Off: the bottom row is a phone feature.");
    ui.note(fs, "The Year Slider is coming later, as an add-on.");

    const ab = ui.section(side, "About This Map", { open: false });
    ui.text(ab, "Button Words", S("EVENT_BUTTON"), v => setS("EVENT_BUTTON", v, "about button"), "The badge and the About button open this.", { placeholder: "About" });
    ui.text(ab, "Title", S("EVENT_TITLE"), v => setS("EVENT_TITLE", v, "about title"), "", { placeholder: "About This Map" });
    ui.text(ab, "Text", S("EVENT_TEXT"), v => setS("EVENT_TEXT", v, "about text"), "Who made the map and how to use it. A blank line starts a new paragraph.", { multi: true, rows: 6 });
    ui.text(ab, "Share a Memory Link", S("MEMORY_LINK"), v => setS("MEMORY_LINK", v, "memory link"), "An email address or a form's web address. Cards then say \"Do you have a memory of this place? Share it.\" {ID} and {NAME} are filled in.", { placeholder: "memories@example.org" });

    const wd = ui.section(side, "Wording", { open: false });
    wording(wd);

    const em = ui.section(side, "Embed on Another Site", { open: false });
    embed(em);

    const mo = ui.section(side, "More Options", { open: false });
    timeZone(mo);
    ui.text(mo, "Local Imagery Address", S("LOCAL_IMAGERY_URL"), v => setS("LOCAL_IMAGERY_URL", v, "local imagery"), "Optional sharper aerial photos from your state or county, shown up close. Paste the tile address with {z}, {x} and {y}.", { placeholder: "https://…/tile/{z}/{y}/{x}" });
    if (S("LOCAL_IMAGERY_URL")) { ui.text(mo, "Local Imagery Credit", S("LOCAL_IMAGERY_CREDIT"), v => setS("LOCAL_IMAGERY_CREDIT", v, "imagery credit"), "Required: who provides the photos."); ui.number(mo, "Show It From Zoom", S("LOCAL_IMAGERY_MINZOOM"), v => setS("LOCAL_IMAGERY_MINZOOM", v, "imagery zoom"), "Blank = 13.");
      const z = 15, c = ED.map ? ED.map.getCenter() : { lng: -86, lat: 40 }, x = Math.floor((c.lng + 180) / 360 * 2 ** z), y = Math.floor((1 - Math.log(Math.tan(c.lat * Math.PI / 180) + 1 / Math.cos(c.lat * Math.PI / 180)) / Math.PI) / 2 * 2 ** z);
      const img = h("img"); img.alt = "Preview of one imagery tile"; img.style.cssText = "width:128px;height:128px;border-radius:12px;background:var(--surface-2)"; img.src = S("LOCAL_IMAGERY_URL").replace("{z}", z).replace("{x}", x).replace("{y}", y);
      img.onerror = () => { img.replaceWith(h("p", "ed-note warn", "No picture came back for this spot. Check the address, and that it covers the area on the map.")); };
      ui.field(mo, "Preview (One Tile Where the Map Is)", img); }
    ui.select(mo, "Distances In", S("UNITS"), [["", "Miles and Feet"], ["km", "Kilometers and Meters"]], v => setS("UNITS", v, "units"));
    ui.select(mo, "Street Map Tone", S("MAP_TONE"), [["", "Standard"], ["warm", "Warm"], ["muted", "Muted"]], v => setS("MAP_TONE", v, "map tone"), "Colors the street map only, in Day Mode.");
    ui.select(mo, "Categories Show As", S("CATEGORY_STYLE"), [["", "Chips (a Scrolling Row)"], ["dropdown", "One Categories Button (a Checklist)"]], v => setS("CATEGORY_STYLE", v, "categories style"), "Dropdown suits sites with many categories.");
    ui.select(mo, "Group Shape", S("GROUP_SHAPE"), (ED.shapeOptions || (() => [["", "Circle"]]))("Same as the Category"), v => setS("GROUP_SHAPE", v, "group shape"), "The marker shape for every group, unless a group picks its own.");
    ui.select(mo, "Group Members Show", S("SHOW_MEMBERS"), [["", "When the Group Is Tapped"], ["always", "Always, When Zoomed In"]], v => setS("SHOW_MEMBERS", v, "show members"));
    ui.text(mo, "Tour Length Buttons (Minutes)", S("TOUR_TIME_BUTTONS"), v => setS("TOUR_TIME_BUTTONS", v, "tour buttons"), "The Under 30 min, Under 1 hr buttons on the tour list.", { placeholder: "30,60,120" });
    ui.toggle(mo, "Slow Spin on Tours", ED.yes(S("TOUR_SPIN")), v => setS("TOUR_SPIN", v ? "yes" : "no", "tour spin"), "Stops the moment a visitor touches the map.");
    ui.select(mo, "Spin Speed", S("TOUR_SPIN_SPEED"), [["slow", "Slow"], ["", "Medium"], ["fast", "Fast"]], v => setS("TOUR_SPIN_SPEED", v, "spin speed"));
    ui.number(mo, "Tour Tilt (0 to 60 Degrees)", S("TOUR_TILT"), v => setS("TOUR_TILT", v, "tilt"), "Tips the map back a little while touring.", { min: 0, max: 60 });
    ui.buttons(mo, [{ text: "Start From the Standard Look…", onClick: () => ED.confirm("Start from the standard look?", "Colors, fonts, buttons, welcome screen and wording go back to the standard settings. Your name, start view, allowed area and places stay.", "Reset the Look", () => {
      const keep = /^(PLACE|CENTER_LAT|CENTER_LNG|ZOOM|BOUNDS_|MIN_ZOOM|MAX_ZOOM|FIT_TO_MARKERS|TIME_ZONE|PASSPORT|PASSPORT_RANKS|PRIZES|EVENT_TITLE|EVENT_TEXT|EVENT_BUTTON|MEMORY_LINK|LOCAL_IMAGERY_)/;
      ED.change("site.csv", f => { f.rows.forEach(r => { if (!keep.test(r.KEY)) r.VALUE = ""; }); f.rows = f.rows.filter(r => !String(r.KEY).startsWith("LABEL.")); }, "standard look"); ED.rerender(); }) }]);
    ui.toggle(mo, "Editor in Night Mode", document.documentElement.dataset.theme === "night", v => { document.documentElement.dataset.theme = v ? "night" : ""; try { localStorage.setItem(ED.key("ed_theme"), v ? "night" : ""); } catch (e) { /* fine */ } }, "Only changes this editor, on this device.");
  }

  /* ---------- Arrange the Controls: drag tiles onto a phone ---------- */
  function arrange(parent) {
    const L = layout();
    ui.note(parent, "Drag a button onto the phone. It snaps into the nearest spot. Drag it to Switched Off to hide it. Tap Categories for its choices.");
    const seg = h("div", "ed-seg"); seg.innerHTML = '<button type="button" data-d="0"' + (!previewDesk ? ' aria-pressed="true"' : "") + '>Phone</button><button type="button" data-d="1"' + (previewDesk ? ' aria-pressed="true"' : "") + ">Computer</button>";
    seg.querySelectorAll("button").forEach(b => b.addEventListener("click", () => { previewDesk = b.dataset.d === "1"; ED.rerender(); }));
    parent.appendChild(seg);
    const wrap = h("div", "lk-wrap"); parent.appendChild(wrap);
    const phone = h("div", "lk-phone" + (previewDesk ? " desk" : "")); wrap.appendChild(phone);
    phone.style.setProperty("--accent", S("BAR_COLOR") || "#0B7A75");
    const tile = (k, z) => '<button type="button" class="lk-tile' + (CTL[k].wide && z !== "LEFT" && z !== "RIGHT" ? " wide" : "") + '" data-k="' + k + '" data-from="' + z + '">' + esc(k === "categories" && String(S("CATEGORY_STYLE")).toLowerCase() === "dropdown" ? "Categories ▾" : CTL[k].name) + "</button>";
    ZONES.forEach(([z, label]) => { phone.insertAdjacentHTML("beforeend", '<div class="lk-zone" data-z="' + z + '" data-label="' + esc(label) + '">' + L[z].map(k => tile(k, z)).join("") + "</div>"); });
    const used = new Set([].concat(...ZONES.map(([z]) => L[z]), L.MORE));
    wrap.insertAdjacentHTML("beforeend", '<b class="ed-label">More Menu</b><small class="ed-help">Things tucked behind the ••• button.</small><div class="lk-tray" data-z="MORE">' + L.MORE.map(k => tile(k, "MORE")).join("") + "</div>" +
      '<b class="ed-label">Switched Off</b><small class="ed-help">Drag one onto the phone to turn it on.</small><div class="lk-tray" data-z="OFF">' + Object.keys(CTL).filter(k => !used.has(k) || CTL[k].multi).map(k => tile(k, "OFF")).join("") + "</div>");
    ui.buttons(wrap, [{ text: "Reset to Standard", onClick: () => ED.confirm("Reset the buttons?", "The buttons go back to the standard layout.", "Reset", () => { saveLayout(JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(DEFAULT).map(([k, v]) => [k, v.split(",").filter(Boolean)]))))); ED.rerender(); }) }]);
    const g = h("div", "ed-grid2"); wrap.appendChild(g);
    ui.number(g, "Search Width on Phones (%)", S("SEARCH_WIDTH_PHONE"), v => setS("SEARCH_WIDTH_PHONE", v, "search width"), "Blank = fills the row.", { min: 30, max: 100 });
    ui.number(g, "Search Width on Computers (%)", S("SEARCH_WIDTH"), v => setS("SEARCH_WIDTH", v, "search width"), "", { min: 30, max: 100 });
    ui.select(wrap, "Zoom Buttons", S("ZOOM_POS"), [["", "Top Right"], ["bottom", "Bottom Right"], ["off", "Off (Pinch to Zoom)"]], v => setS("ZOOM_POS", v, "zoom buttons"));
    wireDrag(wrap, L);
  }
  // Pointer dragging that works with a mouse, a finger or a pen. A drop lands in the zone under the pointer,
  // before the tile it's nearest to.
  function wireDrag(wrap, L) {
    wrap.querySelectorAll(".lk-tile").forEach(t => {
      t.addEventListener("pointerdown", e => {
        if (e.button > 0) return;
        const k = t.dataset.k, from = t.dataset.from, x0 = e.clientX, y0 = e.clientY;
        let ghost = null, moved = false, hot = null;
        const move = ev => {
          if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
          if (!moved) { moved = true; ghost = t.cloneNode(true); ghost.classList.add("lk-ghost"); document.body.appendChild(ghost); t.classList.add("dragging"); wrap.classList.add("lk-dragging"); }
          ghost.style.left = ev.clientX + "px"; ghost.style.top = ev.clientY + "px";
          const z = zoneAt(wrap, ev.clientX, ev.clientY);
          if (hot !== z) { if (hot) hot.classList.remove("hot"); hot = z; if (hot) hot.classList.add("hot"); }
        };
        const up = ev => {
          document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up);
          if (ghost) ghost.remove(); t.classList.remove("dragging"); wrap.classList.remove("lk-dragging"); if (hot) hot.classList.remove("hot");
          if (!moved) { tapTile(k); return; }
          const z = zoneAt(wrap, ev.clientX, ev.clientY); if (!z) return;
          drop(L, k, from, z.dataset.z, indexAt(z, ev.clientX, ev.clientY, t));
        };
        document.addEventListener("pointermove", move); document.addEventListener("pointerup", up);
      });
    });
  }
  function zoneAt(wrap, x, y) {
    const els = [...wrap.querySelectorAll(".lk-zone, .lk-tray")];
    const inside = els.filter(z => { const r = z.getBoundingClientRect(); return x >= r.left - 6 && x <= r.right + 6 && y >= r.top - 6 && y <= r.bottom + 6; });
    if (inside.length) return inside.sort((a, b) => a.getBoundingClientRect().width * a.getBoundingClientRect().height - b.getBoundingClientRect().width * b.getBoundingClientRect().height)[0];
    const phone = wrap.querySelector(".lk-phone").getBoundingClientRect();     // over the phone but between zones: snap to the nearest zone
    if (x < phone.left || x > phone.right || y < phone.top || y > phone.bottom) return null;
    let best = null, bd = 1e9;
    wrap.querySelectorAll(".lk-zone").forEach(z => { const r = z.getBoundingClientRect(), cx = Math.max(r.left, Math.min(x, r.right)), cy = Math.max(r.top, Math.min(y, r.bottom)), d = Math.hypot(x - cx, y - cy); if (d < bd) { bd = d; best = z; } });
    return best;
  }
  function indexAt(zone, x, y, self) {
    const vertical = zone.dataset.z === "LEFT" || zone.dataset.z === "RIGHT";
    const kids = [...zone.querySelectorAll(".lk-tile")].filter(c => c !== self);
    let i = 0;
    kids.forEach((c, n) => { const r = c.getBoundingClientRect(); if (vertical ? y > r.top + r.height / 2 : x > r.left + r.width / 2) i = n + 1; });
    return i;
  }
  function drop(L, k, from, to, index) {
    const c = CTL[k];
    if (c.fixed && to === "OFF") { ED.toast("Search is always on, so the badge and search stay reachable."); return; }
    if (c.moreOnly && to !== "MORE" && to !== "OFF") { ED.toast(c.name + " only fits in the More menu."); return; }
    if (from !== "OFF") { const a = L[from]; const at = a.indexOf(k); if (at >= 0 && !(c.multi && from === to && false)) a.splice(at, 1); }
    if (to !== "OFF") {
      if (!c.multi) Object.keys(L).forEach(z => { L[z] = L[z].filter(x => x !== k); });
      L[to].splice(Math.min(index, L[to].length), 0, k);
    }
    saveLayout(L); ED.rerender();
  }
  function tapTile(k) {
    if (k === "categories") ED.modal("<h2>Categories</h2><p>How the category filter shows on the map.</p>", (m, close) => {
      ui.select(m, "Show As", String(S("CATEGORY_STYLE")).toLowerCase() === "dropdown" ? "dropdown" : "", [["", "Chips (a Scrolling Row)"], ["dropdown", "One Categories Button (a Checklist)"]], v => { setS("CATEGORY_STYLE", v, "categories style"); close(); ED.rerender(); });
    });
    else ED.toast(CTL[k].name + ": drag it to move it.");
  }
  // the real page, in a phone- or computer-sized window
  function framePreview(desk) {
    const u = new URL("index.html", location.href); u.searchParams.set("draft", "1"); u.searchParams.set("intro", "0"); if (ED.SAMPLE) u.searchParams.set("sample", ED.SAMPLE); if (ED.EVENT) u.searchParams.set("event", ED.EVENT);
    const W = desk ? 1280 : 390, H = desk ? 800 : 844, k = Math.min(1, (innerHeight - 140) / H, (Math.min(innerWidth, 1100) - 80) / W);
    ED.modal("<h2>Preview on a " + (desk ? "Computer" : "Phone") + '</h2><div style="width:' + Math.round(W * k) + "px;height:" + Math.round(H * k) + 'px;overflow:hidden;border-radius:' + (desk ? 12 : 32) + 'px;border:6px solid #14181B;margin:0 auto"><iframe src="' + esc(u.toString()) + '" style="width:' + W + "px;height:" + H + "px;border:0;transform:scale(" + k + ');transform-origin:0 0" title="Preview"></iframe></div>', null, { wide: true });
    const m = document.querySelector(".ed-modal"); if (m) m.style.maxWidth = Math.round(W * k + 60) + "px";
  }

  /* ---------- Wording: every phrase visitors read ---------- */
  let WORDS = null, wq = "";
  async function loadWords() {
    if (WORDS) return WORDS;
    WORDS = {};
    for (const f of ["app/core.js", "app/happenings.js", "app/tours.js", "app/nearme.js", "app/oldmaps.js", "app/passport.js", "app/interiors.js", "app/welcome.js", "app/offline.js"]) {
      try {
        const t = await (await fetch(f)).text();
        const blocks = t.match(/(?:const WORDS = \{|C\.words\(\{)([\s\S]*?)\}\)?;/g) || [];
        blocks.forEach(b => { const re = /(?:^|[,{\s])"?([\w.]+)"?\s*:\s*"((?:[^"\\]|\\.)*)"/g; let m; while ((m = re.exec(b))) if (!(m[1] in WORDS)) WORDS[m[1]] = m[2].replace(/\\"/g, '"'); });
      } catch (e) { /* offline: fine */ }
    }
    return WORDS;
  }
  function wording(parent) {
    ui.note(parent, "Change any phrase visitors read. Words in {curly brackets} are filled in by the map, so keep them. Blank = the standard words.");
    const s = h("input", "ed-input"); s.type = "search"; s.placeholder = "Find a phrase"; s.value = wq; parent.appendChild(s);
    const box = h("div", "lk-words"); parent.appendChild(box);
    const draw = W => {
      const q = wq.trim().toLowerCase();
      const keys = Object.keys(W).filter(k => !q || k.toLowerCase().includes(q) || W[k].toLowerCase().includes(q) || String(S("LABEL." + k)).toLowerCase().includes(q)).slice(0, 80);
      box.innerHTML = "";
      keys.forEach(k => {
        const cur = S("LABEL." + k);
        const row = h("div", "lk-word");
        row.innerHTML = "<small>Standard: " + esc(W[k]) + "</small>";
        const inp = h("input", "ed-input"); inp.value = cur; inp.placeholder = W[k]; inp.setAttribute("aria-label", W[k]);
        inp.addEventListener("change", () => setS("LABEL." + k, inp.value, "wording"));
        row.appendChild(inp);
        if (cur) { const r = h("button", "ed-btn ed-small", "Reset to Standard"); r.type = "button"; r.addEventListener("click", () => { setS("LABEL." + k, "", "wording"); ED.rerender(); }); row.appendChild(r); }
        box.appendChild(row);
      });
      if (!keys.length) box.innerHTML = '<div class="ed-empty">Nothing matches.</div>';
    };
    loadWords().then(draw);
    s.addEventListener("input", () => { wq = s.value; loadWords().then(draw); });
    ui.buttons(parent, [{ text: "Reset All Wording to Standard", onClick: () => ED.confirm("Reset all wording?", "Every phrase you changed goes back to the standard words.", "Reset", () => { ED.change("site.csv", f => { f.rows = f.rows.filter(r => !String(r.KEY).startsWith("LABEL.")); }, "wording reset"); ED.rerender(); }) }]);
  }

  /* ---------- Embed snippet ---------- */
  let emb = { place: "", tour: "", happening: "", height: 520 };
  function embed(parent) {
    ui.note(parent, "Show the map inside another website, as a box on one of its pages. Paste this into that page's HTML.");
    const gh = (() => { try { return JSON.parse(localStorage.getItem(ED.key("gh")) || "{}"); } catch (e) { return {}; } })();
    const guess = gh.owner && gh.repo ? "https://" + gh.owner.toLowerCase() + ".github.io/" + gh.repo + "/" + (gh.folder ? gh.folder + "/" : "") : new URL(".", location.href).toString();
    const url = () => { const u = new URL(guess + "index.html"); u.searchParams.set("embed", "1"); if (emb.place) u.searchParams.set("place", emb.place); if (emb.tour) u.searchParams.set("tour", emb.tour); if (emb.happening) u.searchParams.set("happening", emb.happening); return u.toString(); };
    const code = h("textarea", "ed-code"); code.rows = 4; code.readOnly = true;
    const upd = () => { code.value = '<iframe src="' + url() + '" title="Map of ' + (S("PLACE") || "the area").replace(/"/g, "") + '" style="width:100%;height:' + (+emb.height || 520) + 'px;border:0;border-radius:16px" allow="geolocation; fullscreen" loading="lazy"></iframe>'; };
    ui.picker(parent, "Start On a Place", emb.place, ED.data.items.map(i => [i.ID, i.NAME || i.ID]), v => { emb.place = v; upd(); }, "", { none: "The Whole Map" });
    ui.picker(parent, "Or Start On a Tour", emb.tour, ((ED.data.routes && ED.data.routes.features) || []).filter(f => f.properties.TYPE !== "line").map(f => [f.properties.ID, f.properties.TITLE || f.properties.ID]), v => { emb.tour = v; upd(); }, "", { none: "No Tour" });
    ui.number(parent, "Height (Pixels)", emb.height, v => { emb.height = v; upd(); });
    ui.field(parent, "The Code to Paste", code, "Location (Near Me) only works because of the allow=\"geolocation\" part. The passport stays a full-map feature.");
    ui.buttons(parent, [{ text: "Copy the Code", primary: true, onClick: async () => { try { await navigator.clipboard.writeText(code.value); ED.toast("Copied."); } catch (e) { code.select(); ED.toast("Select it and copy."); } } }]);
    upd();
  }

  function timeZone(parent) {
    let zones = []; try { zones = Intl.supportedValuesOf("timeZone"); } catch (e) { zones = ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu", "Europe/London", "Europe/Paris", "Australia/Sydney"]; }
    const mine = Intl.DateTimeFormat().resolvedOptions().timeZone;
    ui.picker(parent, "Time Zone", S("TIME_ZONE"), zones.map(z => [z, z.replace(/_/g, " "), z === mine ? "This device's zone" : ""]), v => setS("TIME_ZONE", v, "time zone"), "Happenings use the clock on the wall here, so daylight saving never shifts them. Blank = each visitor's own clock (" + mine + " for you).", { none: "Each Visitor's Own Clock" });
  }

  ED.panel("look", { title: "Look", render });
})();
