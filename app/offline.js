/* ETS Community Map: offline.js
   Save for Offline Use: keeps a copy of the page, its data, photos and audio on the visitor's phone, so it works with no signal.
   Loads only when a visitor opens it from the More menu. The saving itself is done by sw.js. */
(function () {
  "use strict";
  const C = window.ETSCore; if (!C) return;
  const { esc, L } = C;
  C.words({
    offTitle: "Save for Offline Use", offText: "Keep a copy of this map on your phone so it works with no signal: places, photos, audio, tours and your passport.",
    offStreet: "Good to know: with no signal, the street map's background (roads and names) won't show. Your places, photos, audio, tours and passport will. The Aerial and Topographic maps can be saved for this area, so switch to one of those when you're offline.",
    offTiles: "Also save the Aerial and Topographic maps (about {n} pictures)", offSave: "Save It", offSaving: "Saving… {done} of {total}", offDone: "Saved. This map now works offline.",
    offSome: "Saved, but {n} files couldn't be reached.", offRemove: "Remove the Saved Copy", offRemoved: "The saved copy was removed.", offNo: "This browser can't save maps for offline use."
  });

  function fileList(withTiles) {
    const set = new Set();
    const add = u => { if (u) set.add(new URL(u, location.href).toString()); };
    add("index.html"); add("./"); add("manifest.json");
    document.querySelectorAll("script[src], link[rel=stylesheet]").forEach(el => add(el.src || el.href));
    ["app/welcome-themes.js", "app/welcome.js"].forEach(add);
    ["site.csv", "items.csv", "categories.csv", "media.csv", "map.json", "icons.json", "happenings.csv", "routes.geojson", "passport.csv"].forEach(f => add(C.dataUrl(f)));
    if (C.EVENT) add(C.BASE + "events/" + C.EVENT.name + "/event.json");
    C.DATA.media.forEach(rows => rows.forEach(m => { if (!/video/i.test(m.KIND || "")) { add(C.mediaUrl(m.FILE)); if (m.THUMB) add(C.mediaUrl(m.THUMB)); if (m.ANIMATION) add(C.mediaUrl(m.ANIMATION)); } }));
    if (C.SITE.WELCOME_GIF) add(C.mediaUrl(C.SITE.WELCOME_GIF));
    if (C.SITE.BADGE_LOGO) add(C.mediaUrl(C.SITE.BADGE_LOGO));
    const bd = C.DATA.map.backdrop; if (bd) (bd.floors || [{ image: bd.image }]).forEach(f => f.image && add((C.EVENT ? C.BASE + "events/" + C.EVENT.name + "/media/" : C.BASE + "media/") + f.image));
    (C.DATA.map.overlays || []).forEach(o => { if (o.offline === true && o.file) add(C.BASE + (o.file.includes("/") ? o.file : "overlays/" + o.file)); });   // old maps are big: only those marked "offline": true
    if (withTiles) tiles().forEach(add);
    return [...set];
  }
  // The USGS map pictures covering the allowed area (or the area's outline, or the places), zoom 10 to 15
  function area() {
    const S = C.SITE, b = [parseFloat(S.BOUNDS_WEST), parseFloat(S.BOUNDS_SOUTH), parseFloat(S.BOUNDS_EAST), parseFloat(S.BOUNDS_NORTH)];
    if (b.every(isFinite)) return [[b[0], b[1]], [b[2], b[3]]];
    const pts = C.DATA.items.filter(i => i.hasPos).map(i => [i.lng, i.lat]);
    return pts.length ? C.boundsOf(pts) : null;
  }
  const inUS = a => a && a[0][1] > 17 && a[1][1] < 72 && a[0][0] > -180 && a[1][0] < -64;
  function tiles() {
    const a = area(); if (!inUS(a) || C.noRealPlace) return [];
    const out = [];
    const tx = (lng, z) => Math.floor((lng + 180) / 360 * 2 ** z);
    const ty = (lat, z) => { const r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z); };
    for (let z = 10; z <= 15; z++) {
      for (let x = tx(a[0][0], z); x <= tx(a[1][0], z); x++) for (let y = ty(a[1][1], z); y <= ty(a[0][1], z); y++) {
        ["USGSImageryOnly", "USGSTopo"].forEach(n => out.push("https://basemap.nationalmap.gov/arcgis/rest/services/" + n + "/MapServer/tile/" + z + "/" + y + "/" + x));
      }
    }
    return out.length > 6000 ? [] : out;          // a huge area would fill the phone: skip the map pictures then
  }

  async function worker() {
    const reg = await navigator.serviceWorker.register("sw.js");
    await navigator.serviceWorker.ready;
    return reg.active || navigator.serviceWorker.controller;
  }
  function open() {
    if (!("serviceWorker" in navigator)) { C.toast(L("offNo")); return; }
    const t = tiles().length;
    C.openSheetHtml('<div class="c-head"><h2 class="c-title">' + esc(L("offTitle")) + '</h2></div><div class="c-text"><p>' + esc(L("offText")) + "</p><p>" + esc(L("offStreet")) + "</p></div>" +
      (t ? '<label class="off-tiles"><input type="checkbox" checked> ' + esc(L("offTiles", { n: t.toLocaleString() })) + "</label>" : "") +
      '<div class="off-prog" hidden><div class="pp-bar"><span></span></div><small></small></div>' +
      '<div class="c-acts"><button type="button" class="act act-main" data-save="1"><span>' + esc(L("offSave")) + '</span></button><button type="button" class="act" data-clear="1"><span>' + esc(L("offRemove")) + "</span></button></div>", body => {
      const prog = body.querySelector(".off-prog"), bar = prog.querySelector("span"), msg = prog.querySelector("small");
      navigator.serviceWorker.onmessage = e => {
        const d = e.data || {};
        if (d.type === "progress" || d.type === "saved") { prog.hidden = false; bar.style.width = Math.round(100 * d.done / Math.max(1, d.total)) + "%"; msg.textContent = d.type === "saved" ? (d.failed ? L("offSome", { n: d.failed }) : L("offDone")) : L("offSaving", { done: d.done, total: d.total }); }
        if (d.type === "saved") { C.store.set("offline_saved", Date.now()); body.querySelector("[data-save]").disabled = false; }
        if (d.type === "cleared") { C.toast(L("offRemoved")); prog.hidden = true; }
      };
      body.querySelector("[data-save]").addEventListener("click", async e => {
        e.currentTarget.disabled = true; prog.hidden = false; msg.textContent = L("offSaving", { done: 0, total: "…" });
        try { const sw = await worker(); const cb = body.querySelector(".off-tiles input"); sw.postMessage({ type: "save", urls: fileList(!!(cb && cb.checked)) }); }
        catch (err) { msg.textContent = L("offNo"); C.warn("Offline saving couldn't start: " + err.message); }
      });
      body.querySelector("[data-clear]").addEventListener("click", async () => { try { const sw = await worker(); sw.postMessage({ type: "clear" }); C.store.set("offline_saved", null); } catch (err) { /* nothing saved */ } });
    }, "open");
  }
  window.ETSOffline = { open, fileList, tiles };
})();
