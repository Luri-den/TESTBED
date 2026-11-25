/* ETS Community Map: ed-haps.js. The Happenings panel: what's on, with dates or a repeat, a month view that shows clashes,
   and an event folder (its own map) only when a happening truly needs one. */
(function () {
  "use strict";
  const ED = window.ETSEditor, { esc, ui, h } = ED;
  let selId = null, view = "list", month = null, pickedDay = null;
  const DAY = 864e5;
  const rows = () => ED.data.happenings;
  const byId = id => rows().find(r => r.ID === id);
  const set = (r, k, v, label) => ED.change("happenings.csv", () => { r[k] = v; }, label || (r.NAME || r.ID));

  /* ---------- the schedule (same rules as the map) ---------- */
  const parseLocal = s => { const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?/.exec(String(s || "")); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) : null; };
  const parseTime = s => { const m = /^(\d{1,2}):(\d{2})/.exec(String(s || "")); return m ? [+m[1], +m[2]] : null; };
  const dim = (y, m0) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
  const atDay = (y, m0, d, hh, mm) => { y += Math.floor(m0 / 12); m0 = ((m0 % 12) + 12) % 12; return Date.UTC(y, m0, Math.min(d, dim(y, m0)), hh, mm); };
  function runs(r, from, to) {
    const rep = String(r.REPEAT || "once").toLowerCase(), out = [];
    const Y1 = new Date(from).getUTCFullYear(), Y2 = new Date(to).getUTCFullYear();
    if (rep === "ongoing") return [{ start: from, end: to }];
    if (rep === "once" || rep === "yearly" || !rep) {
      const a = parseLocal(r.START), b = parseLocal(r.END || r.START); if (a == null || b == null) return out;
      if (rep !== "yearly") out.push({ start: a, end: b > a ? b : a + DAY });
      else { const A = new Date(a), B = new Date(b), key = d => Date.UTC(2001, d.getUTCMonth(), d.getUTCDate(), d.getUTCHours()); const wraps = key(B) < key(A);
        for (let y = Y1 - 1; y <= Y2 + 1; y++) out.push({ start: atDay(y, A.getUTCMonth(), A.getUTCDate(), A.getUTCHours(), A.getUTCMinutes()), end: atDay(y + (wraps ? 1 : 0), B.getUTCMonth(), B.getUTCDate(), B.getUTCHours(), B.getUTCMinutes()) }); }
    } else if (rep === "monthly") {
      const st = parseTime(r.START_TIME) || [0, 0], en = parseTime(r.END_TIME) || [23, 59], d1 = +r.START_DAY, d2 = +r.END_DAY || d1; if (!(d1 >= 1)) return out;
      const m0 = Y1 * 12 + new Date(from).getUTCMonth(), m1 = Y2 * 12 + new Date(to).getUTCMonth();
      for (let k = m0 - 1; k <= m1 + 1; k++) out.push({ start: atDay(0, k, d1, st[0], st[1]), end: atDay(0, k + (d2 < d1 ? 1 : 0), d2, en[0], en[1]) });
    } else if (rep === "weekly") {
      const days = String(r.DAYS || "").split("|").map(Number).filter(n => n >= 0 && n <= 6), st = parseTime(r.START_TIME) || [0, 0], en = parseTime(r.END_TIME) || [23, 59];
      for (let d = Math.floor(from / DAY) * DAY - DAY; d < to; d += DAY) if (days.includes(new Date(d).getUTCDay())) out.push({ start: d + (st[0] * 60 + st[1]) * 6e4, end: d + (en[0] * 60 + en[1]) * 6e4 });
    }
    return out.filter(o => o.end > from && o.start < to);
  }
  // "now" on the wall clock in the site's time zone (Look panel), the same way the map works it out
  const nowWall = () => {
    const d = new Date(), tz = ED.site("TIME_ZONE") || undefined;
    try { const p = {}; new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(d).forEach(x => { p[x.type] = x.value; }); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute); }
    catch (e) { return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()); }
  };
  function state(r) {
    if (String(r.ENABLED).toLowerCase() === "no" || String(r.PUBLIC).toLowerCase() === "no") return "hidden";
    if (String(r.REPEAT).toLowerCase() === "ongoing") return "ongoing";
    const now = nowWall(), rs = runs(r, now - 400 * DAY, now + 400 * DAY);
    if (rs.some(o => o.start <= now && now < o.end)) return "now";
    if (rs.some(o => o.start > now)) return "coming";
    return "ended";
  }
  const STATE_NAME = { now: "On Now", coming: "Coming Up", ongoing: "Ongoing", ended: "Ended", hidden: "Hidden" };
  const WD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  function describe(r) {
    const rep = String(r.REPEAT || "once").toLowerCase();
    const f = ms => new Date(ms).toLocaleDateString(undefined, { timeZone: "UTC", month: "short", day: "numeric", year: rep === "yearly" ? undefined : "numeric" });
    if (rep === "ongoing") return "Ongoing";
    if (rep === "weekly") return "Every " + String(r.DAYS || "").split("|").filter(Boolean).map(d => WD[+d]).join(", ") + (r.START_TIME ? ", " + r.START_TIME + "–" + r.END_TIME : "");
    if (rep === "monthly") return "Monthly on the " + r.START_DAY + (r.END_DAY && r.END_DAY !== r.START_DAY ? "–" + r.END_DAY : "");
    const a = parseLocal(r.START), b = parseLocal(r.END);
    return (rep === "yearly" ? "Every year, " : "") + (a != null ? f(a) + (b != null && Math.floor(b / DAY) !== Math.floor(a / DAY) ? " – " + f(b) : "") : "No date yet");
  }

  /* ---------- the list and the month ---------- */
  function render(side) {
    ui.head(side, "Happenings", "What's on: markets, festivals, exhibits, clean-ups. Times are in the site's time zone (set in Look).");
    ui.buttons(side, [{ text: "+ New Happening", primary: true, onClick: () => create() }]);
    const seg = h("div", "ed-seg"); seg.innerHTML = '<button type="button" data-v="list"' + (view === "list" ? ' aria-pressed="true"' : "") + '>List</button><button type="button" data-v="month"' + (view === "month" ? ' aria-pressed="true"' : "") + ">Month</button>";
    seg.querySelectorAll("button").forEach(b => b.addEventListener("click", () => { view = b.dataset.v; ED.rerender(); }));
    side.appendChild(seg);
    if (view === "month") return monthView(side);
    ["now", "coming", "ongoing", "ended", "hidden"].forEach(st => {
      const list = rows().filter(r => state(r) === st);
      if (!list.length) return;
      const sec = ui.section(side, STATE_NAME[st], { badge: String(list.length), open: st !== "ended" && st !== "hidden" });
      ui.list(sec, list.map(r => ({ id: r.ID, title: r.NAME || r.ID, sub: describe(r) + (r.FOLDER ? " · Own map" : ""), color: r.COLOR || "#0B7A75", on: r.ID === selId })), { onPick: select });
    });
    if (!rows().length) ui.note(side, "Nothing yet. Press New Happening.");
  }
  function monthView(side) {
    const now = new Date();
    if (!month) month = [now.getFullYear(), now.getMonth()];
    const [y, m] = month, first = Date.UTC(y, m, 1), startDow = new Date(first).getUTCDay(), days = dim(y, m);
    const nav = h("div", "cal-nav", '<button type="button" class="ed-btn ed-small" data-m="-1" aria-label="Previous month">‹</button><b>' + esc(new Date(first).toLocaleDateString(undefined, { timeZone: "UTC", month: "long", year: "numeric" })) + '</b><button type="button" class="ed-btn ed-small" data-m="1" aria-label="Next month">›</button>');
    nav.querySelectorAll("[data-m]").forEach(b => b.addEventListener("click", () => { let mm = m + +b.dataset.m, yy = y; if (mm < 0) { mm = 11; yy--; } if (mm > 11) { mm = 0; yy++; } month = [yy, mm]; pickedDay = null; ED.rerender(); }));
    side.appendChild(nav);
    const all = rows().filter(r => state(r) !== "hidden").map(r => ({ r, rs: runs(r, first - 7 * DAY, first + 40 * DAY) }));
    const grid = h("div", "cal");
    grid.innerHTML = ["S", "M", "T", "W", "T", "F", "S"].map(d => "<b>" + d + "</b>").join("") + "<span></span>".repeat(startDow) + Array.from({ length: days }, (_, i) => {
      const d0 = Date.UTC(y, m, i + 1), on = all.filter(x => x.rs.some(o => o.start < d0 + DAY && o.end > d0) && String(x.r.REPEAT).toLowerCase() !== "ongoing");
      const today = now.getFullYear() === y && now.getMonth() === m && now.getDate() === i + 1;
      return '<button type="button" class="cal-d' + (today ? " today" : "") + (on.length > 1 ? " clash" : "") + '" data-d="' + (i + 1) + '" title="' + esc(on.map(x => x.r.NAME).join(", ")) + '"><span>' + (i + 1) + "</span>" + on.slice(0, 3).map(x => '<i style="background:' + esc(x.r.COLOR || "#0B7A75") + '"></i>').join("") + "</button>";
    }).join("");
    grid.querySelectorAll("[data-d]").forEach(b => b.addEventListener("click", () => { pickedDay = +b.dataset.d; ED.rerender(); }));
    side.appendChild(grid);
    ui.note(side, "An orange outline means more than one thing is on that day.");
    if (pickedDay) {
      const d0 = Date.UTC(y, m, pickedDay), on = all.filter(x => x.rs.some(o => o.start < d0 + DAY && o.end > d0));
      const sec = ui.section(side, new Date(d0).toLocaleDateString(undefined, { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" }));
      ui.list(sec, on.map(x => ({ id: x.r.ID, title: x.r.NAME, sub: describe(x.r), color: x.r.COLOR }), ), { empty: "Nothing on this day.", onPick: select });
      ui.buttons(sec, [{ text: "+ Add on This Day", onClick: () => create(y + "-" + String(m + 1).padStart(2, "0") + "-" + String(pickedDay).padStart(2, "0")) }]);
    }
  }
  function create(date) {
    const id = ED.newId("HAP");
    const d = date || new Date(Date.now() + 7 * DAY).toISOString().slice(0, 10);
    ED.change("happenings.csv", f => f.rows.push(Object.assign(Object.fromEntries(f.cols.map(c => [c, ""])), { ID: id, NAME: "New Happening", COLOR: "#C2410C", REPEAT: "once", START: d + "T10:00", END: d + "T14:00" })), "new happening");
    select(id);
  }
  function select(id) { selId = id; ED.inspect(inspector); ED.rerender(); const r = byId(id); if (r) { const ids = String(r.FEATURES || "").split("|").filter(Boolean); ED.setHighlight && ED.setHighlight(ids); } }

  /* ---------- one happening ---------- */
  function inspector(box) {
    const r = byId(selId); if (!r) { ED.closeInspector(); return; }
    const top = h("div", "ed-insp-top", '<span class="ed-kind">Happening · ' + esc(STATE_NAME[state(r)]) + '</span><button type="button" class="ed-x" aria-label="Close">✕</button>');
    top.querySelector(".ed-x").addEventListener("click", () => { selId = null; ED.closeInspector(); ED.rerender(); }); box.appendChild(top);
    const s = (k, label) => v => { set(r, k, v, label); ED.rerender(); };
    ui.text(box, "Name", r.NAME, s("NAME"));
    const g = h("div", "ed-grid2"); box.appendChild(g);
    ui.text(g, "Tag", r.TAG, s("TAG", "tag"), "A short label for the map's tag. Blank = the name.");
    ui.color(g, "Color", r.COLOR, s("COLOR", "color"));
    ui.text(box, "About It", r.TEXT, s("TEXT", "text"), "", { multi: true, rows: 4 });

    const when = ui.section(box, "When");
    const rep = String(r.REPEAT || "once").toLowerCase();
    ui.select(when, "Repeats", rep, [["once", "Once"], ["weekly", "Every Week"], ["monthly", "Every Month"], ["yearly", "Every Year"], ["ongoing", "Ongoing (No Dates)"]], v => { set(r, "REPEAT", v, "repeat"); ED.rerenderInspector(); ED.rerender(); });
    if (rep === "once" || rep === "yearly") {
      const gg = h("div", "ed-grid2"); when.appendChild(gg);
      ui.text(gg, "Starts", (r.START || "").slice(0, 16), s("START", "start"), rep === "yearly" ? "The year doesn't matter." : "", { type: "datetime-local" });
      ui.text(gg, "Ends", (r.END || "").slice(0, 16), s("END", "end"), "", { type: "datetime-local" });
    } else if (rep === "weekly") {
      const days = String(r.DAYS || "").split("|").filter(Boolean);
      const w = h("div", "ed-filters"); w.innerHTML = WD.map((d, i) => '<button type="button" data-d="' + i + '" aria-pressed="' + days.includes(String(i)) + '">' + d.slice(0, 3) + "</button>").join("");
      w.querySelectorAll("button").forEach(b => b.addEventListener("click", () => { const set2 = new Set(days); set2.has(b.dataset.d) ? set2.delete(b.dataset.d) : set2.add(b.dataset.d); set(r, "DAYS", [...set2].sort().join("|"), "days"); ED.rerenderInspector(); ED.rerender(); }));
      ui.field(when, "Days", w);
      times(when, r);
    } else if (rep === "monthly") {
      const gg = h("div", "ed-grid2"); when.appendChild(gg);
      ui.number(gg, "From Day", r.START_DAY, s("START_DAY", "day"), "1 to 31", { min: 1, max: 31 });
      ui.number(gg, "To Day", r.END_DAY, s("END_DAY", "day"), "Blank = same day", { min: 1, max: 31 });
      times(when, r);
    }
    if (rep !== "ongoing") ui.number(when, "Starts Soon Means Within (Days)", r.SOON_DAYS, s("SOON_DAYS", "soon"), "Blank = 14 days.");

    const wh = ui.section(box, "Where and What");
    const items = ED.data.items.filter(i => i.ID).map(i => [i.ID, i.NAME || i.ID, i.KIND === "story" ? "Story" : i.KIND === "photospot" ? "Photo Spot" : ""]);
    ui.picker(wh, "Featured Places", r.FEATURES, items, v => { set(r, "FEATURES", v, "featured places"); ED.setHighlight && ED.setHighlight(v.split("|").filter(Boolean)); }, "These light up on the map when a visitor opens the happening.", { multi: true });
    const tours = ((ED.data.routes && ED.data.routes.features) || []).filter(f => f.properties.TYPE !== "line").map(f => [f.properties.ID, f.properties.TITLE || f.properties.ID]);
    ui.picker(wh, "Featured Tour", r.TOUR_ID, tours, s("TOUR_ID", "tour"), "Its Start the Tour button only shows while this is on.", { none: "None" });
    const lg = h("div", "ed-grid2"); wh.appendChild(lg);
    ui.text(lg, "Link", r.LINK, s("LINK", "link"), "", { placeholder: "example.org/festival" });
    ui.text(lg, "Link Words", r.LINK_TEXT, s("LINK_TEXT", "link words"), "", { placeholder: "More Information" });

    const own = ui.section(box, "Its Own Map", { open: !!r.FOLDER });
    if (r.FOLDER) {
      ui.note(own, "This happening has its own map in the folder events/" + r.FOLDER + "/. Anything not changed there comes from the live map.");
      ui.buttons(own, [{ text: "Design Its Map", primary: true, onClick: () => { location.href = "edit.html?" + new URLSearchParams(Object.assign(ED.SAMPLE ? { sample: ED.SAMPLE } : {}, { event: r.FOLDER })).toString(); } },
        { text: "Preview Its Map", onClick: () => { const u = new URL("index.html", location.href); u.searchParams.set("draft", "1"); u.searchParams.set("intro", "0"); u.searchParams.set("event", r.FOLDER); if (ED.SAMPLE) u.searchParams.set("sample", ED.SAMPLE); window.open(u.toString(), "ets-preview"); } },
        { text: "Unlink the Folder", onClick: () => { set(r, "FOLDER", "", "folder"); ED.rerenderInspector(); } }]);
    } else {
      ui.note(own, "Most happenings don't need this. Use it when an event needs its own places, tours or passport (a festival grounds map, say).");
      ui.buttons(own, [{ text: "Give It Its Own Map", onClick: () => { const name = ED.slug(r.NAME) || ED.slug(r.ID); ED.newFolder(name, r.NAME || name, "event"); set(r, "FOLDER", name, "own map"); ED.rerenderInspector(); ED.toast("Made events/" + name + "/. Press Design Its Map to change what's different there.", 5000); } }]);
    }
    const vis = ui.section(box, "Showing It", { open: false });
    ui.toggle(vis, "Shown", String(r.ENABLED).toLowerCase() !== "no", on => { set(r, "ENABLED", on ? "" : "no", "shown"); ED.rerender(); }, "Off hides it everywhere without deleting it.");
    ui.toggle(vis, "Public", String(r.PUBLIC).toLowerCase() !== "no", on => { set(r, "PUBLIC", on ? "" : "no", "public"); ED.rerender(); }, "Off keeps it for planning only; visitors don't see it.");
    ui.buttons(vis, [{ text: "Duplicate", onClick: () => { const id = ED.newId("HAP"); ED.change("happenings.csv", f => f.rows.splice(f.rows.indexOf(r) + 1, 0, Object.assign({}, r, { ID: id, NAME: (r.NAME || "") + " (Copy)" })), "duplicated"); select(id); } },
      { text: "Delete…", danger: true, onClick: () => ED.confirm("Delete " + (r.NAME || r.ID) + "?", r.FOLDER ? "Its own map folder stays on the website; only the happening is removed." : "It comes off the map.", "Delete", () => { ED.change("happenings.csv", f => { f.rows = f.rows.filter(x => x !== r); }, "deleted happening"); selId = null; ED.closeInspector(); ED.rerender(); }) }]);
  }
  function times(parent, r) {
    const gg = h("div", "ed-grid2"); parent.appendChild(gg);
    ui.text(gg, "From", r.START_TIME, v => set(r, "START_TIME", v, "time"), "", { type: "time" });
    ui.text(gg, "Until", r.END_TIME, v => set(r, "END_TIME", v, "time"), "", { type: "time" });
  }

  ED.panel("happenings", { title: "Happenings", render, onClose: () => { selId = null; ED.setHighlight && ED.setHighlight(null); ED.rerender(); } });
})();
