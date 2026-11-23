/* 施業地(境界)データ: KML / GeoJSON を読み込んで赤い太線で表示 */
(() => {
  const AREA_COLOR = "#ff1a1a";
  let areas = ls.get("fw-areas", []);   // [{id,name,on,fc}]
  const EMPTY = { type: "FeatureCollection", features: [] };

  const txt = (el, tag) => { const n = el.getElementsByTagName(tag)[0]; return n ? (n.textContent || "").trim() : ""; };
  function coords(s) {
    const out = [];
    for (const t of (s || "").trim().split(/\s+/)) {
      const p = t.split(",").map(Number);
      if (p.length >= 2 && isFinite(p[0]) && isFinite(p[1])) out.push([+p[0].toFixed(7), +p[1].toFixed(7)]);
    }
    return out;
  }
  function parseKml(text) {
    const d = new DOMParser().parseFromString(text, "application/xml");
    if (d.getElementsByTagName("parsererror").length) throw new Error("KMLとして読めませんでした");
    const feats = [];
    for (const pm of d.getElementsByTagName("Placemark")) {
      const name = txt(pm, "name");
      for (const pg of pm.getElementsByTagName("Polygon")) {
        const rings = [];
        const ob = pg.getElementsByTagName("outerBoundaryIs")[0];
        if (ob) rings.push(coords(txt(ob, "coordinates")));
        for (const ib of pg.getElementsByTagName("innerBoundaryIs")) rings.push(coords(txt(ib, "coordinates")));
        const rr = rings.filter(r => r.length >= 3);
        if (rr.length) feats.push({ type: "Feature", properties: { name }, geometry: { type: "Polygon", coordinates: rr } });
      }
      for (const ln of pm.getElementsByTagName("LineString")) {
        const c = coords(txt(ln, "coordinates"));
        if (c.length >= 2) feats.push({ type: "Feature", properties: { name }, geometry: { type: "LineString", coordinates: c } });
      }
      for (const pt of pm.getElementsByTagName("Point")) {
        const c = coords(txt(pt, "coordinates"));
        if (c.length) {
          const props = { name }, html = txt(pm, "description");
          if (html) {
            const imgs = [...html.matchAll(/<img[^>]*?src=["']([^"']+)["']/gi)].map(m => m[1]);
            const plain = html.replace(/<br\s*\/?>/gi, "\n").replace(/<img[^>]*>/gi, "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").trim();
            if (plain) props.desc = plain.slice(0, 2000);
            if (imgs.length) props.imgs = imgs;
          }
          feats.push({ type: "Feature", properties: props, geometry: { type: "Point", coordinates: c[0] } });
        }
      }
    }
    return { type: "FeatureCollection", features: feats };
  }
  function parseGeo(text) {
    const j = JSON.parse(text);
    let fs = [];
    if (j.type === "FeatureCollection") fs = j.features || [];
    else if (j.type === "Feature") fs = [j];
    else if (j.type) fs = [{ type: "Feature", properties: {}, geometry: j }];
    return { type: "FeatureCollection", features: fs.filter(f => f && f.geometry) };
  }
  function eachCoord(g, f) {
    if (!g) return;
    if (g.type === "GeometryCollection") { g.geometries.forEach(x => eachCoord(x, f)); return; }
    (function w(a) { if (typeof a[0] === "number") f(a); else a.forEach(w); })(g.coordinates);
  }
  function bboxOf(fc) {
    let w = 1e9, s = 1e9, e = -1e9, n = -1e9, bad = false;
    for (const ft of fc.features) eachCoord(ft.geometry, p => {
      if (Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90) bad = true;
      w = Math.min(w, p[0]); e = Math.max(e, p[0]); s = Math.min(s, p[1]); n = Math.max(n, p[1]);
    });
    return w > e ? null : { w, s, e, n, bad };
  }

  function save() {
    try { localStorage.setItem("fw-areas", JSON.stringify(areas)); return true; }
    catch (e) { setStatus("端末に保存できませんでした(容量不足)", 4000); return false; }
  }
  function refresh() {
    const src = map.getSource("areas");
    if (src) src.setData({ type: "FeatureCollection", features: areas.filter(a => a.on).flatMap(a => a.fc.features) });
    toTop(); renderList();
  }
  function toTop() { for (const id of ["area-fill", "area-casing", "area-line", "area-pt"]) if (map.getLayer(id)) map.moveLayer(id); }
  function initLayers() {
    if (map.getSource("areas")) return;
    map.addSource("areas", { type: "geojson", data: EMPTY });
    map.addLayer({ id: "area-fill", type: "fill", source: "areas", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": AREA_COLOR, "fill-opacity": 0.08 } });
    map.addLayer({ id: "area-casing", type: "line", source: "areas", filter: ["!=", ["geometry-type"], "Point"], layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": "#ffffff", "line-opacity": 0.8, "line-width": ["interpolate", ["linear"], ["zoom"], 12, 5, 17, 9, 20, 13] } });
    map.addLayer({ id: "area-line", type: "line", source: "areas", filter: ["!=", ["geometry-type"], "Point"], layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": AREA_COLOR, "line-width": ["interpolate", ["linear"], ["zoom"], 12, 2.5, 17, 5, 20, 8] } });
    map.addLayer({ id: "area-pt", type: "circle", source: "areas", filter: ["==", ["geometry-type"], "Point"],
      paint: { "circle-color": ["case", ["has", "ph"], "#1a73e8", AREA_COLOR], "circle-radius": 8, "circle-stroke-color": "#fff", "circle-stroke-width": 2.5 } });
    map.on("click", "area-pt", ev => {
      const f = ev.features && ev.features[0]; if (!f) return;
      const p = f.properties || {}, ph = typeof p.ph === "string" ? JSON.parse(p.ph) : (p.ph || []);
      openDlg(`<h3>${esc(p.name || "")}</h3>${p.desc ? `<div style="white-space:pre-wrap;margin:6px 0">${esc(p.desc)}</div>` : ""}<div id="ipThumbs" class="thumbs"></div><div class="act"><button id="ipC">閉じる</button></div>`);
      $("ipC").onclick = closeDlg;
      (async () => { for (const id of ph) { const u = await FWStore.get("photo", id).catch(() => null); if (!u || !$("ipThumbs")) continue;
        const w = document.createElement("div"); w.className = "th"; w.style.width = "100%"; w.style.height = "auto"; w.innerHTML = `<img src="${u}" style="width:100%;height:auto;object-fit:contain">`;
        w.querySelector("img").onclick = () => viewPhoto(u); $("ipThumbs").append(w); } })();
    });
    map.on("mouseenter", "area-pt", () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "area-pt", () => { map.getCanvas().style.cursor = ""; });
    refresh();
  }

  function fit(a) {
    const b = bboxOf(a.fc); if (!b) return;
    const m = $("menu"); if (m) m.classList.add("hidden");
    map.fitBounds([[b.w, b.s], [b.e, b.n]], { padding: 50, maxZoom: 18, duration: 900 });
  }
  function addFile(name, text, photos) {
    let fc;
    const t = text.replace(/^﻿/, "").trim();
    try { fc = t.startsWith("{") ? parseGeo(t) : parseKml(t); }
    catch (e) { setStatus("「" + name + "」を読み込めませんでした(KML/GeoJSONではありません)", 5000); return null; }
    if (!fc.features.length) { setStatus("「" + name + "」に境界(ポリゴン・線・点)が見つかりませんでした", 5000); return null; }
    const b = bboxOf(fc);
    if (!b || b.bad) { setStatus("「" + name + "」は緯度経度(WGS84)ではないため表示できません。QGISで『座標系=EPSG:4326』にして書き出してください", 7000); return null; }
    const base = name.replace(/\.[^.]+$/, "");
    const a = { id: "a" + Date.now() + Math.floor(Math.random() * 1000), name: base || "施業地", on: true, fc };
    if (photos) attachPhotos(a, photos);
    for (const ft of fc.features) if (ft.properties) delete ft.properties.imgs;
    areas.push(a);
    if (!save()) { areas.pop(); dropPhotos(a); return null; }
    refresh();
    return a;
  }
  // ---- KMZ(ZIP)を開く ----
  async function inflate(u8) {
    const ds = new DecompressionStream("deflate-raw");
    return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(ds)).arrayBuffer());
  }
  async function unzip(buf) {
    const v = new DataView(buf), u8 = new Uint8Array(buf), dec = new TextDecoder(), out = {};
    let e = -1; for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65600); i--) if (v.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error("zip");
    let p = v.getUint32(e + 16, true); const n = v.getUint16(e + 10, true);
    for (let k = 0; k < n; k++) {
      if (v.getUint32(p, true) !== 0x02014b50) break;
      const meth = v.getUint16(p + 10, true), cs = v.getUint32(p + 20, true), nl = v.getUint16(p + 28, true), el = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), lho = v.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
      const ds = lho + 30 + v.getUint16(lho + 26, true) + v.getUint16(lho + 28, true);
      const raw = u8.subarray(ds, ds + cs);
      if (!name.endsWith("/")) out[name] = meth === 0 ? raw : meth === 8 ? await inflate(raw) : null;
      p += 46 + nl + el + cl;
    }
    return out;
  }
  const b64 = u8 => { let s = ""; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s); };
  function mimeOf(n) { return /\.png$/i.test(n) ? "image/png" : /\.gif$/i.test(n) ? "image/gif" : "image/jpeg"; }
  // 写真は端末内の保管庫に入れ、境界データ側には「写真の札(キー)」だけ持たせる
  const pendingPh = new Map();
  function attachPhotos(a, files) {
    a.ph = [];
    for (const ft of a.fc.features) {
      const imgs = ft.properties && ft.properties.imgs; if (!imgs) continue;
      for (const src of imgs) {
        const key = decodeURIComponent(src).replace(/^\.?\//, "");
        const data = files[key] || files[Object.keys(files).find(k => k.endsWith("/" + key.split("/").pop())) || ""];
        if (!data) continue;
        const id = "i" + a.id + "_" + a.ph.length;
        pendingPh.set(id, "data:" + mimeOf(key) + ";base64," + b64(data));
        a.ph.push(id); (ft.properties.ph = ft.properties.ph || []).push(id);
      }
    }
    const save2 = a.ph.map(id => FWStore.put("photo", id, pendingPh.get(id)).then(() => pendingPh.delete(id)));
    Promise.all(save2).catch(() => setStatus("写真を保存できませんでした(容量不足)", 4000));
  }
  function dropPhotos(a) { (a.ph || []).forEach(id => FWStore.del("photo", id).catch(() => {})); }
  async function addKmz(f) {
    let files;
    try { files = await unzip(await f.arrayBuffer()); } catch (e) { setStatus("「" + f.name + "」を開けませんでした", 5000); return null; }
    const kn = Object.keys(files).find(k => /(^|\/)doc\.kml$/i.test(k)) || Object.keys(files).find(k => /\.kml$/i.test(k));
    if (!kn) { setStatus("「" + f.name + "」にKMLが入っていません", 5000); return null; }
    return addFile(f.name, new TextDecoder().decode(files[kn]), files);
  }
  async function importFiles(files) {
    let last = null;
    for (const f of files) { const a = /\.kmz$/i.test(f.name) ? await addKmz(f) : addFile(f.name, await f.text()); if (a) last = a; }
    if (last) { fit(last); setStatus("「" + last.name + "」を表示しました", 3000); }
  }

  window.FWImport = importFiles;

  function renderList() {
    const box = $("areaList"); if (!box) return;
    box.innerHTML = areas.length ? "" : '<div class="note">まだ読み込んでいません。</div>';
    for (const a of areas) {
      const row = document.createElement("div"); row.className = "muni";
      const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = a.on; cb.style.cssText = "width:22px;height:22px";
      cb.onchange = () => { a.on = cb.checked; save(); refresh(); };
      const sp = document.createElement("span"); sp.textContent = a.name;
      const go = document.createElement("button"); go.textContent = "表示"; go.onclick = () => fit(a);
      const del = document.createElement("button"); del.textContent = "削除";
      del.onclick = () => { if (confirm("「" + a.name + "」を削除します。よろしいですか?")) { dropPhotos(a); areas = areas.filter(x => x !== a); save(); refresh(); } };
      row.append(cb, sp, go, del); box.append(row);
    }
  }

  $("areaBtn").onclick = () => $("areaFile").click();
  $("areaFile").onchange = async e => { const fs = [...e.target.files]; e.target.value = ""; if (fs.length) await importFiles(fs); };

  // 他のアプリ(LINEなど)から「共有」されたファイルを受け取る
  async function takeShared() {
    if (!/[?&]shared=1/.test(location.search) || !("caches" in window)) return;
    history.replaceState(null, "", location.pathname);
    const c = await caches.open("fw-share"); let last = null;
    for (const req of await c.keys()) {
      const r = await c.match(req); const name = decodeURIComponent(req.url.split("/").pop());
      const a = addFile(name, await r.text()); if (a) last = a;
      await c.delete(req);
    }
    if (last) { fit(last); setStatus("「" + last.name + "」を表示しました", 3000); }
  }

  // Androidアプリ版: 他のアプリ(LINEなど)で「開く」ように渡されたファイルを受け取る
  function takeNative() {
    try {
      if (!window.FWNative) return;
      const arr = JSON.parse(window.FWNative.takePending() || "[]"); let last = null;
      for (const f of arr) { const a = addFile(f.name, f.text); if (a) last = a; }
      if (last) { fit(last); setStatus("「" + last.name + "」を表示しました", 3000); }
    } catch (e) {}
  }
  window.fwNativeCheck = takeNative;

  // 地図の準備ができるまで、層の追加を繰り返し試す
  let tries = 0;
  const iv = setInterval(() => {
    try { initLayers(); } catch (e) { if (++tries < 300) return; }
    clearInterval(iv);
    if (map.getSource("areas")) { map.on("moveend", toTop); takeShared(); takeNative(); }
  }, 200);
  renderList();
})();
