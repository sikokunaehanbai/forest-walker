/* ライセンス認証(キー番号と端末の結びつけ)
   LICENSE_URL が空のあいだは、何もしません(認証なしで使えます)。
   認証サーバー(Googleアプリスクリプト)を作ったら、そのアドレスをここに入れます。 */
(() => {
  const LICENSE_URL = "";
  if (!LICENSE_URL) return;

  const KEY = "fw-lic", DID = "fw-did", GRACE_DAYS = 30;
  const get = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  let did = get(DID);
  if (!did) { did = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2); set(DID, did); }

  const ov = document.createElement("div");
  ov.id = "lic"; ov.className = "hidden";
  ov.innerHTML = '<div class="licbox"><h2>フォレストウォーカー</h2>' +
    '<p>ご利用にはキー番号が必要です。</p>' +
    '<input id="licKey" placeholder="キー番号(例 FW-ABCD-2345)" autocomplete="off" autocapitalize="characters">' +
    '<input id="licDev" placeholder="この端末の名前(例 山田さんのスマホ)" autocomplete="off">' +
    '<button id="licGo">認証する</button><div id="licMsg"></div>' +
    '<p class="note">キー番号をお持ちでない場合は、管理者へご連絡ください。</p></div>';
  document.body.append(ov);
  const msg = t => { document.getElementById("licMsg").textContent = t || ""; };

  async function ask(action, key, dn) {
    const q = new URLSearchParams({ action, key, did, dn: dn || "", v: "1" });
    const r = await fetch(LICENSE_URL + "?" + q.toString(), { redirect: "follow" });
    return await r.json();
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
    if (!key) { msg("キー番号を入力してください"); return; }
    const b = document.getElementById("licGo"); b.disabled = true; msg("確認しています…");
    try {
      const j = await ask("activate", key, dn);
      if (j.ok) { set(KEY, { key, name: j.name, expires: j.expires, limit: j.limit, last: Date.now() }); unlock(); }
      else msg(j.msg || "認証できませんでした");
    } catch (e) { msg("通信できません。電波のある場所で、もう一度お試しください。"); }
    b.disabled = false;
  };

  /* 起動時 */
  const st = get(KEY);
  if (!st || !st.key) lock();
  else {
    unlock();
    const age = (Date.now() - (st.last || 0)) / 864e5;
    if (navigator.onLine) {
      ask("check", st.key).then(j => {
        if (j.ok) { st.last = Date.now(); st.name = j.name; st.expires = j.expires; st.limit = j.limit; set(KEY, st); renderInfo(); }
        else { localStorage.removeItem(KEY); lock(j.msg); }
      }).catch(() => { if (age > GRACE_DAYS) lock("認証の確認が必要です。通信できる場所で、アプリを開いてください。"); });
    } else if (age > GRACE_DAYS) lock("認証の確認が必要です。通信できる場所で、アプリを開いてください。");
  }
})();
