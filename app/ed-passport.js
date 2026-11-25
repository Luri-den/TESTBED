/* ETS Community Map: ed-passport.js. The Passport panel: ranks (stamps with stars), tasks, prizes and the passport's settings.
   Everything that points at something else is picked from a list, so it can't be typed wrong. */
(function () {
  "use strict";
  const ED = window.ETSEditor, { esc, ui, h } = ED;
  let selId = null;
  const rows = () => ED.data.passport;
  const byId = id => rows().find(r => r.ID === id);
  const set = (r, k, v, label) => ED.change("passport.csv", () => { r[k] = v; }, label || (r.TITLE || r.ID));
  const KIND = { stamp: "Rank", task: "Task", prize: "Prize" };
  const BEHAVIOR = [["story", "Open Any Story"], ["spot", "Open Any Photo Spot"], ["place", "Open Any Place"], ["tour", "Finish Any Tour"]];

  function render(side) {
    ui.head(side, "Passport", "Visitors collect stamps by finding places, earn stars by doing tasks, and win prizes.");
    const on = ED.yes(ED.site("PASSPORT"));
    ui.toggle(side, "Passport Switched On", on, v => { ED.setSite("PASSPORT", v ? "yes" : "no", "passport"); ED.rerender(); }, "Off: no passport button and no passport code is downloaded.");
    ui.buttons(side, [{ text: "See It as a Visitor", onClick: () => { const u = new URL("index.html", location.href); u.searchParams.set("draft", "1"); u.searchParams.set("intro", "0"); u.searchParams.set("passport", "1"); u.searchParams.set("passportdemo", "1"); if (ED.SAMPLE) u.searchParams.set("sample", ED.SAMPLE); window.open(u.toString(), "ets-preview"); }, title: "Opens a practice passport (nothing is saved)" }]);
    [["stamp", "Ranks", "Each rank has three stars, earned by finishing its tasks."], ["task", "Tasks", "Things to do: open a story, finish a tour, visit three downtown places."], ["prize", "Prizes", "Won at a set number of stars, or by finding set places. Shows a code to a vendor."]].forEach(([type, title, note]) => {
      const list = rows().filter(r => r.TYPE === type);
      const sec = ui.section(side, title, { badge: String(list.length) });
      ui.note(sec, note);
      ui.list(sec, list.map(r => ({ id: r.ID, title: r.TITLE || r.ID, sub: subFor(r), color: type === "prize" ? "#B45309" : type === "task" ? "#5B6670" : "var(--accent)", on: r.ID === selId })), { empty: "None yet.", onPick: select });
      ui.buttons(sec, [{ text: "+ New " + KIND[type], onClick: () => create(type) }]);
    });
    const st = ui.section(side, "Passport Settings", { open: false });
    ui.toggle(st, "Ranks", ED.yes(ED.site("PASSPORT_RANKS"), true), v => ED.setSite("PASSPORT_RANKS", v ? "yes" : "no", "ranks"), "Off hides ranks and stars; places to find still work.");
    ui.toggle(st, "Prizes", ED.yes(ED.site("PRIZES"), true), v => ED.setSite("PRIZES", v ? "yes" : "no", "prizes"));
    ui.text(st, "Grand Rank", ED.site("PASSPORT_GRAND_RANK"), v => ED.setSite("PASSPORT_GRAND_RANK", v, "grand rank"), "The title for getting three stars in every rank, like Local Historian.");
    ui.select(st, "Passport Button", ED.site("PASSPORT_STYLE"), [["", "Stamp Button with a Count"], ["ring", "Progress Ring"]], v => { ED.setSite("PASSPORT_STYLE", v, "passport style"); ED.rerender(); });
    if (ED.site("PASSPORT_STYLE") === "ring") { ui.color(st, "Ring Color", ED.site("RING_COLOR"), v => ED.setSite("RING_COLOR", v, "ring")); ui.color(st, "Ring Track Color", ED.site("RING_TRACK"), v => ED.setSite("RING_TRACK", v, "ring")); ui.color(st, "Ring Number Color", ED.site("RING_TEXT"), v => ED.setSite("RING_TEXT", v, "ring")); }
    ui.note(st, "Links: add ?resetpassport to the map's address to clear a phone's progress, or ?passportdemo=1 for a practice passport in front of a crowd.");
  }
  function subFor(r) {
    if (r.TYPE === "stamp") return (String(r.NEEDS || "").split("|").filter(Boolean).length) + " tasks · stars at " + (r.STARS || "1|2|3").split("|").join(", ");
    if (r.TYPE === "task") return r.SCOPE === "item" ? "Visit " + ((ED.data.byId.get(r.TARGET) || {}).NAME || r.TARGET || "?") : r.SCOPE === "category" ? "Visit " + (r.COUNT || 1) + " in " + ((ED.data.cats.get(r.TARGET) || {}).LABEL || r.TARGET || "?") : (BEHAVIOR.find(b => b[0] === String(r.TARGET).toLowerCase().replace(/s$/, "")) || [0, "Something"])[1];
    return "Needs " + (String(r.NEEDS || "").split("|").filter(Boolean).length || "nothing yet") + (r.CODE ? " · code " + r.CODE : "");
  }
  function create(type) {
    const prefix = { stamp: "RANK", task: "TASK", prize: "PRIZE" }[type];
    const id = ED.newId(prefix);
    const base = { TYPE: type, ID: id, TITLE: "New " + KIND[type] };
    if (type === "stamp") Object.assign(base, { STARS: "1|2|3", RANKS: "Beginner|Explorer|Expert" });
    if (type === "task") Object.assign(base, { SCOPE: "behavior", TARGET: "story", BUTTON: "Show Me" });
    ED.change("passport.csv", f => f.rows.push(Object.assign(Object.fromEntries(f.cols.map(c => [c, ""])), base)), "new " + type);
    select(id);
  }
  function select(id) { selId = id; ED.inspect(inspector); ED.rerender(); }

  function inspector(box) {
    const r = byId(selId); if (!r) { ED.closeInspector(); return; }
    const top = h("div", "ed-insp-top", '<span class="ed-kind">' + KIND[r.TYPE] + '</span><button type="button" class="ed-x" aria-label="Close">✕</button>');
    top.querySelector(".ed-x").addEventListener("click", () => { selId = null; ED.closeInspector(); ED.rerender(); }); box.appendChild(top);
    const s = (k, label) => v => { set(r, k, v, label); ED.rerender(); };
    ui.text(box, r.TYPE === "task" ? "What to Do" : "Name", r.TITLE, s("TITLE"));
    const tasks = rows().filter(x => x.TYPE === "task").map(x => [x.ID, x.TITLE || x.ID]);
    if (r.TYPE === "stamp") {
      ui.select(box, "Category", r.CATEGORY, [["", "Any"]].concat([...ED.data.cats.values()].map(c => [c.CODE, (c.LABEL || c.CODE) + (ED.yes(c.RANKED) ? " (Ranked)" : "")])), s("CATEGORY", "category"), "When any category is marked Ranked, a rank only shows if its category is ranked.");
      ED.iconPicker(box, "Badge Picture", r.ICON, s("ICON", "icon"));
      const th = (r.STARS || "1|2|3").split("|"), rk = (r.RANKS || "").split("|");
      const g = h("div", "ed-starrows"); box.appendChild(g);
      [0, 1, 2].forEach(i => {
        const row = h("div", "ed-grid2"); g.appendChild(row);
        ui.number(row, "★".repeat(i + 1) + " After Tasks", th[i], v => { const a = (r.STARS || "1|2|3").split("|"); a[i] = v; set(r, "STARS", a.join("|"), "stars"); ED.rerender(); }, "", { min: 1 });
        ui.text(row, "Rank Name", rk[i], v => { const a = (r.RANKS || "").split("|"); while (a.length < 3) a.push(""); a[i] = v; set(r, "RANKS", a.join("|"), "rank names"); });
      });
      ui.picker(box, "Its Tasks", r.NEEDS, tasks, s("NEEDS", "tasks"), "Finishing these tasks earns the stars. Make tasks in the Tasks list.", { multi: true, ordered: true });
    } else if (r.TYPE === "task") {
      ui.text(box, "Hint", r.HINT, s("HINT", "hint"), "A nudge shown under the task.");
      ui.text(box, "Helper Button Words", r.BUTTON, s("BUTTON", "button"), "Shows where to go, like Show Stories.");
      const scope = String(r.SCOPE || "behavior").toLowerCase();
      ui.select(box, "What Counts", scope, [["behavior", "Doing Something"], ["item", "Visiting One Place"], ["category", "Visiting Places in a Category"]], v => { ED.change("passport.csv", () => { r.SCOPE = v; r.TARGET = ""; }, "task"); ED.rerenderInspector(); ED.rerender(); });
      if (scope === "behavior") ui.select(box, "Doing What", String(r.TARGET || "story").toLowerCase().replace(/s$/, ""), BEHAVIOR, s("TARGET", "task"));
      if (scope === "item") ui.picker(box, "Which Place", r.TARGET, ED.data.items.map(i => [i.ID, i.NAME || i.ID]), s("TARGET", "task"), "", { required: true });
      if (scope === "category") { ui.select(box, "Which Category", r.TARGET, [["", "Pick One"]].concat([...ED.data.cats.values()].map(c => [c.CODE, c.LABEL || c.CODE])), s("TARGET", "task")); ui.number(box, "How Many", r.COUNT, s("COUNT", "count"), "Different places in that category. Blank = 1.", { min: 1 }); }
      const usedBy = rows().filter(x => x.TYPE === "stamp" && String(x.NEEDS || "").split("|").includes(r.ID));
      ui.note(box, usedBy.length ? "Counts toward: " + usedBy.map(x => x.TITLE).join(", ") + "." : "No rank uses this task yet. Add it to a rank's tasks.", usedBy.length ? "" : "warn");
    } else {
      const opts = [];
      rows().filter(x => x.TYPE === "stamp").forEach(x => [1, 2, 3].forEach(n => opts.push([x.ID + ":" + n, (x.TITLE || x.ID) + ": " + "★".repeat(n), "Rank"])));
      rows().filter(x => x.TYPE === "task").forEach(x => opts.push([x.ID, x.TITLE || x.ID, "Task"]));
      ED.data.items.forEach(i => opts.push([i.ID, i.NAME || i.ID, "Find this place"]));
      ui.picker(box, "Earned By", r.NEEDS, opts, s("NEEDS", "needs"), "Every one of these is needed.", { multi: true });
      ui.text(box, "What They Get", r.REWARD, s("REWARD", "reward"), "Shown when it's won, like: Show this screen at the library for a free pin.", { multi: true, rows: 3 });
      ui.text(box, "Code to Show", r.CODE, s("CODE", "code"), "Optional. A vendor can check it.");
      ui.number(box, "Order in the List", r.ORDER, s("ORDER", "order"));
    }
    ui.buttons(box, [{ text: "Duplicate", onClick: () => { const id = ED.newId(r.ID.split("-")[0] || "P"); ED.change("passport.csv", f => f.rows.splice(f.rows.indexOf(r) + 1, 0, Object.assign({}, r, { ID: id, TITLE: (r.TITLE || "") + " (Copy)" })), "duplicated"); select(id); } },
      { text: "Delete…", danger: true, onClick: () => ED.confirm("Delete " + (r.TITLE || r.ID) + "?", "Anything that needs it will be updated.", "Delete", () => {
        ED.change("passport.csv", f => { f.rows = f.rows.filter(x => x !== r); f.rows.forEach(x => { x.NEEDS = String(x.NEEDS || "").split("|").filter(n => n && n !== r.ID && n.split(":")[0] !== r.ID).join("|"); }); }, "deleted " + r.TYPE);
        selId = null; ED.closeInspector(); ED.rerender();
      }) }]);
    ui.note(box, "ID: " + r.ID);
  }

  ED.panel("passport", { title: "Passport", render, onClose: () => { selId = null; ED.rerender(); } });
})();
