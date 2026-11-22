/* トラッキング(歩いた道すじの記録) */
(() => {
  const COLOR = "#1a73e8";
  let tracks = [];            // [{id,name,t0,t1,pts:[[lng,lat,alt,t]],on,rec}]
  let cur = null, lastSave = 0, wake = null;
  const EMPTY = { type: "FeatureCollection", features: [] };
  const fmtD = m => m >= 1000 ? (m / 1000).toFixed(2) + "km" : Math.round(m) + "m";
  function hav(a, b) {
    const R = 6371000, r = Math.PI / 180, dLa = (b[1] - a[1]) * r, dLo = (b[0] - a[0]) * r;
    const x = Math.sin(dLa / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  function len(t) { let d = 0; for (let i = 1; i < t.pts.length; i++) d += hav(t.pts[i - 1], t.pts[i]); return d; }
  const pad = n => String(n).padStart(2, "0");
  function nameOf(t) { const d = new Date(t); return (d.getMonth() + 1) + "/" + d.getDate() + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()); }

  function draw() {
    const src = map.getSource("tracks"); if (!src) return;
    src.setData({ type: "FeatureCollection", features: tracks.filter(t => t.on && t.pts.length > 1).map(t => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: t.pts.map(p => [p[0], p[1]]) } })) });
  }
  function initLayers() {
    if (map.getSource("tracks")) return;
    map.addSource("tracks", { type: "geojson", data: EMPTY });
    map.addLayer({ id: "track-casing", type: "line", source: "tracks", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#fff", "line-width": ["interpolate", ["linear"], ["zoom"], 12, 5, 18, 9] } });
    map.addLayer({ id: "track-line", type: "line", source: "tracks", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": COLOR, "line-width": ["interpolate", ["linear"], ["zoom"], 12, 3, 18, 5.5] } });
  }
  function save(t) { return FWStore.put("track", t.id, t).catch(() => {}); }

  async function getWake() { try { if (navigator.wakeLock) wake = await navigator.wakeLock.request("screen"); } catch (e) {} }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && cur && (!wake || wake.released)) getWake(); });

  function start() {
    if (cur) return;
    const t0 = Date.now();
    cur = { id: "t" + t0.toString(36), name: nameOf(t0), t0, t1: t0, pts: [], on: true, rec: true };
    tracks.unshift(cur); save(cur); getWake();
    if (watchId == null) startLoc();
    setStatus("記録を始めました(画面を消すと止まることがあります)", 3500);
    renderList(); refreshBtn();
  }
  function stop() {
    if (!cur) return;
    cur.rec = false; cur.t1 = Date.now(); save(cur);
    const t = cur; cur = null;
    try { if (wake) wake.release(); } catch (e) {} wake = null;
    setStatus("記録を終えました " + fmtD(len(t)), 3500);
    renderList(); refreshBtn(); draw();
  }
  function add(pos) {
    if (!cur) return;
    const c = pos.coords; if (c.accuracy > 40) return;
    const p = [+c.longitude.toFixed(6), +c.latitude.toFixed(6), c.altitude != null ? Math.round(c.altitude) : null, pos.timestamp || Date.now()];
    const l = cur.pts[cur.pts.length - 1];
    if (l && hav(l, p) < 5) return;                  // 5m未満の動きは記録しない(止まっているときの揺れ対策)
    cur.pts.push(p); cur.t1 = p[3]; draw();
    if (Date.now() - lastSave > 10000) { lastSave = Date.now(); save(cur); }
  }
  function info() { return cur ? fmtD(len(cur)) : ""; }

  function toGPX(t) {
    const esc = s => String(s).replace(/[<>&]/g, "");
    return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="フォレストウォーカー" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${esc(t.name)}</name><trkseg>\n` +
      t.pts.map(p => `<trkpt lat="${p[1]}" lon="${p[0]}">${p[2] != null ? `<ele>${p[2]}</ele>` : ""}<time>${new Date(p[3]).toISOString()}</time></trkpt>`).join("\n") + `\n</trkseg></trk></gpx>`;
  }
  function toKML(t) {
    const esc = s => String(s).replace(/[<>&]/g, "");
    return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>${esc(t.name)}</name><Style><LineStyle><color>ffe8731a</color><width>4</width></LineStyle></Style><LineString><coordinates>\n` +
      t.pts.map(p => p[0] + "," + p[1] + "," + (p[2] != null ? p[2] : 0)).join("\n") + `\n</coordinates></LineString></Placemark></Document></kml>`;
  }
  async function exportTrack(t, kind) {
    const gpx = kind === "gpx", text = gpx ? toGPX(t) : toKML(t);
    const fname = "track-" + new Date(t.t0).toISOString().slice(0, 10) + "-" + pad(new Date(t.t0).getHours()) + pad(new Date(t.t0).getMinutes()) + (gpx ? ".gpx" : ".kml");
    const file = new File([text], fname, { type: gpx ? "application/gpx+xml" : "application/vnd.google-earth.kml+xml" });
    try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: t.name }); return; } } catch (e) { if (e && e.name === "AbortError") return; }
    try { const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = fname; document.body.append(a); a.click(); a.remove(); setStatus("書き出しました", 2500); return; } catch (e) {}
    if (await copyText(text, null)) { setStatus("内容をコピーしました", 2500); return; }
    openDlg(`<h3>書き出し</h3><textarea style="min-height:160px" id="tx">${esc(text)}</textarea><div class="act"><button id="txc">閉じる</button></div>`); $("txc").onclick = closeDlg;
  }

  function renderList() {
    const box = $("trackList"); if (!box) return;
    box.innerHTML = tracks.length ? "" : '<div class="note">まだ記録がありません。</div>';
    for (const t of tracks) {
      const row = document.createElement("div"); row.className = "muni";
      const d = Math.max(0, (t.t1 - t.t0) / 60000);
      row.innerHTML = `<input type="checkbox" ${t.on ? "checked" : ""}><span>${esc(t.name)}${t === cur ? " ● 記録中" : ""}<br><small>${fmtD(len(t))} / ${Math.round(d)}分 / ${t.pts.length}点</small></span>`;
      row.querySelector("input").onchange = e => { t.on = e.target.checked; save(t); draw(); };
      const more = document.createElement("button"); more.textContent = "操作";
      more.onclick = () => {
        openDlg(`<h3>${esc(t.name)}</h3><div class="note">${fmtD(len(t))} / ${t.pts.length}点</div>
          <div class="act"><button class="alt" id="tZ">地図で見る</button></div>
          <div class="act"><button class="alt" id="tG">GPXで書き出す</button><button class="alt" id="tK">KMLで書き出す</button></div>
          <div class="act"><button class="warn" id="tD">削除</button><button id="tC">閉じる</button></div>`);
        $("tC").onclick = closeDlg;
        $("tZ").onclick = () => { closeDlg(); if (t.pts.length < 2) return; t.on = true; draw(); renderList(); $("menu").classList.add("hidden");
          const b = new maplibregl.LngLatBounds(); t.pts.forEach(p => b.extend([p[0], p[1]])); map.fitBounds(b, { padding: 60, duration: 800, maxZoom: 18 }); };
        $("tG").onclick = () => exportTrack(t, "gpx"); $("tK").onclick = () => exportTrack(t, "kml");
        $("tD").onclick = () => { if (t === cur) { alert("記録中です。先に停止してください。"); return; } if (!confirm("「" + t.name + "」を削除します。よろしいですか?")) return; tracks = tracks.filter(x => x !== t); FWStore.del("track", t.id).catch(() => {}); closeDlg(); renderList(); draw(); };
      };
      row.append(more); box.append(row);
    }
  }
  function refreshBtn() { const b = $("trackBtn"); if (!b) return; b.textContent = cur ? "■ 記録を止める" : "● 記録を始める"; b.classList.toggle("rec", !!cur); const f = $("trackFab"); if (f) f.classList.toggle("on", !!cur); }

  window.FWTrack = { add, active: () => !!cur, info, list: () => tracks };
  $("trackBtn").onclick = () => { cur ? stop() : start(); };
  if ($("trackFab")) $("trackFab").onclick = () => { if (cur) { if (confirm("記録を止めますか?(" + info() + ")")) stop(); } else start(); };

  (async () => {
    try { tracks = (await FWStore.all("track")).sort((a, b) => b.t0 - a.t0); } catch (e) {}
    // 前回、記録中のまま閉じられたものは、終わったものとして残す
    for (const t of tracks) if (t.rec) { t.rec = false; save(t); }
    renderList(); refreshBtn();
    let n = 0; const iv = setInterval(() => { try { initLayers(); clearInterval(iv); draw(); } catch (e) { if (++n > 300) clearInterval(iv); } }, 200);
  })();
})();
