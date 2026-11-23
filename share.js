/* 共有フォルダ(社内の人だけ): 写真つきメモ・記録をGoogleドライブへ送る/読み込む */
(() => {
  const $ = id => document.getElementById(id);
  const L = () => window.FWLic;
  const member = () => !!(L() && L().member());
  function refresh() { const b = $("shareBox"); if (b) b.classList.toggle("hidden", !member()); }
  refresh(); setInterval(refresh, 1500);

  const base = extra => { const s = L().st() || {}; return Object.assign({ key: s.key || "", did: L().did(), dn: s.dn || "" }, extra || {}); };
  async function post(obj) {
    const r = await fetch(L().url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(obj), redirect: "follow" });
    return await r.json();
  }
  async function getJ(obj) {
    const r = await fetch(L().url + "?" + new URLSearchParams(obj).toString(), { redirect: "follow" });
    return await r.json();
  }
  const toB64 = blob => new Promise((res, rej) => { const f = new FileReader(); f.onload = () => res(String(f.result).split(",")[1]); f.onerror = rej; f.readAsDataURL(blob); });
  const fromB64 = b => { const s = atob(b), a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; };
  const fmtT = t => { const d = new Date(t), p = FWKmz.p2; return (d.getMonth() + 1) + "/" + d.getDate() + " " + p(d.getHours()) + ":" + p(d.getMinutes()); };
  const fmtS = n => n > 1048576 ? (n / 1048576).toFixed(1) + "MB" : Math.max(1, Math.round(n / 1024)) + "KB";
  const esc = s => String(s).replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));

  async function upload(onlyToday) {
    closeDlg(); setStatus("共有フォルダへ送る準備をしています…", 0);
    let r;
    try { r = await FWKmz.build(onlyToday); } catch (e) { setStatus("", 0); alert("作成に失敗しました"); return; }
    if (!r.nMemo && !r.nTrack) { setStatus("", 0); alert("送るメモ・記録がありません。"); return; }
    if (!navigator.onLine) { setStatus("", 0); alert("電波のある場所で、もう一度お試しください。"); return; }
    try {
      setStatus("送っています(" + fmtS(r.blob.size) + ")…", 0);
      const d = new Date(), p = FWKmz.p2;
      const name = d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes());
      const j = await post(base({ action: "share", fname: name, data: await toB64(r.blob) }));
      setStatus("", 0);
      if (j.ok) setStatus("共有フォルダへ送りました(メモ" + r.nMemo + "件・写真" + r.nPhoto + "枚・記録" + r.nTrack + "本)", 6000);
      else alert(j.msg || "送れませんでした");
    } catch (e) { setStatus("", 0); alert("送れませんでした。電波のある場所で、もう一度お試しください。"); }
  }
  $("shareUp").onclick = () => {
    if (!member()) return;
    openDlg(`<h3>共有フォルダへ送る</h3><div class="note">このアプリのメモ(写真つき)と移動の記録を、会社の共有フォルダへ送ります。送ったあとも、この端末のメモは残ります。</div>
      <div class="act"><button class="alt" id="sAll">すべて</button><button class="alt" id="sToday">今日の分だけ</button></div>
      <div class="act"><button id="sC">閉じる</button></div>`);
    $("sAll").onclick = () => upload(false); $("sToday").onclick = () => upload(true); $("sC").onclick = closeDlg;
  };

  async function pick(f) {
    closeDlg(); setStatus("読み込んでいます…", 0);
    try {
      const j = await getJ(Object.assign(base({ action: "get", id: f.id })));
      if (!j.ok) { setStatus("", 0); alert(j.msg || "読み込めませんでした"); return; }
      const file = new File([fromB64(j.data)], j.name || f.name, { type: "application/vnd.google-earth.kmz" });
      setStatus("", 0); await FWImport([file]);
    } catch (e) { setStatus("", 0); alert("読み込めませんでした。電波のある場所で、もう一度お試しください。"); }
  }
  $("shareDown").onclick = async () => {
    if (!member()) return;
    if (!navigator.onLine) { alert("電波のある場所で、もう一度お試しください。"); return; }
    setStatus("共有フォルダを見ています…", 0);
    let j;
    try { j = await getJ(base({ action: "list" })); } catch (e) { setStatus("", 0); alert("通信できませんでした"); return; }
    setStatus("", 0);
    if (!j.ok) { alert(j.msg || "読み込めませんでした"); return; }
    const files = j.files || [];
    openDlg('<h3>共有フォルダから読み込む</h3><div class="note">新しい順に40件まで出ます。押すと、地図に読み込みます。</div><div id="shList">' +
      (files.length ? "" : "<p>まだ何も送られていません。</p>") + '</div><div class="act"><button id="shC">閉じる</button></div>');
    const box = $("shList");
    files.forEach(f => {
      const row = document.createElement("div"); row.className = "muni";
      const sp = document.createElement("span"); sp.innerHTML = esc(f.name) + '<br><small>' + fmtT(f.t) + " / " + fmtS(f.size) + "</small>";
      const b = document.createElement("button"); b.textContent = "読み込む"; b.onclick = () => pick(f);
      row.append(sp, b); box.append(row);
    });
    $("shC").onclick = closeDlg;
  };
})();
