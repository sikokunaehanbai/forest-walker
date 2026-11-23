/* ライセンス認証(パスワードと端末の結びつけ)+ 起動記録
   LICENSE_URL が空のあいだは、何もしません(認証なしで使えます)。
   認証サーバー(Googleアプリスクリプト)を作ったら、そのアドレスをここに入れます。 */
(() => {
  const LICENSE_URL = "https://script.google.com/macros/s/AKfycbzA3h7GJP45WG9NTvu1VvkoA16cICsZdDOI6qgYHcUi237tZzvJ3Ur-vvD4eqJltEXh/exec";
  if (!LICENSE_URL) return;

  const KEY = "fw-lic", DID = "fw-did", GRACE_DAYS = 30;
  const get = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  let did = get(DID);
  if (!did) { did = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2); set(DID, did); }

  const ov = document.createElement("div");
  ov.id = "lic"; ov.className = "hidden";
  ov.innerHTML = '<div class="licbox"><h2>フォレストウォーカー</h2>' +
    '<p>ご利用にはパスワードが必要です。</p>' +
    '<input id="licKey" placeholder="パスワード" autocomplete="off" autocapitalize="characters">' +
    '<input id="licDev" placeholder="お名前(必須)例 山田太郎" autocomplete="off">' +
    '<button id="licGo">認証する</button><div id="licMsg"></div>' +
    '<p class="note">「認証する」を押すと、次の情報を管理者(四国苗販売株式会社)へ送ることに同意したものとします。<br>' +
    '・アプリを開いた日時 ・入力したお名前/端末名 ・端末の識別番号 ・端末の種類とアプリの版 ・開いたときの現在地(緯度・経度・誤差)<br>' +
    '利用状況の把握と不正利用の防止のために使います。詳しくは <a href="privacy.html" target="_blank" rel="noopener">プライバシーポリシー</a> をご覧ください。</p>' +
    '<p class="note">パスワードをお持ちでない場合は、管理者へご連絡ください。</p></div>';
  document.body.append(ov);
  const msg = t => { document.getElementById("licMsg").textContent = t || ""; };

  async function ask(action, key, dn, extra) {
    const q = new URLSearchParams(Object.assign({ action, key, did, dn: dn || "", v: "1" }, extra || {}));
    const r = await fetch(LICENSE_URL + "?" + q.toString(), { redirect: "follow" });
    return await r.json();
  }
  /* 起動記録(アプリを開くたびに1回。現在地は、許可されていれば付ける) */
  const APPV = () => { const e = document.getElementById("ver"); const m = e && /v[\d.]+/.exec(e.textContent); return m ? m[0] : ""; };
  function devType() {
    const u = navigator.userAgent || "";
    const os = /Android/i.test(u) ? "Android" : /iPhone|iPad|iPod/i.test(u) ? "iOS" : /Windows/i.test(u) ? "Windows" : /Mac/i.test(u) ? "Mac" : "その他";
    return os + (window.Capacitor ? "/APK" : "/ブラウザ");
  }
  function getPos() {
    return new Promise(res => {
      if (!navigator.geolocation) return res(null);
      let done = false; const fin = v => { if (!done) { done = true; res(v); } };
      setTimeout(() => fin(null), 9000);
      try { navigator.geolocation.getCurrentPosition(p => fin(p.coords), () => fin(null), { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }); } catch (e) { fin(null); }
    });
  }
  async function sendLog() {
    try {
      if (sessionStorage.getItem("fw-logged")) return;
      const st = get(KEY); if (!st || !st.key || !navigator.onLine) return;
      sessionStorage.setItem("fw-logged", "1");
      const c = await getPos();
      const ex = { dt: devType(), av: APPV() };
      if (c) { ex.lat = c.latitude.toFixed(5); ex.lng = c.longitude.toFixed(5); ex.acc = Math.round(c.accuracy || 0); }
      await ask("log", st.key, st.dn || "", ex);
    } catch (e) {}
  }

  function lock(m) { ov.classList.remove("hidden"); msg(m); }
  function unlock() { ov.classList.add("hidden"); renderInfo(); }

  /* メニューの「ライセンス」欄 */
  function renderInfo() {
    let box = document.getElementById("licInfo");
    if (!box) {
      const v = document.getElementById("ver");
      if (!v) return;
      v.insertAdjacentHTML("beforebegin", '<h3>ライセンス</h3><div id="licInfo" class="note"></div><button class="wide" id="licRel">この端末の認証を解除する</button>');
      box = document.getElementById("licInfo");
      document.getElementById("licRel").onclick = release;
    }
    const st = get(KEY);
    box.textContent = st ? ("認証済み" + (st.name ? "(" + st.name + ")" : "") + (st.expires ? "  有効期限 " + st.expires : "") + "  /  端末の上限 " + (st.limit || "-") + "台") : "";
  }
  async function release() {
    const st = get(KEY); if (!st) return;
    if (!confirm("この端末の認証を解除します。\n(別の端末で使いたいときに行います。この端末では、もう一度キーの入力が必要になります。)")) return;
    try {
      const j = await ask("release", st.key);
      if (!j.ok) { alert(j.msg || "解除できませんでした"); return; }
      localStorage.removeItem(KEY); document.getElementById("menu").classList.add("hidden"); lock("認証を解除しました");
    } catch (e) { alert("通信できません。電波のある場所で、もう一度お試しください。"); }
  }

  /* 認証ボタン */
  document.getElementById("licGo").onclick = async () => {
    const key = document.getElementById("licKey").value.trim().toUpperCase();
    const dn = document.getElementById("licDev").value.trim();
    if (!key) { msg("パスワードを入力してください"); return; }
    if (dn.length < 2) { msg("お名前を入力してください(誰が使っているか分かるようにするためです)"); return; }
    const b = document.getElementById("licGo"); b.disabled = true; msg("確認しています…");
    try {
      const old = get(KEY);
      if (old && old.key === key && !old.dn && navigator.onLine) await ask("release", key);   // 名前が空だった端末は、登録し直して名前を入れる
      const j = await ask("activate", key, dn);
      if (j.ok) { set(KEY, { key, dn, name: j.name, expires: j.expires, limit: j.limit, last: Date.now() }); unlock(); sendLog(); }
      else msg(j.msg || "認証できませんでした");
    } catch (e) { msg("通信できません。電波のある場所で、もう一度お試しください。"); }
    b.disabled = false;
  };

  /* 起動時 */
  const st = get(KEY);
  if (!st || !st.key) lock();
  else if (!st.dn && navigator.onLine) { document.getElementById("licKey").value = st.key; lock("お名前を入力して、もう一度「認証する」を押してください"); }
  else {
    unlock();
    const age = (Date.now() - (st.last || 0)) / 864e5;
    if (navigator.onLine) {
      ask("check", st.key).then(j => {
        if (j.ok) { st.last = Date.now(); st.name = j.name; st.expires = j.expires; st.limit = j.limit; set(KEY, st); renderInfo(); sendLog(); }
        else { localStorage.removeItem(KEY); lock(j.msg); }
      }).catch(() => { if (age > GRACE_DAYS) lock("認証の確認が必要です。通信できる場所で、アプリを開いてください。"); });
    } else if (age > GRACE_DAYS) lock("認証の確認が必要です。通信できる場所で、アプリを開いてください。");
  }
})();
