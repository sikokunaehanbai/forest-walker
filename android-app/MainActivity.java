package com.sikokunaehanbai.forestwalker;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.os.Parcelable;
import android.provider.OpenableColumns;
import android.webkit.JavascriptInterface;
import com.getcapacitor.BridgeActivity;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import org.json.JSONArray;
import org.json.JSONObject;

/** 他のアプリ(LINE・ファイルなど)から渡されたKML/KMZ/GeoJSONを受け取り、Web側へ渡す */
public class MainActivity extends BridgeActivity {
  private final Object lock = new Object();
  private JSONArray pending = new JSONArray();

  /** Web側(JavaScript)から呼ばれる窓口 */
  public class NativeBridge {
    @JavascriptInterface
    public String takePending() {
      synchronized (lock) {
        String s = pending.toString();
        pending = new JSONArray();
        return s;
      }
    }
  }

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    getBridge().getWebView().addJavascriptInterface(new NativeBridge(), "FWNative");
    handleIntent(getIntent());
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    handleIntent(intent);
    runOnUiThread(() -> getBridge().getWebView().evaluateJavascript(
        "window.fwNativeCheck && window.fwNativeCheck()", null));
  }

  @SuppressWarnings("deprecation")
  private void handleIntent(Intent intent) {
    if (intent == null) return;
    String action = intent.getAction();
    List<Uri> uris = new ArrayList<>();
    try {
      if (Intent.ACTION_VIEW.equals(action) && intent.getData() != null) {
        uris.add(intent.getData());
      } else if (Intent.ACTION_SEND.equals(action)) {
        Parcelable p = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        if (p instanceof Uri) uris.add((Uri) p);
        String t = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (t != null && (t.contains("<kml") || t.trim().startsWith("{"))) add("shared.kml", t);
      } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
        ArrayList<Parcelable> ps = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
        if (ps != null) for (Parcelable p : ps) if (p instanceof Uri) uris.add((Uri) p);
      }
    } catch (Exception e) { /* 無視 */ }
    for (Uri u : uris) readUri(u);
    if (!uris.isEmpty()) { intent.setAction(null); intent.setData(null); }
  }

  private void readUri(Uri uri) {
    try (InputStream in = getContentResolver().openInputStream(uri)) {
      if (in == null) return;
      ByteArrayOutputStream bo = new ByteArrayOutputStream();
      byte[] buf = new byte[16384];
      int n, total = 0;
      while ((n = in.read(buf)) > 0) { bo.write(buf, 0, n); total += n; if (total > 30 * 1024 * 1024) return; }
      byte[] data = bo.toByteArray();
      String name = displayName(uri);
      if (data.length > 2 && data[0] == 'P' && data[1] == 'K') {   // KMZ(zip)
        try (ZipInputStream z = new ZipInputStream(new ByteArrayInputStream(data))) {
          ZipEntry e;
          while ((e = z.getNextEntry()) != null) {
            if (e.getName().toLowerCase().endsWith(".kml")) {
              ByteArrayOutputStream ko = new ByteArrayOutputStream();
              int k; while ((k = z.read(buf)) > 0) ko.write(buf, 0, k);
              add(name.replaceAll("(?i)\\.kmz$", "") + ".kml", new String(ko.toByteArray(), "UTF-8"));
              return;
            }
          }
        }
        return;
      }
      add(name, new String(data, "UTF-8"));
    } catch (Exception e) { /* 読めなかった場合は何もしない */ }
  }

  private String displayName(Uri uri) {
    String name = null;
    try (Cursor c = getContentResolver().query(uri, null, null, null, null)) {
      if (c != null && c.moveToFirst()) {
        int i = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
        if (i >= 0) name = c.getString(i);
      }
    } catch (Exception e) { /* 無視 */ }
    if (name == null || name.isEmpty()) {
      String p = uri.getLastPathSegment();
      name = (p == null || p.isEmpty()) ? "area.kml" : p;
    }
    return name;
  }

  private void add(String name, String text) {
    try {
      JSONObject o = new JSONObject();
      o.put("name", name);
      o.put("text", text);
      synchronized (lock) { pending.put(o); }
    } catch (Exception e) { /* 無視 */ }
  }
}
