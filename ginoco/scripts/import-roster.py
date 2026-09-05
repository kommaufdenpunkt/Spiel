#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Verlauf-Import (wiederholbar): legt fehlende Fahrschueler an und traegt Fahrten
# ein. Bereits vorhandene Fahrten (gleiches Datum+Uhrzeit) werden uebersprungen,
# es entstehen also keine Doppel. Aufruf auf dem Server:
#   python3 /home/ginoco/spiel/ginoco/scripts/import-roster.py
import os, json, sys, getpass, subprocess, urllib.request, urllib.error, http.cookiejar

def detect_port():
    p = os.environ.get("GINOCO_PORT")
    if p: return p
    try:
        out = subprocess.check_output(["systemctl","show","ginoco","-p","Environment","--value"], text=True)
        for tok in out.split():
            if tok.startswith("PORT="): return tok[5:]
    except Exception:
        pass
    return "3000"

BASE = "http://127.0.0.1:%s" % detect_port()
BLOCKS = [
    r"""
Kaya, Aleyna
03.08.2026, 08:30, 80, Schalt
04.08.2026, 09:00, 80
05.08.2026, 09:30, 80
06.08.2026, 09:00, 40
07.08.2026, 09:30, 80
10.08.2026, 08:30, 80
11.08.2026, 09:00, 80
12.08.2026, 09:30, 80
13.08.2026, 09:00, 80
14.08.2026, 09:30, 80
18.08.2026, 09:00, 80
19.08.2026, 09:30, 80
20.08.2026, 09:00, 80
25.08.2026, 15:00, 80
26.08.2026, 11:00, 120
28.08.2026, 16:10, 120
31.08.2026, 11:45, 120
01.09.2026, 11:00, 120
01.09.2026, 13:00, 15, Schaltkompetenznachweis
02.09.2026, 11:00, 120
03.09.2026, 11:00, 120
07.09.2026, 11:00, 120
09.09.2026, 14:40, 120
15.09.2026, 11:00, 160
""",
    r"""
Pohl, Klaus Benjamin
11.07.2026, 13:00, 120
17.07.2026, 18:40, 80
18.07.2026, 12:05, 160
18.07.2026, 15:15, 120
18.07.2026, 19:00, 80
21.07.2026, 09:50, 120
21.07.2026, 20:15, 80
25.07.2026, 11:10, 200
27.07.2026, 12:40, 180
27.07.2026, 20:25, 80
28.07.2026, 14:00, 120
29.07.2026, 13:05, 45, Überland
29.07.2026, 20:40, 40
29.07.2026, 22:00, 135, Nacht
30.07.2026, 12:00, 135, Überland
30.07.2026, 16:30, 90, Autobahn
30.07.2026, 19:30, 45, Überland
31.07.2026, 09:00, 45, Überland
31.07.2026, 13:50, 90, Autobahn
04.08.2026, 12:00, 80
04.08.2026, 16:00, 120
07.08.2026, 11:45, 120
08.08.2026, 13:30, 160
10.08.2026, 12:40, 80
12.08.2026, 15:00, 40
18.08.2026, 12:10, 80
22.08.2026, 16:05, 120
28.08.2026, 09:30, 400
31.08.2026, 15:05, 80
""",
    r"""
Fiedler, Elex
26.03.2025, 16:30, 80
07.08.2025, 17:00, 80
11.08.2025, 17:00, 80
11.08.2025, 17:00, 80
27.08.2025, 17:00, 80
09.09.2025, 17:00, 80
09.09.2025, 17:00, 80
09.09.2025, 18:30, 80
29.09.2025, 17:00, 80
30.09.2025, 17:00, 80
01.10.2025, 17:00, 80
02.10.2025, 16:00, 80, Fehlstunde
02.09.2026, 13:30, 240
03.09.2026, 13:30, 240
03.09.2026, 17:30, 30
04.09.2026, 17:15, 80
07.09.2026, 13:30, 120
09.09.2026, 12:30, 120
10.09.2026, 12:35, 120
""",
    r"""
Baumert, Selina
08.08.2026, 11:15, 120
12.08.2026, 19:30, 80
14.08.2026, 11:30, 80
15.08.2026, 13:00, 120
17.08.2026, 11:10, 120
20.08.2026, 12:15, 120
20.08.2026, 14:15, 15, Schaltkompetenznachweis
21.08.2026, 11:20, 80
31.08.2026, 16:25, 120
07.09.2026, 16:00, 120
10.09.2026, 15:00, 120
12.09.2026, 11:00, 225, Überland
17.09.2026, 14:00, 180, Autobahn
""",
    r"""
Homuth, Janez
03.06.2026, 14:50, 80
09.06.2026, 17:00, 120
12.06.2026, 17:00, 120
19.06.2026, 17:00, 120
08.07.2026, 15:35, 120
11.07.2026, 16:00, 80
16.07.2026, 15:20, 80
18.08.2026, 14:00, 120
18.08.2026, 16:40, 200
26.08.2026, 13:30, 120
26.08.2026, 16:15, 120
31.08.2026, 18:25, 80
01.09.2026, 13:30, 225, Überland
01.09.2026, 17:15, 135, Autobahn
02.09.2026, 18:00, 40, 05.09.2026 06:00
02.09.2026, 18:40, 45, Autobahn, 05.09.2026 06:40
02.09.2026, 19:25, 135, Nacht, 05.09.2026 07:25
""",
    r"""
Esmatullah, Saraj
29.04.2026, 09:00, 120
15.05.2026, 09:00, 120
18.05.2026, 09:00, 80
19.06.2026, 08:00, 80
23.06.2026, 11:00, 80
30.06.2026, 12:15, 80
07.07.2026, 08:00, 80
08.07.2026, 08:00, 80
27.07.2026, 09:30, 80
30.07.2026, 09:30, 80
13.08.2026, 08:00, 80
04.09.2026, 13:30, 80
07.09.2026, 19:00, 80
09.09.2026, 19:00, 80
14.09.2026, 13:15, 80
""",
]

cj = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

def call(path, obj=None, method="POST"):
    data = json.dumps(obj).encode() if obj is not None else None
    req = urllib.request.Request(BASE + path, data=data, headers={'Content-Type':'application/json'}, method=method)
    try:
        return json.loads(op.open(req, timeout=120).read().decode())
    except urllib.error.HTTPError as e:
        try: return json.loads(e.read().decode() or '{}')
        except Exception: return {'_http': e.code}
    except Exception as e:
        return {'_err': str(e)}

pin = getpass.getpass("Cockpit-PIN (Eingabe wird nicht angezeigt): ")
res = call("/api/auth/instructor", {"pin": pin})
if isinstance(res, dict) and res.get("need2fa"):
    res = call("/api/auth/instructor", {"pin": pin, "code": input("Authenticator-Code: ").strip()})
if not (isinstance(res, dict) and res.get("role") == "instructor"):
    print("!! Login fehlgeschlagen:", res); sys.exit(1)
print("Login OK - trage ein (Doppel werden automatisch uebersprungen) ...\n")

out = call("/api/instructor/roster/bulk", {"text": "\n\n".join(BLOCKS), "commit": True})
if not out.get("committed"):
    print("!! Import-Fehler:", json.dumps(out)[:800]); sys.exit(1)
print("Neu eingetragen: %d Fahrstunden  ·  schon vorhanden (uebersprungen): %d\n" % (out.get("createdLessons",0), out.get("totalDup",0)))
print("%-26s %-8s %-14s" % ("Fahrschueler","NEU","schon vorhanden"))
for g in out.get("groups", []):
    if g.get("name"):
        print("  %-24s %-8d %-14d" % (g["name"], g.get("okCount",0), g.get("dupCount",0)))
newc = out.get("createdStudents", [])
if newc:
    print("\n=== ZUGANGSDATEN neu angelegter Fahrschueler (wegkopieren!) ===")
    print("%-28s %-12s %s" % ("Name","Login","Passwort"))
    for s in newc:
        print("%-28s %-12s %s" % (s["name"], s["username"], s["password"]))
print("\nFertig. Alle Fahrschueler sind vollstaendig - ohne Doppel.")
