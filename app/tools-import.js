/* ETS Community Map: tools-import.js. Bring In Old ETS Data: pick the old site's folder and its files are turned into the
   9 new data files, with photos, audio and old maps carried over. The same rules as the converter used for the rebuild.
   Nothing changes until you press Use This Data, and nothing reaches the website until you Publish. */
(function () {
  "use strict";
  const ED = window.ETSEditor, { esc, ui, h } = ED;
  let report = null, result = null, files = null;

  const split = v => String(v || "").split("|").map(s => s.trim()).filter(Boolean);
  async function csv(name) { const f = files.get(name); if (!f) return null; const p = ED.parseCSV(await f.text()); return p.rows.map(r => { const o = {}; Object.keys(r).forEach(k => { o[k.trim()] = String(r[k] || "").trim(); }); return o; }).filter(r => Object.values(r).some(Boolean)); }
  async function json(name) { const f = files.get(name); if (!f) return null; try { return JSON.parse(await f.text()); } catch (e) { report.problems.push(name + " couldn't be read: " + e.message); return null; } }
  const has = name => files.has(name);

  async function convert(fileList) {
    report = { changed: [], problems: [], notes: [] };
    files = new Map();
    const paths = fileList.map(f => f.webkitRelativePath || f.name);        // a picked folder's files all start with its name: drop that part
    const first = paths[0] ? paths[0].split("/")[0] : "", dropTop = paths.length && paths.every(p => p.includes("/") && p.split("/")[0] === first);
    fileList.forEach((f, i) => files.set(dropTop ? paths[i].split("/").slice(1).join("/") : paths[i], f));
    const changed = m => report.changed.push(m), problem = m => { if (!report.problems.includes(m)) report.problems.push(m); };
    if (!has("site.csv") && !has("locations.csv") && !has("spots.csv")) throw new Error("That folder doesn't look like an old ETS site (no site.csv, locations.csv or spots.csv).");

    // site settings and reworded phrases
    const site = {}, order = [];
    (await csv("site.csv") || []).forEach(r => { if (r.KEY) { site[r.KEY] = r.VALUE || ""; order.push(r.KEY); } });
    (await csv("labels.csv") || []).forEach(r => { const k = r.KEY || r.LABEL; if (k) { site["LABEL." + k] = r.VALUE || r.TEXT || ""; order.push("LABEL." + k); } });

    // items
    const items = [];
    (await csv("locations.csv") || []).forEach(r => { const it = { ID: r.ID, KIND: "place", NAME: r.NAME, YEAR_START: r["EST."] || r.EST || "", LAT: r.LAT, LONG: r.LONG, TEXT: r.DETAILS, CATEGORY: r.CATEGORY, MAJOR: r.MAJOR, RADIUS: r.RADIUS, BLURB: r.BLURB, CHECKIN: r.CHECKIN, INSIDE: r.INSIDE, FLOOR: r.FLOOR, _PHOTO: r.PHOTO };
      if (r["USER NOTE"]) { it.STAFF_NOTE = r["USER NOTE"]; changed(it.ID + "'s USER NOTE moved to Staff Note (the map never showed it)."); } items.push(it); });
    (await csv("childmarkers.csv") || []).forEach(r => { const it = { ID: r.CHILD_ID, KIND: "place", PART_OF: r.PARENT_ID, NAME: r.NAME, OTHER_NAMES: r.HIST_NAMES, ADDRESS: r.ADDRESS, TEXT: r.DETAILS, LAT: r.LAT, LONG: r.LONG, CATEGORY: r.CATEGORY, MAJOR: r.MAJOR, RADIUS: r.RADIUS, BLURB: r.BLURB, CHECKIN: r.CHECKIN, INSIDE: r.INSIDE, FLOOR: r.FLOOR, _PHOTO: r.PHOTO };
      if (r.CONNECTION) { it.STAFF_NOTE = "Connection: " + r.CONNECTION; changed(it.ID + "'s CONNECTION moved to Staff Note."); } items.push(it); });
    (await csv("spots.csv") || []).forEach(r => { const kind = (r.KIND || "spot").toLowerCase(); items.push({ ID: r.SPOT_ID, KIND: kind === "story" ? "story" : "photospot", NAME: r.TITLE, LAT: r.LAT, LONG: r.LONG, YEAR_START: r.YEAR, TEXT: r.DETAILS, CREDIT: r.CREDIT, CATEGORY: r.CATEGORY, SERIES: r.SERIES, ORDER: r.ORDER, SOURCE: r.SOURCE, STAFF_NOTE: r.STAFF_NOTE, ICON: r.ICON, ICON_COLOR: r.ICON_COLOR, EFFECT: r.EFFECT, _PHOTO: r.PHOTO }); });
    if (items.length) changed("locations, child markers and spots combined into " + items.length + " items. Child markers now use Part Of.");

    // media: listed photos, cover photos found by file name, audio and video
    const media = [], used = new Set(), byItem = new Map();
    (await csv("photos.csv") || []).forEach(r => { if (!byItem.has(r.ITEM_ID)) byItem.set(r.ITEM_ID, []); byItem.get(r.ITEM_ID).push(r); });
    const strip = p => String(p || "").replace(/^media\//, "");
    const EXTS = ["jpg", "jpeg", "png", "webp", "JPG", "PNG"];
    let guessed = 0;
    items.forEach(it => {
      const folders = it.KIND === "place" ? ["photos"] : ["spots", "stories", "photos"];
      const covers = []; folders.forEach(fd => EXTS.forEach(x => { if (has(fd + "/" + it.ID + "." + x)) covers.push(fd + "/" + it.ID + "." + x); }));
      const cover = it._PHOTO || covers[0] || "";
      if (covers.length > 1 && !it._PHOTO) problem(it.ID + " has more than one cover photo (" + covers.join(", ") + "). Kept " + covers[0] + ".");
      if (covers.length && !it._PHOTO) guessed++;
      const listed = (byItem.get(it.ID) || []).sort((a, b) => (+a.ORDER || 999) - (+b.ORDER || 999));
      const out = listed.length ? listed.map(r => ({ FILE: r.PATH || cover, CAPTION: r.CAPTION, CREDIT: r.CREDIT })).filter(o => o.FILE) : cover ? [{ FILE: cover }] : [];
      if (listed.length && cover && !out.some(o => o.FILE === cover)) out.unshift({ FILE: cover });
      out.forEach((o, n) => { const f = strip(o.FILE), stem = f.split("/").pop().replace(/\.[^.]+$/, ""), anim = has("anims/" + stem + ".mp4") ? "anims/" + stem + ".mp4" : "";
        used.add(f); if (anim) used.add(anim);
        media.push({ ITEM_ID: it.ID, ORDER: String(n + 1), KIND: "photo", FILE: f, CAPTION: o.CAPTION || "", CREDIT: o.CREDIT || "", ANIMATION: anim }); });
    });
    if (guessed) changed(guessed + " cover photos the old map found by guessing file names are now listed by name.");
    (await csv("media.csv") || []).forEach(r => { const f = strip(r.SOURCE); if ((r.KIND || "").toLowerCase() !== "video") used.add(f); media.push({ ITEM_ID: r.ITEM_ID, ORDER: r.ORDER, KIND: (r.KIND || "").toLowerCase(), FILE: f, CAPTION: r.TITLE, CREDIT: r.CREDIT, TRANSCRIPT: r.TRANSCRIPT, SECONDS: r.SECONDS }); });
    items.forEach(it => { delete it._PHOTO; });

    // the media files themselves
    const toCopy = [];
    files.forEach((f, rel) => {
      if (!/^(photos|spots|stories|anims|audio|plans)\//.test(rel) || /(^|\/)\.|\/test$/.test(rel)) return;
      if (!f.size) { problem(rel + " is an empty file. Not copied."); return; }
      toCopy.push([rel, f]);
      if (!rel.includes("/thumbs/") && !used.has(rel)) problem(rel + " isn't attached to anything, so visitors never see it. It was brought in anyway.");
    });
    media.filter(m => m.KIND !== "video" && m.FILE && !files.has(m.FILE) && !/^https?:/i.test(m.FILE)).forEach(m => problem("media lists " + m.FILE + " for " + m.ITEM_ID + ", but that file isn't in the folder."));

    // categories, icons and shapes
    const cats = (await csv("categories.csv") || []).map(r => ({ CODE: r.CODE, LABEL: r.LABEL, COLOR: r.COLOR, ICON: r.ICON, SHAPE: r.SHAPE, FILL: r.FILL, FILL_COLOR: r.FILL_COLOR, FILL_COLOR2: r.FILL_COLOR2, RANKED: r.RANKED }));
    const icons = { icons: Object.assign({}, (ED.data.icons && ED.data.icons.icons) || {}), shapes: Object.assign({}, (ED.data.icons && ED.data.icons.shapes) || {}) };
    if (has("icons.js")) {
      try {
        const t = await files.get("icons.js").text(), m = /const\s+ICONS\s*=\s*\{/.exec(t);
        const start = m.index + m[0].length - 1, end = start + t.slice(start).search(/\n\};/) + 1;
        const obj = new Function("return (" + t.slice(start, end + 1) + ");")();      // the old site's own icon list (a data object)
        Object.keys(obj).forEach(k => { const v = obj[k]; icons.icons[k] = Object.assign({}, v, { art: String(v.art || "").replace(/\s+\n/g, "\n").trim() }); });
        changed("icons.js turned into icon data: " + Object.keys(obj).length + " icons.");
      } catch (e) { problem("icons.js couldn't be read: " + e.message); }
    }
    (await csv("shapes.csv") || []).forEach(r => { if (r.CODE) icons.shapes[r.CODE] = { label: r.LABEL || r.CODE, points: r.POINTS || "" }; });

    // tours, trails and lines
    const lines = await json("lines.geojson") || { features: [] }, lineById = new Map((lines.features || []).map(f => [f.properties && f.properties.ID, f]));
    const stops = new Map(); (await csv("tourstops.csv") || []).forEach(r => { if (!stops.has(r.TOUR_ID)) stops.set(r.TOUR_ID, []); stops.get(r.TOUR_ID).push(r); });
    const feats = [], usedLines = new Set();
    (await csv("tours.csv") || []).forEach(t => {
      const line = lineById.get(t.ROUTE); if (t.ROUTE && !line) problem("Tour " + t.TOUR_ID + " points to route " + t.ROUTE + ", which doesn't exist.");
      if (line) usedLines.add(t.ROUTE);
      const p = (line && line.properties) || {}, st = (stops.get(t.TOUR_ID) || []).sort((a, b) => (+a.STEP || 999) - (+b.STEP || 999));
      const props = { ID: t.TOUR_ID, TYPE: t.TYPE || "tour", TITLE: t.TITLE, INTRO: t.INTRO, CATEGORY: t.CATEGORY, MODES: t.MODES, LENGTH_MI: t.LENGTH_MI, STYLE: p.STYLE || "", COLOR: p.COLOR || "", WIDTH: p.WIDTH || "", OPACITY: p.OPACITY || "",
        STOPS: st.map(s => ({ ITEM: s.ITEM_ID, NOTE: s.NOTE || "", VEHICLE: (s.VEHICLE || "").toLowerCase() })) };
      ["SUMMARY", "EFFORT", "MINUTES", "SPIN", "AVAILABILITY"].forEach(k => { if (t[k]) props[k] = t[k]; });
      feats.push({ type: "Feature", properties: props, geometry: line ? line.geometry : { type: "LineString", coordinates: [] } });
    });
    lineById.forEach((f, id) => { if (!usedLines.has(id)) feats.push({ type: "Feature", properties: Object.assign({}, f.properties, { TYPE: "line" }), geometry: f.geometry }); });
    if (feats.length) changed("tours, tour stops and lines combined into " + feats.length + " routes.");

    // passport
    const pass = [], grand = new Set();
    (await csv("stamps.csv") || []).forEach(s => { if (s.GRAND_RANK) grand.add(s.GRAND_RANK); pass.push({ TYPE: "stamp", ID: s.STAMP_ID, TITLE: s.TITLE, CATEGORY: s.CATEGORY, ICON: s.VEHICLE, STARS: [s.STAR1, s.STAR2, s.STAR3].filter(Boolean).join("|"), RANKS: [s.RANK1, s.RANK2, s.RANK3].filter(Boolean).join("|"), NEEDS: s.TASKS }); });
    (await csv("tasks.csv") || []).forEach(t => pass.push({ TYPE: "task", ID: t.TASK_ID, TITLE: t.LABEL, HINT: t.HINT, BUTTON: t.BTN, SCOPE: t.SCOPE, TARGET: t.TARGET, COUNT: t.COUNT }));
    (await csv("prizes.csv") || []).forEach(p => { pass.push({ TYPE: "prize", ID: p.PRIZE_ID, TITLE: p.LABEL, NEEDS: p.REQUIREMENTS, REWARD: p.REWARD, CODE: p.CODE || p.VENDOR_CODE, ORDER: p.ORDER });
      if (p.REQUIRED_STAMPS) problem("Prize " + p.PRIZE_ID + " had a REQUIRED_STAMPS list the old map never used. It wasn't carried over; add those places to the prize in the Passport panel if they matter.");
      if (!p.REQUIREMENTS) problem("Prize " + p.PRIZE_ID + " has no requirements, so nobody can earn it."); });
    if (grand.size) { site.PASSPORT_GRAND_RANK = [...grand].sort()[0]; if (!order.includes("PASSPORT_GRAND_RANK")) order.push("PASSPORT_GRAND_RANK"); }

    // happenings: announcements, plus the event folders found
    const haps = [], zones = new Set();
    (await csv("announcements.csv") || []).forEach(a => { const r = Object.assign({}, a, { ID: a.ANN_ID, TEXT: a.BLURB, FEATURES: a.VENUE_IDS }); if (a.TZ) zones.add(a.TZ); haps.push(r); });
    const evNames = new Set(); files.forEach((f, rel) => { const m = /^events\/([^/]+)\/event\.json$/.exec(rel); if (m) evNames.add(m[1]); });
    for (const name of evNames) { const ej = await json("events/" + name + "/event.json"); if (ej) haps.push({ ID: name, NAME: ej.title || name, FOLDER: name, KIND: ej.kind || "event", PUBLIC: ej.public ? "yes" : "no", ENABLED: "yes" }); }
    if (evNames.size) report.notes.push(evNames.size + " event folders are listed in Happenings. Their own places weren't brought in; copy each folder's files to the website's events/ folder by hand if you still need them.");
    if (zones.size && !site.TIME_ZONE) { site.TIME_ZONE = [...zones].sort()[0]; order.push("TIME_ZONE"); }

    // map layers
    const mapj = { outline: await json("border.geojson"), overlays: [], backdrop: await json("backdrop.json") };
    const overlayFiles = [];
    (await json("overlays.json") || []).forEach(o => { const f = o.url || "", base = f.split("/").pop(); if (has(f)) overlayFiles.push([base, files.get(f)]); else problem("The old map " + f + " is listed but its file isn't in the folder."); mapj.overlays.push({ name: o.name || "", file: "overlays/" + base, corners: o.coords || [] }); });

    result = { site, order, items, media, cats, icons, routes: { type: "FeatureCollection", features: feats }, pass, haps, map: mapj, toCopy, overlayFiles };
    return result;
  }

  // Put the converted data into the editor (one change per file, so Undo can step back) and queue the files for Publish
  async function apply(say) {
    const R = result, rows = (name, list) => ED.change(name, f => { f.rows = list.map(r => Object.assign(Object.fromEntries(f.cols.map(c => [c, ""])), r)); }, "brought in old " + name);
    ED.change("site.csv", f => { f.rows = R.order.filter((k, i, a) => a.indexOf(k) === i).map(k => ({ KEY: k, VALUE: R.site[k] })); }, "brought in old settings");
    rows("items.csv", R.items); rows("media.csv", R.media); rows("categories.csv", R.cats); rows("passport.csv", R.pass); rows("happenings.csv", R.haps);
    ED.change("icons.json", f => { f.data = R.icons; }, "brought in old icons");
    ED.change("routes.geojson", f => { f.data = R.routes; }, "brought in old tours");
    ED.change("map.json", f => { f.data = R.map; }, "brought in old map layers");
    let n = 0; const total = R.toCopy.length + R.overlayFiles.length;
    for (const [rel, f] of R.toCopy) { ED.addPending(ED.BASE + "media/" + rel, f); say("Bringing in " + rel, ++n / total); }
    for (const [base, f] of R.overlayFiles) {
      let blob = f;
      if (f.size > 4e6 && /^image\//.test(f.type)) { try { blob = (await ED.shrinkPhoto(f, 4096, 0)).main; report.changed.push("Old map " + base + " shrunk from " + (f.size / 1e6).toFixed(1) + " MB to " + (blob.size / 1e6).toFixed(1) + " MB."); } catch (e) { /* kept as is */ } }
      const name = blob === f ? base : base.replace(/\.[^.]+$/, "") + (blob.type === "image/webp" ? ".webp" : ".jpg");
      R.map.overlays.forEach(o => { if (o.file === "overlays/" + base) o.file = "overlays/" + name; });
      ED.addPending(ED.BASE + "overlays/" + name, blob); say("Bringing in " + name, ++n / total);
    }
    ED.change("map.json", f => { f.data = R.map; }, "old map files");
  }

  function reportText() { return "Bringing in old ETS data, " + new Date().toLocaleString() + "\n\nWhat changed:\n" + report.changed.map(x => "- " + x).join("\n") + "\n\nWorth a look:\n" + (report.problems.map(x => "- " + x).join("\n") || "- Nothing") + (report.notes.length ? "\n\nNotes:\n" + report.notes.map(x => "- " + x).join("\n") : ""); }
  function panel(side) {
    ui.head(side, "Bring In Old ETS Data", "Move a site made with the old ETS editors into this one: places, child markers, spots and stories, photos, audio, tours, the passport, announcements, old maps and icons.");
    ui.note(side, "Pick the old site's folder (the one with site.csv and locations.csv in it). This replaces what's on this map now; Undo or Discard All Changes puts it back until you publish.", "warn");
    const z = h("label", "ed-drop"); z.innerHTML = '<input type="file" webkitdirectory directory multiple><b>Pick the Old Site\'s Folder</b><small>Everything stays on this computer until you publish.</small>';
    z.querySelector("input").addEventListener("change", async e => {
      const list = [...e.target.files]; if (!list.length) return;
      try { await convert(list); show(); } catch (err) { ED.toast(err.message, 6000); }
    });
    side.appendChild(z);
    ED.inspect(box => { box.classList.add("ed-insp-wide"); ui.head(box, "Nothing Picked Yet", "Pick the folder on the left. You'll see what would change before anything does."); });
  }
  function show() {
    const R = result;
    ED.inspect(box => {
      box.classList.add("ed-insp-wide");
      ui.head(box, "Ready to Bring In", R.items.length + " items, " + R.media.length + " photos and clips, " + R.cats.length + " categories, " + R.routes.features.length + " routes, " + R.pass.length + " passport rows, " + R.haps.length + " happenings, " + (R.toCopy.length + R.overlayFiles.length) + " files.");
      box.insertAdjacentHTML("beforeend", "<h3>What Changes</h3><ul class=\"ed-changes\">" + report.changed.map(x => "<li>" + esc(x) + "</li>").join("") + "</ul>" +
        (report.problems.length ? "<h3>Worth a Look (" + report.problems.length + ")</h3><ul class=\"ed-probs\">" + report.problems.slice(0, 60).map(x => "<li>" + esc(x) + "</li>").join("") + "</ul>" : "") +
        (report.notes.length ? "<h3>Notes</h3><ul class=\"ed-changes\">" + report.notes.map(x => "<li>" + esc(x) + "</li>").join("") + "</ul>" : "") + '<div class="ed-prog" hidden><div class="pp-bar"><span></span></div><small></small></div>');
      ui.buttons(box, [{ text: "Use This Data", primary: true, onClick: async e => {
        e.target.disabled = true;
        const prog = box.querySelector(".ed-prog"), bar = prog.querySelector("span"), msg = prog.querySelector("small"); prog.hidden = false;
        await apply((t, k) => { msg.textContent = t; bar.style.width = Math.round(100 * k) + "%"; });
        msg.textContent = "Done. Open the editor to look it over, then Publish."; bar.style.width = "100%";
        ED.toast("Brought in. Look it over in the editor, then Publish.", 6000);
      } }, { text: "Copy the Report", onClick: async () => { try { await navigator.clipboard.writeText(reportText()); ED.toast("Report copied."); } catch (e) { ED.modal('<h2>Report</h2><textarea class="ed-code" rows="14">' + esc(reportText()) + "</textarea>"); } } }]);
    });
  }
  ED.importOld = { convert, apply, get result() { return result; }, get report() { return report; } };
  ED.panel("import", { title: "Bring In Old Data", render: panel });
})();
