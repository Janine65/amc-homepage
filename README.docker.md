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
- Anmeldungen werden mit Honeypot und Backend-Rate-Limit gegen Spam geschützt.

## Zusammenspiel

- Backend-Image: [`janine65/amcbackend`](https://hub.docker.com/r/janine65/amcbackend)
- Interne Verwaltung: [`janine65/amcfrontend`](https://hub.docker.com/r/janine65/amcfrontend)
