/* 画面中心の点・標高の表示と、縮尺バー */
(() => {
  const GSI_ = "https://cyberjapandata.gsi.go.jp/xyz/";
  const elev = document.getElementById("elev"), bar = document.getElementById("sbar"), lab = document.getElementById("slab");

  /* ---------- 縮尺バー ---------- */
  const NICE = [];
  for (const p of [1, 10, 100, 1000, 10000, 100000, 1000000]) for (const m of [1, 2, 5]) NICE.push(m * p);
  const fmt = v => String(+v.toFixed(2));
  function updateScale() {
    const lat = map.getCenter().lat, z = map.getZoom();
    const mpp = 78271.51696 * Math.cos(lat * Math.PI / 180) / Math.pow(2, z);   // 1ピクセルあたりのメートル
    let v = NICE[0];
    for (const n of NICE) if (n / mpp <= 130) v = n;
    const px = Math.max(30, Math.round(v / mpp));
    const km = v >= 1000, d = km ? 1000 : 1, unit = km ? "km" : "m";
    bar.style.width = px + "px"; lab.style.width = px + "px";
    lab.innerHTML = "<span>0</span><span>" + fmt(v / 2 / d) + "</span><span>" + fmt(v / d) + " " + unit + "</span>";
  }

  /* ---------- 標高(国土地理院の標高タイル) ---------- */
  const cache = new Map(), none = new Set();
  async function tileData(layer, z, x, y) {
    const key = layer + "/" + z + "/" + x + "/" + y;
    if (cache.has(key)) return cache.get(key);
    if (none.has(key)) return null;
    try {
      const r = await fetch(GSI_ + layer + "/" + z + "/" + x + "/" + y + ".png");
      if (!r.ok) { none.add(key); return null; }
      const bmp = await createImageBitmap(await r.blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
      const cv = document.createElement("canvas"); cv.width = cv.height = 256;
      const cx = cv.getContext("2d", { willReadFrequently: true }); cx.drawImage(bmp, 0, 0);
      const d = cx.getImageData(0, 0, 256, 256).data;
      if (cache.size >= 24) cache.delete(cache.keys().next().value);
      cache.set(key, d); return d;
    } catch (e) { return null; }
  }
  function hAt(d, px, py) {
    px = Math.min(255, Math.max(0, px)); py = Math.min(255, Math.max(0, py));
    const i = (py * 256 + px) * 4, v = d[i] * 65536 + d[i + 1] * 256 + d[i + 2];
    if (v === 8388608) return NaN;
    return (v < 8388608 ? v : v - 16777216) * 0.01;
  }
  function sample(d, fx, fy) {   // 双一次補間
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const a = hAt(d, x0, y0), b = hAt(d, x0 + 1, y0), c = hAt(d, x0, y0 + 1), e = hAt(d, x0 + 1, y0 + 1);
    if ([a, b, c, e].some(isNaN)) return NaN;
    return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + e * tx * ty;
  }
  async function elevAt(lng, lat) {
    for (const [layer, z] of [["dem5a_png", 15], ["dem_png", 14]]) {
      const n = Math.pow(2, z), fx = (lng + 180) / 360 * n, r = lat * Math.PI / 180;
      const fy = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n;
      const tx = Math.floor(fx), ty = Math.floor(fy);
      const d = await tileData(layer, z, tx, ty);
      if (!d) continue;
      const h = sample(d, (fx - tx) * 256 - 0.5, (fy - ty) * 256 - 0.5);
      if (!isNaN(h)) return h;
    }
    return null;
  }
  let seq = 0, timer = null;
  function updateElev() {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const my = ++seq, c = map.getCenter();
      if (map.getZoom() < 9) { elev.textContent = "標高 --"; return; }
      const h = await elevAt(c.lng, c.lat);
      if (my !== seq) return;
      elev.textContent = h == null ? "標高 --" : "標高 " + Math.round(h) + " m";
    }, 150);
  }

  map.on("move", updateScale);
  map.on("moveend", updateElev);
  updateScale(); updateElev();
})();
