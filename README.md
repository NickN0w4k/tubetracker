# TubeTracker 🎥

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](/LICENSE)

[English version](README_EN.md)

Self‑Hosted YouTube Video Archive & Analytics

TubeTracker archiviert dauerhaft Video‑Metriken und Kommentare, erkennt gelöschte sowie wieder aufgetauchte (reinstated) Kommentare, bietet interaktive Vergleichs‑Charts und lässt sich flexibel per Cron oder Intervall konfigurieren – volle Datenhoheit ohne fremde Cloud.

## ✨ Kernfunktionen

- 📊 Zeitreihen‑Tracking für Views, Likes, Comments
- 🔄 Server‑seitiges Sampling & Vergleich: Normalisierung (Index 100), Wachstum %, Smoothing, letzter‑Punkt‑Labels, Zoom/Pan, getrennte/ gemeinsame Y‑Achsen
- 💬 Kommentar‑Archiv inkl. Erkennung gelöschter & reinstateter Kommentare (Statuswechsel + History‑Events)
- 🧠 (Optional) Sentiment‑Analyse (abschaltbar; Confidence‑Schwelle konfigurierbar)
- 🏷 Keyword‑Extraktion (unigram/bigram) inkl. konfigurierbarer Stopwords
- 📤 Per‑Chart PNG‑Export mit Kopfzeile (Video‑/Channel‑Titel, Metrik)
- ⏱ Automatische Synchronisierung: Cron via `SYNC_CRON` oder Intervall via `SYNC_INTERVAL_HOURS`
- 🌓 Einheitliches dunkles „glassy“ UI
- 🔒 Komplett self‑hosted (SQLite/Postgres)

## 🚀 Schnellstart

### Voraussetzungen

- YouTube Data API Key ([hier erstellen](https://console.developers.google.com/))
- Docker & Docker Compose (für Docker-Setup)
- oder Python 3.9+ und Node.js 18+ (für manuelle Installation)

### Setup mit Docker (empfohlen)

1. **Repository klonen:**
   ```bash
   git clone https://github.com/NickN0w4k/tubetracker.git
   cd tubetracker
   ```

2. **Backend‑Env erstellen und anpassen:**
   Windows (PowerShell / CMD):
   ```powershell
   copy backend/.env.sample backend/.env
   notepad backend/.env
   ```

   Linux / macOS:
   ```bash
   cp backend/.env.sample backend/.env
   # Edit with your preferred editor, e.g.:
   nano backend/.env
   # or
   ${EDITOR:-nano} backend/.env
   ```
   Wichtig: `YOUTUBE_API_KEY` setzen. Optional: `SYNC_CRON`/`SYNC_INTERVAL_HOURS`, `SENTIMENT_ENABLED`, `SENTIMENT_MIN_CONFIDENCE`, `PORT` (Standard 5055).

3. **Anwendung starten:**
   ```bash
   docker-compose up -d
   ```

4. **Öffnen:**
   - Frontend: http://localhost:3000
   - Backend:  http://localhost:5055 (API unter /api)

### Manuelle Installation (Alternativ)

#### Backend

1. **Ins Backend-Verzeichnis wechseln:**
   ```bash
   cd backend
   ```

2. **Virtual Environment erstellen:**
   ```bash
   python -m venv venv
   venv\Scripts\activate  # Windows
   source venv/bin/activate  # Linux/Mac
   ```

3. **Abhängigkeiten installieren:**
   ```bash
   pip install -r requirements.txt
   # (Optional für neues Sentiment-Modell: sentencepiece ist bereits enthalten)
   ```

4. **Umgebungsvariablen konfigurieren:**
   - Kopiere `.env.sample` zu `.env`
   - Füge deinen YouTube API Key & Optionen ein

5. **Backend starten:**
   ```bash
   python app.py
   ```

#### Frontend

1. **Ins Frontend-Verzeichnis wechseln:**
   ```bash
   cd frontend
   ```

2. **Abhängigkeiten installieren:**
   ```bash
   npm install
   ```

3. **Frontend starten:**
   ```bash
   npm start
   ```

## 📖 Nutzung

### Video hinzufügen

1. Öffne die Weboberfläche
2. Gib die YouTube-URL in das Eingabefeld ein (z.B. `https://www.youtube.com/watch?v=xvFZjo5PgG0`)
3. Klicke auf "Hinzufügen"

Die Anwendung wird automatisch:
- Video-Informationen abrufen
- Erste Metriken speichern
- Alle Kommentare archivieren

### Metriken anzeigen

- Klicke auf eine Video-Card, um Details anzuzeigen
- Wechsle zum Tab "📊 Metriken"
- Sieh dir die Entwicklung von Aufrufen, Likes und Kommentaren im Zeitverlauf an

### Kommentare durchsuchen

 - Öffne den Tab "💬 Kommentare"
 - Filtere gelöschte Kommentare mit der Checkbox
 - Gelöschte Kommentare werden orange markiert mit Löschdatum

### Manuelle Synchronisierung

Klicke auf "🔄 Sync" bei einem Video, um sofort die neuesten Daten abzurufen.

## 🔧 Konfiguration & Env Variablen

Beispiel `backend/.env`:
```env
YOUTUBE_API_KEY=your_api_key_here
DATABASE_URL=sqlite:///tubetracker.db

# Synchronisierung: Cron (Vorrang) oder Intervall
SYNC_CRON=0,15,30,45
SYNC_INTERVAL_HOURS=24

# Sentiment
SENTIMENT_ENABLED=true
SENTIMENT_MIN_CONFIDENCE=0.6

# Server
PORT=5055
SECRET_KEY=change-me
```

### Datenbanken

Standardmäßig verwendet TubeTracker SQLite. Für Produktionsumgebungen wird PostgreSQL empfohlen:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/tubetracker
```

## 📊 API‑Endpunkte (Auszug)

### Videos

- `GET /api/videos` - Alle Videos abrufen
- `POST /api/videos` - Neues Video hinzufügen
- `DELETE /api/videos/{id}` - Video deaktivieren
- `POST /api/videos/{id}/sync` - Video synchronisieren

### Metriken & Kommentare

- `GET /api/videos/{id}/metrics` - Metriken-Historie
- `GET /api/videos/{id}/comments` - Kommentare (Filter: deleted_only/include_deleted/sentiment, Sortierung, Pagination)
- `GET /api/videos/compare?video1=..&video2=..&max_points=..&strategy=even|cover_both` - Gesampelte, ausgerichtete Reihen (Server‑seitig)
- `GET /api/videos/{id}/top-keywords?limit=5&bigrams=true&min_occ=2` - Top‑Begriffe
- `GET /api/admin/stopwords` (GET/PUT) – Custom Stopwords verwalten

### Statistiken

- `GET /api/stats` - Globale Statistiken
- `GET /api/health` - Health Check

## 🛠️ Technologie‑Stack

### Backend
- **Flask** - Web-Framework
- **SQLAlchemy** - ORM
- **YouTube Data API v3** - Daten-Quelle
- **APScheduler** - Automatische Synchronisierung (CronTrigger oder IntervalTrigger)
- **PostgreSQL/SQLite** - Datenbank

### Frontend
- **React** - UI-Framework
- **Chart.js** - Visualisierung
- **Axios** - HTTP-Client
- **date-fns** - Datums-Formatierung

## 🎯 Testvideo

Zum Testen kannst du dieses Video verwenden:
```
https://www.youtube.com/watch?v=xvFZjo5PgG0
```

## 📝 Erweiterte Features / Roadmap

- [x] **Reinstatement-Erkennung** von erneut auftauchenden Kommentaren
- [x] **Keyword-Extraktion** (Top Begriffe)
- [x] **PNG-Chart-Exports** mit Titel/Channel-Header
- [ ] Weitere Metrik-Analysen (Sentiment-Verlauf, Wachstumsraten UI)
- [ ] **Multi-Plattform**: Unterstützung für Vimeo, Twitch, etc.
- [ ] **Export-Funktion**: CSV/JSON Export von Daten
- [ ] **Benachrichtigungen**: Alerts bei gelöschten Kommentaren
- [ ] **Playlist-Tracking**: Mehrere Videos auf einmal hinzufügen
- [ ] **Formale DB-Migrationen** (Alembic statt runtime ALTER)
- [ ] **E2E Tests (Playwright)**

## 🐛 Troubleshooting

### "Could not fetch video details"
- Überprüfe deinen YouTube API Key
- Stelle sicher, dass die YouTube Data API v3 aktiviert ist
- Prüfe dein API-Quota

### "Comments are disabled"
- Das Video hat Kommentare deaktiviert
- Das System speichert trotzdem die Metriken

### Modell-Download langsam / Sentiment
- Bei Docker wird das Modell beim Build vorgeladen (falls Dockerfile aktiv). Ohne Docker kann der Erstlauf länger dauern.
- Sentiment deaktivierbar: `SENTIMENT_ENABLED=false`.

### Ports / Zugriff
- Backend Standard-Port: 5055 (per `PORT` änderbar). Docker Compose mappt 5055:5055.

## 📄 Lizenz

MIT License – siehe `LICENSE`

## 🤝 Beitragen

Pull Requests sind willkommen! Für größere Änderungen öffne bitte zuerst ein Issue.

## 🔐 Datenschutz

Alle Daten werden lokal auf deinem Server gespeichert. Es werden keine Daten an Dritte weitergegeben (außer den API-Aufrufen an YouTube zum Abrufen der Daten).

## 📧 Support

Wenn du Fragen oder Probleme hast, öffne bitte ein Issue im GitHub-Repository.

---

Made with ❤️ for transparency and data ownership
