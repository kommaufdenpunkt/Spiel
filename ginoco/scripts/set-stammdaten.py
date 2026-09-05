#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Setzt Stammdaten fuer einen bestehenden Fahrschueler ueber die lokale API.
# Aufruf: python3 /home/ginoco/spiel/ginoco/scripts/set-stammdaten.py
import os, json, sys, getpass, subprocess, urllib.request, urllib.error, http.cookiejar, unicodedata
def detect_port():
    p = os.environ.get("GINOCO_PORT")
    if p: return p
    try:
        out = subprocess.check_output(["systemctl","show","ginoco","-p","Environment","--value"], text=True)
        for tok in out.split():
            if tok.startswith("PORT="): return tok[5:]
    except Exception: pass
    return "3000"
BASE = "http://127.0.0.1:%s" % detect_port()

# --- Wen und welche Daten? ---
ZIEL_NAME = "Lea-Michelle Franke"
DATEN = {
    "birth_date": "2002-03-13",
    "street": "Ernst-Thälmann-Str.",
    "house_no": "135",
    "zip": "16259",
    "city": "Falkenberg",
    "phone": "015202409003",
    "email": "lea2719@gmx.de",
}

cj = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
def call(path, obj=None, method="POST"):
    data = json.dumps(obj).encode() if obj is not None else None
    req = urllib.request.Request(BASE+path, data=data, headers={'Content-Type':'application/json'}, method=method)
    try: return json.loads(op.open(req, timeout=60).read().decode())
    except urllib.error.HTTPError as e:
        try: return json.loads(e.read().decode() or '{}')
        except Exception: return {'_http': e.code}
    except Exception as e: return {'_err': str(e)}
def norm(s): return " ".join(unicodedata.normalize("NFKD", s or "").encode("ascii","ignore").decode().lower().split())

pin = getpass.getpass("Cockpit-PIN (Eingabe wird nicht angezeigt): ")
res = call("/api/auth/instructor", {"pin": pin})
if isinstance(res, dict) and res.get("need2fa"):
    res = call("/api/auth/instructor", {"pin": pin, "code": input("Authenticator-Code: ").strip()})
if not (isinstance(res, dict) and res.get("role") == "instructor"):
    print("!! Login fehlgeschlagen:", res); sys.exit(1)
studs = call("/api/students", method="GET").get("students", [])
match = [s for s in studs if norm(s["name"]) == norm(ZIEL_NAME)]
if not match:
    print("!! Fahrschueler nicht gefunden:", ZIEL_NAME); sys.exit(1)
sid = match[0]["id"]
out = call("/api/students/%d" % sid, DATEN, method="PATCH")
if out.get("error"):
    print("!! Fehler:", out["error"]); sys.exit(1)
print("Stammdaten gesetzt fuer %s:" % ZIEL_NAME)
for k, v in DATEN.items():
    print("  %-12s %s" % (k, v))
print("\nFertig.")
