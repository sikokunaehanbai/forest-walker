const V = "fw-shell-v21";
const SHELL = ["./", "index.html", "style.css", "app.js", "kml.js", "store.js", "track.js", "kmz.js", "hud.js", "terrain.js", "license.js", "privacy.html", "lib/maplibre-gl.js", "lib/maplibre-gl.css", "lib/pmtiles.js", "manifest.webmanifest", "icon.svg", "icon-192.png"];
const blobs = new Map();
self.addEventListener("install", e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("fw-shell-") && k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method === "POST" && url.pathname.endsWith("/share-target")) { e.respondWith(recvShare(req)); return; }
  if (req.method !== "GET") return;
  if (url.pathname.endsWith(".pmtiles")) { e.respondWith(pm(req, url)); return; }
  if (url.hostname === "cyberjapandata.gsi.go.jp" || url.hostname === "rinya-ehime.geospatial.jp") { e.respondWith(gsi(req)); return; }
  if (url.origin === location.origin) { e.respondWith(net(req)); }
});
async function pm(req, url) {
  const key = url.origin + url.pathname;
  let blob = blobs.get(key);
  if (!blob) { const r = await (await caches.open("fw-pm")).match(key); if (r) { blob = await r.blob(); blobs.set(key, blob); } }
  if (!blob) return fetch(req);
  const rg = req.headers.get("range");
  if (!rg) return new Response(blob, { headers: { "Content-Type": "application/octet-stream" } });
  const m = /bytes=(\d+)-(\d*)/.exec(rg); const s = +m[1], en = m[2] ? Math.min(+m[2], blob.size - 1) : blob.size - 1;
  return new Response(blob.slice(s, en + 1), { status: 206, headers: { "Content-Type": "application/octet-stream", "Content-Range": `bytes ${s}-${en}/${blob.size}`, "Content-Length": String(en - s + 1) } });
}
async function gsi(req) {
  const c = await caches.open("fw-gsi"); const hit = await c.match(req.url);
  if (hit) return hit;
  try { const r = await fetch(req); if (r.ok) c.put(req.url, r.clone()); return r; } catch (e) { return new Response("", { status: 504 }); }
}
async function net(req) {
  const c = await caches.open(V);
  try { const r = await fetch(req, { cache: "no-cache" }); if (r.ok) c.put(req, r.clone()); return r; }
  catch (e) { const hit = await c.match(req, { ignoreSearch: true }); return hit || new Response("offline", { status: 504 }); }
}

async function recvShare(req) {
  try {
    const fd = await req.formData(), c = await caches.open("fw-share"); let i = 0;
    for (const f of fd.getAll("file")) if (f && typeof f.text === "function") await c.put("share/" + (i++) + "/" + encodeURIComponent(f.name || "area.kml"), new Response(await f.text()));
  } catch (err) {}
  return Response.redirect(new URL("./?shared=1", self.registration.scope).href, 303);
}
