/* ETS Community Map: passport.js
   The passport: places to find, ranks with stars, tasks, and prizes. Progress is kept on the visitor's own phone.
   Loads when site.csv has PASSPORT = yes (and never in an embedded map).

   Places to find: every place marked MAJOR = yes (or every main place, if none are marked).
   How a place's stamp is collected is its CHECKIN column in items.csv:
     blank or "open" = opening it counts   "scan" = arriving by its QR sign (?place=ID&qr=1)
     "near" = being within its RADIUS (meters, 75 if blank)   "none" = no stamp
   passport.csv, one row per stamp, task or prize (TYPE column):
     stamp: ID, TITLE, CATEGORY, ICON, STARS (like 2|4|6 tasks for one, two, three stars), RANKS (three names, with |), NEEDS (its task IDs, with |)
     task:  ID, TITLE, HINT, BUTTON (the helper button's words), SCOPE (behavior | item | category), TARGET, COUNT
              behavior targets: story (open a story), spot (open a photo spot), tour (finish a tour), place (open any place)
     prize: ID, TITLE, NEEDS (stamp IDs, STAMP:stars, task IDs or item IDs, with |), REWARD (what to show a vendor), CODE
   Site settings: PASSPORT, PASSPORT_RANKS (no hides ranks), PRIZES (no hides prizes), PASSPORT_GRAND_RANK (for finishing every rank),
     PASSPORT_STYLE (ring for a progress ring button), RING_COLOR, RING_TRACK, RING_TEXT.
   Links: ?resetpassport clears this phone's progress; ?passportdemo=1 is a practice passport for showing a crowd (nothing is saved). */
(function () {
  "use strict";
  const C = window.ETSCore; if (!C) return;
  const { esc, L, yes } = C;

  C.words({
    passport: "Passport", placesFound: "{n} of {total} places found", ranks: "Ranks", tasks: "Tasks", prizes: "Prizes", placesToFind: "Places to Find",
    stampCollected: "Stamp Collected", stampHere: "Passport stamp: open this place to collect it", stampScan: "Passport stamp: scan this place's QR sign to collect it",
    stampNear: "Passport stamp: be here to collect it", checkIn: "Check In Here", tooFar: "You're {d} away. Get a little closer.", needLocation: "Turn on Show Where I Am to check in.",
    taskDone: "Task Complete!", newStar: "New Star!", tapContinue: "Tap to Continue", prizeEarned: "Prize Earned!", prizeLocked: "Keep going to earn this", showVendor: "Show this screen",
    grandTitle: "Every Rank Complete!", grandText: "Three stars in every rank", demoRibbon: "Practice Passport: nothing is saved", resetDone: "Passport progress cleared",
    noRank: "No rank yet", ofStars: "{n} of 3 stars", nextStar: "{n} more for the next star", allStars: "All three stars!", noPlaces: "No places to find yet."
  });

  /* ---------- progress, kept on this phone ---------- */
  const SUFFIX = C.EVENT ? "_" + C.EVENT.name : "";
  const KEY = "passport" + SUFFIX;
  const DEMO = C.Q.get("passportdemo") === "1";
  if (C.Q.has("resetpassport")) {
    C.store.set(KEY, null);
    const u = new URL(location.href); u.searchParams.delete("resetpassport"); try { history.replaceState(null, "", u.toString()); } catch (e) { /* fine */ }
    setTimeout(() => C.toast(L("resetDone")), 600);
  }
  const blank = () => ({ found: {}, seen: {}, done: {}, stars: {}, prizes: {}, grand: false, nudge: false });
  let P = DEMO ? blank() : Object.assign(blank(), C.store.get(KEY, null) || {});
  const save = () => { if (!DEMO) C.store.set(KEY, P); };

  /* ---------- reading passport.csv ---------- */
  let STAMPS = [], TASKS = new Map(), PRIZES = [];
  const split = v => String(v || "").split("|").map(s => s.trim()).filter(Boolean);
  const nums = v => split(v).map(n => parseInt(n, 10)).filter(n => n > 0);
  const anyRanked = [...C.DATA.cats.values()].some(c => String(c.RANKED || "").trim() !== "");
  const ranksOn = yes(C.SITE.PASSPORT_RANKS, true), prizesOn = yes(C.SITE.PRIZES, true);
  const stampActive = s => ranksOn && (!anyRanked || !s.category || yes((C.DATA.cats.get(s.category) || {}).RANKED));

  const PLACES = (() => {
    const main = C.DATA.items.filter(i => i.kind === "place" && String(i.CHECKIN || "").toLowerCase() !== "none");
    const flagged = main.filter(i => yes(i.MAJOR));
    return flagged.length ? flagged : main.filter(i => !i.PART_OF);
  })();
  const isPlace = new Set(PLACES.map(i => i.ID));
  const modeOf = it => { const m = String(it.CHECKIN || "").trim().toLowerCase(); return m === "qr" ? "scan" : m === "gps" ? "near" : ["scan", "near", "none", "either", "both"].includes(m) ? m : "open"; };

  /* ---------- the button ---------- */
  const STAMP_ICON = '<circle cx="12" cy="9" r="5.5"></circle><path d="M8 14l-2 7 6-3 6 3-2-7"></path>';
  const ringStyle = String(C.SITE.PASSPORT_STYLE || "").toLowerCase() === "ring";
  C.RENDER.passport = () => {
    const found = PLACES.filter(i => P.found[i.ID]).length;
    const b = document.createElement("button"); b.type = "button"; b.className = "round round-passport" + (P.nudge ? " nudge" : "") + (ringStyle ? " ring" : "");
    b.setAttribute("aria-label", L("passport") + ": " + L("placesFound", { n: found, total: PLACES.length })); b.title = L("passport");
    if (ringStyle) {
      const pct = PLACES.length ? Math.round(100 * found / PLACES.length) : 0;
      b.innerHTML = '<svg viewBox="0 0 36 36" class="p-ring" aria-hidden="true"><circle cx="18" cy="18" r="15.9" pathLength="100" class="pr-track"' + (C.SITE.RING_TRACK ? ' style="stroke:' + esc(C.SITE.RING_TRACK) + '"' : "") + '></circle>' +
        '<circle cx="18" cy="18" r="15.9" pathLength="100" class="pr-fill" style="stroke-dasharray:' + pct + ' 100' + (C.SITE.RING_COLOR ? ";stroke:" + esc(C.SITE.RING_COLOR) : "") + '"></circle></svg><b class="pr-n"' + (C.SITE.RING_TEXT ? ' style="color:' + esc(C.SITE.RING_TEXT) + '"' : "") + ">" + found + "</b>";
    } else b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + STAMP_ICON + "</svg>" + (found ? '<span class="p-count">' + found + "</span>" : "");
    b.addEventListener("click", () => open());
    return b;
  };
  C.MENU_ITEMS.passport = { show: () => true, label: () => L("passport"), run: () => open() };

  /* ---------- earning ---------- */
  function stars(s) {
    const n = s.tasks.filter(id => P.done[id]).length;
    let k = 0; s.thresholds.forEach((t, i) => { if (n >= t) k = i + 1; });
    return { n, k: Math.min(3, k) };
  }
  function find(it, how) {
    if (!isPlace.has(it.ID) || P.found[it.ID]) return;
    const m = modeOf(it);
    const ok = m === "open" ? true : m === "scan" ? how === "qr" : m === "near" ? how === "near" : m === "either" ? (how === "qr" || how === "near") : m === "both" ? how === "qr" : false;
    if (!ok) return;
    P.found[it.ID] = Date.now(); P.nudge = true;
    stampToast(it);
  }
  function seen(kind, it) {             // feed every task that this action could count toward
    TASKS.forEach(t => {
      if (P.done[t.id]) return;
      let hit = false;
      if (t.scope === "behavior") hit = t.target === kind || (t.target === "spot" && kind === "photospot") || (t.target === "place" && kind === "place");
      else if (t.scope === "item") hit = !!it && it.ID.toLowerCase() === t.target;
      else if (t.scope === "category") hit = !!it && String(it.CATEGORY || "").toLowerCase() === t.target;
      if (!hit) return;
      const list = P.seen[t.id] || (P.seen[t.id] = []);
      const key = it ? it.ID : kind + ":" + Date.now();
      if (!list.includes(key)) list.push(key);
      if (list.length >= t.count) { P.done[t.id] = Date.now(); queue.push({ kind: "task", task: t }); }
    });
  }
  function afterChange() {
    STAMPS.filter(stampActive).forEach(s => {
      const k = stars(s).k, was = P.stars[s.id] || 0;
      if (k > was) { P.stars[s.id] = k; queue.push({ kind: "star", stamp: s, stars: k }); }
    });
    // a task that earns a star celebrates once: the star (the task's own celebration is dropped)
    if (queue.some(j => j.kind === "star")) for (let k = queue.length - 1; k >= 0; k--) if (queue[k].kind === "task") queue.splice(k, 1);
    const act = STAMPS.filter(stampActive);
    if (!P.grand && act.length && act.every(s => (P.stars[s.id] || 0) >= 3)) { P.grand = true; queue.push({ kind: "grand" }); }
    if (prizesOn) PRIZES.forEach(z => { if (!P.prizes[z.id] && prizeMet(z)) { P.prizes[z.id] = Date.now(); queue.push({ kind: "prize", prize: z }); } });
    save(); C.renderControls(); pump();
    if (document.querySelector("#sheetBody .pp")) render();   // the passport is open: refresh it
  }
  function prizeMet(z) {
    if (!z.needs.length) return false;
    return z.needs.every(tok => {
      const m = /^(.+):(\d)$/.exec(tok);
      if (m) return (P.stars[m[1]] || 0) >= +m[2];
      if (STAMPS.some(s => s.id === tok)) return (P.stars[tok] || 0) >= 1;
      if (TASKS.has(tok)) return !!P.done[tok];
      return !!P.found[tok];
    });
  }

  let READY = false; const early = [];       // anything that happens before passport.csv has loaded waits for it
  const whenReady = f => (READY ? f() : early.push(f));
  document.addEventListener("ets:open", e => whenReady(() => {
    const it = e.detail.item, how = e.detail.how;
    find(it, how);
    seen(it.kind, it);
    afterChange();
  }));
  document.addEventListener("ets:near", e => whenReady(() => { find(e.detail.item, "near"); afterChange(); }));
  document.addEventListener("ets:tourdone", () => whenReady(() => { seen("tour", null); afterChange(); }));

  /* ---------- the line on a place's card ---------- */
  document.addEventListener("ets:card", e => {
    const it = e.detail.item; if (!isPlace.has(it.ID)) return;
    const m = modeOf(it), got = !!P.found[it.ID];
    const row = document.createElement("div"); row.className = "c-stamp" + (got ? " got" : "");
    if (got) row.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + STAMP_ICON + "</svg><span>" + esc(L("stampCollected")) + "</span>";
    else {
      const text = m === "scan" ? L("stampScan") : m === "near" || m === "either" ? L("stampNear") : L("stampHere");
      row.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + STAMP_ICON + "</svg><span>" + esc(text) + "</span>" +
        ((m === "near" || m === "either") && it.hasPos ? '<button type="button" class="act" data-checkin="1">' + esc(L("checkIn")) + '</button><small class="c-stamp-msg"></small>' : "");
    }
    const acts = e.detail.body.querySelector(".c-acts");
    (acts || e.detail.body.firstChild).after(row);
    const b = row.querySelector("[data-checkin]");
    if (b) b.addEventListener("click", () => checkIn(it, row.querySelector(".c-stamp-msg")));
  });
  function checkIn(it, msg) {
    const N = window.ETSNear, f = N && N.last();
    if (!f) { msg.textContent = L("needLocation"); if (N) N.start(); return; }
    const d = N.distance([f.lng, f.lat], [it.lng, it.lat]), r = (parseFloat(it.RADIUS) || 75) + Math.min(f.acc || 0, 50);
    if (d <= r) { find(it, "near"); afterChange(); if (C.openItem === it) C.openCard(it); }
    else msg.textContent = L("tooFar", { d: N.fmt(d) });
  }

  /* ---------- the passport itself ---------- */
  let featured = null;
  const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"></path></svg>';
  const starRow = (n, newest) => [1, 2, 3].map(i => '<span class="' + (i <= n ? "on" : "off") + (i === newest ? " new" : "") + '">' + STAR + "</span>").join("");
  function emblem(s, big) {
    const ic = s.icon && C.DATA.icons.icons[s.icon] ? '<img src="' + C.iconDataUrl(s.icon, 96) + '" alt="">' : '<svg viewBox="0 0 24 24" class="em-def">' + STAMP_ICON + "</svg>";
    return '<span class="emblem' + (big ? " big" : "") + '">' + ic + (big ? "<b>" + esc(s.title) + "</b>" : "") + "</span>";
  }
  function open() { P.nudge = false; save(); C.renderControls(); C.highlight(null); C.openSheetHtml('<div class="pp"></div>', null, "open"); render(); C.setUrl({ place: null, passport: "1" }); C.onSheetClose = () => C.setUrl({ passport: null }); }
  function render() {
    const box = document.querySelector("#sheetBody .pp"); if (!box) return;
    const found = PLACES.filter(i => P.found[i.ID]).length;
    const act = STAMPS.filter(stampActive);
    if (!featured || !act.includes(featured)) featured = act[0] || null;
    const parts = [];
    if (DEMO) parts.push('<div class="pp-demo">' + esc(L("demoRibbon")) + "</div>");
    parts.push('<div class="c-head"><h2 class="c-title">' + esc(L("passport")) + "</h2></div>");
    parts.push('<div class="pp-progress"><div class="pp-bar"><span style="width:' + (PLACES.length ? Math.round(100 * found / PLACES.length) : 0) + '%"></span></div><b>' + esc(L("placesFound", { n: found, total: PLACES.length })) + "</b></div>");
    if (act.length) {
      const s = featured, st = stars(s), k = P.stars[s.id] || 0, next = s.thresholds[k];
      parts.push('<h3 class="pp-h">' + esc(L("ranks")) + "</h3>");
      parts.push('<div class="pp-featured">' + emblem(s, true) + '<div class="stars">' + starRow(k) + '</div><div class="pp-rank">' + esc(k ? s.ranks[k - 1] || "" : L("noRank")) + "</div>" +
        '<small>' + esc(k >= 3 ? L("allStars") : next ? L("nextStar", { n: Math.max(1, next - st.n) }) : L("ofStars", { n: k })) + "</small>" +
        (k >= 3 && C.SITE.PASSPORT_GRAND_RANK && P.grand ? '<div class="pp-grand">' + esc(C.SITE.PASSPORT_GRAND_RANK) + "</div>" : "") + "</div>");
      if (act.length > 1) parts.push('<div class="pp-tiles">' + act.map(x => '<button type="button" class="pp-tile' + (x === s ? " sel" : "") + '" data-stamp="' + esc(x.id) + '">' + emblem(x) + '<span class="name">' + esc(x.title) + '</span><span class="stars">' + starRow(P.stars[x.id] || 0) + "</span></button>").join("") + "</div>");
      const tasks = s.tasks.map(id => TASKS.get(id)).filter(Boolean);
      if (tasks.length) parts.push('<h3 class="pp-h">' + esc(L("tasks")) + "</h3>" + tasks.map(taskHtml).join(""));
    }
    const loose = [...TASKS.values()].filter(t => !STAMPS.some(s => stampActive(s) && s.tasks.includes(t.id)));
    if (loose.length && !act.length) parts.push('<h3 class="pp-h">' + esc(L("tasks")) + "</h3>" + loose.map(taskHtml).join(""));
    if (prizesOn && PRIZES.length) parts.push('<h3 class="pp-h">' + esc(L("prizes")) + "</h3>" + PRIZES.map(z => {
      const got = !!P.prizes[z.id];
      return '<div class="pp-prize' + (got ? " got" : "") + '"><b>' + esc(z.title) + "</b>" + (got ? "<p>" + esc(z.reward || L("showVendor")) + "</p>" + (z.code ? '<div class="pp-code">' + esc(z.code) + "</div>" : "") : "<small>" + esc(L("prizeLocked")) + "</small>") + "</div>";
    }).join(""));
    parts.push('<h3 class="pp-h">' + esc(L("placesToFind")) + "</h3>");
    parts.push(PLACES.length ? '<div class="pp-places">' + PLACES.map(it => {
      const got = !!P.found[it.ID], ph = (C.DATA.media.get(it.ID) || []).find(m => (m.KIND || "photo").toLowerCase() === "photo" && m.FILE);
      const ic = (C.DATA.cats.get(it.CATEGORY) || {}).ICON;
      const pic = ph ? '<img src="' + esc(C.mediaUrl(ph.THUMB || ph.FILE)) + '" alt="" loading="lazy">' : ic && C.DATA.icons.icons[ic] ? '<img class="ic" src="' + C.iconDataUrl(ic, 64) + '" alt="">' : "";
      return '<button type="button" class="pp-place' + (got ? " got" : "") + '" data-go="' + esc(it.ID) + '"><span class="pic" style="--c:' + esc(C.colorFor(it)) + '">' + pic + (got ? '<span class="tick">✓</span>' : "") + '</span><span class="name">' + esc(it.NAME || it.ID) + "</span></button>";
    }).join("") + "</div>" : '<p class="hap-empty">' + esc(L("noPlaces")) + "</p>");
    box.innerHTML = parts.join("");
    box.querySelectorAll("[data-stamp]").forEach(b => b.addEventListener("click", () => { featured = STAMPS.find(s => s.id === b.dataset.stamp); render(); }));
    box.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => { const it = C.DATA.byId.get(b.dataset.go); if (it) C.goTo(it); }));
    box.querySelectorAll("[data-task]").forEach(b => b.addEventListener("click", () => helper(TASKS.get(b.dataset.task))));
  }
  function taskHtml(t) {
    const done = !!P.done[t.id], have = done ? t.count : Math.min((P.seen[t.id] || []).length, t.count);
    return '<div class="pp-task' + (done ? " done" : "") + '"><span class="chk">' + (done ? "✓" : "") + '</span><div class="body"><div class="lbl">' + esc(t.title) + (t.count > 1 ? ' <span class="cnt">' + have + " / " + t.count + "</span>" : "") + "</div>" +
      (t.hint && !done ? '<div class="th">' + esc(t.hint) + "</div>" : "") + (t.button && !done ? '<button type="button" class="act" data-task="' + esc(t.id) + '">' + esc(t.button) + "</button>" : "") + "</div></div>";
  }
  // The helper button under a task: shows where to go
  function helper(t) {
    if (!t) return;
    if (t.scope === "behavior" && t.target === "tour" && window.ETSTours) { window.ETSTours.openList(); return; }
    let ids = [];
    if (t.scope === "behavior") ids = C.DATA.items.filter(i => i.hasPos && (i.kind === t.target || (t.target === "spot" && i.kind === "photospot"))).map(i => i.ID);
    else if (t.scope === "item") { const it = C.DATA.items.find(i => i.ID.toLowerCase() === t.target); if (it) { C.goTo(it); return; } }
    else if (t.scope === "category") ids = C.DATA.items.filter(i => i.hasPos && String(i.CATEGORY || "").toLowerCase() === t.target).map(i => i.ID);
    if (!ids.length) return;
    C.closeSheet(); C.highlight(ids); C.fitTo(ids);
  }

  /* ---------- celebrations: the stamp slam, stars, confetti ---------- */
  const queue = []; let showing = false, autoTimer = 0, stopConfetti = null;
  function stampToast(it) {
    const el = document.createElement("div"); el.className = "stamp-toast"; el.setAttribute("role", "status");
    el.innerHTML = '<span class="st-seal"><svg viewBox="0 0 24 24" aria-hidden="true">' + STAMP_ICON + "</svg></span><span><b>" + esc(L("stampCollected")) + "</b><small>" + esc(it.NAME || it.ID) + "</small></span>";
    document.body.appendChild(el);
    if (navigator.vibrate && !C.REDUCED && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) { try { navigator.vibrate([30, 40, 30]); } catch (e) { /* fine */ } }
    setTimeout(() => el.classList.add("out"), 2600); setTimeout(() => el.remove(), 3100);
  }
  const rank = j => j.kind === "grand" ? 5 : j.kind === "prize" ? 4 : j.kind === "star" ? (j.stars >= 3 ? 3 : 2) : 1;
  function pump() {
    if (showing || !queue.length) return;
    if (document.querySelector(".welcome")) { setTimeout(pump, 600); return; }      // wait for the welcome screen to finish
    queue.sort((a, b) => rank(a) - rank(b));
    showing = true;
    const job = queue.shift();
    setTimeout(() => slam(job), 500);
  }
  function slam(job) {
    const el = document.createElement("div"); el.className = "p-slam"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.tabIndex = -1;
    const big = job.kind === "star" || job.kind === "grand";
    el.classList.toggle("plain", !big);
    let inner;
    if (job.kind === "grand") inner = '<div class="seal"><svg viewBox="0 0 24 24">' + STAMP_ICON + "</svg><b>" + esc(C.SITE.PASSPORT_GRAND_RANK || L("grandTitle")) + '</b></div><div class="rank">' + esc(L("grandTitle")) + '</div><div class="grand">' + esc(L("grandText")) + "</div>";
    else if (job.kind === "star") { const s = job.stamp; inner = '<div class="seal">' + emblem(s).replace('class="emblem"', 'class="emblem in-seal"') + "<b>" + esc(s.title) + '</b></div><div class="stars">' + starRow(job.stars, job.stars) + '</div><div class="rank">' + esc(s.ranks[job.stars - 1] || L("newStar")) + "</div>" + (job.stars >= 3 && C.SITE.PASSPORT_GRAND_RANK && P.grand ? '<div class="grand">' + esc(C.SITE.PASSPORT_GRAND_RANK) + "</div>" : ""); }
    else if (job.kind === "prize") inner = '<div class="seal"><svg viewBox="0 0 24 24">' + STAMP_ICON + "</svg><b>" + esc(L("prizeEarned")) + '</b></div><div class="rank">' + esc(job.prize.title) + "</div>" + (job.prize.reward ? '<div class="note">' + esc(job.prize.reward) + "</div>" : "");
    else inner = '<div class="seal small"><svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"></path></svg></div><div class="rank">' + esc(L("taskDone")) + '</div><div class="note">' + esc(job.task.title) + "</div>";
    el.innerHTML = '<div class="rays"></div><canvas></canvas><div class="box">' + inner + '<div class="tap">' + esc(L("tapContinue").toUpperCase()) + "</div></div>";
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add("on"));
    if (big) el.classList.add("hit");
    el.focus();
    if ((job.kind === "grand" || (job.kind === "star" && job.stars >= 3) || job.kind === "prize") && !C.REDUCED) stopConfetti = confetti(el.querySelector("canvas"));
    const dur = job.kind === "grand" ? 12000 : job.kind === "star" ? (job.stars >= 3 ? 10000 : 6000) : job.kind === "prize" ? 9000 : 2600;
    const done = () => {
      clearTimeout(autoTimer); if (stopConfetti) { stopConfetti(); stopConfetti = null; }
      el.remove(); document.removeEventListener("keydown", key, true);
      showing = false; P.nudge = true; save(); C.renderControls(); pump();
    };
    const key = e => { if (e.key === "Escape") { e.stopPropagation(); done(); } };
    el.addEventListener("click", done); document.addEventListener("keydown", key, true);
    autoTimer = setTimeout(done, dur);
  }
  function confetti(canvas) {
    const ctx = canvas.getContext("2d"); if (!ctx) return () => {};
    const W = canvas.width = innerWidth, H = canvas.height = innerHeight;
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#0B7A75";
    const colors = [accent, "#FFC20E", "#E47303", "#91AF45", "#FFFFFF", "#AF350A"];
    const bits = Array.from({ length: 150 }, () => ({ x: Math.random() * W, y: -20 - Math.random() * H * 0.6, w: 6 + Math.random() * 6, h: 10 + Math.random() * 8, vx: -1 + Math.random() * 2, vy: 2 + Math.random() * 3.5, r: Math.random() * 6.28, vr: -0.2 + Math.random() * 0.4, c: colors[Math.floor(Math.random() * colors.length)] }));
    const t0 = performance.now(); let id = 0;
    (function tick(now) {
      ctx.clearRect(0, 0, W, H);
      bits.forEach(b => { b.x += b.vx; b.y += b.vy; b.r += b.vr; ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.r); ctx.fillStyle = b.c; ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); ctx.restore(); });
      if (now - t0 < 4500) id = requestAnimationFrame(tick); else ctx.clearRect(0, 0, W, H);
    })(t0);
    return () => { cancelAnimationFrame(id); ctx.clearRect(0, 0, W, H); };
  }

  /* ---------- start ---------- */
  C.getCSV("passport.csv").then(rows => {
    rows.forEach(r => {
      const type = String(r.TYPE || "").toLowerCase(), id = String(r.ID || "").trim(); if (!id) return;
      if (type === "stamp") STAMPS.push({ id, title: r.TITLE || id, category: r.CATEGORY || "", icon: r.ICON || "", thresholds: (nums(r.STARS).length ? nums(r.STARS) : [1, 2, 3]).slice(0, 3), ranks: split(r.RANKS), tasks: split(r.NEEDS) });
      else if (type === "task") TASKS.set(id, { id, title: r.TITLE || id, hint: r.HINT || "", button: r.BUTTON || "", scope: String(r.SCOPE || "behavior").toLowerCase(), target: String(r.TARGET || "").trim().toLowerCase().replace(/s$/, "").replace(/^photo ?spot$/, "photospot"), count: Math.max(1, parseInt(r.COUNT, 10) || 1) });
      else if (type === "prize") PRIZES.push({ id, title: r.TITLE || id, needs: split(r.NEEDS), reward: r.REWARD || "", code: r.CODE || "", order: +r.ORDER || 999 });
    });
    PRIZES.sort((a, b) => a.order - b.order);
    STAMPS.forEach(s => s.tasks.forEach(t => { if (!TASKS.has(t)) C.warn("Passport stamp " + s.id + " lists task " + t + ", which isn't in passport.csv."); }));
    READY = true; early.splice(0).forEach(f => f());
    C.renderControls();
    if (C.Q.get("passport") === "1") C.onStart(open);
  });
  window.ETSPassport = { open, get progress() { return P; }, places: PLACES, get stamps() { return STAMPS; }, get tasks() { return TASKS; }, get prizes() { return PRIZES; }, demo: DEMO };
})();
