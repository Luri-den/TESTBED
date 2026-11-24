/* ETS Community Map: happenings.js
   What's on: the This Week tag on the map, the Happenings list (This Week, This Month, Calendar),
   and each happening's own card. Reads data/happenings.csv. Loads only when that file has rows.

   happenings.csv columns:
     ID, NAME, TAG (short label for the tag; blank = name), COLOR, TEXT, FEATURES (place IDs, separated by |),
     TOUR_ID, LINK, LINK_TEXT, ENABLED (no = hidden), PUBLIC (no = hidden from visitors),
     REPEAT: once | yearly | monthly | weekly | ongoing
       once, yearly:     START, END like 2026-11-07T10:00 (for yearly only the month, day and time count)
       monthly:          START_DAY, END_DAY (1 to 31), START_TIME, END_TIME
       weekly:           DAYS (0 = Sunday ... 6 = Saturday, separated by |), START_TIME, END_TIME
       ongoing:          always on (no dates)
     SOON_DAYS (how many days ahead it counts as "starting soon"; default 14),
     FOLDER (an event folder with its own map), KIND
   Times are the clock on the wall in the site's TIME_ZONE (site.csv), so daylight saving never shifts them. */
(function () {
  "use strict";
  const C = window.ETSCore; if (!C) return;
  const { esc, yes, L } = C;

  C.words({
    happenings: "Happenings", thisWeek: "This Week", thisMonth: "This Month", calendar: "Calendar",
    tagNow: "NOW", tagWeek: "THIS WEEK", tagSoon: "SOON", happeningNow: "Happening now", startsSoon: "Starts soon",
    nextTime: "Next", ended: "Ended", ongoing: "Ongoing", every: "Every {days}", everyMonth: "Every month",
    everyYear: "Every year", nothingWeek: "Nothing on this week.", nothingMonth: "Nothing on this month.",
    nothingDay: "Nothing on this day.", featured: "Where", openItsMap: "Open Its Map", startTour: "Start the Tour",
    moreInfo: "More Information", until: "until {t}", backToList: "All Happenings", today: "Today"
  });

  /* ---------- time, in the site's time zone ---------- */
  const DAY = 864e5;
  const TZ = (C.SITE.TIME_ZONE || "").trim() || undefined;
  const LOCALE = navigator.language || "en-US";
  function wallNow() {                         // the current wall-clock time in the site's zone, as a UTC number
    const d = new Date();
    try {
      const p = {};
      new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
        .formatToParts(d).forEach(x => { p[x.type] = x.value; });
      return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute);
    } catch (e) { C.warn("TIME_ZONE \"" + TZ + "\" isn't recognised; using the visitor's own clock."); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()); }
  }
  const parseLocal = s => { const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?/.exec(String(s || "")); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) : null; };
  const parseTime = s => { const m = /^(\d{1,2}):(\d{2})/.exec(String(s || "")); return m ? [+m[1], +m[2]] : null; };
  const mins = t => t[0] * 60 + t[1];
  const dim = (y, m0) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
  function atDay(y, m0, d, hh, mm) { y += Math.floor(m0 / 12); m0 = ((m0 % 12) + 12) % 12; return Date.UTC(y, m0, Math.min(d, dim(y, m0)), hh, mm); }

  // Every run of a schedule that overlaps [from, to), as wall-clock numbers.
  function runs(s, from, to) {
    const out = [];
    const Y1 = new Date(from).getUTCFullYear(), Y2 = new Date(to).getUTCFullYear();
    if (s.repeat === "ongoing") return [{ start: from - DAY, end: to + DAY, ongoing: true }];
    if (s.repeat === "once" || s.repeat === "yearly") {
      const a = parseLocal(s.start), b = parseLocal(s.end);
      if (a == null || b == null) return out;
      if (s.repeat === "once") out.push({ start: a, end: b });
      else {
        const A = new Date(a), B = new Date(b);
        const key = d => Date.UTC(2001, d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes());
        const wraps = key(B) < key(A);                         // like Dec 20 to Jan 5
        for (let y = Y1 - 1; y <= Y2 + 1; y++) out.push({
          start: atDay(y, A.getUTCMonth(), A.getUTCDate(), A.getUTCHours(), A.getUTCMinutes()),
          end: atDay(y + (wraps ? 1 : 0), B.getUTCMonth(), B.getUTCDate(), B.getUTCHours(), B.getUTCMinutes())
        });
      }
    } else if (s.repeat === "monthly") {
      const st = parseTime(s.startTime) || [0, 0], en = parseTime(s.endTime) || [23, 59], d1 = +s.startDay, d2 = +s.endDay || d1;
      if (!(d1 >= 1)) return out;
      const wraps = d2 < d1 || (d2 === d1 && mins(en) <= mins(st));
      const m0 = Y1 * 12 + new Date(from).getUTCMonth(), m1 = Y2 * 12 + new Date(to).getUTCMonth();
      for (let k = m0 - 1; k <= m1 + 1; k++) out.push({ start: atDay(0, k, d1, st[0], st[1]), end: atDay(0, k + (wraps ? 1 : 0), d2, en[0], en[1]) });
    } else if (s.repeat === "weekly") {
      const st = parseTime(s.startTime) || [0, 0], en = parseTime(s.endTime) || [23, 59];
      const overnight = mins(en) <= mins(st);
      for (let d = Math.floor(from / DAY) * DAY - DAY; d < to && out.length < 2000; d += DAY)
        if (s.days.includes(new Date(d).getUTCDay())) out.push({ start: d + mins(st) * 6e4, end: d + (overnight ? DAY : 0) + mins(en) * 6e4 });
    }
    return out.filter(o => o.end > o.start && o.end > from && o.start < to).sort((a, b) => a.start - b.start);
  }
  function status(h, now) {
    if (h.s.repeat === "ongoing") return { state: "now", ongoing: true };
    const around = runs(h.s, now - 400 * DAY, now + 400 * DAY);
    const cur = around.find(o => o.start <= now && now < o.end);
    if (cur) return { state: "now", start: cur.start, end: cur.end };
    const next = around.find(o => o.start > now);
    if (!next) { const last = around[around.length - 1]; return { state: "ended", end: last ? last.end : null }; }
    const soon = (h.s.soonDays == null || h.s.soonDays === "" ? 14 : +h.s.soonDays) * DAY;
    return { state: next.start - now <= soon ? "soon" : "later", start: next.start, end: next.end };
  }

  // Dates in the visitor's own style; the numbers are wall-clock, so they're shown "as UTC"
  const fmt = (ms, o) => new Date(ms).toLocaleString(LOCALE, Object.assign({ timeZone: "UTC" }, o));
  const fDay = ms => fmt(ms, { weekday: "short", month: "short", day: "numeric" });
  const fTime = ms => fmt(ms, { hour: "numeric", minute: "2-digit" }).replace(/:00(?=\s|$)/, "");
  const fClock = t => { const p = parseTime(t); return p ? fTime(Date.UTC(2000, 0, 1, p[0], p[1])) : ""; };
  const weekdayName = (d, style) => fmt(Date.UTC(2023, 0, 1 + d), { weekday: style || "long" });   // Jan 1 2023 was a Sunday
  const sameDay = (a, b) => Math.floor(a / DAY) === Math.floor(b / DAY);
  function when(r) {
    if (!r || r.ongoing) return L("ongoing");
    const allDay = new Date(r.start).getUTCHours() === 0 && new Date(r.start).getUTCMinutes() === 0 && (r.end - r.start) % DAY === 0;
    if (sameDay(r.start, r.end - 1)) return fDay(r.start) + (allDay ? "" : " · " + fTime(r.start) + " – " + fTime(r.end));
    return fDay(r.start) + (allDay ? "" : " " + fTime(r.start)) + " – " + fDay(r.end - (allDay ? 1 : 0)) + (allDay ? "" : " " + fTime(r.end));
  }
  function describe(h) {
    const s = h.s;
    if (s.repeat === "ongoing") return L("ongoing");
    if (s.repeat === "weekly") {
      const names = s.days.slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(d => weekdayName(d));
      const list = names.length > 1 ? names.slice(0, -1).join(", ") + " & " + names[names.length - 1] : names[0] || "";
      return L("every", { days: list }) + (s.startTime ? " · " + fClock(s.startTime) + " – " + fClock(s.endTime) : "");
    }
    if (s.repeat === "monthly") return L("everyMonth") + " · " + s.startDay + (s.endDay && s.endDay !== s.startDay ? "–" + s.endDay : "") + (s.startTime ? " · " + fClock(s.startTime) + " – " + fClock(s.endTime) : "");
    if (s.repeat === "yearly") { const a = parseLocal(s.start), b = parseLocal(s.end); return L("everyYear") + (a != null ? " · " + fmt(a, { month: "short", day: "numeric" }) + " – " + fmt(b, { month: "short", day: "numeric" }) : ""); }
    const a = parseLocal(s.start), b = parseLocal(s.end);
    return a != null && b != null ? when({ start: a, end: b }) : "";
  }

  /* ---------- reading happenings.csv ---------- */
  const list = v => String(v || "").split("|").map(x => x.trim()).filter(Boolean);
  const goodColor = c => /^#[0-9a-f]{3,8}$/i.test(String(c || "").trim()) ? c.trim() : getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
  const HAPS = C.DATA.happenings.map(r => {
    const repeat = String(r.REPEAT || "").toLowerCase().trim() || (r.START ? "once" : (r.FOLDER ? "" : "ongoing"));
    return {
      id: r.ID || r.NAME, name: r.NAME || r.ID, tag: r.TAG || "", color: r.COLOR || "", text: r.TEXT || "",
      features: list(r.FEATURES), tour: r.TOUR_ID || "", link: r.LINK || "", linkText: r.LINK_TEXT || "", folder: r.FOLDER || "",
      enabled: !/^(n|no|false|0|off)$/i.test(String(r.ENABLED || "").trim()),
      public: !/^(n|no|false|0|off)$/i.test(String(r.PUBLIC || "").trim()),
      s: { repeat, start: r.START, end: r.END, startDay: +r.START_DAY || 0, endDay: +r.END_DAY || 0, startTime: r.START_TIME, endTime: r.END_TIME,
           days: list(r.DAYS).map(Number).filter(n => n >= 0 && n <= 6), soonDays: r.SOON_DAYS }
    };
  }).filter(h => {
    if (!h.enabled || (!h.public && !C.Q.get("debug"))) return false;
    if (!["once", "yearly", "monthly", "weekly", "ongoing"].includes(h.s.repeat)) { if (h.s.repeat) C.warn("Happening " + h.id + " has REPEAT \"" + h.s.repeat + "\", which isn't one of once, yearly, monthly, weekly or ongoing."); return !!h.folder; }
    h.features = h.features.filter(id => { if (C.DATA.byId.has(id)) return true; C.warn("Happening " + h.id + " features " + id + ", which isn't on the map."); return false; });
    return true;
  });
  if (!HAPS.length) return;

  /* ---------- the tag on the map ---------- */
  function headline(now) {     // what's on now first, then what starts soonest within a week
    const scored = HAPS.filter(h => h.s.repeat && h.s.repeat !== "ongoing").map(h => ({ h, st: status(h, now) }))   // ongoing things aren't news
      .filter(x => x.st.state === "now" || (x.st.start && x.st.start - now < 7 * DAY));
    scored.sort((a, b) => (a.st.state === "now" ? 0 : 1) - (b.st.state === "now" ? 0 : 1) || (a.st.start || 0) - (b.st.start || 0));
    return scored;
  }
  C.RENDER.happenings = () => {
    const now = wallNow(), top = headline(now);
    const b = document.createElement("button"); b.type = "button";
    if (!top.length) {
      b.className = "pill";
      b.innerHTML = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M3 10h18M8 3v4M16 3v4"></path></svg>' + esc(L("happenings"));
      b.addEventListener("click", () => openList("week"));
      return b;
    }
    const { h, st } = top[0];
    const label = st.state === "now" ? L("tagNow") : L("tagWeek");
    const day = st.state === "now" ? "" : " · " + fmt(st.start, { weekday: "short" });
    b.className = "pill hap-tag";
    b.innerHTML = '<span class="hap-flag" style="background:' + esc(goodColor(h.color || "#F59E0B")) + '">' + esc(label) + "</span>" +
      '<span class="hap-name">' + esc(h.tag || h.name) + esc(day) + "</span>" + (top.length > 1 ? '<span class="hap-more">+' + (top.length - 1) + "</span>" : "");
    b.setAttribute("aria-label", L("happenings") + ": " + (h.tag || h.name));
    b.addEventListener("click", () => top.length > 1 ? openList("week") : openOne(h));
    return b;
  };
  C.MENU_ITEMS.happenings = { show: () => true, label: () => L("happenings"), run: () => openList("week") };
  C.renderControls();
  setInterval(() => { if (document.visibilityState === "visible") C.renderControls(); }, 5 * 6e4);   // keeps "now" current

  /* ---------- the Happenings list ---------- */
  let view = "week", calMonth = null, calDay = null;
  const ICAL = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"></path></svg>';
  function rowsBetween(from, to) {
    const out = [];
    HAPS.filter(h => h.s.repeat).forEach(h => runs(h.s, from, to).forEach(r => out.push({ h, r })));
    out.sort((a, b) => (a.r.ongoing ? 1 : 0) - (b.r.ongoing ? 1 : 0) || a.r.start - b.r.start);
    const seen = new Set();                         // a weekly market shows once per list, at its next time
    return out.filter(x => { if (x.h.s.repeat !== "weekly" && x.h.s.repeat !== "ongoing") return true; if (seen.has(x.h.id)) return false; seen.add(x.h.id); return true; });
  }
  function card(x, now) {
    const { h, r } = x, color = goodColor(h.color);
    const st = status(h, now);
    let flag;
    if (r.ongoing) flag = L("ongoing");
    else if (r.start <= now && now < r.end) flag = L("happeningNow");
    else if (h.s.repeat === "weekly") flag = describe(h).split(" · ")[0];
    else if (st.state === "soon") flag = L("startsSoon");
    else flag = h.tag;
    const where = h.features.map(id => C.DATA.byId.get(id).NAME).slice(0, 2).join(", ");
    const box = r.ongoing ? '<span class="d-big">∞</span>' : '<span class="d-wk">' + esc(fmt(Math.max(r.start, now - (now % DAY)), { weekday: "short" }).toUpperCase()) + '</span><span class="d-big">' + esc(fmt(r.start <= now && now < r.end ? now : r.start, { day: "numeric" })) + "</span>";
    return '<button type="button" class="hap-card" data-h="' + esc(h.id) + '">' +
      '<span class="hap-date" style="background:' + esc(color) + '">' + box + "</span>" +
      '<span class="hap-body">' + (flag ? '<span class="hap-pill" style="color:' + esc(color) + '">' + esc(String(flag).toUpperCase()) + "</span>" : "") +
      '<b>' + esc(h.name) + "</b><small>" + esc([r.ongoing ? "" : (r.start <= now && now < r.end ? L("until", { t: fTime(r.end) }) : when(r)), where].filter(Boolean).join(" · ")) + "</small></span></button>";
  }
  function listHtml() {
    const now = wallNow();
    const tabs = [["week", L("thisWeek")], ["month", L("thisMonth")], ["cal", L("calendar")]].map(([k, lab]) =>
      '<button type="button" role="tab" class="seg' + (view === k ? " on" : "") + '" aria-selected="' + (view === k) + '" data-v="' + k + '">' + esc(lab) + "</button>").join("");
    let body = "";
    if (view === "cal") body = calendarHtml(now);
    else {
      const today = now - (now % DAY);
      const rows = rowsBetween(now, view === "week" ? now + 7 * DAY : today + 31 * DAY);   // "this week" = the next 7 days, the same as the tag
      body = rows.length ? '<div class="hap-list">' + rows.map(x => card(x, now)).join("") + "</div>" : '<div class="hap-empty">' + esc(view === "week" ? L("nothingWeek") : L("nothingMonth")) + "</div>";
    }
    return '<div class="c-head"><h2 class="c-title">' + esc(L("happenings")) + '</h2></div><div class="segs" role="tablist">' + tabs + "</div>" + body;
  }
  function calendarHtml(now) {
    if (calMonth == null) { const d = new Date(now); calMonth = d.getUTCFullYear() * 12 + d.getUTCMonth(); }
    const y = Math.floor(calMonth / 12), m = calMonth % 12, first = Date.UTC(y, m, 1), days = dim(y, m);
    const firstDow = (new Date(first).getUTCDay() + 6) % 7;      // weeks start on Monday
    const all = rowsBetween(first, first + days * DAY);
    const busy = new Set();
    HAPS.filter(h => h.s.repeat && h.s.repeat !== "ongoing").forEach(h => runs(h.s, first, first + days * DAY).forEach(r => {
      for (let d = Math.max(r.start, first) - (Math.max(r.start, first) % DAY); d < Math.min(r.end, first + days * DAY); d += DAY) busy.add(new Date(d).getUTCDate());
    }));
    const todayNum = new Date(now).getUTCFullYear() * 12 + new Date(now).getUTCMonth() === calMonth ? new Date(now).getUTCDate() : -1;
    let grid = '<div class="cal-head"><button type="button" class="round cal-nav" data-m="-1" aria-label="Previous month">' + ICAL + '</button><b>' + esc(fmt(first, { month: "long", year: "numeric" })) + '</b><button type="button" class="round cal-nav cal-next" data-m="1" aria-label="Next month">' + ICAL + "</button></div>";
    grid += '<div class="cal-grid">' + [1, 2, 3, 4, 5, 6, 0].map(d => '<span class="cal-dow">' + esc(weekdayName(d, "narrow")) + "</span>").join("");
    for (let i = 0; i < firstDow; i++) grid += "<span></span>";
    for (let d = 1; d <= days; d++) grid += '<button type="button" class="cal-day' + (busy.has(d) ? " busy" : "") + (d === todayNum ? " today" : "") + (d === calDay ? " on" : "") + '" data-d="' + d + '">' + d + "</button>";
    grid += "</div>";
    const day = calDay ? Date.UTC(y, m, calDay) : null;
    const rows = day ? rowsBetween(day, day + DAY) : all;
    grid += rows.length ? '<div class="hap-list">' + rows.map(x => card(x, now)).join("") + "</div>" : '<div class="hap-empty">' + esc(day ? L("nothingDay") : L("nothingMonth")) + "</div>";
    return grid;
  }
  function wireList(body) {
    body.querySelectorAll("[data-v]").forEach(b => b.addEventListener("click", () => { view = b.dataset.v; calDay = null; redraw(); }));
    body.querySelectorAll("[data-m]").forEach(b => b.addEventListener("click", () => { calMonth += +b.dataset.m; calDay = null; redraw(); }));
    body.querySelectorAll("[data-d]").forEach(b => b.addEventListener("click", () => { calDay = calDay === +b.dataset.d ? null : +b.dataset.d; redraw(); }));
    body.querySelectorAll("[data-h]").forEach(b => b.addEventListener("click", () => { const h = HAPS.find(x => x.id === b.dataset.h); if (h) openOne(h); }));
  }
  const redraw = () => C.openSheetHtml(listHtml(), wireList, "open");
  function openList(v) { view = v || view; calDay = null; C.highlight(null); redraw(); C.setUrl({ place: null, happening: null }); }

  /* ---------- one happening ---------- */
  function openOne(h) {
    const now = wallNow(), st = status(h, now), color = goodColor(h.color);
    const stText = st.ongoing ? L("ongoing") : st.state === "now" ? L("happeningNow") + (st.end ? ", " + L("until", { t: fDay(st.end) + " " + fTime(st.end) }) : "")
      : st.state === "ended" ? L("ended") + (st.end ? " " + fDay(st.end) : "") : (st.state === "soon" ? L("startsSoon") + ": " : L("nextTime") + ": ") + fDay(st.start) + " " + fTime(st.start);
    const parts = [];
    parts.push('<button type="button" class="linkish hap-back" data-back="1">' + ICAL + esc(L("backToList")) + "</button>");
    parts.push('<div class="c-head"><div class="c-kind" style="color:' + esc(color) + '">' + esc(L("happenings").toUpperCase()) + '</div><h2 class="c-title">' + esc(h.name) + "</h2></div>");
    parts.push('<div class="c-meta"><span class="dot" style="background:' + esc(color) + '"></span>' + esc(stText) + "</div>");
    const d = describe(h); if (d && h.s.repeat !== "once" && h.s.repeat !== "ongoing") parts.push('<div class="c-aka">' + esc(d) + "</div>");
    const acts = [];
    if (h.folder) { const u = new URL(location.href); u.searchParams.set("event", h.folder); u.searchParams.delete("place"); u.searchParams.delete("happening"); acts.push('<a class="act act-main" href="' + esc(u.toString()) + '">' + C.svgI("maps") + "<span>" + esc(L("openItsMap")) + "</span></a>"); }
    if (h.tour && st.state === "now" && window.ETSTours && window.ETSTours.has(h.tour)) acts.push('<button type="button" class="act act-main" data-tour="' + esc(h.tour) + '">' + C.svgI("play") + "<span>" + esc(L("startTour")) + "</span></button>");
    if (h.link) acts.push('<a class="act' + (acts.length ? "" : " act-main") + '" target="_blank" rel="noopener" href="' + esc(/^https?:\/\//i.test(h.link) ? h.link : "https://" + h.link) + '">' + C.svgI("web") + "<span>" + esc(h.linkText || L("moreInfo")) + "</span></a>");
    acts.push('<button type="button" class="act" data-share="1">' + C.svgI("share") + "<span>" + esc(L("share")) + "</span></button>");
    parts.push('<div class="c-acts">' + acts.join("") + "</div>");
    if (h.features.length) parts.push('<div class="c-info">' + h.features.map(id => { const it = C.DATA.byId.get(id); return '<div class="row">' + C.svgI("place") + '<span><button type="button" class="linkish" data-open="' + esc(id) + '">' + esc(it.NAME || id) + "</button></span></div>"; }).join("") + "</div>");
    if (h.text) parts.push('<div class="c-text">' + String(h.text).split(/\n\s*\n/).map(p => "<p>" + esc(p).replace(/\n/g, "<br>") + "</p>").join("") + "</div>");
    C.openSheetHtml(parts.join(""), body => {
      body.querySelector("[data-back]").addEventListener("click", () => openList());
      body.querySelectorAll("[data-open]").forEach(b => b.addEventListener("click", () => C.goTo(C.DATA.byId.get(b.dataset.open))));
      const sh = body.querySelector("[data-share]");
      sh.addEventListener("click", async () => {
        const u = new URL(location.href); u.searchParams.delete("embed"); u.searchParams.delete("place"); u.searchParams.set("happening", h.id);
        if (navigator.share) { try { await navigator.share({ title: h.name, url: u.toString() }); return; } catch (e) { if (e && e.name === "AbortError") return; } }
        try { await navigator.clipboard.writeText(u.toString()); C.toast(L("linkCopied")); } catch (e) { prompt(L("share"), u.toString()); }
      });
      const tb = body.querySelector("[data-tour]"); if (tb) tb.addEventListener("click", () => window.ETSTours.start(h.tour));
    }, "peek");
    C.highlight(h.features);
    if (h.features.length) C.fitTo(h.features);
    C.setUrl({ place: null, happening: h.id });
  }

  // ?happening=ID opens it straight away
  const want = C.Q.get("happening");
  if (want) C.onStart(() => { const h = HAPS.find(x => x.id === want); if (h) openOne(h); else C.warn("The link asked for happening " + want + ", which isn't listed."); });
  window.ETSHappenings = { list: HAPS, status: h => status(h, wallNow()), openList, openOne };
})();
