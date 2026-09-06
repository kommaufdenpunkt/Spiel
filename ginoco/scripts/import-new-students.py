#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Legt neue Fahrschüler aus der alten Software in ginoco an – mit kompletter
Fahrstunden-Historie (vergangene = gefahren, künftige = gebucht -> blocken die
Slots), Stammdaten und dem tatsächlichen Fahrlehrer je Stunde (Kollegen).

Nutzt den vorhandenen Sammel-Import (/api/instructor/roster/bulk): legt fehlende
Schüler an, überspringt Doppel automatisch (Datum+Uhrzeit), trägt künftige Termine
als „gebucht" ein. Danach werden Stammdaten und Kollegen-Namen ergänzt.
Mehrfach ausführbar (idempotent).

Aufruf auf dem Server:
    python3 /home/ginoco/spiel/ginoco/scripts/import-new-students.py
"""
import os, sys, json, getpass, urllib.request, urllib.error, http.cookiejar

BASE = os.environ.get("GINOCO_BASE", "http://127.0.0.1:3000")

# ---- Schüler-Daten ----------------------------------------------------------
# lessons: (Datum DD.MM.YY, Beginn HH:MM, Dauer Min, Art, Fahrlehrer)
#   Art:      "" normal · "Überland" · "Autobahn" · "Nacht" · "Prüfungsfahrt"
#   Fahrlehrer: "" = Gino selbst (bleibt leer/Standard) · sonst Kollegen-Name
STUDENTS = [
    {
        "header": "Lilienthal, Heidi",
        "stamm": {"phone": "01746550714", "email": "heidi0609@hotmail.de",
                   "street": "Alex-v-Humboldt-Str", "house_no": "20",
                   "zip": "16225", "city": "Eberswalde", "birth_date": "1984-09-06"},
        "match": ["heidi", "lilienthal"],
        "lessons": [
            ("14.09.26", "11:00", 120, "", ""),
            ("10.09.26", "11:00", 80,  "", ""),
            ("09.09.26", "11:00", 80,  "", ""),
            ("04.09.26", "11:00", 120, "", ""),
            ("04.09.26", "10:20", 40,  "", ""),
            ("27.07.26", "06:00", 80,  "", ""),
            ("22.07.26", "09:00", 55,  "Prüfungsfahrt", ""),
            ("22.07.26", "08:10", 40,  "", ""),
            ("10.07.26", "13:10", 80,  "", ""),
            ("22.06.26", "11:15", 55,  "Prüfungsfahrt", ""),
            ("22.06.26", "10:30", 40,  "", ""),
            ("08.06.26", "14:00", 55,  "Prüfungsfahrt", "Rechtenbach Tim"),
            ("06.06.26", "12:00", 160, "", "Rechtenbach Tim"),
            ("05.06.26", "12:00", 160, "", "Rechtenbach Tim"),
            ("04.06.26", "12:00", 160, "", "Rechtenbach Tim"),
            ("03.06.26", "11:00", 160, "", "Rechtenbach Tim"),
            ("02.06.26", "16:00", 160, "", "Rechtenbach Tim"),
            ("02.06.26", "14:20", 80,  "", ""),
            ("01.06.26", "14:20", 80,  "", ""),
            ("30.05.26", "13:30", 80,  "", ""),
            ("28.05.26", "13:30", 80,  "", ""),
            ("26.05.26", "13:00", 80,  "", ""),
            ("23.05.26", "14:40", 80,  "", ""),
            ("20.05.26", "13:00", 160, "", ""),
            ("19.05.26", "13:00", 160, "", ""),
            ("23.04.26", "12:15", 80,  "", "Rechtenbach Tim"),
            ("22.04.26", "10:45", 80,  "", "Rechtenbach Tim"),
            ("20.04.26", "10:45", 80,  "", "Rechtenbach Tim"),
            ("17.04.26", "09:30", 80,  "", "Rechtenbach Tim"),
            ("24.02.25", "12:30", 80,  "", "Zieroth André"),
            ("18.02.25", "18:00", 135, "Nacht", "Zieroth André"),
            ("17.02.25", "09:00", 80,  "", "Zieroth André"),
            ("24.01.25", "16:30", 135, "Nacht", ""),
            ("22.01.25", "12:45", 180, "Autobahn", ""),
            ("22.01.25", "09:00", 225, "Überland", ""),
            ("26.11.24", "12:00", 60,  "", ""),
            ("06.11.24", "09:30", 60,  "", ""),
            ("17.10.24", "10:30", 60,  "", ""),
            ("11.08.24", "12:30", 60,  "", "Zieroth André"),
            ("31.07.24", "16:45", 60,  "", "Zieroth André"),
            ("26.07.24", "16:45", 60,  "", "Zieroth André"),
            ("24.07.24", "15:30", 60,  "", ""),
            ("26.06.24", "13:15", 60,  "", "Zieroth André"),
        ],
    },
]

cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    try:
        with opener.open(req, timeout=60) as r:
            raw = r.read().decode(); return r.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try: return e.code, json.loads(raw)
        except: return e.code, {"error": raw[:200]}

def roster_text(stu):
    lines = [stu["header"]]
    for (d, t, dur, art, _instr) in stu["lessons"]:
        extra = f", {art}" if art else ""
        lines.append(f"{d}, {t}, {dur}{extra}")
    return "\n".join(lines)

def main():
    pin = getpass.getpass("Cockpit-PIN (Eingabe wird nicht angezeigt): ")
    st, resp = call("POST", "/api/auth/instructor", {"pin": pin})
    if st != 200: print("Login fehlgeschlagen:", resp.get("error", st)); sys.exit(1)
    print("Login OK.\n")

    for stu in STUDENTS:
        text = roster_text(stu)
        # 1) Vorschau
        st, pv = call("POST", "/api/instructor/roster/bulk", {"text": text, "commit": False})
        if st != 200: print("Vorschau-Fehler:", pv.get("error", st)); continue
        print(f"== {stu['header']} ==  Vorschau: neu={pv.get('totalOk','?')} "
              f"(gefahren={pv.get('totalDone','?')}, gebucht={pv.get('totalFuture','?')}, "
              f"schon vorhanden={pv.get('totalDup','?')}, Fehler={pv.get('totalErr','?')})")
        # 2) Eintragen
        st, cm = call("POST", "/api/instructor/roster/bulk", {"text": text, "commit": True})
        if st != 200: print("Eintrag-Fehler:", cm.get("error", st)); continue
        print(f"   eingetragen: neu={cm.get('totalOk','?')} · schon vorhanden={cm.get('totalDup','?')}")

        # 3) Schüler finden
        _, sl = call("GET", "/api/students")
        s = next((x for x in sl.get("students", []) if all(tok in (x.get("name") or "").lower() for tok in stu["match"])), None)
        if not s: print("   [!] Schüler nach Import nicht gefunden – Stammdaten/Kollegen übersprungen."); continue

        # 4) Stammdaten
        st, _ = call("PATCH", f"/api/students/{s['id']}", stu["stamm"])
        print("   Stammdaten:", "gesetzt ✓" if st == 200 else "Fehler")

        # 5) Kollegen-Fahrlehrer je Stunde
        _, lr = call("GET", f"/api/students/{s['id']}/lessons")
        by_slot = {}
        for l in lr.get("lessons", []):
            by_slot.setdefault((l["date"], l["start_time"]), []).append(l)
        def to_iso(d):  # DD.MM.YY -> YYYY-MM-DD
            dd, mm, yy = d.split("."); yy = ("20" + yy) if len(yy) == 2 else yy
            return f"{yy}-{int(mm):02d}-{int(dd):02d}"
        n_instr = 0
        for (d, t, dur, art, instr) in stu["lessons"]:
            if not instr: continue
            rows = by_slot.get((to_iso(d), t), [])
            if not rows: print(f"   [!] {d} {t}: Stunde nicht gefunden ({instr})"); continue
            for row in rows:
                sp, _ = call("PATCH", f"/api/bookings/{row['id']}", {"instructor_name": instr})
                if sp == 200: n_instr += 1
        print(f"   Kollegen-Fahrlehrer gesetzt: {n_instr}\n")

    print("Fertig.")

if __name__ == "__main__":
    main()
