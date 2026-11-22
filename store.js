/* 端末内の保存(IndexedDB): 写真と移動の記録 */
(() => {
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open("fw-store", 1);
      r.onupgradeneeded = () => { const d = r.result; d.createObjectStore("photo"); d.createObjectStore("track"); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function tx(store, mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode), s = t.objectStore(store); const q = fn(s);
      t.oncomplete = () => res(q ? q.result : undefined); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  }
  const api = {
    put: (s, k, v) => tx(s, "readwrite", o => o.put(v, k)),
    get: (s, k) => tx(s, "readonly", o => o.get(k)),
    del: (s, k) => tx(s, "readwrite", o => o.delete(k)),
    all: async s => { const d = await db(); return new Promise((res, rej) => { const o = d.transaction(s, "readonly").objectStore(s).getAll(); o.onsuccess = () => res(o.result); o.onerror = () => rej(o.error); }); }
  };
  // 写真を縮小して文字列(JPEG)にする。長辺1024px・約100KB(最大120KB)を目指す
  api.shrink = file => new Promise((res, rej) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      URL.revokeObjectURL(url);
      let k = Math.min(1, 1024 / Math.max(im.width, im.height)), out = "";
      for (let n = 0; n < 6; n++) {
        const c = document.createElement("canvas"); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        for (const q of [0.72, 0.62, 0.52, 0.42]) { out = c.toDataURL("image/jpeg", q); if (out.length * 0.75 <= 120000) return res(out); }
        k *= 0.85;                                   // それでも大きければ、少し小さくして再挑戦
      }
      res(out);
    };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error("img")); };
    im.src = url;
  });
  window.FWStore = api;
})();
