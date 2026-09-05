#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Trägt bei den bereits importierten (vergangenen) Fahrstunden den tatsächlichen
Fahrlehrer ein – dort, wo ein Kollege gefahren ist. Fahrten von Gino selbst
bleiben leer (dann erscheint automatisch dein Name).

Quelle: die alten fsmanager-Screenshots (Spalte „Lehrer").
Nur die Spalte instructor_name wird gesetzt – sonst nichts. Mehrfach ausführbar
(idempotent): setzt immer denselben Wert, verändert nichts doppelt.

Aufruf auf dem Server:
    python3 /home/ginoco/spiel/ginoco/scripts/set-instructors.py
"""
import os, sys, json, getpass, urllib.request, urllib.error, http.cookiejar

BASE = os.environ.get("GINOCO_BASE", "http://127.0.0.1:3000")

# ---- Kollegen-Fahrten je Schüler: (Datum YYYY-MM-DD, Beginn HH:MM, Fahrlehrer) ----
# Gino-Fahrten stehen hier NICHT drin (die bleiben leer = Standard-Fahrlehrer).
ELEX = [
    ("2025-10-02", "16:00", "Zieroth André"),
    ("2025-10-01", "17:00", "Heckert Uwe"),
    ("2025-09-30", "17:00", "Rechtenbach Tim"),
    ("2025-09-29", "17:00", "Rechtenbach Tim"),
    ("2025-09-09", "18:30", "Heckert Uwe"),
    ("2025-09-09", "17:00", "Heckert Uwe"),
    ("2025-09-09", "17:00", "Rechtenbach Tim"),
    ("2025-08-27", "17:00", "Heckert Uwe"),
    ("2025-08-11", "17:00", "Heckert Uwe"),
    ("2025-08-11", "17:00", "Rechtenbach Tim"),
    ("2025-08-07", "17:00", "Heckert Uwe"),
    ("2025-03-26", "16:30", "Zieroth André"),
]
SARAJ = [
    ("2026-08-13", "08:00", "Heckert Uwe"),
    ("2026-07-30", "09:30", "Heckert Uwe"),
    ("2026-07-27", "09:30", "Heckert Uwe"),
    ("2026-07-08", "08:00", "Heckert Uwe"),
    ("2026-07-07", "08:00", "Heckert Uwe"),
    ("2026-06-30", "12:15", "Heckert Uwe"),
    ("2026-06-23", "11:00", "Heckert Uwe"),
    ("2026-06-19", "08:00", "Heckert Uwe"),
    ("2026-05-18", "09:00", "Jorde Kevin"),
    ("2026-05-15", "09:00", "Jorde Kevin"),
    ("2026-04-29", "09:00", "Jorde Kevin"),
]
# Tiago: ALLE Fahrstunden wurden von Zieroth André gefahren.
TIAGO_ALL = "Zieroth André"

# Schüler-Zuordnung: Namensbestandteile (Vor- + Nachname) -> Regelwerk
STUDENTS = [
    (["elex", "fiedler"],       {"entries": ELEX}),
    (["saraj", "esmatullah"],   {"entries": SARAJ}),
    (["tiago", "katscher"],     {"all": TIAGO_ALL}),
]

cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    try:
        with opener.open(req, timeout=30) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try: return e.code, json.loads(raw)
        except: return e.code, {"error": raw[:200]}

def match_student(students, tokens):
    for s in students:
        nm = (s.get("name") or "").lower()
        if all(tok in nm for tok in tokens):
            return s
    return None

def main():
    pin = getpass.getpass("Cockpit-PIN (Eingabe wird nicht angezeigt): ")
    st, resp = call("POST", "/api/auth/instructor", {"pin": pin})
    if st != 200:
        print("Login fehlgeschlagen:", resp.get("error", st)); sys.exit(1)
    print("Login OK.\n")

    st, resp = call("GET", "/api/students")
    students = resp.get("students", [])
    if not students:
        print("Keine Fahrschüler gefunden."); sys.exit(1)

    total_set = 0
    for tokens, rule in STUDENTS:
        s = match_student(students, tokens)
        label = "/".join(tokens)
        if not s:
            print(f"[!] {label}: Fahrschüler nicht gefunden – übersprungen."); continue
        stx, lr = call("GET", f"/api/students/{s['id']}/lessons")
        lessons = lr.get("lessons", [])
        by_slot = {}
        for l in lessons:
            by_slot.setdefault((l["date"], l["start_time"]), []).append(l)
        print(f"== {s['name']} ({len(lessons)} Fahrstunden) ==")

        assignments = []  # (booking_id, name)
        if "all" in rule:
            name = rule["all"]
            for l in lessons:
                if (l.get("instructor_name") or "") != name:
                    assignments.append((l["id"], name))
            print(f"   alle Fahrten -> {name}")
        else:
            # Kollegen-Einträge nach Slot gruppieren und auf die DB-Zeilen verteilen
            groups = {}
            for (d, t, name) in rule["entries"]:
                groups.setdefault((d, t), []).append(name)
            for (d, t), names in groups.items():
                rows = sorted(by_slot.get((d, t), []), key=lambda x: x["id"])
                if not rows:
                    print(f"   [!] keine Stunde am {d} {t} gefunden ({', '.join(names)})"); continue
                for i, name in enumerate(names):
                    if i < len(rows):
                        assignments.append((rows[i]["id"], name))
                    else:
                        print(f"   [!] {d} {t}: mehr Kollegen ({name}) als Stunden – übersprungen")

        for bid, name in assignments:
            stp, pr = call("PATCH", f"/api/bookings/{bid}", {"instructor_name": name})
            ok = stp == 200
            print(f"   {'✓' if ok else '✗'} #{bid} -> {name}" + ("" if ok else f"  ({pr.get('error')})"))
            if ok: total_set += 1
        print()

    print(f"Fertig. {total_set} Fahrstunden mit Fahrlehrer-Namen versehen.")

if __name__ == "__main__":
    main()
