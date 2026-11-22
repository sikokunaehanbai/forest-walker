/* メモ(写真つき)と移動の記録を、KMZ(Google Earth / QGISで開けるファイル)にして書き出す */
(() => {
  // ---- 最小のZIP作成(無圧縮) ----
  const crcT = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u => { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = crcT[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(files) {     // files: [{name, data:Uint8Array}]
    const enc = new TextEncoder(), parts = [], cen = []; let off = 0;
    const d = new Date(), dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)), dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate());
    for (const f of files) {
      const nm = enc.encode(f.name), crc = crc32(f.data), sz = f.data.length;
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, dt, true); h.setUint16(12, dd, true); h.setUint32(14, crc, true); h.setUint32(18, sz, true); h.setUint32(22, sz, true); h.setUint16(26, nm.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), nm, f.data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, dt, true); c.setUint16(14, dd, true); c.setUint32(16, crc, true); c.setUint32(20, sz, true); c.setUint32(24, sz, true); c.setUint16(28, nm.length, true);
      c.setUint32(42, off, true);
      cen.push(new Uint8Array(c.buffer), nm);
      off += 30 + nm.length + sz;
    }
    let cs = 0; cen.forEach(x => cs += x.length);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cs, true); e.setUint32(16, off, true);
    return new Blob([...parts, ...cen, new Uint8Array(e.buffer)], { type: "application/vnd.google-earth.kmz" });
  }
  const x = s => String(s == null ? "" : s).replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
  const bgr = hex => { const h = (hex || "#d61a1a").replace("#", ""); return "ff" + h.slice(4, 6) + h.slice(2, 4) + h.slice(0, 2); };
  const p2 = n => String(n).padStart(2, "0");
  const when = t => { const d = new Date(t); return d.getFullYear() + "/" + p2(d.getMonth() + 1) + "/" + p2(d.getDate()) + " " + p2(d.getHours()) + ":" + p2(d.getMinutes()); };
  const dataUrlBytes = u => { const b = atob(u.split(",")[1]), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };

  async function build(onlyToday) {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const ms = memos.filter(m => !onlyToday || m.t >= start.getTime());
    const trs = (window.FWTrack ? FWTrack.list() : []).filter(t => t.pts.length > 1 && (!onlyToday || t.t0 >= start.getTime()));
    const files = []; const enc = new TextEncoder(); let nPhoto = 0;
    let styles = "", marks = "";
    const used = new Set();
    for (const m of ms) {
      const c = m.color || "#d61a1a";
      if (!used.has(c)) { used.add(c); styles += `<Style id="c${c.slice(1)}"><IconStyle><color>${bgr(c)}</color><scale>1.1</scale><Icon><href>http://maps.google.com/mapfiles/kml/paddle/wht-blank.png</href></Icon></IconStyle></Style>\n`; }
      let imgs = "";
      for (const id of (m.photos || [])) {
        const u = await FWStore.get("photo", id).catch(() => null); if (!u) continue;
        const nm = "files/photo" + (++nPhoto) + ".jpg"; files.push({ name: nm, data: dataUrlBytes(u) });
        imgs += `<br><img src="${nm}" width="480">`;
      }
      const label = (m.text || "(文字なし)").replace(/\s+/g, " ");
      marks += `<Placemark><name>${x(label.length > 20 ? label.slice(0, 20) + "…" : label)}</name><description><![CDATA[${x(m.text || "").replace(/\n/g, "<br>")}<br><small>${when(m.t)}</small>${imgs}]]></description><styleUrl>#c${c.slice(1)}</styleUrl><TimeStamp><when>${new Date(m.t).toISOString()}</when></TimeStamp><Point><coordinates>${m.lng},${m.lat},0</coordinates></Point></Placemark>\n`;
    }
    let lines = "";
    for (const t of trs) lines += `<Placemark><name>${x(t.name)}</name><styleUrl>#trk</styleUrl><LineString><tessellate>1</tessellate><coordinates>${t.pts.map(p => p[0] + "," + p[1] + "," + (p[2] != null ? p[2] : 0)).join(" ")}</coordinates></LineString></Placemark>\n`;
    const kml = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>フォレストウォーカー ${when(Date.now())}</name>\n<Style id="trk"><LineStyle><color>ffe8731a</color><width>4</width></LineStyle></Style>\n${styles}` +
      (marks ? `<Folder><name>メモ</name>\n${marks}</Folder>\n` : "") + (lines ? `<Folder><name>移動の記録</name>\n${lines}</Folder>\n` : "") + `</Document></kml>`;
    files.unshift({ name: "doc.kml", data: enc.encode(kml) });
    return { blob: zip(files), nMemo: ms.length, nPhoto, nTrack: trs.length };
  }

  async function run(onlyToday) {
    closeDlg(); setStatus("書き出しを作っています…", 0);
    let r;
    try { r = await build(onlyToday); } catch (e) { setStatus("", 0); alert("書き出しに失敗しました"); return; }
    setStatus("", 0);
    if (!r.nMemo && !r.nTrack) { alert("書き出すメモ・記録がありません。"); return; }
    const d = new Date(), fname = "forest-walker-" + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + "-" + p2(d.getHours()) + p2(d.getMinutes()) + ".kmz";
    const file = new File([r.blob], fname, { type: "application/vnd.google-earth.kmz" });
    const msg = "メモ" + r.nMemo + "件・写真" + r.nPhoto + "枚・記録" + r.nTrack + "本";
    try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: fname, text: msg }); return; } } catch (e) { if (e && e.name === "AbortError") return; }
    try { const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = fname; document.body.append(a); a.click(); a.remove(); setStatus("書き出しました(" + msg + ")", 4000); }
    catch (e) { alert("この端末では書き出せませんでした"); }
  }
  $("exportKmz").onclick = () => {
    openDlg(`<h3>KMZで書き出す</h3><div class="note">メモの位置・文字・写真と、移動の記録(線)を1つのファイルにします。Google EarthやQGISで開けます。</div>
      <div class="act"><button class="alt" id="kAll">すべて</button><button class="alt" id="kToday">今日の分だけ</button></div>
      <div class="act"><button id="kC">閉じる</button></div>`);
    $("kAll").onclick = () => run(false); $("kToday").onclick = () => run(true); $("kC").onclick = closeDlg;
  };
})();
