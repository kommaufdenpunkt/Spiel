#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Einmalige Aktualisierungen: Tiago Katscher (Fahrten + Stammdaten) und
# Lea-Michelle Franke (Stammdaten). Aufruf auf dem Server:
#   python3 /home/ginoco/spiel/ginoco/scripts/apply-updates.py
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

TIAGO_ROSTER = r"""
Katscher, Tiago
04.04.2026, 15:00, 80, A1
08.04.2026, 12:00, 80, A1
10.04.2026, 15:00, 80, A1
04.05.2026, 15:00, 80, A1
06.05.2026, 15:00, 80, A1
08.05.2026, 15:00, 80, A1
13.05.2026, 18:00, 80, A1
21.05.2026, 19:30, 80, A1
28.05.2026, 19:30, 80, B
29.05.2026, 13:00, 80, A1
16.06.2026, 18:10, 180, Überland, A1
16.06.2026, 21:30, 90, Autobahn, A1
10.07.2026, 12:00, 160, A1
13.07.2026, 15:00, 45, Überland, A1
13.07.2026, 15:45, 90, Autobahn, A1
15.07.2026, 21:30, 135, Nacht, A1
30.07.2026, 11:00, 80, A1
30.07.2026, 12:30, 70, Prüfungsfahrt, A1
"""
STAMM = {
  "Tiago Katscher": {"birth_date":"2009-10-26","street":"Steinfurter Str.","house_no":"17c","zip":"16348","city":"Marienwerder","phone":"01723116502","email":"ekorkow@gmail.com"},
  "Lea-Michelle Franke": {"birth_date":"2002-03-13","street":"Ernst-Thälmann-Str.","house_no":"135","zip":"16259","city":"Falkenberg","phone":"015202409003","email":"lea2719@gmx.de"},
}

cj = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
def call(path, obj=None, method="POST"):
    data = json.dumps(obj).encode() if obj is not None else None
    req = urllib.request.Request(BASE+path, data=data, headers={'Content-Type':'application/json'}, method=method)
    try: return json.loads(op.open(req, timeout=90).read().decode())
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
print("Login OK.\n")

# 1) Tiago-Fahrten importieren (Doppel werden uebersprungen)
out = call("/api/instructor/roster/bulk", {"text": TIAGO_ROSTER, "commit": True})
if out.get("committed"):
    print("Tiago-Fahrten: %d neu, %d schon vorhanden" % (out.get("createdLessons",0), out.get("totalDup",0)))
    for s in out.get("createdStudents", []):
        print("   NEU angelegt: %s  Login %s  Passwort %s" % (s["name"], s["username"], s["password"]))
else:
    print("!! Fahrten-Import-Fehler:", json.dumps(out)[:400])

# 2) Stammdaten setzen
studs = call("/api/students", method="GET").get("students", [])
for name, daten in STAMM.items():
    m = [s for s in studs if norm(s["name"]) == norm(name)]
    if not m:
        print("   Stammdaten uebersprungen (nicht gefunden): %s" % name); continue
    r = call("/api/students/%d" % m[0]["id"], daten, method="PATCH")
    print("   Stammdaten gesetzt: %s%s" % (name, "" if not r.get("error") else "  !! "+r["error"]))
print("\nFertig.")
