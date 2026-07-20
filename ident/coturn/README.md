# coturn – TURN-Server für ident

TURN sorgt dafür, dass das **Video auch hinter strengen Firewalls / im Mobilfunk**
zustande kommt. Wenn eine direkte Verbindung nicht klappt, wird sie über diesen
Server geleitet. Ohne TURN scheitert das Gespräch in vielen Firmen-/Handynetzen.

## Der einfache Weg: als Coolify-Ressource (empfohlen)

TURN läuft auf **demselben Server wie ident** (178.104.82.169). Alles steckt in
`docker-compose.yml` – keine extra Datei, IP schon eingetragen.

1. **DNS** (empfohlen): A-Record `turn.4ever1.tv` → **178.104.82.169**.
   Aktuell zeigt er auf eine andere IP (178.105.238.222) – bitte ändern.
   Proxy/„Schutz" (CDN) für diesen Eintrag **AUS** lassen.
   *Ohne DNS-Änderung:* unten bei ident einfach die IP als `TURN_HOST` nehmen.

2. **Firewall öffnen** (Hetzner-Firewall im Panel und/oder Host):
   - UDP **3478**, TCP **3478** (TURN/STUN)
   - TCP **5349** (TURN/TLS)
   - UDP **49160–49200** (Relay-Bereich)

3. **In Coolify:** `+ New Resource` → **Docker Compose** → Inhalt von
   `docker-compose.yml` einfügen. Deploy. (Nichts ändern – IP + Secret stehen drin.)

4. **ident-App verbinden** (Environment Variables der ident-Ressource):
   ```
   TURN_HOST=turn.4ever1.tv      (oder 178.104.82.169, falls DNS nicht geändert)
   TURN_SECRET=a456bcb2acdc50cc89a5ae9abeccf7e6e07141c552db639f8774869ee6658acd
   ```
   Danach ident **neu deployen**.

> Das `--static-auth-secret` in der Compose-Datei und `TURN_SECRET` in ident
> **müssen exakt gleich** sein (ist hier schon so eingetragen).

## Läuft schon einer? / Prüfen (per SSH, optional)
```
docker ps | grep coturn        # läuft der Container?
ss -lun | grep 3478            # lauscht etwas auf UDP 3478?
docker logs coturn --tail 30   # Meldungen von coturn
```

## Klappt es? – Test
- Auf `https://ident.4ever1.tv/ice` muss ein `turn:`-Eintrag erscheinen
  (nicht nur `stun:`). Dann liefert die App die TURN-Zugangsdaten aus.
- Echter Test: ein Gespräch zwischen zwei Geräten in **unterschiedlichen Netzen**
  (z. B. WLAN ↔ Handy-Mobilfunk). Kommt das Video, funktioniert TURN.
- Feintest: WebRTC-„Trickle ICE"-Seite, Server `turn:turn.4ever1.tv:3478`
  eintragen – es sollten `relay`-Kandidaten erscheinen.

## Alternative: direkt per SSH (ohne Coolify)
Wer lieber auf dem Server arbeitet, kann `turnserver.conf.example` nach
`turnserver.conf` kopieren, IP + Secret eintragen und coturn mit einer
Compose-Datei starten, die diese Datei mountet. Für die meisten ist der
Coolify-Weg oben aber einfacher.
