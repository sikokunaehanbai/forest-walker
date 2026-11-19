"use strict";
const VERSION = "v0.9";
const $ = id => document.getElementById(id);
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
$("ver").textContent = "フォレストウォーカー " + VERSION + "  /  地図:国土地理院・愛媛県";

/* ---------- 基本設定 ---------- */
const GSI = "https://cyberjapandata.gsi.go.jp/xyz/";
const BASES = {
  std:   { url: GSI + "std/{z}/{x}/{y}.png",           max: 18 },
  photo: { url: GSI + "seamlessphoto/{z}/{x}/{y}.jpg", max: 18 },
  cs:    { url: "https://rinya-ehime.geospatial.jp/tile/rinya/2024/csmap_Ehime/{z}/{x}/{y}.png", max: 18, tms: true, mb: 0.19 },   // 愛媛県 林野 微地形図(CS立体図)
  ls:    { url: "https://rinya-ehime.geospatial.jp/tile/rinya/2024/ls_standtype_Ehime/{z}/{x}/{y}.png", max: 18, tms: true, mb: 0.19 }   // 愛媛県 林野 レーザー林相図
};
let base = ls.get("fw-base", "std");
if (!BASES[base]) base = "std";
let fudeColor = ls.get("fw-fudecolor", "#ff5a3c");
let showFude = ls.get("fw-showfude", true);
let showMemo = ls.get("fw-showmemo", true);

function baseSrc(k) {
  const att = k === "cs" ? "愛媛県 微地形図(CS立体図)" : k === "ls" ? "愛媛県 レーザー林相図" : "<a href='https://maps.gsi.go.jp/development/ichiran.html' target='_blank'>国土地理院</a>";
  return Object.assign({ type: "raster", tiles: [BASES[k].url], tileSize: 256, maxzoom: BASES[k].max, attribution: att }, BASES[k].tms ? { scheme: "tms" } : {});
}
// 背景の地図は「いま使っているもの」だけを持つ(切り替えたら古いものは捨ててメモリを空ける)
const style = { version: 8, sources: { ["b-" + base]: baseSrc(base) }, layers: [{ id: "b-" + base, type: "raster", source: "b-" + base }] };

const protocol = new pmtiles.Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);

const last = ls.get("fw-view", { c: [132.9, 33.65], z: 11 });
const map = new maplibregl.Map({
  container: "map", style, center: last.c, zoom: last.z, maxZoom: 21, minZoom: 5,
  attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false,
  pixelRatio: Math.min(window.devicePixelRatio || 1, 2), maxTileCacheSize: 30, fadeDuration: 100, refreshExpiredTiles: false
});
map.touchZoomRotate.disableRotation();
map.addControl(new maplibregl.ScaleControl({ maxWidth: 100, unit: "metric" }), "bottom-left");

/* ---------- 市町データ ---------- */
let MUNIS = [];
const added = {};   // code -> true
const absUrl = f => new URL("tiles/" + f, location.href).href;
function fillLayerIds() { return Object.keys(added).map(c => "fill-" + c); }

function addMuni(m) {
  const id = m.code;
  if (added[id]) return;
  added[id] = true;
  map.addSource("s-" + id, { type: "vector", url: "pmtiles://" + absUrl(m.file), minzoom: 10, maxzoom: 15 });
  const vis = showFude ? "visible" : "none";
  map.addLayer({ id: "fill-" + id, type: "fill", source: "s-" + id, "source-layer": "fude", minzoom: 13,
    layout: { visibility: vis }, paint: { "fill-color": "#000", "fill-opacity": 0.001 } });
  map.addLayer({ id: "line-" + id, type: "line", source: "s-" + id, "source-layer": "fude", minzoom: 13,
    layout: { visibility: vis, "line-join": "round" },
    paint: { "line-color": fudeColor, "line-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0.45, 16, 0.95],
      "line-width": ["interpolate", ["linear"], ["zoom"], 13, 0.3, 16, 1.2, 19, 2.6] } });
  map.addLayer({ id: "sel-" + id, type: "line", source: "s-" + id, "source-layer": "fude", minzoom: 13,
    filter: selFilter(), layout: { visibility: vis, "line-join": "round" },
    paint: { "line-color": "#ff2d2d", "line-width": 4 } });
}
function ensureMunis() {
  if (!MUNIS.length || map.getZoom() < 10) return;
  const b = map.getBounds();
  const w = b.getWest(), s = b.getSouth(), e = b.getEast(), n = b.getNorth();
  for (const m of MUNIS) {
    const [mw, ms, me, mn] = m.bbox;
    if (mw < e && me > w && ms < n && mn > s) addMuni(m);
  }
}

/* ---------- 選択中の筆 ---------- */
let sel = null;
function selFilter() {
  if (!sel) return ["==", ["get", "c"], "\u0000"];
  return ["all", ["==", ["get", "o"], sel.o], ["==", ["get", "k"], sel.k], ["==", ["get", "c"], sel.c]];
}
function applySel() { for (const c in added) if (map.getLayer("sel-" + c)) map.setFilter("sel-" + c, selFilter()); }

function geomCenter(g) {
  let w = 180, s = 90, e = -180, n = -90;
  const rings = g.type === "Polygon" ? [g.coordinates[0]] : g.type === "MultiPolygon" ? g.coordinates.map(p => p[0]) : [];
  for (const r of rings) for (const p of r) { if (p[0] < w) w = p[0]; if (p[0] > e) e = p[0]; if (p[1] < s) s = p[1]; if (p[1] > n) n = p[1]; }
  return [(w + e) / 2, (s + n) / 2];
}
function dist(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad, dLng = (b[0] - a[0]) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function fmtDist(m) { return m < 1000 ? Math.round(m) + " m" : (m / 1000).toFixed(2) + " km"; }
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

function showParcel(f) { showParcelInfo(f.properties, geomCenter(f.geometry)); }
function showParcelInfo(p, ctr) {
  sel = { o: p.o || "", k: p.k || "", c: p.c || "" };
  applySel();
  const place = [p.o, p.d, p.k].filter(Boolean).join(" ");
  let rows = `<div class="kv"><b>大字</b><span>${esc(p.o || "-")}</span>`;
  if (p.d) rows += `<b>丁目</b><span>${esc(p.d)}</span>`;
  if (p.k) rows += `<b>小字</b><span>${esc(p.k)}</span>`;
  rows += `<b>地番</b><span>${esc(p.c || "-")}</span>`;
  if (p.a) rows += `<b>精度区分</b><span>${esc(p.a)}</span>`;
  if (myPos) rows += `<b>現在地から</b><span>${fmtDist(dist(myPos, ctr))}</span>`;
  rows += `<b>座標</b><span>${ctr[1].toFixed(6)}, ${ctr[0].toFixed(6)}</span></div>`;
  $("sheetBody").innerHTML = `<h2>${esc(place)} ${esc(p.c || "")}</h2><div class="sub">筆の情報</div>${rows}
    <div class="act"><button class="alt" id="actMemo">この筆にメモ</button><button id="actCopy">地番をコピー</button></div>`;
  $("sheet").classList.remove("hidden");
  $("actMemo").onclick = () => memoDialog(ctr[0], ctr[1], null, place + " " + (p.c || "") + "\n");
  $("actCopy").onclick = () => copyText(place + " " + (p.c || ""), $("actCopy"));
}
function closeSheet() { $("sheet").classList.add("hidden"); sel = null; applySel(); }
$("sheetClose").onclick = closeSheet;

map.on("click", e => {
  const ids = fillLayerIds();
  if (!ids.length) return;
  const fs = map.queryRenderedFeatures(e.point, { layers: ids });
  if (fs.length) showParcel(fs[0]); else closeSheet();
});

async function copyText(t, btn) {
  try { await navigator.clipboard.writeText(t); if (btn) { const o = btn.textContent; btn.textContent = "コピーしました ✓"; setTimeout(() => btn.textContent = o, 1500); } return true; }
  catch (e) { return false; }
}

/* ---------- 地番ラベル(拡大時のみ) ---------- */
let labelMarks = [], lastLabelKey = "";
function updateLabels() {
  const z = map.getZoom();
  const key = [z.toFixed(1), map.getCenter().lng.toFixed(4), map.getCenter().lat.toFixed(4), showFude].join();
  if (key === lastLabelKey) return;
  lastLabelKey = key;
  labelMarks.forEach(m => m.remove()); labelMarks = [];
  if (!showFude || z < 17) return;
  const ids = fillLayerIds().filter(i => map.getLayer(i));
  if (!ids.length) return;
  const cv = map.getCanvas(), W = cv.clientWidth, H = cv.clientHeight, cx = W / 2, cy = H / 2;
  const cand = [], seen = new Set();
  for (const f of map.queryRenderedFeatures({ layers: ids })) {
    const p = f.properties; if (!p.c) continue;
    const k = (p.o || "") + "|" + (p.k || "") + "|" + p.c;
    if (seen.has(k)) continue; seen.add(k);
    const ll = geomCenter(f.geometry), pt = map.project(ll);
    if (pt.x < -20 || pt.y < -10 || pt.x > W + 20 || pt.y > H + 10) continue;
    cand.push({ c: p.c, ll, x: pt.x, y: pt.y, d: (pt.x - cx) ** 2 + (pt.y - cy) ** 2 });
  }
  cand.sort((u, v) => u.d - v.d);   // 画面の中心に近いものから
  const placed = [];
  for (const c of cand) {
    if (labelMarks.length >= 90) break;
    const w = 11 * c.c.length + 14;   // 文字の幅のめやす
    if (placed.some(q => Math.abs(q.x - c.x) < (q.w + w) / 2 && Math.abs(q.y - c.y) < 20)) continue;   // 重なるものは出さない
    placed.push({ x: c.x, y: c.y, w });
    const el = document.createElement("div"); el.className = "pl"; el.textContent = c.c;
    labelMarks.push(new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(c.ll).addTo(map));
  }
}
map.on("idle", updateLabels);
{
  const cv = map.getCanvas();
  cv.addEventListener("webglcontextlost", e => { e.preventDefault(); setStatus("地図を復旧しています…"); setTimeout(() => { try { if (map.painter.context.gl.isContextLost()) location.reload(); } catch (x) { location.reload(); } }, 3000); });
  cv.addEventListener("webglcontextrestored", () => setStatus("", 0));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { map.resize(); map.triggerRepaint(); } });
}

/* ---------- 現在地 ---------- */
let myPos = null, watchId = null, follow = false, myMarker = null;
function updateAcc(acc) {
  const src = map.getSource("acc"); if (!src || !myPos) return;
  const mpp = acc / (111320 * Math.cos(myPos[1] * Math.PI / 180));
  const pts = []; for (let i = 0; i <= 48; i++) { const a = i / 48 * 2 * Math.PI; pts.push([myPos[0] + Math.cos(a) * mpp, myPos[1] + Math.sin(a) * acc / 111320]); }
  src.setData({ type: "Feature", geometry: { type: "Polygon", coordinates: [pts] } });
}
function startLoc() {
  if (!navigator.geolocation) { setStatus("この端末では現在地を取得できません", 3000); return; }
  if (watchId != null) return;
  setStatus("現在地を探しています…");
  watchId = navigator.geolocation.watchPosition(pos => {
    myPos = [pos.coords.longitude, pos.coords.latitude];
    if (!myMarker) {
      const el = document.createElement("div");
      el.style.cssText = "width:18px;height:18px;border-radius:50%;background:#1a73e8;border:3px solid #fff;box-shadow:0 0 6px rgba(0,0,0,.6)";
      myMarker = new maplibregl.Marker({ element: el }).setLngLat(myPos).addTo(map);
      if (!map.getSource("acc")) {
        map.addSource("acc", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "acc", type: "fill", source: "acc", paint: { "fill-color": "#1a73e8", "fill-opacity": 0.15 } });
      }
    }
    myMarker.setLngLat(myPos); updateAcc(pos.coords.accuracy);
    setStatus("現在地 ±" + Math.round(pos.coords.accuracy) + "m" + (pos.coords.altitude != null ? "  標高 " + Math.round(pos.coords.altitude) + "m" : ""), 0);
    if (follow) map.easeTo({ center: myPos, duration: 400 });
  }, err => {
    setStatus(err.code === 1 ? "現在地の使用が許可されていません(設定で許可してください)" : "現在地を取得できません", 4000);
    stopLoc();
  }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
}
function stopLoc() {
  if (watchId != null) navigator.geolocation.clearWatch(watchId);
  watchId = null; follow = false; $("locBtn").classList.remove("on");
}
$("locBtn").onclick = () => {
  if (watchId == null) { startLoc(); follow = true; $("locBtn").classList.add("on"); const t = setInterval(() => { if (myPos) { map.flyTo({ center: myPos, zoom: Math.max(map.getZoom(), 16) }); clearInterval(t); } }, 300); setTimeout(() => clearInterval(t), 20000); }
  else if (!follow) { follow = true; $("locBtn").classList.add("on"); if (myPos) map.flyTo({ center: myPos, zoom: Math.max(map.getZoom(), 16) }); }
  else { stopLoc(); if (myMarker) { myMarker.remove(); myMarker = null; } setStatus("", 0); myPos = null; }
};
map.on("dragstart", () => { if (follow) { follow = false; $("locBtn").classList.remove("on"); } });
let stTimer;
function setStatus(t, ms) {
  const s = $("status"); clearTimeout(stTimer);
  if (!t) { s.style.display = "none"; return; }
  s.textContent = t; s.style.display = "block";
  if (ms) stTimer = setTimeout(() => s.style.display = "none", ms);
}

/* ---------- メモ ---------- */
let memos = ls.get("fw-memos", []);
const COLORS = ["#e53935", "#fb8c00", "#43a047", "#1e88e5", "#8e24aa"];
let memoMarks = {};
function saveMemos() { ls.set("fw-memos", memos); }
function renderMemos() {
  Object.values(memoMarks).forEach(m => m.remove()); memoMarks = {};
  renderMemoList();
  if (!showMemo) return;
  for (const m of memos) {
    if (!isFinite(m.lng) || !isFinite(m.lat)) continue;
    const el = document.createElement("div"); el.className = "pinw";
    const col = m.color || COLORS[0];
    const t = (m.text || "").replace(/\s+/g, " ").trim();
    el.innerHTML = `<svg viewBox="0 0 28 40" width="34" height="48"><path d="M14 38 C14 38 2 24 2 14 A12 12 0 0 1 26 14 C26 24 14 38 14 38Z" fill="${col}" stroke="#fff" stroke-width="2.5"/><circle cx="14" cy="14" r="4.5" fill="#fff"/></svg>` +
      (t ? `<span class="pt">${esc(t.length > 14 ? t.slice(0, 14) + "…" : t)}</span>` : "");
    el.onclick = ev => { ev.stopPropagation(); memoDialog(m.lng, m.lat, m); };
    memoMarks[m.id] = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([m.lng, m.lat]).addTo(map);
  }
}
function renderMemoList() {
  const box = $("memoList"); if (!box) return;
  $("memoCount").textContent = memos.length;
  box.innerHTML = memos.length ? "" : '<div class="note">まだメモがありません。</div>';
  for (const m of memos.slice().reverse()) {
    const row = document.createElement("div"); row.className = "muni";
    const t = (m.text || "(文字なし)").replace(/\s+/g, " ");
    row.innerHTML = `<i style="width:14px;height:14px;border-radius:50%;background:${m.color || COLORS[0]};display:inline-block"></i><span>${esc(t.length > 40 ? t.slice(0, 40) + "…" : t)}</span>`;
    const b = document.createElement("button"); b.textContent = "表示";
    b.onclick = () => { $("menu").classList.add("hidden"); map.flyTo({ center: [m.lng, m.lat], zoom: Math.max(map.getZoom(), 17), duration: 800 }); };
    row.append(b); box.append(row);
  }
}
function openDlg(html) { $("dlgBox").innerHTML = html; $("dlg").classList.remove("hidden"); }
function closeDlg() { $("dlg").classList.add("hidden"); }
$("dlg").onclick = e => { if (e.target.id === "dlg") closeDlg(); };

function memoDialog(lng, lat, m, pre) {
  let color = m ? m.color : COLORS[0];
  const dateStr = m ? new Date(m.t).toLocaleString("ja-JP") : "";
  openDlg(`<h3>${m ? "メモを編集" : "メモを追加"}</h3>
    <textarea id="mText" placeholder="例:境界杭あり/ここから急斜面/要確認">${esc(m ? m.text : (pre || ""))}</textarea>
    <div class="colors">${COLORS.map(c => `<i data-c="${c}" style="background:${c}" class="${c === color ? "on" : ""}"></i>`).join("")}</div>
    <div class="note">${lat.toFixed(6)}, ${lng.toFixed(6)} ${dateStr}</div>
    <div class="act"><button class="alt" id="mSave">保存</button>${m ? '<button class="warn" id="mDel">削除</button>' : ""}<button id="mCancel">閉じる</button></div>`);
  document.querySelectorAll(".colors i").forEach(i => i.onclick = () => { color = i.dataset.c; document.querySelectorAll(".colors i").forEach(x => x.classList.toggle("on", x === i)); });
  $("mCancel").onclick = closeDlg;
  $("mSave").onclick = () => {
    const text = $("mText").value.trim();
    if (m) { m.text = text; m.color = color; }
    else memos.push({ id: "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), lng, lat, text, color, t: Date.now() });
    saveMemos(); renderMemos(); closeDlg(); closeSheet();
  };
  if (m) $("mDel").onclick = () => { if (!confirm("このメモを削除しますか?")) return; memos = memos.filter(x => x.id !== m.id); saveMemos(); renderMemos(); closeDlg(); };
}
$("memoBtn").onclick = () => {
  if (myPos) {
    openDlg(`<h3>どこにメモしますか?</h3><div class="act"><button class="alt" id="w1">現在地</button><button id="w2">地図の中心</button></div>`);
    $("w1").onclick = () => memoDialog(myPos[0], myPos[1], null);
    $("w2").onclick = () => { const c = map.getCenter(); memoDialog(c.lng, c.lat, null); };
  } else { const c = map.getCenter(); memoDialog(c.lng, c.lat, null); }
};
renderMemos();

/* ---------- メニュー ---------- */
$("menuBtn").onclick = () => { $("menu").classList.remove("hidden"); renderMuniList(); };
$("menuClose").onclick = () => $("menu").classList.add("hidden");
function firstNonBase() { const l = map.getStyle().layers.find(x => !x.id.startsWith("b-")); return l ? l.id : undefined; }
function addBase(k) {
  if (map.getSource("b-" + k)) return;
  map.addSource("b-" + k, baseSrc(k));
  map.addLayer({ id: "b-" + k, type: "raster", source: "b-" + k }, firstNonBase());
}
function dropBase(k) { if (map.getLayer("b-" + k)) map.removeLayer("b-" + k); if (map.getSource("b-" + k)) map.removeSource("b-" + k); }
function setBase(b) {
  const old = base; base = b; ls.set("fw-base", b);
  document.querySelectorAll("#baseSeg button").forEach(x => x.classList.toggle("on", x.dataset.b === b));
  if (old === b) return;
  addBase(b);
  const done = () => { if (base !== old) dropBase(old); };   // 新しい地図が描けたら、古い地図を捨てる
  map.once("idle", done); setTimeout(done, 4000);
}
// 地図の表示がおかしくなったとき用:背景を作り直す
function resetMap() {
  dropBase(base); addBase(base);
  labelMarks.forEach(m => m.remove()); labelMarks = []; lastLabelKey = "";
  map.triggerRepaint(); setStatus("地図を描き直しました", 2000);
}
document.querySelectorAll("#baseSeg button").forEach(x => x.onclick = () => setBase(x.dataset.b));
document.querySelectorAll("#baseSeg button").forEach(x => x.classList.toggle("on", x.dataset.b === base));
$("resetMap").onclick = () => { $("menu").classList.add("hidden"); resetMap(); };
$("chkFude").checked = showFude; $("chkMemo").checked = showMemo; $("fudeColor").value = fudeColor;
$("chkFude").onchange = e => {
  showFude = e.target.checked; ls.set("fw-showfude", showFude);
  for (const c in added) for (const p of ["fill-", "line-", "sel-"]) map.setLayoutProperty(p + c, "visibility", showFude ? "visible" : "none");
  lastLabelKey = ""; updateLabels();
};
$("chkMemo").onchange = e => { showMemo = e.target.checked; ls.set("fw-showmemo", showMemo); renderMemos(); };
$("fudeColor").onchange = e => { fudeColor = e.target.value; ls.set("fw-fudecolor", fudeColor); for (const c in added) map.setPaintProperty("line-" + c, "line-color", fudeColor); };

$("exportMemo").onclick = async () => {
  const t = JSON.stringify(memos);
  if (await copyText(t, $("exportMemo"))) return;
  openDlg(`<h3>メモの書き出し</h3><textarea id="exT" style="min-height:160px">${esc(t)}</textarea><div class="act"><button id="exC">閉じる</button></div>`);
  $("exT").select(); $("exC").onclick = closeDlg;
};
$("importMemo").onclick = () => {
  openDlg(`<h3>メモの取り込み</h3><textarea id="imT" placeholder="書き出したメモを貼り付け" style="min-height:140px"></textarea><div class="act"><button class="alt" id="imOk">取り込む</button><button id="imC">閉じる</button></div>`);
  $("imC").onclick = closeDlg;
  $("imOk").onclick = () => {
    try {
      const arr = JSON.parse($("imT").value); const ids = new Set(memos.map(m => m.id)); let n = 0;
      for (const m of arr) if (m && m.id && isFinite(m.lng) && isFinite(m.lat) && !ids.has(m.id)) { memos.push({ id: String(m.id), lng: +m.lng, lat: +m.lat, text: String(m.text || ""), color: m.color || COLORS[0], t: m.t || Date.now() }); n++; }
      saveMemos(); renderMemos(); closeDlg(); setStatus(n + "件取り込みました", 2500);
    } catch (e) { alert("読み取れませんでした"); }
  };
};

/* ---------- オフライン保存 ---------- */
async function pmCached(url) { try { return !!(await (await caches.open("fw-pm")).match(url)); } catch (e) { return false; } }
async function renderMuniList() {
  const box = $("muniList"); box.innerHTML = "";
  for (const m of MUNIS) {
    const url = absUrl(m.file), done = await pmCached(url);
    const row = document.createElement("div"); row.className = "muni";
    row.innerHTML = `<span>${esc(m.name)} <small>${(m.bytes / 1e6).toFixed(0)}MB</small></span>`;
    const jump = document.createElement("button"); jump.textContent = "表示";
    jump.onclick = () => { $("menu").classList.add("hidden"); map.fitBounds([[m.bbox[0], m.bbox[1]], [m.bbox[2], m.bbox[3]]], { padding: 30, duration: 800 }); };
    const b = document.createElement("button"); b.textContent = done ? "保存済 ✓" : "保存"; if (done) b.className = "done";
    b.onclick = () => savePm(m, b);
    row.append(jump, b); box.append(row);
  }
}
async function savePm(m, btn) {
  if (!("caches" in window)) { alert("この環境ではオフライン保存が使えません"); return; }
  const url = absUrl(m.file); const cache = await caches.open("fw-pm");
  if (btn.className === "done") { if (confirm(m.name + "の保存を削除しますか?")) { await cache.delete(url); btn.className = ""; btn.textContent = "保存"; } return; }
  btn.disabled = true;
  try {
    const r = await fetch(url, { cache: "no-store" }); if (!r.ok) throw 0;
    const total = +r.headers.get("Content-Length") || m.bytes, rd = r.body.getReader(), parts = []; let got = 0;
    for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; btn.textContent = Math.round(got / total * 100) + "%"; }
    await cache.put(url, new Response(new Blob(parts), { headers: { "Content-Type": "application/octet-stream", "Content-Length": String(got) } }));
    try { btn.textContent = "検索用…"; await fetch("search/" + m.code + ".json"); } catch (e) {}
    btn.className = "done"; btn.textContent = "保存済 ✓";
  } catch (e) { btn.textContent = "失敗"; }
  btn.disabled = false;
}
function lon2x(lon, z) { return Math.floor((lon + 180) / 360 * 2 ** z); }
function lat2y(lat, z) { const r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z); }
$("saveBase").onclick = async () => {
  if (!("caches" in window)) { alert("この環境ではオフライン保存が使えません"); return; }
  const b = map.getBounds(), cfg = BASES[base], z0 = Math.min(cfg.max, Math.max(10, Math.floor(map.getZoom()))), z1 = Math.min(cfg.max, cfg.mb ? 16 : 17);
  const list = [], opt = new Set();
  function tilesAt(z, pad, f) {
    const x0 = lon2x(b.getWest(), z) - pad, x1 = lon2x(b.getEast(), z) + pad, y0 = lat2y(b.getNorth(), z) - pad, y1 = lat2y(b.getSouth(), z) + pad;
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) f(z, x, y);
  }
  {
    for (let z = z0; z <= z1; z++) tilesAt(z, 0, (z, x, y) => list.push(cfg.url.replace("{z}", z).replace("{x}", x).replace("{y}", cfg.tms ? 2 ** z - 1 - y : y)));
  }
  const mbEach = cfg.mb || 0.03;
  if (list.length * mbEach > 150) { alert("範囲が広すぎます(" + list.length + "枚・約" + Math.round(list.length * mbEach) + "MB)。地図を拡大してから、もう一度保存してください。"); return; }
  if (list.length > 1800) { alert("範囲が広すぎます(" + list.length + "枚)。地図を拡大してから、もう一度保存してください。"); return; }
  if (!confirm("現在の地図(" + $("baseSeg").querySelector(".on").textContent + ")を保存します。\n約" + list.length + "枚(目安 " + Math.round(list.length * mbEach * 10) / 10 + "MB前後)。よろしいですか?")) return;
  const cache = await caches.open("fw-gsi"); let n = 0, ng = 0, i = 0;
  const btn = $("saveBase"), old = btn.textContent; btn.disabled = true;
  async function w() { while (i < list.length) { const u = list[i++]; try { if (!(await cache.match(u))) { const r = await fetch(u); if (r.ok) await cache.put(u, r); else if (!opt.has(u)) ng++; } } catch (e) { ng++; } n++; btn.textContent = "保存中 " + n + "/" + list.length; } }
  await Promise.all([w(), w(), w(), w(), w(), w()]);
  btn.disabled = false; btn.textContent = old; setStatus("地図を保存しました" + (ng ? "(" + ng + "枚は取得できず)" : ""), 3500);
};

/* ---------- 地番検索 ---------- */
const IDX = {};   // code -> [{o,d,k,c:[],x:[],y:[]}]
function norm(s) {
  return String(s).replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[－‐‑–—―ー−]/g, "-").replace(/[\s　]+/g, " ").trim();
}
function parseQuery(q) {
  q = norm(q);
  if (!q) return { names: [], num: "" };
  let toks = q.split(" ");
  if (toks.length === 1) { const m = /^(\D+?)((?:[甲乙丙丁])?\d[\d-]*)$/.exec(toks[0]); if (m) toks = [m[1], m[2]]; }
  const names = [], nums = [];
  for (const t of toks) (/\d/.test(t) ? nums : names).push(t);
  return { names, num: nums.length ? nums[nums.length - 1] : "" };
}
async function loadIdx(code) {
  if (IDX[code]) return IDX[code];
  const r = await fetch("search/" + code + ".json");
  if (!r.ok) throw new Error("index");
  const j = await r.json();
  IDX[code] = j.a.map(([o, d, k, c, dx, dy]) => {
    const x = new Array(dx.length), y = new Array(dy.length); let ax = 0, ay = 0;
    for (let i = 0; i < dx.length; i++) { ax += dx[i]; ay += dy[i]; x[i] = ax / 1e5; y[i] = ay / 1e5; }
    return { o, d, k, c, cn: c.map(norm), x, y, name: o + d + k };
  });
  return IDX[code];
}
function areaMatch(a, names) {
  return names.every(t => a.name.includes(t) || a.name.includes(t.replace(/^大字/, "")));
}
function runSearch(code, qs, idx) {
  const { names, num } = parseQuery(qs), out = [];
  if (!names.length && !num) return { kind: "none" };
  if (!num) {
    for (const a of idx) if (areaMatch(a, names)) out.push(a);
    return { kind: "areas", list: out.slice(0, 40), total: out.length };
  }
  for (const a of idx) {
    if (names.length && !areaMatch(a, names)) continue;
    for (let i = 0; i < a.cn.length; i++) {
      const c = a.cn[i], s = c.replace(/^[甲乙丙丁]/, "");
      let r = -1;
      if (c === num || s === num) r = 0;
      else if (c.startsWith(num + "-") || s.startsWith(num + "-")) r = 1;
      else if (num.length >= 2 && (c.startsWith(num) || s.startsWith(num))) r = 2;
      if (r >= 0) out.push({ r, a, i });
    }
  }
  out.sort((p, q) => p.r - q.r || p.a.cn[p.i].length - q.a.cn[q.i].length);
  return { kind: "parcels", list: out.slice(0, 40), total: out.length };
}
function detectMuni() {
  const c = map.getCenter();
  const m = MUNIS.find(m => c.lng >= m.bbox[0] && c.lng <= m.bbox[2] && c.lat >= m.bbox[1] && c.lat <= m.bbox[3]);
  return m ? m.code : "38386";
}
function openSearch() {
  closeSheet(); $("sp").classList.remove("hidden");
  const sel2 = $("spMuni");
  if (!sel2.options.length) for (const m of MUNIS) sel2.add(new Option(m.name, m.code));
  sel2.value = detectMuni();
  doSearch(); setTimeout(() => $("spInput").focus(), 50);
}
let spTimer;
async function doSearch() {
  const code = $("spMuni").value, qs = $("spInput").value, box = $("spRes");
  if (!code) return;
  let idx;
  if (!IDX[code]) { box.innerHTML = '<div class="note">読み込み中…</div>'; }
  try { idx = await loadIdx(code); } catch (e) { box.innerHTML = '<div class="note">検索データを読み込めません。通信状態を確認してください(オフラインでは、「保存」した市町のみ検索できます)。</div>'; return; }
  if (code !== $("spMuni").value || qs !== $("spInput").value) return;
  const r = runSearch(code, qs, idx);
  if (r.kind === "none") { box.innerHTML = ""; return; }
  if (!r.total) { box.innerHTML = '<div class="note">見つかりませんでした。大字名の一部だけでも試してください。</div>'; return; }
  box.innerHTML = "";
  if (r.kind === "areas") {
    for (const a of r.list) {
      const row = document.createElement("div"); row.className = "rs";
      row.innerHTML = `<span>${esc([a.o, a.d, a.k].filter(Boolean).join(" "))}</span><small>${a.c.length}筆</small>`;
      row.onclick = () => { $("spInput").value = (a.o || a.d || a.k) + " "; $("spInput").focus(); doSearch(); };
      box.append(row);
    }
    if (r.total > r.list.length) box.insertAdjacentHTML("beforeend", `<div class="note">ほか${r.total - r.list.length}件。もう少し絞ってください。</div>`);
  } else {
    for (const it of r.list) {
      const a = it.a, i = it.i, row = document.createElement("div"); row.className = "rs";
      const place = [a.o, a.d, a.k].filter(Boolean).join(" ");
      row.innerHTML = `<span>${esc(place)} <b>${esc(a.c[i])}</b></span><small>${it.r === 0 ? "" : "近い番号"}</small>`;
      row.onclick = () => gotoParcel({ o: a.o, d: a.d, k: a.k, c: a.c[i] }, [a.x[i], a.y[i]]);
      box.append(row);
    }
    if (r.total > r.list.length) box.insertAdjacentHTML("beforeend", `<div class="note">ほか${r.total - r.list.length}件。大字名を加えて絞ってください。</div>`);
  }
}
function gotoParcel(p, ctr) {
  $("sp").classList.add("hidden"); $("spInput").blur();
  if (follow) { follow = false; $("locBtn").classList.remove("on"); }
  map.flyTo({ center: ctr, zoom: Math.max(map.getZoom(), 18), duration: 900 });
  showParcelInfo(p, ctr);
}
$("searchBtn").onclick = openSearch;
$("spClose").onclick = () => { $("sp").classList.add("hidden"); $("spInput").blur(); };
$("spInput").oninput = () => { clearTimeout(spTimer); spTimer = setTimeout(doSearch, 150); };
$("spInput").onkeydown = e => { if (e.key === "Enter") { const f = $("spRes").querySelector(".rs"); if (f) f.click(); } };
$("spMuni").onchange = () => { ls.set("fw-smuni", $("spMuni").value); doSearch(); };

/* ---------- 起動 ---------- */
map.once("style.load", async () => {
  try { MUNIS = await (await fetch("tiles/index.json", { cache: "no-cache" })).json(); } catch (e) { MUNIS = ls.get("fw-index", []); }
  if (MUNIS.length) ls.set("fw-index", MUNIS);
  ensureMunis();
});
map.on("moveend", () => {
  ensureMunis();
  const c = map.getCenter(); ls.set("fw-view", { c: [c.lng, c.lat], z: map.getZoom() });
});
map.on("sourcedata", e => { if (e.sourceId && e.sourceId.startsWith("s-") && e.isSourceLoaded === false && map.getZoom() >= 13 && !navigator.onLine) setStatus("オフライン", 1500); });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
