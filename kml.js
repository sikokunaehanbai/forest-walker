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
        if (c.length) feats.push({ type: "Feature", properties: { name }, geometry: { type: "Point", coordinates: c[0] } });
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
      paint: { "circle-color": AREA_COLOR, "circle-radius": 7, "circle-stroke-color": "#fff", "circle-stroke-width": 2.5 } });
    refresh();
  }

  function fit(a) {
    const b = bboxOf(a.fc); if (!b) return;
    const m = $("menu"); if (m) m.classList.add("hidden");
    map.fitBounds([[b.w, b.s], [b.e, b.n]], { padding: 50, maxZoom: 18, duration: 900 });
  }
  function addFile(name, text) {
    let fc;
    const t = text.replace(/^﻿/, "").trim();
    try { fc = t.startsWith("{") ? parseGeo(t) : parseKml(t); }
    catch (e) { setStatus("「" + name + "」を読み込めませんでした(KML/GeoJSONではありません)", 5000); return null; }
    if (!fc.features.length) { setStatus("「" + name + "」に境界(ポリゴン・線・点)が見つかりませんでした", 5000); return null; }
    const b = bboxOf(fc);
    if (!b || b.bad) { setStatus("「" + name + "」は緯度経度(WGS84)ではないため表示できません。QGISで『座標系=EPSG:4326』にして書き出してください", 7000); return null; }
    const base = name.replace(/\.[^.]+$/, "");
    const a = { id: "a" + Date.now() + Math.floor(Math.random() * 1000), name: base || "施業地", on: true, fc };
    areas.push(a);
    if (!save()) { areas.pop(); return null; }
    refresh();
    return a;
  }
  async function importFiles(files) {
    let last = null;
    for (const f of files) { const a = addFile(f.name, await f.text()); if (a) last = a; }
    if (last) { fit(last); setStatus("「" + last.name + "」を表示しました", 3000); }
  }

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
      del.onclick = () => { if (confirm("「" + a.name + "」を削除します。よろしいですか?")) { areas = areas.filter(x => x !== a); save(); refresh(); } };
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

  // 地図の準備ができるまで、層の追加を繰り返し試す
  let tries = 0;
  const iv = setInterval(() => {
    try { initLayers(); } catch (e) { if (++tries < 300) return; }
    clearInterval(iv);
    if (map.getSource("areas")) { map.on("moveend", toTop); takeShared(); }
  }, 200);
  renderList();
})();
