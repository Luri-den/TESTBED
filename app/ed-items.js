/* ETS Community Map: ed-items.js. The Items panel: places, photo spots and stories, groups, their photos,
   audio and video, check-in, and the categories they belong to. */
(function () {
  "use strict";
  const ED = window.ETSEditor, { esc, ui, h } = ED;
  const KINDS = [["place", "Place"], ["photospot", "Photo Spot"], ["story", "Story"]];
  const kindName = k => (KINDS.find(x => x[0] === k) || KINDS[0])[1];
  const SHAPES = ["circle", "square", "diamond", "triangle", "shield", "flag1", "cross", "speechbubble", "starburst", "pentagon", "hexagon", "octagon", "star", "trapezoid"];
  const SHAPE_NAMES = { flag1: "Flag", speechbubble: "Speech Bubble" };
  const title = s => SHAPE_NAMES[s] || s.charAt(0).toUpperCase() + s.slice(1);
  const PATTERNS = ["solid", "stripes", "lines", "diagonal", "checks", "dots", "grid", "waves", "zigzag", "crosses"];
  let filter = "all", query = "";

  // who's in which group, worked out once per change instead of once per row (big sites stay quick)
  let memo = null, memoFor = null;
  const groupsMap = () => { if (memoFor !== ED.data.items || !memo || memo.size !== undefined && memo._n !== ED.data.items.length) { memo = new Map(); ED.data.items.forEach(x => { if (x.PART_OF) { if (!memo.has(x.PART_OF)) memo.set(x.PART_OF, []); memo.get(x.PART_OF).push(x); } }); memo._n = ED.data.items.length; memoFor = ED.data.items; } return memo; };
  ED.onChange(() => { memo = null; });
  const isGroup = it => groupsMap().has(it.ID);
  const members = it => groupsMap().get(it.ID) || [];
  const hasPos = it => isFinite(parseFloat(it.LAT)) && isFinite(parseFloat(it.LONG));
  const shapeOptions = (blankText) => [["", blankText]].concat(SHAPES.map(s => [s, title(s)]), Object.keys((ED.data.icons && ED.data.icons.shapes) || {}).map(k => [k, (ED.data.icons.shapes[k].label || k) + " (drawn)"]));
  ED.shapeOptions = shapeOptions;

  /* ---------- the list ---------- */
  function render(side) {
    const D = ED.data;
    ui.head(side, "Items", "Places, Photo Spots and Stories. Tap one to edit it, or drag its marker to move it.");
    ui.buttons(side, [{ text: "+ Add a Place", primary: true, onClick: () => startAdd("place") }, { text: "+ Photo Spot", onClick: () => startAdd("photospot") }, { text: "+ Story", onClick: () => startAdd("story") }, { text: "Bring In From a Spreadsheet", onClick: importSheet, title: "Paste rows from Excel or Google Sheets, or pick a CSV file" }]);
    const s = h("div", "ed-search"); s.innerHTML = '<input class="ed-input" type="search" placeholder="Find an item" aria-label="Find an item" value="' + esc(query) + '">';
    side.appendChild(s);
    const inp = s.querySelector("input");
    inp.addEventListener("input", () => { query = inp.value; drawList(); });
    const counts = { all: D.items.length, place: D.items.filter(i => (i.KIND || "place") === "place").length, photospot: D.items.filter(i => i.KIND === "photospot").length, story: D.items.filter(i => i.KIND === "story").length, group: D.items.filter(isGroup).length };
    const f = h("div", "ed-filters");
    f.innerHTML = [["all", "All"], ["place", "Places"], ["photospot", "Photo Spots"], ["story", "Stories"], ["group", "Groups"]].map(([k, t]) => '<button type="button" data-f="' + k + '" aria-pressed="' + (filter === k) + '">' + t + " " + counts[k] + "</button>").join("");
    f.querySelectorAll("button").forEach(b => b.addEventListener("click", () => { filter = b.dataset.f; ED.rerender(); }));
    side.appendChild(f);
    const listBox = h("div"); side.appendChild(listBox);
    function drawList() {
      listBox.innerHTML = "";
      const q = query.trim().toLowerCase();
      const match = it => (!q || [it.NAME, it.OTHER_NAMES, it.ID, it.ADDRESS].join(" ").toLowerCase().includes(q)) &&
        (filter === "all" || (filter === "group" ? isGroup(it) : (it.KIND || "place") === filter));
      // groups first with their members under them, then everything else
      const rows = [];
      const row = (it, member) => {
        const cat = D.cats.get(it.CATEGORY), key = it.ICON || (cat && cat.ICON);
        const sub = [isGroup(it) ? "Group · " + members(it).length + " places" : kindName(it.KIND), cat ? cat.LABEL || cat.CODE : "", hasPos(it) ? "" : (it.KIND === "story" ? "Tour only" : "No location")].filter(Boolean).join(" · ");
        rows.push({ id: it.ID, title: (member ? "↳ " : "") + (it.NAME || it.ID), sub, color: ED.colorFor(it), icon: key ? ED.iconUrl(key, 40) : "", on: ED.selected === it, bad: !hasPos(it) && it.KIND !== "story" });
      };
      D.items.filter(i => !i.PART_OF).forEach(it => {
        const ms = members(it).filter(match);
        if (match(it) || ms.length) row(it, false);
        if (!q && filter === "all" || ms.length) ms.forEach(m => row(m, true));
      });
      if (filter !== "all" || q) D.items.filter(i => i.PART_OF && match(i) && !rows.some(r => r.id === i.ID)).forEach(i => row(i, true));
      ui.list(listBox, rows, { empty: D.items.length ? "Nothing matches." : "No items yet. Press Add a Place, then tap the map where it goes.", onPick: id => selectItem(D.byId.get(id), true) });
    }
    drawList();
    if (!D.items.length && !ED.SAMPLE) { ui.note(side, "New to this? Look around a made-up sample town first. Nothing you do there touches your map."); ui.buttons(side, [{ text: "Look at the Sample", onClick: () => { location.href = "edit.html?sample=demo"; } }]); }
    if (ED.SAMPLE) ui.note(side, "This is the sample town. Changes here never touch your own map.", "warn");

    const cs = ui.section(side, "Categories", { open: false, badge: String(D.cats.size) });
    ui.note(cs, "Each place can belong to one category. A category sets the marker's color, icon and shape, and gets its own chip on the map.");
    ui.list(cs, [...D.cats.values()].map(c => ({ id: c.CODE, title: c.LABEL || c.CODE, sub: D.items.filter(i => i.CATEGORY === c.CODE).length + " items" + (ED.yes(c.RANKED) ? " · Ranked" : ""), color: c.COLOR, icon: c.ICON ? ED.iconUrl(c.ICON, 40) : "" })), { empty: "No categories yet.", onPick: code => editCategory(code) });
    ui.buttons(cs, [{ text: "+ New Category", onClick: () => newCategory() }]);
  }

  /* ---------- bringing in places from a spreadsheet ---------- */
  const FIELDS = [["NAME", "Name", /^(name|title|place|site)$/i], ["LAT", "Latitude", /^(lat|latitude|y)$/i], ["LONG", "Longitude", /^(lon|long|lng|longitude|x)$/i], ["ADDRESS", "Address", /address|street|location/i],
    ["CATEGORY", "Category", /categ|type|kind of/i], ["TEXT", "Description", /desc|details|text|about|notes?$/i], ["WEBSITE", "Website", /web|url|link/i], ["PHONE", "Phone", /phone|tel/i], ["HOURS", "Hours", /hours|open/i],
    ["YEAR_START", "Year Opened", /year|built|est/i], ["OTHER_NAMES", "Other Names", /other|aka|also/i], ["ORG", "Organization", /org|owner|run by/i]];
  function readRows(text) {
    text = String(text || "").replace(/^\uFEFF/, "").trim();
    if (!text) return [];
    const first = text.split(/\r?\n/)[0];
    if (first.includes("\t")) return text.split(/\r?\n/).map(l => l.split("\t").map(c => c.replace(/^"(.*)"$/, "$1").replace(/""/g, '"').trim()));      // pasted from a spreadsheet
    const p = ED.parseCSV(text);                     // a CSV file (quotes and commas inside cells are fine)
    return [p.cols].concat(p.rows.map(r => p.cols.map(c => r[c])));
  }
  function importSheet() {
    let rows = [], head = [], map = {}, catAll = "", geocode = true;
    const guess = () => { map = {}; FIELDS.forEach(([k, , re]) => { const i = head.findIndex(h => re.test(String(h).trim())); if (i >= 0 && !Object.values(map).includes(i)) map[k] = i; }); };
    const body = () => {
      const data = rows.slice(1).filter(r => r.some(c => String(c || "").trim()));
      return "<h2>Bring In From a Spreadsheet</h2><p>Copy the rows in Excel or Google Sheets (with the heading row) and paste them here, or pick a CSV file.</p>" +
        '<textarea class="ed-input" rows="5" data-paste placeholder="Name&#9;Address&#9;Category&#10;Main Street Market&#9;100 Main St&#9;Food"></textarea><div class="ed-btnrow"><label class="ed-btn">Pick a CSV File<input type="file" accept=".csv,.tsv,.txt,text/csv" data-file hidden></label><button type="button" class="ed-btn" data-read="1">Read It</button></div>' +
        (head.length ? "<h3>Which Column Is Which</h3><div class=\"ed-grid2\">" + FIELDS.map(([k, label]) => '<label class="ed-field"><span class="ed-label">' + label + (k === "NAME" ? " (Needed)" : "") + '</span><select class="ed-input" data-map="' + k + '"><option value="">Not in the Sheet</option>' + head.map((h, i) => '<option value="' + i + '"' + (map[k] === i ? " selected" : "") + ">" + esc(h || "Column " + (i + 1)) + "</option>").join("") + "</select></label>").join("") + "</div>" +
          (map.CATEGORY == null ? '<label class="ed-field"><span class="ed-label">Category for Every Row</span><select class="ed-input" data-catall><option value="">None</option>' + [...ED.data.cats.values()].map(c => '<option value="' + esc(c.CODE) + '"' + (catAll === c.CODE ? " selected" : "") + ">" + esc(c.LABEL || c.CODE) + "</option>").join("") + "</select></label>" : '<p class="ed-note">Category names that don\'t exist yet become new categories.</p>') +
          (map.ADDRESS != null ? '<label class="ed-toggle"><input type="checkbox" data-geo' + (geocode ? " checked" : "") + '><span class="ed-switch"></span><span class="ed-tl"><b>Find Locations From the Addresses</b><small>For rows without a latitude and longitude. About one per second, using OpenStreetMap.</small></span></label>' : "") +
          "<h3>First Rows</h3><table class=\"ed-table\"><tr>" + FIELDS.filter(([k]) => map[k] != null).map(([, l]) => "<th>" + l + "</th>").join("") + "</tr>" + data.slice(0, 5).map(r => "<tr>" + FIELDS.filter(([k]) => map[k] != null).map(([k]) => "<td>" + esc(r[map[k]] || "") + "</td>").join("") + "</tr>").join("") + "</table>" +
          '<p class="ed-note">' + data.length + " rows.</p>" : "") +
        '<div class="ed-prog" hidden><div class="pp-bar"><span></span></div><small></small></div><div class="ed-btnrow end"><button type="button" class="ed-btn ed-primary" data-go="1"' + (head.length && map.NAME != null ? "" : " disabled") + ">Add These Places</button></div>";
    };
    const show = () => ED.modal(body(), (m, close) => {
      const q = sel => m.querySelector(sel);
      const take = text => { rows = readRows(text); head = rows[0] || []; guess(); close(); show(); };
      q("[data-read]").addEventListener("click", () => take(q("[data-paste]").value));
      q("[data-file]").addEventListener("change", e => { const f = e.target.files[0]; if (f) f.text().then(take); });
      m.querySelectorAll("[data-map]").forEach(s => s.addEventListener("change", () => { if (s.value === "") delete map[s.dataset.map]; else map[s.dataset.map] = +s.value; close(); show(); }));
      const ca = q("[data-catall]"); if (ca) ca.addEventListener("change", () => { catAll = ca.value; });
      const geo = q("[data-geo]"); if (geo) geo.addEventListener("change", () => { geocode = geo.checked; });
      q("[data-go]").addEventListener("click", async e => {
        e.target.disabled = true;
        const prog = q(".ed-prog"), bar = prog.querySelector("span"), msg = prog.querySelector("small"); prog.hidden = false;
        const data = rows.slice(1).filter(r => String(r[map.NAME] || "").trim());
        const cell = (r, k) => map[k] == null ? "" : String(r[map[k]] == null ? "" : r[map[k]]).trim();
        // categories by name: an existing one, or a new one
        const catFor = new Map(); const newCats = [];
        if (map.CATEGORY != null) data.forEach(r => {
          const v = cell(r, "CATEGORY"); if (!v || catFor.has(v.toLowerCase())) return;
          const hit = [...ED.data.cats.values()].find(c => c.CODE.toLowerCase() === v.toLowerCase() || String(c.LABEL || "").toLowerCase() === v.toLowerCase());
          if (hit) catFor.set(v.toLowerCase(), hit.CODE);
          else { let code = v.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6) || "CAT"; while (ED.data.cats.has(code) || newCats.some(c => c.CODE === code)) code = code.slice(0, 5) + Math.floor(Math.random() * 9); newCats.push({ CODE: code, LABEL: v }); catFor.set(v.toLowerCase(), code); }
        });
        const out = [];
        for (let i = 0; i < data.length; i++) {
          const r = data[i], row = { KIND: "place", NAME: cell(r, "NAME") };
          FIELDS.forEach(([k]) => { if (k !== "NAME" && k !== "CATEGORY" && k !== "LAT" && k !== "LONG") row[k] = cell(r, k); });
          row.CATEGORY = map.CATEGORY != null ? (catFor.get(cell(r, "CATEGORY").toLowerCase()) || "") : catAll;
          let lat = parseFloat(cell(r, "LAT")), lng = parseFloat(cell(r, "LONG"));
          if ((!isFinite(lat) || !isFinite(lng)) && geocode && row.ADDRESS) {
            msg.textContent = "Finding " + row.NAME + " (" + (i + 1) + " of " + data.length + ")…"; bar.style.width = Math.round(100 * i / data.length) + "%";
            try { const res = await (await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(row.ADDRESS))).json(); if (res[0]) { lat = +res[0].lat; lng = +res[0].lon; } } catch (err) { /* left without a location */ }
            await new Promise(res => setTimeout(res, 1100));        // OpenStreetMap asks for no more than one search a second
          }
          if (isFinite(lat) && isFinite(lng)) { row.LAT = lat.toFixed(6); row.LONG = lng.toFixed(6); }
          out.push(row);
        }
        const palette = ["#1D4ED8", "#C2410C", "#7C3AED", "#15803D", "#B45309", "#BE185D", "#0E7490", "#4D7C0F"];
        if (newCats.length) ED.change("categories.csv", f => newCats.forEach((c, k) => f.rows.push(Object.assign(Object.fromEntries(f.cols.map(x => [x, ""])), c, { COLOR: palette[(f.rows.length + k) % palette.length], SHAPE: "circle" }))), "new categories");
        ED.change("items.csv", f => out.forEach(row => { row.ID = ED.newId("PL"); f.rows.push(Object.assign(Object.fromEntries(f.cols.map(c => [c, ""])), row)); ED.data = ED.data; }), "brought in " + out.length + " places");
        const noLoc = out.filter(r => !r.LAT).length;
        close(); ED.rerender(); ED.fitAll(true);
        ED.toast("Added " + out.length + " places" + (newCats.length ? " and " + newCats.length + " categories" : "") + "." + (noLoc ? " " + noLoc + " have no location yet: open each and use Place It on the Map." : ""), 7000);
      });
    }, { wide: true });
    show();
  }

  /* ---------- adding ---------- */
  function startAdd(kind, partOf) {
    ED.closeInspector();
    const t = kind === "story" ? "Story" : kind === "photospot" ? "Photo Spot" : "Place";
    ED.setMode({
      title: "Tap the map where the new " + t + " goes.", text: partOf ? "It will be part of " + (ED.data.byId.get(partOf).NAME || partOf) + "." : "You can drag it later to fine-tune.",
      doneText: "Cancel",
      extra: kind === "story" ? '<button type="button" class="ed-btn" data-noloc="1">No Location (Tour Only)</button>' : "",
      wire: box => { const b = box.querySelector("[data-noloc]"); if (b) b.addEventListener("click", () => { ED.setMode(null); create(kind, null, partOf); }); },
      onMapClick: ll => { ED.setMode(null); create(kind, ll, partOf); }
    });
  }
  function create(kind, ll, partOf) {
    const id = ED.newId(kind === "story" ? "ST" : kind === "photospot" ? "SPOT" : "PL");
    const g = partOf && ED.data.byId.get(partOf);
    const row = { ID: id, KIND: kind, NAME: kind === "story" ? "New Story" : kind === "photospot" ? "New Photo Spot" : "New Place", PART_OF: partOf || "", CATEGORY: g ? g.CATEGORY : (kind === "place" && ED.data.cats.size === 1 ? [...ED.data.cats.keys()][0] : "") };
    if (ll) { row.LAT = ll[1].toFixed(6); row.LONG = ll[0].toFixed(6); }
    ED.change("items.csv", f => f.rows.push(Object.assign(Object.fromEntries(f.cols.map(c => [c, ""])), row)), "added " + row.NAME);
    ED.rerender();
    selectItem(ED.data.byId.get(id));
    setTimeout(() => { const n = document.querySelector('#edInsp input[data-k="NAME"]'); if (n) { n.focus(); n.select(); } }, 50);
  }

  /* ---------- the inspector for one item ---------- */
  function selectItem(it, fly) {
    if (!it) return;
    ED.selected = it;
    if (fly) ED.flyTo(it);
    const id = it.ID;
    ED.inspect(box => { const cur = ED.data.byId.get(id); if (cur) ED.selected = cur; inspector(box, cur || it); });      // looked up again each time, so Undo can't leave it stale
    ED.refreshMarkers();
    ED.rerender();
  }
  const set = (it, k, v, label) => { ED.change("items.csv", () => { it[k] = v; }, label || (it.NAME || it.ID)); };
  function inspector(box, it) {
    const D = ED.data;
    if (!D.items.includes(it)) { ED.closeInspector(); return; }
    const grp = isGroup(it);
    const top = h("div", "ed-insp-top", '<span class="ed-kind">' + esc(grp ? "Group" : kindName(it.KIND)) + '</span><button type="button" class="ed-x" aria-label="Close">✕</button>');
    top.querySelector(".ed-x").addEventListener("click", () => { ED.closeInspector(); ED.rerender(); });
    box.appendChild(top);
    const name = ui.text(box, "Name", it.NAME, v => { set(it, "NAME", v); ED.rerender(); });
    name.dataset.k = "NAME";
    ui.select(box, "Kind", it.KIND || "place", KINDS, v => { set(it, "KIND", v); ED.rerenderInspector(); ED.rerender(); }, "Places are the main markers. Photo Spots show a camera; Stories show a sparkle.");
    const catOpts = [["", "None"]].concat([...D.cats.values()].map(c => [c.CODE, c.LABEL || c.CODE]), [["__new", "+ New Category…"]]);
    ui.select(box, "Category", it.CATEGORY, catOpts, v => { if (v === "__new") { newCategory(it); return; } set(it, "CATEGORY", v); ED.rerender(); });
    if (!grp) {
      const groups = D.items.filter(x => x !== it && !x.PART_OF && (x.KIND || "place") === "place").map(x => [x.ID, x.NAME || x.ID, isGroup(x) ? "Group" : "Place"]);
      ui.picker(box, "Part Of", it.PART_OF, groups, v => { set(it, "PART_OF", v, (it.NAME || it.ID) + " group"); ED.rerender(); ED.rerenderInspector(); }, "Pick a group (or any place, to make it a group). Leave it empty to stand alone.", { none: "None" });
    }
    // location
    const loc = h("div", "ed-loc");
    loc.innerHTML = hasPos(it) ? '<p class="ed-note">Drag the marker on the map to move it.</p>' : '<p class="ed-note' + (it.KIND === "story" ? "" : " warn") + '">' + (it.KIND === "story" ? "No location: this story only appears inside a tour." : "No location yet, so it isn't on the map.") + "</p>";
    box.appendChild(loc);
    ui.buttons(box, [hasPos(it) ? { text: "Show on Map", onClick: () => ED.flyTo(it) } : null, { text: hasPos(it) ? "Move by Tapping" : "Place It on the Map", onClick: () => ED.setMode({ title: "Tap where " + (it.NAME || "it") + " goes.", doneText: "Cancel", onMapClick: ll => { ED.setMode(null); ED.change("items.csv", () => { it.LAT = ll[1].toFixed(6); it.LONG = ll[0].toFixed(6); }, "moved " + it.NAME); ED.rerenderInspector(); } }) },
      it.KIND === "story" && hasPos(it) ? { text: "Remove Location", onClick: () => { ED.change("items.csv", () => { it.LAT = ""; it.LONG = ""; }, "location"); ED.rerenderInspector(); } } : null]);

    // groups
    if (grp) groupSection(box, it);
    else if ((it.KIND || "place") === "place" && !it.PART_OF) ui.buttons(box, [{ text: "Make This a Group", onClick: () => addMembers(it, true), title: "A group is one marker that opens to show the places in it." }]);

    mediaSection(box, it);
    detailsSection(box, it);

    const end = ui.section(box, "Copy or Remove", { open: false });
    ui.buttons(end, [{ text: "Duplicate", onClick: () => duplicate(it) }, { text: "Delete…", danger: true, onClick: () => remove(it) }]);
    ui.note(end, "ID: " + it.ID + ". Links and QR codes use this, so it never changes.");
  }

  function groupSection(box, g) {
    const D = ED.data, ms = members(g);
    const sec = ui.section(box, "Members (" + ms.length + ")");
    const list = h("div", "ed-list");
    list.innerHTML = ms.map(m => '<div class="ed-row"><span class="ed-dot" style="background:' + esc(ED.colorFor(m)) + '"></span><span class="ed-rt"><b>' + esc(m.NAME || m.ID) + '</b></span><button type="button" class="ed-btn ed-small" data-open="' + esc(m.ID) + '">Edit</button><button type="button" class="ed-x" data-out="' + esc(m.ID) + '" aria-label="Take ' + esc(m.NAME) + ' out of the group">✕</button></div>').join("");
    list.querySelectorAll("[data-open]").forEach(b => b.addEventListener("click", () => selectItem(D.byId.get(b.dataset.open), true)));
    list.querySelectorAll("[data-out]").forEach(b => b.addEventListener("click", () => { const m = D.byId.get(b.dataset.out); set(m, "PART_OF", "", "took " + m.NAME + " out of " + g.NAME); ED.rerenderInspector(); ED.rerender(); }));
    sec.appendChild(list);
    ui.buttons(sec, [{ text: "Add Places", primary: true, onClick: () => addMembers(g) }, { text: "+ New Place in This Group", onClick: () => startAdd("place", g.ID) }]);
    ui.select(sec, "Group Shape", g.SHAPE, shapeOptions("Site Default"), v => set(g, "SHAPE", v, "group shape"), "The marker shape for this group. Site Default comes from the Look panel. Hand-drawn shapes are made in Tools.");
    ui.select(sec, "Show Members", g.SHOW_MEMBERS, [["", "Site Default"], ["tap", "When Tapped"], ["always", "Always, When Zoomed In"]], v => set(g, "SHOW_MEMBERS", v, "show members"));
  }
  // "Add Places": tap markers to put them in the group or take them out
  let boxing = false, boxFirst = null;
  function addMembers(g, makeNew) {
    boxing = false; boxFirst = null;
    const picked = new Set(members(g).map(m => m.ID));
    const paint = () => { const m = ED.mode(); if (m) { m.picked = picked; ED.refreshMarkers(); const c = document.querySelector("#edMode .em-count"); if (c) c.textContent = picked.size + " in the group"; } };
    ED.setMode({
      title: "Adding places to " + (g.NAME || g.ID) + ".", text: "Tap markers to add or remove them. Tap the map to add a new place to the group.",
      extra: '<span class="ed-pill em-count">' + picked.size + ' in the group</span><button type="button" class="ed-btn" data-box="1">Draw a Box</button>', picked,
      wire: box => box.querySelector("[data-box]").addEventListener("click", () => { boxFirst = null; boxing = true; ED.toast("Tap one corner of the box, then the opposite corner. Every place inside joins the group."); }),
      dim: x => x !== g && !x.PART_OF || x.PART_OF === g.ID || x === g,
      onMarkerClick: m => {
        if (m === g) return;
        if (isGroup(m)) { ED.toast(m.NAME + " is a group itself. Groups only go one level deep."); return; }
        if (m.PART_OF && m.PART_OF !== g.ID) { ED.toast(m.NAME + " is in another group. It moves here."); }
        const inIt = m.PART_OF === g.ID;
        ED.change("items.csv", () => { m.PART_OF = inIt ? "" : g.ID; }, (inIt ? "removed " : "added ") + m.NAME);
        inIt ? picked.delete(m.ID) : picked.add(m.ID);
        paint(); ED.rerender();
      },
      onMapClick: ll => {
        if (boxing) {
          if (!boxFirst) { boxFirst = ll; ED.toast("Now tap the opposite corner."); return; }
          const w = Math.min(boxFirst[0], ll[0]), e = Math.max(boxFirst[0], ll[0]), s = Math.min(boxFirst[1], ll[1]), n = Math.max(boxFirst[1], ll[1]);
          boxing = false; boxFirst = null;
          const inside = ED.data.items.filter(x => x !== g && !isGroup(x) && x.PART_OF !== g.ID && hasPos(x) && +x.LONG >= w && +x.LONG <= e && +x.LAT >= s && +x.LAT <= n);
          if (!inside.length) { ED.toast("No places inside that box."); return; }
          ED.change("items.csv", () => inside.forEach(x => { x.PART_OF = g.ID; }), "added " + inside.length + " places to " + g.NAME);
          inside.forEach(x => picked.add(x.ID)); paint(); ED.rerender(); ED.toast("Added " + inside.length + " places.");
          return;
        }
        ED.setMode(null); create("place", ll, g.ID);
      },
      onDone: () => { selectItem(g); if (makeNew && !members(g).length) ED.toast("A group needs at least one place. Add some with Add Places."); }
    });
    paint();
  }

  /* ---------- photos, audio and video ---------- */
  function mediaSection(box, it) {
    const D = ED.data;
    const rows = D.media.filter(m => m.ITEM_ID === it.ID).sort((a, b) => (+a.ORDER || 999) - (+b.ORDER || 999));
    const photos = rows.filter(m => (m.KIND || "photo").toLowerCase() === "photo"), other = rows.filter(m => (m.KIND || "photo").toLowerCase() !== "photo");
    const sec = ui.section(box, "Photos" + (photos.length ? " (" + photos.length + ")" : ""));
    if (photos.length) ui.note(sec, "The first photo is the cover" + ((it.KIND || "place") === "place" ? " and the marker" : "") + ". Use ↑ to change the order.");
    photos.forEach((m, i) => sec.appendChild(mediaRow(it, m, i, photos)));
    ui.file(sec, "Drop Photos Here", "image/*", files => addPhotos(it, files), "or tap to choose. They're shrunk on this device before uploading.", true);
    const sec2 = ui.section(box, "Audio and Video" + (other.length ? " (" + other.length + ")" : ""), { open: other.length > 0 });
    other.forEach((m, i) => sec2.appendChild(mediaRow(it, m, i, other)));
    ui.file(sec2, "Drop an Audio Clip Here", "audio/*", files => addAudio(it, files), "MP3 or M4A. Nothing plays or downloads until a visitor presses play.");
    const yt = h("div", "ed-pick-row"); yt.innerHTML = '<input class="ed-input" placeholder="Paste a YouTube link" aria-label="YouTube link"><button type="button" class="ed-btn">Add Video</button>';
    yt.querySelector("button").addEventListener("click", () => {
      const v = yt.querySelector("input").value.trim();
      if (!/(youtu\.be\/|youtube\.com\/)/.test(v) && !/^[\w-]{11}$/.test(v)) { ED.toast("That doesn't look like a YouTube link."); return; }
      addMedia(it, { KIND: "video", FILE: v, CAPTION: "" }); ED.rerenderInspector();
    });
    sec2.appendChild(yt);
  }
  function mediaRow(it, m, i, list) {
    const isPhoto = (m.KIND || "photo").toLowerCase() === "photo";
    const row = h("div", "ed-media");
    const thumb = isPhoto ? '<img src="' + esc(ED.mediaSrc(m.THUMB || m.FILE)) + '" alt="">' : '<span class="ed-mtype">' + (/video/i.test(m.KIND) ? "VIDEO" : "AUDIO") + "</span>";
    row.innerHTML = thumb + '<div class="mi"><input data-k="CAPTION" placeholder="Caption" value="' + esc(m.CAPTION) + '"><input data-k="CREDIT" placeholder="Credit (who took it, or where it\'s from)" value="' + esc(m.CREDIT) + '">' +
      (isPhoto ? "" : '<input data-k="TRANSCRIPT" placeholder="Transcript (shown under the player)" value="' + esc(m.TRANSCRIPT) + '">') +
      "<small>" + esc(m.FILE) + (m.ANIMATION ? " · animated" : "") + "</small></div>" +
      (i ? '<button type="button" class="ed-btn" data-up="1" aria-label="Move up">↑</button>' : "") + '<button type="button" class="ed-btn" data-more="1" aria-label="More">⋯</button><button type="button" class="ed-btn ed-danger" data-x="1" aria-label="Remove">✕</button>';
    row.querySelectorAll("input[data-k]").forEach(inp => inp.addEventListener("change", () => ED.change("media.csv", () => { m[inp.dataset.k] = inp.value; }, "caption")));
    const up = row.querySelector("[data-up]");
    if (up) up.addEventListener("click", () => { ED.change("media.csv", () => { const prev = list[i - 1]; list.forEach((x, k) => { x.ORDER = String(k + 1); }); prev.ORDER = String(i + 1); m.ORDER = String(i); }, "order"); ED.rerenderInspector(); });
    row.querySelector("[data-x]").addEventListener("click", () => { ED.change("media.csv", f => { f.rows.splice(f.rows.indexOf(m), 1); }, "removed " + m.FILE); ED.rerenderInspector(); ED.toast("Removed from this item. The file itself stays on the website, in case it's used elsewhere."); });
    row.querySelector("[data-more]").addEventListener("click", () => mediaMore(it, m, isPhoto));
    return row;
  }
  function mediaMore(it, m, isPhoto) {
    ED.modal("<h2>" + esc(m.CAPTION || m.FILE) + "</h2>" +
      (isPhoto ? '<p class="ed-note">An animation (a short MP4 or WebM clip) plays once when the card opens, then rests on the photo.</p><div data-anim></div>' : "") +
      '<label class="ed-field"><span class="ed-label">File</span><input class="ed-input" data-file value="' + esc(m.FILE) + '"><small class="ed-help">A photo path can be typed to reuse a photo that\'s already on the site.</small></label>' +
      (!isPhoto ? '<label class="ed-field"><span class="ed-label">Length in Seconds</span><input class="ed-input" type="number" data-sec value="' + esc(m.SECONDS) + '"></label>' : "") +
      '<div class="ed-btnrow end"><button type="button" class="ed-btn ed-primary" data-ok="1">Done</button></div>', (box, close) => {
      if (isPhoto) {
        const a = box.querySelector("[data-anim]");
        ui.file(a, m.ANIMATION ? "Replace the Animation" : "Add an Animation", "video/mp4,video/webm", files => {
          const f = files[0], name = ED.fileName((m.FILE || "clip").replace(/\.[^.]+$/, "") + "-anim", (f.name.split(".").pop() || "mp4").toLowerCase());
          ED.addPending(ED.mediaDir() + name, f); ED.change("media.csv", () => { m.ANIMATION = name; }, "animation"); close(); ED.rerenderInspector();
        }, m.ANIMATION ? "Now: " + m.ANIMATION : "Keep it short and small (under 2 MB).");
        if (m.ANIMATION) ui.buttons(a, [{ text: "Remove the Animation", onClick: () => { ED.change("media.csv", () => { m.ANIMATION = ""; }, "animation"); close(); ED.rerenderInspector(); } }]);
      }
      box.querySelector("[data-ok]").addEventListener("click", () => {
        const file = box.querySelector("[data-file]").value.trim(), sec = box.querySelector("[data-sec]");
        ED.change("media.csv", () => { m.FILE = file; if (sec) m.SECONDS = sec.value; }, "media"); close(); ED.rerenderInspector();
      });
    });
  }
  function addMedia(it, row) {
    ED.change("media.csv", f => {
      const n = f.rows.filter(m => m.ITEM_ID === it.ID).length;
      f.rows.push(Object.assign(Object.fromEntries(f.cols.map(c => [c, ""])), { ITEM_ID: it.ID, ORDER: String(n + 1) }, row));
    }, "added media to " + it.NAME);
  }
  async function addPhotos(it, files) {
    for (const file of files) {
      if (!/^image\//.test(file.type)) { ED.toast(file.name + " isn't a picture."); continue; }
      try {
        ED.toast("Shrinking " + file.name + "…");
        const r = await ED.shrinkPhoto(file, 1600, 200);
        const name = ED.fileName((it.NAME || it.ID) + "", r.ext);
        ED.addPending(ED.mediaDir() + name, r.main);
        ED.addPending(ED.mediaDir() + "thumbs/" + name, r.thumb);
        addMedia(it, { KIND: "photo", FILE: name, THUMB: "thumbs/" + name, CAPTION: "" });
        ED.toast("Added " + name + " (" + Math.round(r.main.size / 1024) + " KB).");
      } catch (e) { ED.toast(e.message); }
    }
    ED.rerenderInspector();
  }
  function addAudio(it, files) {
    const f = files[0]; if (!f) return;
    if (f.size > 15 * 1024 * 1024) { ED.toast("That clip is over 15 MB. Shorten it or save it at a lower quality first."); return; }
    const name = ED.fileName((it.NAME || it.ID) + "-audio", (f.name.split(".").pop() || "mp3").toLowerCase());
    ED.addPending(ED.mediaDir() + name, f);
    const a = new Audio(); a.src = URL.createObjectURL(f);
    a.addEventListener("loadedmetadata", () => { const row = ED.data.media.find(m => m.FILE === name); if (row && isFinite(a.duration)) ED.change("media.csv", () => { row.SECONDS = String(Math.round(a.duration)); }, "audio length"); });
    addMedia(it, { KIND: "audio", FILE: name, CAPTION: "" });
    ED.rerenderInspector();
  }

  /* ---------- everything else about an item ---------- */
  function detailsSection(box, it) {
    const kind = it.KIND || "place";
    const sec = ui.section(box, "More Details: Text, Website, Hours, Check-In", { open: false });
    const t = (label, k, help, opts) => ui.text(sec, label, it[k], v => set(it, k, v, label.toLowerCase()), help, opts);
    t("Text", "TEXT", "The main description on the card. Leave a blank line between paragraphs.", { multi: true, rows: 6 });
    t("Short Preview", "BLURB", "One or two sentences used in the welcome showcase and tour stops. Blank = the first sentence of the text.", { multi: true, rows: 2 });
    t("Other Names", "OTHER_NAMES", "Shown as Also Known As, and found by search.");
    if (kind === "place") { t("Address", "ADDRESS"); t("Website", "WEBSITE", "", { placeholder: "example.org" }); t("Phone", "PHONE"); t("Hours", "HOURS", "", { placeholder: "Sat 8 AM – 1 PM" }); t("Organization", "ORG", "Who runs it, if that helps visitors."); }
    const yr = h("div", "ed-grid2"); sec.appendChild(yr);
    ui.text(yr, "Year Opened", it.YEAR_START, v => set(it, "YEAR_START", v, "year"), "", { placeholder: "1888" });
    ui.text(yr, "Year Closed", it.YEAR_END, v => set(it, "YEAR_END", v, "year"), "", { placeholder: "blank if still here" });
    t("Source", "SOURCE", "Where the information comes from.");
    if (kind === "story") { const sr = h("div", "ed-grid2"); sec.appendChild(sr); ui.text(sr, "Series", it.SERIES, v => set(it, "SERIES", v, "series"), "Stories with the same series name link to each other."); ui.number(sr, "Order in the Series", it.ORDER, v => set(it, "ORDER", v, "order")); }
    if (kind !== "place") ui.select(sec, "Marker Effect", it.EFFECT, [["", "None"], ["twinkle", "Twinkle"], ["ripple", "Ripple"], ["flash", "Flash"], ["bob", "Bob"]], v => set(it, "EFFECT", v, "effect"), "A gentle animation to draw the eye. It stops when a visitor has Reduce Motion on.");
    iconPicker(sec, "Icon", it.ICON, v => { set(it, "ICON", v, "icon"); }, "Blank = the category's icon.");
    ui.color(sec, "Marker Color", it.ICON_COLOR, v => set(it, "ICON_COLOR", v, "color"), "Blank = the category's color.");
    // passport and check-in
    const ps = ui.section(box, "Passport and Check-In", { open: false });
    ui.toggle(ps, "A Place to Find", ED.yes(it.MAJOR), on => set(it, "MAJOR", on ? "yes" : "", "passport"), "Shows in the passport's Places to Find. If no place is marked, every main place counts.");
    ui.select(ps, "How the Stamp Is Collected", it.CHECKIN, [["", "Opening Its Card"], ["scan", "Scanning Its QR Sign"], ["near", "Being Near It"], ["none", "No Stamp"]], v => { set(it, "CHECKIN", v, "check-in"); ED.rerenderInspector(); });
    ui.number(ps, "Near Means Within (Meters)", it.RADIUS, v => set(it, "RADIUS", v, "radius"), "Also makes Near Me say \"You're at…\" when a visitor walks this close. Blank = 75 meters for check-in, and no alert.");
    // inside a building
    const ins = ui.section(box, "Inside This Place", { open: !!it.INSIDE || !!it.FLOOR });
    const folders = ED.interiorFolders();
    ui.select(ins, "Step Inside Opens", it.INSIDE, [["", "Nothing"]].concat(folders.map(f => [f, f])).concat([["__new", "+ Make an Interior…"]]), v => { if (v === "__new") makeInterior(it); else set(it, "INSIDE", v, "step inside"); }, "An interior is its own little map with a floor plan, made in its own folder.");
    if (it.INSIDE) ui.buttons(ins, [{ text: "Design the Interior", onClick: () => { location.href = "edit.html?" + new URLSearchParams(Object.assign(ED.SAMPLE ? { sample: ED.SAMPLE } : {}, { event: it.INSIDE, panel: "map" })).toString(); } }]);
    const bd = ED.data.map && ED.data.map.backdrop;
    if (bd && (bd.floors || []).length > 1) ui.select(ins, "Floor", it.FLOOR, [["", "Every Floor"]].concat(bd.floors.map(f => [f.id, f.name])), v => set(it, "FLOOR", v, "floor"));
    const more = ui.section(box, "Notes", { open: !!it.STAFF_NOTE });
    ui.text(more, "Staff Note", it.STAFF_NOTE, v => set(it, "STAFF_NOTE", v, "staff note"), "Only curators see this. Visitors never do.", { multi: true, rows: 3 });
    ui.text(more, "Share a Memory Link", it.MEMORY_LINK, v => set(it, "MEMORY_LINK", v, "memory link"), "Blank = the site's link from the Look panel. Type no to hide it on this card.");
  }
  ED.interiorFolders = () => [...new Set(ED.data.items.map(i => i.INSIDE).concat(ED.data.happenings.filter(r => String(r.KIND).toLowerCase() === "interior").map(r => r.FOLDER)).filter(Boolean).map(s => s.toLowerCase()))];
  function makeInterior(it) {
    const name = ED.slug(it.NAME || it.ID) || ED.slug(it.ID);
    ED.newFolder(name, it.NAME || name, "interior");
    set(it, "INSIDE", name, "step inside");
    ED.rerenderInspector();
    ED.toast("Made the interior folder " + name + ". Use Design the Interior to add its floor plan and rooms.", 5000);
  }
  // A new event or interior folder: only event.json and the files that differ
  ED.newFolder = function (name, title, kind) {
    const dir = ED.BASE + "events/" + name + "/";
    const enc = (cols, rows) => ED.toCSV(cols, rows);
    const files = kind === "interior" ? ["items.csv", "categories.csv", "media.csv", "map.json", "site.csv"] : ["site.csv"];
    ED.addExtraFile(dir + "event.json", JSON.stringify({ title, kind, overrides: files }, null, 2) + "\n");
    if (kind === "interior") {
      ED.addExtraFile(dir + "data/items.csv", enc(["ID", "KIND", "PART_OF", "NAME", "LAT", "LONG", "CATEGORY", "TEXT", "FLOOR"], []));
      ED.addExtraFile(dir + "data/categories.csv", enc(["CODE", "LABEL", "COLOR", "ICON", "SHAPE", "FILL", "FILL_COLOR", "FILL_COLOR2", "RANKED"], [{ CODE: "ROOM", LABEL: "Rooms", COLOR: "#1D4ED8", ICON: "generic", SHAPE: "square" }]));
      ED.addExtraFile(dir + "data/media.csv", enc(["ITEM_ID", "ORDER", "KIND", "FILE", "THUMB", "CAPTION", "CREDIT", "TRANSCRIPT", "SECONDS", "ANIMATION"], []));
      ED.addExtraFile(dir + "data/map.json", JSON.stringify({ outline: null, overlays: [], backdrop: null }, null, 2) + "\n");
      ED.addExtraFile(dir + "data/site.csv", enc(["KEY", "VALUE"], [["PLACE", title], ["WELCOME", "no"], ["PASSPORT", "no"], ["FIT_TO_MARKERS", "no"], ["CENTER_LAT", ""], ["CENTER_LNG", ""], ["BOUNDS_WEST", ""], ["BOUNDS_SOUTH", ""], ["BOUNDS_EAST", ""], ["BOUNDS_NORTH", ""], ["MIN_ZOOM", ""], ["MAX_ZOOM", ""]].map(([k, v]) => ({ KEY: k, VALUE: v }))));
    } else ED.addExtraFile(dir + "data/site.csv", enc(["KEY", "VALUE"], [{ KEY: "EVENT_TITLE", VALUE: title }]));
  };

  function iconPicker(parent, label, value, onChange, help) {
    const icons = (ED.data.icons && ED.data.icons.icons) || {};
    const w = h("div", "ed-iconpick");
    w.innerHTML = '<button type="button" class="ed-ic' + (!value ? " on" : "") + '" data-ic="" title="None">—</button>' + Object.keys(icons).map(k => '<button type="button" class="ed-ic' + (value === k ? " on" : "") + '" data-ic="' + esc(k) + '" title="' + esc(icons[k].label || k) + '"><img src="' + ED.iconUrl(k, 36) + '" alt="' + esc(icons[k].label || k) + '"></button>').join("");
    w.querySelectorAll("[data-ic]").forEach(b => b.addEventListener("click", () => { w.querySelectorAll(".ed-ic").forEach(x => x.classList.toggle("on", x === b)); onChange(b.dataset.ic); }));
    ui.field(parent, label, w, (help || "") + " Add your own icons in Tools.");
  }
  ED.iconPicker = iconPicker;

  /* ---------- copy and delete ---------- */
  function duplicate(it) {
    const id = ED.newId(it.KIND === "story" ? "ST" : it.KIND === "photospot" ? "SPOT" : "PL");
    ED.change("items.csv", f => {
      const copy = Object.assign({}, it, { ID: id, NAME: (it.NAME || "") + " (Copy)" });
      if (hasPos(it)) { copy.LAT = (parseFloat(it.LAT) + 0.0002).toFixed(6); copy.LONG = (parseFloat(it.LONG) + 0.0002).toFixed(6); }
      f.rows.splice(f.rows.indexOf(it) + 1, 0, copy);
    }, "duplicated " + it.NAME);
    selectItem(ED.data.byId.get(id));
  }
  function uses(id) {
    const D = ED.data, out = [];
    ((D.routes && D.routes.features) || []).forEach(f => { if ((f.properties.STOPS || []).some(s => s.ITEM === id)) out.push("tour " + (f.properties.TITLE || f.properties.ID)); });
    D.happenings.forEach(r => { if (String(r.FEATURES || "").split("|").includes(id)) out.push("happening " + r.NAME); });
    D.passport.forEach(r => { if (r.TARGET === id || String(r.NEEDS || "").split("|").includes(id)) out.push("passport " + (r.TITLE || r.ID)); });
    return out;
  }
  function remove(it) {
    const used = uses(it.ID), ms = members(it);
    const warnTxt = used.length ? " It's used by " + used.join(", ") + ", which will be updated." : "";
    const doDelete = alsoMembers => {
      ED.change("items.csv", f => {
        const gone = new Set([it.ID].concat(alsoMembers ? ms.map(m => m.ID) : []));
        f.rows = f.rows.filter(r => !gone.has(r.ID));
        f.rows.forEach(r => { if (gone.has(r.PART_OF)) r.PART_OF = ""; });
      }, "deleted " + it.NAME);
      const gone = new Set([it.ID].concat(alsoMembers ? ms.map(m => m.ID) : []));
      if (ED.data.media.some(m => gone.has(m.ITEM_ID))) ED.change("media.csv", f => { f.rows = f.rows.filter(m => !gone.has(m.ITEM_ID)); }, "media of " + it.NAME);
      if (((ED.data.routes && ED.data.routes.features) || []).some(f => (f.properties.STOPS || []).some(s => gone.has(s.ITEM)))) ED.change("routes.geojson", f => { f.data.features.forEach(r => { r.properties.STOPS = (r.properties.STOPS || []).filter(s => !gone.has(s.ITEM)); }); }, "tour stops");
      if (ED.data.happenings.some(r => String(r.FEATURES || "").split("|").some(x => gone.has(x)))) ED.change("happenings.csv", f => { f.rows.forEach(r => { r.FEATURES = String(r.FEATURES || "").split("|").filter(x => x && !gone.has(x)).join("|"); }); }, "happenings");
      if (ED.data.passport.some(r => String(r.NEEDS || "").split("|").some(x => gone.has(x)) || gone.has(r.TARGET))) ED.change("passport.csv", f => { f.rows.forEach(r => { r.NEEDS = String(r.NEEDS || "").split("|").filter(x => x && !gone.has(x)).join("|"); if (gone.has(r.TARGET)) r.TARGET = ""; }); }, "passport");
      ED.closeInspector(); ED.rerender(); ED.toast("Deleted. Undo brings it back.");
    };
    if (ms.length) ED.modal("<h2>Delete the group " + esc(it.NAME) + "?</h2><p>It has " + ms.length + " places in it." + esc(warnTxt) + '</p><div class="ed-btnrow"><button type="button" class="ed-btn ed-primary" data-keep="1">Keep Its Places as Standalone Places</button><button type="button" class="ed-btn ed-danger" data-all="1">Delete Its Places Too</button></div>',
      (m, close) => { m.querySelector("[data-keep]").addEventListener("click", () => { close(); doDelete(false); }); m.querySelector("[data-all]").addEventListener("click", () => { close(); doDelete(true); }); });
    else ED.confirm("Delete " + (it.NAME || it.ID) + "?", "This takes it off the map." + warnTxt, "Delete", () => doDelete(false));
  }

  /* ---------- categories ---------- */
  function newCategory(forItem) {
    ED.modal('<h2>New Category</h2><label class="ed-field"><span class="ed-label">Name</span><input class="ed-input" data-n placeholder="Food and Drink"></label><div class="ed-btnrow end"><button type="button" class="ed-btn ed-primary" data-ok="1">Make It</button></div>', (m, close) => {
      const inp = m.querySelector("[data-n]"); inp.focus();
      const go = () => {
        const label = inp.value.trim(); if (!label) return;
        let code = label.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6) || "CAT";
        while (ED.data.cats.has(code)) code = code.slice(0, 5) + Math.floor(Math.random() * 9);
        const palette = ["#1D4ED8", "#C2410C", "#7C3AED", "#15803D", "#B45309", "#BE185D", "#0E7490", "#4D7C0F"];
        ED.change("categories.csv", f => f.rows.push(Object.assign(Object.fromEntries(f.cols.map(c => [c, ""])), { CODE: code, LABEL: label, COLOR: palette[f.rows.length % palette.length], SHAPE: "circle" })), "new category " + label);
        if (forItem) set(forItem, "CATEGORY", code, "category");
        close(); ED.rerender(); if (forItem) ED.rerenderInspector(); else editCategory(code);
      };
      m.querySelector("[data-ok]").addEventListener("click", go); inp.addEventListener("keydown", e => { if (e.key === "Enter") go(); });
    });
  }
  function editCategory(code) {
    ED.selected = null;
    ED.inspect(box => {
      const c = ED.data.cats.get(code); if (!c) { ED.closeInspector(); return; }
      const setc = (k, v) => { ED.change("categories.csv", () => { c[k] = v; }, "category " + (c.LABEL || c.CODE)); ED.rerender(); };
      const top = h("div", "ed-insp-top", '<span class="ed-kind">Category</span><button type="button" class="ed-x" aria-label="Close">✕</button>');
      top.querySelector(".ed-x").addEventListener("click", ED.closeInspector); box.appendChild(top);
      ui.text(box, "Name", c.LABEL, v => setc("LABEL", v), "Shown on its chip and in the legend. Code: " + c.CODE + ".");
      ui.color(box, "Color", c.COLOR, v => setc("COLOR", v));
      iconPicker(box, "Icon", c.ICON, v => setc("ICON", v));
      ui.select(box, "Marker Shape", c.SHAPE, shapeOptions("Circle"), v => setc("SHAPE", v), "Draw your own shape in Tools.");
      ui.select(box, "Fill (When a Place Has No Photo)", c.FILL, [["", "Icon on the Color"]].concat(PATTERNS.map(p => [p, title(p)])), v => { setc("FILL", v); ED.rerenderInspector(); }, "A color or pattern instead of the icon.");
      if (c.FILL) { const g = h("div", "ed-grid2"); box.appendChild(g); ui.color(g, "Fill Color", c.FILL_COLOR, v => setc("FILL_COLOR", v)); ui.color(g, "Pattern Color", c.FILL_COLOR2, v => setc("FILL_COLOR2", v)); }
      ui.toggle(box, "Ranked", ED.yes(c.RANKED), on => setc("RANKED", on ? "yes" : ""), "Passport ranks only count categories marked Ranked (when any are).");
      const n = ED.data.items.filter(i => i.CATEGORY === code).length;
      ui.buttons(box, [{ text: "Delete…", danger: true, onClick: () => {
        const others = [...ED.data.cats.values()].filter(x => x.CODE !== code);
        ED.modal("<h2>Delete " + esc(c.LABEL || code) + "?</h2><p>" + (n ? n + " items use it. Move them to:" : "Nothing uses it.") + "</p>" + (n ? '<select class="ed-input" data-to><option value="">No Category</option>' + others.map(o => '<option value="' + esc(o.CODE) + '">' + esc(o.LABEL || o.CODE) + "</option>").join("") + "</select>" : "") + '<div class="ed-btnrow end"><button type="button" class="ed-btn ed-danger" data-ok="1">Delete</button></div>', (m, close) => {
          m.querySelector("[data-ok]").addEventListener("click", () => {
            const to = m.querySelector("[data-to]") ? m.querySelector("[data-to]").value : "";
            if (n) ED.change("items.csv", f => f.rows.forEach(r => { if (r.CATEGORY === code) r.CATEGORY = to; }), "moved items");
            ED.change("categories.csv", f => { f.rows = f.rows.filter(r => r.CODE !== code); }, "deleted category");
            close(); ED.closeInspector(); ED.rerender();
          });
        });
      } }]);
    });
  }
  ED.editCategory = editCategory;

  ED.panel("items", { title: "Items", render, selectItem, onClose: () => ED.rerender() });
})();
