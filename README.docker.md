# AMC Homepage (`janine65/amchomepage`)

Öffentliche Homepage des Auto-Moto-Club Swissair: News, Berichte, Agenda mit Anmeldung sowie Club-/Kegelmeisterschaft (nur freigegebene Jahre).

## Stack

- Astro 7 (SSR, Node-Adapter standalone), Build via pnpm
- Node 24 (slim), läuft als Non-Root-User `node`, Port **4321**
- Daten werden pro Request serverseitig vom Backend geladen (`/public`-Endpunkte)

## Tags

| Tag | Bedeutung |
|---|---|
| `latest` | aktueller Build von `main` |
| `x.y.z` | Release-Version (entspricht `package.json`) |
| `test` | Test-Build |

## Verwendung

Die Homepage erwartet das Backend im selben Docker-Netzwerk; die URL wird zur **Laufzeit** über `API_URL` gesetzt:

```yaml
services:
  amcbackend:
    image: janine65/amcbackend:latest
    env_file: .env-prod
    ports:
      - "3001:3001"

  amchomepage:
    image: janine65/amchomepage:latest
    depends_on:
      - amcbackend
    environment:
      - API_URL=http://amcbackend:3001
    ports:
      - "4321:4321"
    volumes:
      # Download-Dateien (z. B. PDFs für Berichte), erreichbar unter /downloads/<datei>
      - ./downloads:/app/dist/client/downloads
```

Danach: `http://localhost:4321`

## Details

- **Downloads**: Dateien im Ordner `public/downloads/` (bzw. im gemounteten Volume) werden unter `https://<host>/downloads/<datei>` ausgeliefert – z. B. als `datei`-Link eines Berichts.
- **Healthcheck** integriert (HTTP-Fetch auf `http://127.0.0.1:4321/`, alle 30 s).
- Alle Backend-Aufrufe laufen Server-zu-Server (SSR) — keine CORS-Konfiguration nötig, das Backend muss nicht öffentlich erreichbar sein.
- Meisterschafts-Ranglisten werden nur für Jahre angezeigt, die intern freigegeben wurden (`jahr_freigabe`).
- Kontaktformular und Anlass-Anmeldungen verwenden Cloudflare Turnstile statt der Rechenaufgabe,
  zusätzlich zu Honeypot und Backend-Rate-Limit. Beide Schlüssel werden nur im
  Backend als `CLOUDFLARE_TURNSPIKE_SITEKEY` und `CLOUDFLARE_TURNSPIKE_SECRET`
  gesetzt (bestehende Schreibweise). Die Homepage lädt ausschliesslich den
  öffentlichen Site Key über `GET /public/turnstile`. Ohne Konfiguration oder bei
  fehlgeschlagener Prüfung ist kein Versand möglich.
- Beide Formulare verwenden dieselben Schlüssel und eine gemeinsame
  Turnstile-Komponente. Das Backend prüft die Aktion `kontakt` bzw. `anmeldung`,
  sodass Tokens nicht zwischen den Formularen ausgetauscht werden können.
- Backend und Homepage gemeinsam aktualisieren und die Homepage-Hostnamen im
  Cloudflare-Widget freigeben. Für lokale Tests muss auch der lokale Hostname
  erlaubt sein. Der Browser muss `https://challenges.cloudflare.com` als
  Script-/Frame-Quelle erreichen können; gegebenenfalls die CSP des
  Reverse-Proxys entsprechend anpassen.
- Beide Formulare zeigen einen Datenschutzhinweis zu Cloudflare; eine
  allenfalls separat veröffentlichte Datenschutzerklärung muss ebenfalls
  entsprechend ergänzt werden.

## Zusammenspiel

### Besucherstatistik

- Backend zuerst auf Revision `0008_besucher_statistik` migrieren
  (`alembic upgrade head`); alle drei Anwendungen gemeinsam aktualisieren.
- `ANALYTICS_SECRET` in der Homepage-Laufzeitumgebung setzen: derselbe
  zufällige Schlüssel mit mindestens 32 Zeichen wie im Backend.
  Nicht als öffentliche Build-Variable verwenden. Ohne Schlüssel wird
  die detaillierte Erfassung deaktiviert und eine Warnung protokolliert;
  der bestehende Gesamtzähler bleibt erhalten.
  Die Compose-Dateien im Verwaltungs-Frontend laden den Schlüssel über
  `amchomepage.env_file`: `.env.analytics.prod` bzw. `.env.analytics.test`
  im Ordner der Compose-Datei. Diese privaten Dateien enthalten nur
  `ANALYTICS_SECRET` und werden nicht versioniert oder ins Image kopiert.
  Auf der Synology separat bereitstellen. Die Backend-Env-Datei wird nicht
  automatisch von der Homepage übernommen und sollte wegen der weiteren
  Zugangsdaten nicht vollständig an sie weitergegeben werden.
- Für Länder im **Backend** `GEOIP_COUNTRY_DB` setzen und die lokale
  Country-MMDB-Datei einbinden. FreeDNS/DNS liefert keine Länderkennung.
- Ohne Reverse-Proxy wird die Socket-IP verwendet. Nur wenn die Homepage
  ausschließlich über einen vertrauenswürdigen Proxy erreichbar ist, der
  `X-Forwarded-For` zuverlässig bereinigt, `ANALYTICS_TRUST_PROXY=true` setzen.
  Sonst können Länderangaben gefälscht sein. Auch bei Docker/NAT muss geprüft
  werden, ob die echte Besucher-IP ankommt; interne IPs liefern „Unbekannt“.
- Bei TLS-Terminierung (z. B. Synology) `ANALYTICS_PUBLIC_ORIGIN` auf die
  tatsächliche öffentliche Origin setzen, z. B. `https://www.example.org`
  (ohne Pfad). So werden der Origin-Check für Aktivitätssignale, interne
  Referrer und Secure-Cookies unabhängig von der internen HTTP-Verbindung
  korrekt behandelt. Dies aktiviert keine Vertrauensstellung für IP-Header.
- Sitzungs-Cookie `amc_statistik`: signiert, HttpOnly, SameSite=Lax,
  30 Minuten Inaktivität; unter HTTPS zusätzlich Secure. Bots/Healthchecks,
  DNT/GPC, Fehlerseiten, Assets und Formular-POSTs werden nicht detailliert erfasst.
- Sichtbare Seiten senden alle 15 Sekunden Aktivität und beim
  Verlassen/Wechsel der Sichtbarkeit ein abschließendes Signal.
  Browser können solche Signale blockieren oder verwerfen; die Dauer bleibt
  näherungsweise und misst nicht reine Lesezeit.
- IP, URL-Parameter, Formularinhalte und vollständige Browserkennungen
  werden nicht in den Statistikdaten gespeichert. Nur der Referrer-Hostname
  wird übermittelt, nicht Suchbegriffe oder vollständige URLs.
- Auswertung in der internen Verwaltung unter **Homepage → Besucherstatistik**;
  Einzelbesuche werden im Backend nach 365 Tagen durch einen täglichen Lauf gelöscht.
- Ein Hinweis ist unter `/datenschutz` verlinkt. Er ersetzt keine vollständige
  Datenschutzerklärung. Erfassung ohne zusätzlichen Einwilligungsdialog,
  Rechtsgrundlage und Infrastruktur-Logs vor dem produktiven Einsatz prüfen.

Validierung: `pnpm test` (Hilfsfunktionen) und `pnpm test:ssr`
(Build und temporäre lokale Server mit simuliertem Backend; keine Produktivdaten).

- Backend-Image: [`janine65/amcbackend`](https://hub.docker.com/r/janine65/amcbackend)
- Interne Verwaltung: [`janine65/amcfrontend`](https://hub.docker.com/r/janine65/amcfrontend)
