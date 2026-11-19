/* 3D表示:国土地理院の標高タイルを使い、山そのものを立体的に表示します。
   「3D」ボタンを押したときだけ読み込むので、2Dのときは軽いままです。 */
(() => {
  const GSI = "https://cyberjapandata.gsi.go.jp/xyz/dem_png/";
  const EXAG = 1.0;
  maplibregl.addProtocol("gsidem", async (params, abort) => {
    const m = /gsidem:\/\/(\d+)\/(\d+)\/(\d+)/.exec(params.url);
    const out = new Uint8ClampedArray(256 * 256 * 4);
    const flat = () => { for (let i = 0; i < out.length; i += 4) { out[i] = 128; out[i + 3] = 255; } };   // 高さ0m
    try {
      const r = await fetch(GSI + m[1] + "/" + m[2] + "/" + m[3] + ".png", { signal: abort && abort.signal });
      if (!r.ok) throw 0;
      const bmp = await createImageBitmap(await r.blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
      const cv = new OffscreenCanvas(256, 256), cx = cv.getContext("2d", { willReadFrequently: true });
      cx.drawImage(bmp, 0, 0);
      const d = cx.getImageData(0, 0, 256, 256).data;
      for (let i = 0; i < d.length; i += 4) {
        let v = d[i] * 65536 + d[i + 1] * 256 + d[i + 2], h;
        if (v === 8388608) h = 0; else h = (v < 8388608 ? v : v - 16777216) * 0.01;
        const t = Math.max(0, h + 32768);   // terrarium形式に変換
        const a = Math.floor(t);
        out[i] = a >> 8; out[i + 1] = a & 255; out[i + 2] = Math.floor((t - a) * 256); out[i + 3] = 255;
      }
    } catch (e) { flat(); }
    const cv2 = new OffscreenCanvas(256, 256);
    cv2.getContext("2d").putImageData(new ImageData(out, 256, 256), 0, 0);
    return { data: await (await cv2.convertToBlob({ type: "image/png" })).arrayBuffer() };
  });

  let on = false;
  function apply() {
    if (!map.getSource("dem")) map.addSource("dem", { type: "raster-dem", tiles: ["gsidem://{z}/{x}/{y}"], encoding: "terrarium", tileSize: 256, maxzoom: 14 });
    map.setTerrain({ source: "dem", exaggeration: EXAG });
  }
  function set3d(v) {
    on = v;
    if (v) { try { apply(); } catch (e) { on = false; return; } map.easeTo({ pitch: 60, duration: 600 }); }
    else { map.easeTo({ pitch: 0, duration: 500 }); setTimeout(() => { if (!on) try { map.setTerrain(null); } catch (e) {} }, 550); }
    document.getElementById("tiltBtn").textContent = v ? "3D" : "2D";
  }
  document.getElementById("tiltBtn").onclick = () => set3d(!on);
  map.on("pitch", () => { if (!on) document.getElementById("tiltBtn").textContent = map.getPitch() > 5 ? "3D" : "2D"; });
  window.fw3d = set3d;
})();
