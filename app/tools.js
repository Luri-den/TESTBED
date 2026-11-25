/* ETS Community Map: tools.js. The Tools page: QR signs, icons (draw your own or bring an SVG), hand-drawn marker shapes,
   and the Building Designer. Icons and shapes are saved as data in icons.json; no code is ever changed. */
(function () {
  "use strict";
  const ED = window.ETSEditor, { esc, ui, h } = ED;

  /* ---------- QR signs ---------- */
  const PRESETS = { classic: { name: "Classic", fg: "#111111", bg: "#FFFFFF" }, heritage: { name: "Heritage", fg: "#4A2C12", bg: "#FBF3E4" }, river: { name: "River", fg: "#0B3D5C", bg: "#F2F8FB" }, forest: { name: "Forest", fg: "#1F4D2B", bg: "#F4FAF4" }, site: { name: "Match My Site" } };
  let qr = { style: "classic", picked: new Set(), center: "badge", base: "", caption: "Scan to learn more" };
  function siteBase() {
    if (qr.base) return qr.base;
    const gh = (() => { try { return JSON.parse(localStorage.getItem("ets_gh") || "{}"); } catch (e) { return {}; } })();
    return gh.owner && gh.repo ? "https://" + gh.owner.toLowerCase() + ".github.io/" + gh.repo + "/" + (gh.folder ? gh.folder + "/" : "") : new URL(".", location.href).toString();
  }
  const darken = (hex, k) => { const n = parseInt(hex.slice(1), 16); return "#" + [16, 8, 0].map(s => Math.round(((n >> s) & 255) * k).toString(16).padStart(2, "0")).join(""); };
  function colors() { if (qr.style === "site") { const c = /^#[0-9a-f]{6}$/i.test(ED.site("BAR_COLOR")) ? ED.site("BAR_COLOR") : "#0B7A75"; return { fg: darken(c, 0.7), bg: "#FFFFFF" }; } return PRESETS[qr.style]; }
  function qrSvg(text, fg, bg, picture) {
    const q = QR.encode(text, picture ? "H" : "M"), n = q.size, pad = 4, W = n + pad * 2;
    let path = "";
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.get(x, y)) path += "M" + (x + pad) + " " + (y + pad) + "h1v1h-1z";
    const mid = picture ? '<rect x="' + (W / 2 - n * 0.13) + '" y="' + (W / 2 - n * 0.13) + '" width="' + (n * 0.26) + '" height="' + (n * 0.26) + '" rx="' + (n * 0.05) + '" fill="' + bg + '"/><image href="' + picture + '" x="' + (W / 2 - n * 0.11) + '" y="' + (W / 2 - n * 0.11) + '" width="' + (n * 0.22) + '" height="' + (n * 0.22) + '"/>' : "";
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + " " + W + '" shape-rendering="crispEdges"><rect width="' + W + '" height="' + W + '" fill="' + bg + '"/><path d="' + path + '" fill="' + fg + '"/>' + mid + "</svg>";
  }
  const qrUrl = it => { const u = new URL(siteBase() + "index.html"); u.searchParams.set("place", it.ID); u.searchParams.set("qr", "1"); return u.toString(); };
  function centerPicture() {
    if (qr.center === "none") return "";
    const s = ED.data.site;
    if (qr.center === "badge" && s.BADGE === "icon" && s.BADGE_ICON) return ED.iconUrl(s.BADGE_ICON, 96);
    if (qr.center === "badge" && s.BADGE_LOGO) return ED.mediaSrc(s.BADGE_LOGO, ED.BASE + "media/");
    const ic = qr.center !== "badge" ? qr.center : "";
    return ic ? ED.iconUrl(ic, 96) : "";
  }
  function qrPanel(side) {
    ui.head(side, "QR Signs", "Print a sign for a place. Scanning it opens that place on the map, and counts as scanning it for the passport.");
    const D = ED.data;
    ui.select(side, "Label Style", qr.style, Object.keys(PRESETS).map(k => [k, PRESETS[k].name]), v => { qr.style = v; ED.rerender(); drawQR(); });
    ui.select(side, "Picture in the Middle", qr.center, [["badge", "The Site's Logo or Badge Icon"], ["none", "None"]].concat(Object.keys((D.icons && D.icons.icons) || {}).map(k => [k, "Icon: " + ((D.icons.icons[k].label) || k)])), v => { qr.center = v; drawQR(); });
    ui.text(side, "Words Under the Name", qr.caption, v => { qr.caption = v; drawQR(); });
    ui.text(side, "Website Address", qr.base, v => { qr.base = v.trim() && !v.trim().endsWith("/") ? v.trim() + "/" : v.trim(); drawQR(); }, "Where the map lives. Blank = " + siteBase());
    const places = D.items.filter(i => i.ID);
    ui.buttons(side, [{ text: "Pick Every Place", onClick: () => { places.forEach(i => qr.picked.add(i.ID)); ED.rerender(); drawQR(); } }, { text: "Pick None", onClick: () => { qr.picked.clear(); ED.rerender(); drawQR(); } }]);
    ui.list(side, places.map(i => ({ id: i.ID, title: i.NAME || i.ID, sub: i.ID, color: ED.colorFor(i), on: qr.picked.has(i.ID) })), { empty: "No places yet.", onPick: id => { qr.picked.has(id) ? qr.picked.delete(id) : qr.picked.add(id); ED.rerender(); drawQR(); } });
    drawQR();
  }
  function drawQR() {
    ED.inspect(box => {
      box.classList.add("ed-insp-wide");
      const c = colors(), pic = centerPicture(), list = ED.data.items.filter(i => qr.picked.has(i.ID));
      ui.head(box, "Signs (" + list.length + ")", list.length ? "Download one as a picture, or print them all on one sheet." : "Pick places on the left.");
      if (list.length) ui.buttons(box, [{ text: "Print the Whole Sheet", primary: true, onClick: () => window.print() }]);
      const grid = h("div", "qr-grid qr-print"); box.appendChild(grid);
      list.forEach(it => {
        const svg = qrSvg(qrUrl(it), c.fg, c.bg, pic);
        const card = h("div", "qr-label"); card.style.background = c.bg; card.style.color = c.fg;
        card.innerHTML = svg + "<b>" + esc(it.NAME || it.ID) + "</b><small>" + esc(qr.caption) + '</small><div class="qr-acts"><button type="button" class="ed-btn ed-small" data-png="1">PNG</button><button type="button" class="ed-btn ed-small" data-svg="1">SVG</button><button type="button" class="ed-btn ed-small" data-print="1">Print</button></div>';
        card.querySelector("[data-svg]").addEventListener("click", () => download(new Blob([svg], { type: "image/svg+xml" }), ED.slug(it.NAME || it.ID) + "-qr.svg"));
        card.querySelector("[data-png]").addEventListener("click", () => toPng(svg, it, c));
        card.querySelector("[data-print]").addEventListener("click", () => { const w = window.open("", "_blank"); w.document.write('<title>' + esc(it.NAME) + '</title><body style="margin:0;display:flex;justify-content:center;font-family:system-ui"><div style="width:3in;text-align:center;padding:.25in;background:' + c.bg + ';color:' + c.fg + '">' + svg + '<h2 style="margin:.1in 0 0">' + esc(it.NAME || it.ID) + "</h2><p>" + esc(qr.caption) + "</p></div><script>onload=()=>print()<\/script></body>"); w.document.close(); });
        grid.appendChild(card);
      });
    });
  }
  function download(blob, name) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 3000); }
  function toPng(svg, it, c) {
    const W = 1200, img = new Image();
    img.onload = () => { const cv = document.createElement("canvas"); cv.width = W; cv.height = W + 220; const g = cv.getContext("2d"); g.fillStyle = c.bg; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, W, W); g.fillStyle = c.fg; g.textAlign = "center"; g.font = "bold 72px system-ui, sans-serif"; g.fillText(it.NAME || it.ID, W / 2, W + 90, W - 60); g.font = "44px system-ui, sans-serif"; g.fillText(qr.caption, W / 2, W + 170, W - 60); cv.toBlob(b => download(b, ED.slug(it.NAME || it.ID) + "-qr.png")); };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  /* ---------- icons ---------- */
  let icSel = null, draft = null, tool = "pen", fill = "#3A3A3A", hist = [], redo = [];
  const icons = () => (ED.data.icons.icons = ED.data.icons.icons || {});
  function iconsPanel(side) {
    ui.head(side, "Icons", "The little drawings on markers. Draw your own, or bring an SVG file.");
    ui.buttons(side, [{ text: "+ Draw a New Icon", primary: true, onClick: () => { icSel = null; draft = { label: "", shapes: [], base: "" }; hist = []; redo = []; editor(); } }]);
    ui.file(side, "Add Your Own Icon (SVG)", ".svg,image/svg+xml", files => files[0].text().then(importSvg), "Pick an SVG file, or paste SVG text below.");
    const ta = h("textarea", "ed-input"); ta.rows = 3; ta.placeholder = "<svg …>…</svg>"; side.appendChild(ta);
    ui.buttons(side, [{ text: "Use the Pasted SVG", onClick: () => { if (ta.value.trim()) importSvg(ta.value); } }]);
    const all = h("div", "ic-all"); side.appendChild(all);
    Object.keys(icons()).forEach(k => {
      const b = h("button", "ic-card" + (icSel === k ? " on" : ""), '<img src="' + ED.iconUrl(k, 44) + '" alt=""><span>' + esc(icons()[k].label || k) + "</span>"); b.type = "button";
      b.addEventListener("click", () => { icSel = k; const ic = icons()[k]; draft = { label: ic.label || k, shapes: [], base: ic.art || "", vb: ic.vb || "0 0 60 60", scene: ic.scene, puff: ic.puff }; hist = []; redo = []; editor(); ED.rerender(); });
      all.appendChild(b);
    });
  }
  // A small drawing board: Select (move), Pen (click points, double-click to finish), Rectangle, Circle, with Undo and Redo
  function editor() {
    ED.inspect(box => {
      box.classList.add("ed-insp-wide");
      ui.head(box, icSel ? "Edit " + (draft.label || icSel) : "New Icon", "Draw on a 60 by 60 grid. Shapes you add sit on top of the existing drawing.");
      const tools = h("div", "ic-tools");
      tools.innerHTML = [["select", "Select"], ["pen", "Pen"], ["rect", "Rectangle"], ["circle", "Circle"]].map(([k, t]) => '<button type="button" class="ed-btn ed-small" data-t="' + k + '" aria-pressed="' + (tool === k) + '">' + t + "</button>").join("") +
        '<input type="color" class="ed-color" value="' + fill + '" aria-label="Color"><button type="button" class="ed-btn ed-small" data-u="1"' + (hist.length ? "" : " disabled") + '>Undo</button><button type="button" class="ed-btn ed-small" data-r="1"' + (redo.length ? "" : " disabled") + '>Redo</button><button type="button" class="ed-btn ed-small" data-del="1">Delete Shape</button>';
      tools.querySelectorAll("[data-t]").forEach(b => b.addEventListener("click", () => { tool = b.dataset.t; editor(); }));
      tools.querySelector("input").addEventListener("change", e => { fill = e.target.value; if (selShape != null) { push(); draft.shapes[selShape].fill = fill; paint(); } });
      tools.querySelector("[data-u]").addEventListener("click", () => { if (!hist.length) return; redo.push(JSON.stringify(draft.shapes)); draft.shapes = JSON.parse(hist.pop()); editor(); });
      tools.querySelector("[data-r]").addEventListener("click", () => { if (!redo.length) return; hist.push(JSON.stringify(draft.shapes)); draft.shapes = JSON.parse(redo.pop()); editor(); });
      tools.querySelector("[data-del]").addEventListener("click", () => { if (selShape == null) return; push(); draft.shapes.splice(selShape, 1); selShape = null; editor(); });
      box.appendChild(tools);
      const stage = h("div", "ic-stage"); box.appendChild(stage);
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("viewBox", draft.vb || "0 0 60 60"); svg.setAttribute("class", "ic-canvas");
      stage.appendChild(svg);
      const side2 = h("div"); stage.appendChild(side2);
      const prev = h("div", "ic-prev"); side2.appendChild(prev);
      const name = ui.text(side2, "Name", draft.label, v => { draft.label = v; }, "Shown in icon pickers.");
      ui.buttons(side2, [{ text: icSel ? "Save Changes" : "Save the Icon", primary: true, onClick: save }, icSel ? { text: "Delete Icon…", danger: true, onClick: delIcon } : null]);
      ui.note(side2, "On a real marker, at real size:");
      let selShape = null, drawing = null;
      const pt = ev => { const r = svg.getBoundingClientRect(), vb = (draft.vb || "0 0 60 60").split(/\s+/).map(Number); return [+(vb[0] + (ev.clientX - r.left) / r.width * vb[2]).toFixed(1), +(vb[1] + (ev.clientY - r.top) / r.height * vb[3]).toFixed(1)]; };
      const push = () => { hist.push(JSON.stringify(draft.shapes)); redo = []; };
      const shapeSvg = (s, i) => s.t === "rect" ? '<rect x="' + Math.min(s.x1, s.x2) + '" y="' + Math.min(s.y1, s.y2) + '" width="' + Math.abs(s.x2 - s.x1) + '" height="' + Math.abs(s.y2 - s.y1) + '" fill="' + s.fill + '"' + (i != null ? ' data-i="' + i + '"' : "") + "/>"
        : s.t === "circle" ? '<ellipse cx="' + (s.x1 + s.x2) / 2 + '" cy="' + (s.y1 + s.y2) / 2 + '" rx="' + Math.abs(s.x2 - s.x1) / 2 + '" ry="' + Math.abs(s.y2 - s.y1) / 2 + '" fill="' + s.fill + '"' + (i != null ? ' data-i="' + i + '"' : "") + "/>"
        : '<path d="M' + s.pts.map(p => p.join(" ")).join("L") + (s.closed ? "Z" : "") + '" fill="' + (s.closed ? s.fill : "none") + '" stroke="' + s.fill + '" stroke-width="' + (s.closed ? 0 : 2.5) + '" stroke-linejoin="round" stroke-linecap="round"' + (i != null ? ' data-i="' + i + '"' : "") + "/>";
      const art = () => draft.base + draft.shapes.map(s => shapeSvg(s)).join("");
      function paint() {
        svg.innerHTML = '<g opacity="1">' + draft.base + "</g>" + draft.shapes.map((s, i) => shapeSvg(s, i)).join("") + (drawing && drawing.t === "pen" ? shapeSvg(drawing) : "") +
          (selShape != null ? '<rect x="0" y="0" width="0" height="0"/>' : "");
        if (selShape != null) { const el = svg.querySelector('[data-i="' + selShape + '"]'); if (el) el.setAttribute("stroke", "#F59E0B"), el.setAttribute("stroke-dasharray", "2 1"); }
        const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + (draft.vb || "0 0 60 60") + '">' + art() + "</svg>");
        prev.innerHTML = '<span class="ic-mk" style="background:#1D4ED8"><img src="' + url + '" alt=""></span><span class="ic-mk" style="background:#C2410C"><img src="' + url + '" alt=""></span><img src="' + url + '" alt="" width="64" height="64">';
      }
      let dragFrom = null;
      svg.addEventListener("pointerdown", ev => {
        const p = pt(ev);
        if (tool === "select") { const t = ev.target.closest("[data-i]"); selShape = t ? +t.dataset.i : null; if (t) { push(); dragFrom = p; } paint(); return; }
        if (tool === "pen") { if (!drawing) drawing = { t: "pen", pts: [p], fill }; else drawing.pts.push(p); paint(); return; }
        drawing = { t: tool, x1: p[0], y1: p[1], x2: p[0], y2: p[1], fill }; svg.setPointerCapture(ev.pointerId);
      });
      svg.addEventListener("pointermove", ev => {
        const p = pt(ev);
        if (tool === "select" && dragFrom && selShape != null) { const s = draft.shapes[selShape], dx = p[0] - dragFrom[0], dy = p[1] - dragFrom[1]; if (s.pts) s.pts = s.pts.map(q => [+(q[0] + dx).toFixed(1), +(q[1] + dy).toFixed(1)]); else { s.x1 += dx; s.x2 += dx; s.y1 += dy; s.y2 += dy; } dragFrom = p; paint(); return; }
        if (drawing && (drawing.t === "rect" || drawing.t === "circle")) { drawing.x2 = p[0]; drawing.y2 = p[1]; svg.innerHTML += ""; paint(); svg.insertAdjacentHTML("beforeend", shapeSvg(drawing)); }
      });
      svg.addEventListener("pointerup", () => {
        dragFrom = null;
        if (drawing && (drawing.t === "rect" || drawing.t === "circle")) { if (Math.abs(drawing.x2 - drawing.x1) > 1 && Math.abs(drawing.y2 - drawing.y1) > 1) { push(); draft.shapes.push(drawing); } drawing = null; editor(); }
      });
      svg.addEventListener("dblclick", () => { if (drawing && drawing.t === "pen") { const s = drawing; drawing = null; if (s.pts.length > 1) { const a = s.pts[0], b = s.pts[s.pts.length - 1]; s.closed = s.pts.length > 2 && Math.hypot(a[0] - b[0], a[1] - b[1]) < 4; push(); draft.shapes.push(s); } editor(); } });
      paint();
      function save() {
        const label = (name.value || draft.label || "").trim(); if (!label) { ED.toast("Give the icon a name first."); return; }
        const key = icSel || uniqueKey(label);
        ED.change("icons.json", f => { f.data.icons = f.data.icons || {}; const old = f.data.icons[key] || {}; f.data.icons[key] = Object.assign({}, old, { label, vb: draft.vb || "0 0 60 60", art: art() }); }, (icSel ? "changed" : "new") + " icon " + label);
        icSel = key; draft.base = art(); draft.shapes = []; hist = []; redo = [];
        ED.rerender(); editor(); ED.toast("Saved. Pick it in any icon list.");
      }
    });
  }
  function uniqueKey(label) { let k = ED.slug(label).replace(/-/g, "") || "icon", n = 2; const base = k; while (icons()[k]) k = base + n++; return k; }
  function usesOf(key) {
    const D = ED.data, out = [];
    D.cats.forEach(c => { if (c.ICON === key) out.push("category " + (c.LABEL || c.CODE)); });
    D.items.forEach(i => { if (i.ICON === key) out.push(i.NAME || i.ID); });
    D.passport.forEach(r => { if (r.ICON === key) out.push("passport " + (r.TITLE || r.ID)); });
    ((D.routes && D.routes.features) || []).forEach(f => { if (f.properties.VEHICLE === key) out.push("tour " + f.properties.TITLE); });
    if (D.site.BADGE_ICON === key) out.push("the badge");
    return out;
  }
  function delIcon() {
    const used = usesOf(icSel);
    if (used.length) { ED.modal("<h2>That icon is in use</h2><p>It's used by " + esc(used.slice(0, 8).join(", ")) + (used.length > 8 ? " and " + (used.length - 8) + " more" : "") + ". Pick a different icon for those first.</p>"); return; }
    ED.confirm("Delete this icon?", "It comes out of the icon set.", "Delete", () => { ED.change("icons.json", f => { delete f.data.icons[icSel]; }, "deleted icon"); icSel = null; draft = null; ED.closeInspector(); ED.rerender(); });
  }
  // Bring your own SVG: anything risky is stripped, and it's checked for things that vanish at marker size
  function cleanSvg(text) {
    const doc = new DOMParser().parseFromString(String(text), "image/svg+xml"), root = doc.documentElement;
    if (!root || root.nodeName.toLowerCase() !== "svg" || doc.querySelector("parsererror")) throw new Error("That isn't an SVG drawing.");
    if (root.querySelector("image")) throw new Error("That SVG has a photo inside it. Icons need to be drawings only.");
    const warn = [];
    root.querySelectorAll("script, foreignObject, iframe, object, embed, audio, video, style[type='text/javascript'], metadata, title, desc").forEach(e => e.remove());
    root.querySelectorAll("*").forEach(e => {
      [...e.attributes].forEach(a => {
        const n = a.name.toLowerCase(), v = a.value;
        if (n.startsWith("on") || ((n === "href" || n === "xlink:href") && !v.startsWith("#")) || /javascript:|url\((?!#)/i.test(v)) e.removeAttribute(a.name);
      });
    });
    if (root.querySelector("text")) warn.push("It has words in it, which are too small to read on a marker.");
    if (root.querySelector("linearGradient, radialGradient")) warn.push("It uses color fades, which can turn muddy at marker size.");
    if ([...root.querySelectorAll("[stroke-width]")].some(e => parseFloat(e.getAttribute("stroke-width")) < 1)) warn.push("Some lines are very thin and may vanish at marker size.");
    let vb = root.getAttribute("viewBox");
    if (!vb) { const w = parseFloat(root.getAttribute("width")) || 60, hh = parseFloat(root.getAttribute("height")) || 60; vb = "0 0 " + w + " " + hh; }
    const art = [...root.childNodes].map(n => n.nodeType === 1 ? new XMLSerializer().serializeToString(n).replace(/ xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, "") : "").join("");
    if (art.length > 20000) warn.push("It's a large drawing (" + Math.round(art.length / 1024) + " KB). Simpler icons load faster.");
    return { vb, art, warn };
  }
  function importSvg(text) {
    let c; try { c = cleanSvg(text); } catch (e) { ED.toast(e.message, 5000); return; }
    let mode = "keep", label = "";
    const whiteArt = () => c.art.replace(/fill="(?!none)[^"]*"/g, 'fill="#FFFFFF"').replace(/stroke="(?!none)[^"]*"/g, 'stroke="#FFFFFF"');
    const url = a => "data:image/svg+xml;charset=utf-8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + c.vb + '"' + (mode === "white" && !/fill=/.test(c.art) ? ' fill="#FFFFFF"' : "") + ">" + a + "</svg>");
    ED.modal("<h2>Add Your Own Icon</h2>" + (c.warn.length ? '<div class="ed-alert warn">' + c.warn.map(esc).join("<br>") + "</div>" : '<div class="ed-alert good">It looks good for a marker.</div>') + '<div class="ic-prev" data-prev></div><div data-f></div>', (m, close) => {
      const f = m.querySelector("[data-f]"), prev = m.querySelector("[data-prev]");
      const draw = () => { const a = mode === "white" ? whiteArt() : c.art; prev.innerHTML = '<span class="ic-mk" style="background:#1D4ED8"><img src="' + url(a) + '" alt=""></span><span class="ic-mk" style="background:#15803D"><img src="' + url(a) + '" alt=""></span><img src="' + url(a) + '" width="64" height="64" alt="">'; };
      ui.select(f, "Colors", mode, [["keep", "Keep the Original Colors"], ["white", "Make It White (Sits on the Category Color)"]], v => { mode = v; draw(); });
      ui.text(f, "Name", label, v => { label = v; }, "Shown in icon pickers.", { live: v => { label = v; } });
      ui.buttons(f, [{ text: "Save the Icon", primary: true, onClick: () => {
        if (!label.trim()) { ED.toast("Give it a name first."); return; }
        const key = uniqueKey(label), art = mode === "white" ? (/fill=/.test(c.art) ? whiteArt() : '<g fill="#FFFFFF">' + c.art + "</g>") : c.art;
        ED.change("icons.json", F => { F.data.icons = F.data.icons || {}; F.data.icons[key] = { label: label.trim(), vb: c.vb, art }; }, "added icon " + label);
        close(); icSel = key; ED.rerender(); ED.toast("Added " + label + ". Pick it in any icon list.");
      } }]);
      draw();
    });
  }
  ED.cleanSvg = cleanSvg;

  /* ---------- marker shapes ---------- */
  let shSel = null, shPts = [];
  const shapes = () => (ED.data.icons.shapes = ED.data.icons.shapes || {});
  function shapesPanel(side) {
    ui.head(side, "Marker Shapes", "Draw your own marker outline, like a leaf or a mountain. Pick it for a category, a group, or the site's Group Shape.");
    ui.buttons(side, [{ text: "+ Draw a New Shape", primary: true, onClick: () => { shSel = null; shPts = []; shapeEditor(); } }]);
    ui.list(side, Object.keys(shapes()).map(k => ({ id: k, title: shapes()[k].label || k, sub: String(shapes()[k].points).split(";").length + " points", on: shSel === k })), { empty: "No hand-drawn shapes yet.", onPick: k => { shSel = k; shPts = String(shapes()[k].points).split(";").map(p => p.trim().split(/\s+/).map(Number)); shapeEditor(); ED.rerender(); } });
  }
  function shapeEditor() {
    ED.inspect(box => {
      box.classList.add("ed-insp-wide");
      ui.head(box, shSel ? "Edit " + (shapes()[shSel].label || shSel) : "New Shape", "Click to add corners around the outline. Drag a corner to move it. The shape is clipped from the marker, so keep it chunky.");
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("viewBox", "-5 -5 110 110"); svg.setAttribute("class", "ic-canvas");
      const stage = h("div", "ic-stage"); box.appendChild(stage); stage.appendChild(svg);
      const side2 = h("div"); stage.appendChild(side2);
      const prev = h("div", "ic-prev"); side2.appendChild(prev);
      const name = ui.text(side2, "Name", shSel ? shapes()[shSel].label : "", () => {});
      ui.buttons(side2, [{ text: "Undo Corner", onClick: () => { shPts.pop(); paint(); } }, { text: "Start Over", onClick: () => { shPts = []; paint(); } }, { text: shSel ? "Save Changes" : "Save the Shape", primary: true, onClick: () => {
        const label = name.value.trim(); if (!label) { ED.toast("Give the shape a name first."); return; } if (shPts.length < 3) { ED.toast("A shape needs at least three corners."); return; }
        const key = shSel || (() => { let k = ED.slug(label).replace(/-/g, "") || "shape", n = 2; const b = k; while (shapes()[k] || ["circle", "square", "diamond", "triangle", "shield", "star"].includes(k)) k = b + n++; return k; })();
        ED.change("icons.json", f => { f.data.shapes = f.data.shapes || {}; f.data.shapes[key] = { label, points: shPts.map(p => p.map(n => +n.toFixed(1)).join(" ")).join(";") }; }, "shape " + label);
        shSel = key; ED.rerender(); ED.toast("Saved. Pick it as a Marker Shape.");
      } }, shSel ? { text: "Delete…", danger: true, onClick: () => {
        const used = [...ED.data.cats.values()].filter(c => c.SHAPE === shSel).map(c => c.LABEL).concat(ED.data.items.filter(i => i.SHAPE === shSel).map(i => i.NAME), ED.data.site.GROUP_SHAPE === shSel ? ["the site's Group Shape"] : []);
        if (used.length) { ED.modal("<h2>That shape is in use</h2><p>Used by " + esc(used.join(", ")) + ". Pick another shape for those first.</p>"); return; }
        ED.confirm("Delete this shape?", "", "Delete", () => { ED.change("icons.json", f => { delete f.data.shapes[shSel]; }, "deleted shape"); shSel = null; ED.closeInspector(); ED.rerender(); });
      } } : null]);
      let drag = null;
      const pt = ev => { const r = svg.getBoundingClientRect(); return [Math.max(0, Math.min(100, -5 + (ev.clientX - r.left) / r.width * 110)), Math.max(0, Math.min(100, -5 + (ev.clientY - r.top) / r.height * 110))]; };
      function paint() {
        svg.innerHTML = '<rect x="0" y="0" width="100" height="100" fill="none" stroke="#C6CFD4" stroke-dasharray="2 2"/>' + (shPts.length > 1 ? '<polygon points="' + shPts.map(p => p.join(",")).join(" ") + '" fill="#0B7A75" fill-opacity=".35" stroke="#0B7A75" stroke-width="1"/>' : "") +
          shPts.map((p, i) => '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="2.6" fill="#fff" stroke="#0B7A75" stroke-width="1.2" data-p="' + i + '" style="cursor:grab"/>').join("");
        const clip = shPts.length > 2 ? "polygon(" + shPts.map(p => p[0].toFixed(1) + "% " + p[1].toFixed(1) + "%").join(",") + ")" : "none";
        prev.innerHTML = '<span class="ic-mk" style="background:#15803D;border-radius:0;clip-path:' + clip + ';box-shadow:none;width:48px;height:48px"></span><span class="ic-mk" style="background:#1D4ED8;border-radius:0;clip-path:' + clip + ';box-shadow:none;width:32px;height:32px"></span>';
      }
      svg.addEventListener("pointerdown", ev => { const c = ev.target.closest("[data-p]"); if (c) { drag = +c.dataset.p; svg.setPointerCapture(ev.pointerId); return; } shPts.push(pt(ev)); paint(); });
      svg.addEventListener("pointermove", ev => { if (drag == null) return; shPts[drag] = pt(ev); paint(); });
      svg.addEventListener("pointerup", () => { drag = null; });
      paint();
    });
  }

  /* ---------- Building Designer ---------- */
  function buildingPanel(side) {
    ui.head(side, "Building Designer", "Draw a floor plan: walls, rooms, stairs, doors, labels and symbols, floor by floor.");
    ui.note(side, "When a floor is ready, use its Export PNG button, then add that picture in the editor: Map panel, Indoor Plan (inside an interior folder).");
    ui.note(side, "Save JSON keeps the drawing so you can open and change it later. It's saved on your computer, not on the website.");
    ui.buttons(side, [{ text: "Open It in a New Tab", onClick: () => window.open("app/building.html", "_blank") }]);
    ED.inspect(box => { box.classList.add("ed-insp-wide"); box.innerHTML = '<iframe class="bld-frame" src="app/building.html" title="Building Designer"></iframe>'; });
  }

  ED.panel("qr", { title: "QR Signs", render: qrPanel });
  ED.panel("icons", { title: "Icons", render: iconsPanel, onShow: () => { if (draft) editor(); } });
  ED.panel("shapes", { title: "Marker Shapes", render: shapesPanel });
  ED.panel("building", { title: "Building Designer", render: buildingPanel });
})();
