#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Verlauf-Import (wiederholbar, mit Doppel-Schutz). Aufruf auf dem Server:
#   python3 /home/ginoco/spiel/ginoco/scripts/import-roster.py
import os, json, sys, getpass, subprocess, urllib.request, urllib.error, http.cookiejar
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
BLOCKS = [
    r"""
Franke, Lea-Michelle
20.07.2026, 14:50, 80
22.07.2026, 12:50, 80
03.08.2026, 19:10, 80
05.08.2026, 15:40, 80
""",
]

cj = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
def call(path, obj=None, method="POST"):
    data = json.dumps(obj).encode() if obj is not None else None
    req = urllib.request.Request(BASE + path, data=data, headers={'Content-Type':'application/json'}, method=method)
    try: return json.loads(op.open(req, timeout=120).read().decode())
    except urllib.error.HTTPError as e:
        try: return json.loads(e.read().decode() or '{}')
        except Exception: return {'_http': e.code}
    except Exception as e: return {'_err': str(e)}
pin = getpass.getpass("Cockpit-PIN (Eingabe wird nicht angezeigt): ")
res = call("/api/auth/instructor", {"pin": pin})
if isinstance(res, dict) and res.get("need2fa"):
    res = call("/api/auth/instructor", {"pin": pin, "code": input("Authenticator-Code: ").strip()})
if not (isinstance(res, dict) and res.get("role") == "instructor"):
    print("!! Login fehlgeschlagen:", res); sys.exit(1)
print("Login OK - trage ein (Doppel werden uebersprungen) ...\n")
out = call("/api/instructor/roster/bulk", {"text": "\n\n".join(BLOCKS), "commit": True})
if not out.get("committed"):
    print("!! Import-Fehler:", json.dumps(out)[:800]); sys.exit(1)
print("Neu eingetragen: %d Fahrstunden  ·  schon vorhanden: %d\n" % (out.get("createdLessons",0), out.get("totalDup",0)))
print("%-26s %-6s %s" % ("Fahrschueler","NEU","schon vorhanden"))
for g in out.get("groups", []):
    if g.get("name"):
        print("  %-24s %-6d %d" % (g["name"], g.get("okCount",0), g.get("dupCount",0)))
newc = out.get("createdStudents", [])
if newc:
    print("\n=== ZUGANGSDATEN (wegkopieren!) ===")
    print("%-28s %-12s %s" % ("Name","Login","Passwort"))
    for s in newc:
        print("%-28s %-12s %s" % (s["name"], s["username"], s["password"]))
print("\nFertig.")
