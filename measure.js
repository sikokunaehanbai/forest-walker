/* 距離・面積の測定(地図をタップして点を打つ) */
(() => {
  const $ = id => document.getElementById(id);
  const btn = $("measBtn"), bar = $("measBar");
  let on = false, pts = [];
  const R = 6371008.8, rad = Math.PI / 180;

  function dist(a, b) {
    const dLat = (b[1] - a[1]) * rad, dLng = (b[0] - a[0]) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function area(ps) {
    if (ps.length < 3) return 0;
    const lat0 = ps.reduce((s, p) => s + p[1], 0) / ps.length, lng0 = ps[0][0];
    const xy = ps.map(p => [(p[0] - lng0) * rad * R * Math.cos(lat0 * rad), (p[1] - lat0) * rad * R]);
    let s = 0;
    for (let i = 0; i < xy.length; i++) { const a = xy[i], b = xy[(i + 1) % xy.length]; s += a[0] * b[1] - b[0] * a[1]; }
    return Math.abs(s) / 2;
  }
  const fmtD = m => m < 1000 ? Math.round(m).toLocaleString("ja-JP") + " m" : (m / 1000).toFixed(m < 10000 ? 3 : 2) + " km";
  const fmtA = m => Math.round(m).toLocaleString("ja-JP") + " ㎡(" + (m / 10000).toFixed(m >= 100000 ? 2 : 3) + " ha)";

  function ensureLayers() {
    if (map.getSource("meas")) return;
    map.addSource("meas", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({ id: "meas-fill", type: "fill", source: "meas", filter: ["==", "$type", "Polygon"], paint: { "fill-color": "#ffd23f", "fill-opacity": 0.22 } });
    map.addLayer({ id: "meas-line", type: "line", source: "meas", filter: ["==", "$type", "LineString"], paint: { "line-color": "#ffd23f", "line-width": 3.5 } });
    map.addLayer({ id: "meas-pt", type: "circle", source: "meas", filter: ["==", "$type", "Point"], paint: { "circle-radius": 6, "circle-color": "#fff", "circle-stroke-color": "#d9480f", "circle-stroke-width": 3 } });
  }
  function draw() {
    ensureLayers();
    const f = pts.map(p => ({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: p } }));
    if (pts.length >= 2) f.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: pts } });
    if (pts.length >= 3) f.push({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [pts.concat([pts[0]])] } });
    map.getSource("meas").setData({ type: "FeatureCollection", features: f });
    let tot = 0; for (let i = 1; i < pts.length; i++) tot += dist(pts[i - 1], pts[i]);
    let h = "";
    if (!pts.length) h = "地図をタップして点を打ってください";
    else {
      h = "合計 <b>" + fmtD(tot) + "</b>";
      if (pts.length >= 2) h += "　(直前の点から " + fmtD(dist(pts[pts.length - 2], pts[pts.length - 1])) + ")";
      if (pts.length >= 3) {
        const loop = tot + dist(pts[pts.length - 1], pts[0]);
        h += "<br>囲んだ範囲 <b>" + fmtA(area(pts)) + "</b>　周囲 " + fmtD(loop);
      }
    }
    $("measTxt").innerHTML = h;
  }
  function setOn(v) {
    on = v; btn.classList.toggle("on", on); bar.classList.toggle("hidden", !on);
    map.getCanvas().style.cursor = on ? "crosshair" : "";
    if (on) { if (!$("sheet").classList.contains("hidden")) $("sheetClose").click(); pts = []; }
    if (map.getSource("meas") || on) draw();
  }
  btn.onclick = () => setOn(!on);
  $("measUndo").onclick = () => { pts.pop(); draw(); };
  $("measClear").onclick = () => { pts = []; draw(); };
  $("measEnd").onclick = () => { pts = []; setOn(false); };
  map.on("click", e => { if (!on) return; pts.push([e.lngLat.lng, e.lngLat.lat]); draw(); });
  window.FWMeasure = { on: () => on };
})();
