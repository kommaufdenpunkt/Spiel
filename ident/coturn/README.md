# coturn – TURN-Server für ident

TURN sorgt dafür, dass das **Video auch hinter strengen Firewalls / im Mobilfunk**
zustande kommt (wenn eine direkte Verbindung nicht klappt, wird sie über diesen
Server geleitet). Ohne TURN scheitert das Gespräch in vielen Firmen-/Handynetzen.

## Läuft schon einer?
Auf dem Server prüfen:
```
docker ps | grep coturn        # läuft ein Container?
ss -lun | grep 3478            # lauscht etwas auf UDP 3478?
```
Wenn nichts kommt: mit dieser Anleitung einen aufsetzen.

## Einrichten (auf dem Server, im Ordner ident/coturn/)
1. **Konfig anlegen und ausfüllen:**
   ```
   cp turnserver.conf.example turnserver.conf
   ```
   In `turnserver.conf` eintragen:
   - `external-ip=` → öffentliche IP des Servers (**178.105.238.222**)
   - `static-auth-secret=` → ein langes Zufallsgeheimnis, z. B. `openssl rand -hex 32`
2. **Firewall öffnen** (falls aktiv), diese Ports:
   - UDP + TCP **3478** (TURN/STUN)
   - TCP **5349** (TURN über TLS, optional)
   - UDP **49160–49200** (Relay-Bereich)
   ```
   ufw allow 3478
   ufw allow 5349/tcp
   ufw allow 49160:49200/udp
   ```
3. **Starten:**
   ```
   docker compose up -d
   docker compose logs -f   # sollte "Relay ... listening" o. ä. zeigen
   ```

## Mit ident verbinden
In den **Umgebungsvariablen der ident-App** (Coolify) setzen:
```
TURN_HOST=turn.4ever1.tv
TURN_SECRET=<dasselbe Geheimnis wie static-auth-secret oben>
```
> Wichtig: `TURN_SECRET` (ident) und `static-auth-secret` (coturn) **müssen exakt
> gleich** sein – sonst weist der TURN-Server die Verbindungen ab.

Danach neu deployen. Prüfen: `https://ident.4ever1.tv/ice` sollte einen
`turn:`-Eintrag zeigen.

## DNS-Hinweis
`turn.4ever1.tv` muss auf **die Server-IP** zeigen (hast du schon: 178.105.238.222)
und der **Proxy/„Schutz" beim DNS-Anbieter muss AUS** sein – TURN funktioniert
nicht über einen HTTP-CDN-Proxy.

## Testen
- Öffne die WebRTC-Trickle-ICE-Seite und trage ein:
  `turn:turn.4ever1.tv:3478`, Username/Passwort spielt keine Rolle (die App
  erzeugt sie automatisch) – oder teste einfach ein Gespräch zwischen zwei Geräten
  in **unterschiedlichen Netzen** (z. B. WLAN ↔ Handy-Mobilfunk).
