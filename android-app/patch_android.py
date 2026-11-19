"""cap add android で作られたAndroidプロジェクトに、KMLを受け取る設定・位置情報の許可・アイコンを加える"""
import os, re, shutil, sys
HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "android", "app", "src", "main")
PKG = "com/sikokunaehanbai/forestwalker"

# 1) MainActivity を差し替え
shutil.copy(os.path.join(HERE, "MainActivity.java"), os.path.join(APP, "java", PKG, "MainActivity.java"))

# 2) AndroidManifest に「KMLを開く/共有で受ける」設定と位置情報の許可を追加
mp = os.path.join(APP, "AndroidManifest.xml")
m = open(mp, encoding="utf-8").read()
mimes = ["application/vnd.google-earth.kml+xml", "application/vnd.google-earth.kmz", "application/xml", "text/xml",
         "application/geo+json", "application/json", "application/octet-stream"]
data_mimes = "\n".join(f'                <data android:mimeType="{x}" />' for x in mimes)
filters = f'''
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="content" />
                <data android:scheme="file" />
{data_mimes}
            </intent-filter>
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="content" />
                <data android:scheme="file" />
                <data android:mimeType="*/*" />
                <data android:pathPattern=".*\\\\.kml" />
                <data android:pathPattern=".*\\\\.kmz" />
                <data android:pathPattern=".*\\\\.geojson" />
            </intent-filter>
            <intent-filter>
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
{data_mimes}
            </intent-filter>
'''
assert "</activity>" in m
m = m.replace("</activity>", filters + "        </activity>", 1)
perms = '''    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
'''
m = m.replace('<uses-permission android:name="android.permission.INTERNET" />',
              '<uses-permission android:name="android.permission.INTERNET" />\n' + perms, 1)
open(mp, "w", encoding="utf-8").write(m)

# 3) アイコン(リポジトリ直下の icon-512.png を使う)
try:
    from PIL import Image
    src = Image.open(os.path.join(HERE, "..", "icon-512.png")).convert("RGBA")
    res = os.path.join(APP, "res")
    shutil.rmtree(os.path.join(res, "mipmap-anydpi-v26"), ignore_errors=True)
    for d, s in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
        dd = os.path.join(res, "mipmap-" + d)
        for f in os.listdir(dd):
            os.remove(os.path.join(dd, f))
        im = src.resize((s, s), Image.LANCZOS)
        im.save(os.path.join(dd, "ic_launcher.png")); im.save(os.path.join(dd, "ic_launcher_round.png"))
except Exception as e:
    print("アイコンの差し替えをスキップ:", e, file=sys.stderr)
print("patched")
