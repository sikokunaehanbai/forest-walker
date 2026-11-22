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
  // 写真を縮小して文字列(JPEG)にする(長辺1280px)
  api.shrink = file => new Promise((res, rej) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      const k = Math.min(1, 1280 / Math.max(im.width, im.height));
      const c = document.createElement("canvas"); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg", 0.72));
    };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error("img")); };
    im.src = url;
  });
  window.FWStore = api;
})();
