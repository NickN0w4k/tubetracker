# Konzept: TubeTracker – YouTube Video Archive & Analytics (Self-Hosted)

TubeTracker ist eine Open-Source-Webanwendung, die speziell entwickelt wurde, um YouTube-Video-Metriken und Kommentare langfristig zu archivieren und detaillierte Einblicke in deren Entwicklung über die Zeit zu bieten. Das Hauptaugenmerk liegt auf Datenschutz, Datenhoheit (self-hosted) und der Erkennung von Zensur (gelöschte Kommentare).

## Kernfunktionen

### 1. Video-Tracking und Metriken

*   **Regelmäßige Erfassung:** Ein integrierter Scheduler (z. B. alle 15 Minuten, konfigurierbar) synchronisiert über die YouTube Data API die Metriken und Kommentare der hinterlegten Videos.
*   **Historische Metriken:** Tracking des Verlaufs von:
    *   Likes
    *   Anzahl der Kommentare
    *   Aufrufe
    *   (Optional) Dislikes, sofern verfügbar
*   **Interaktive Dashboards:** Visualisierung dieser Metriken in Liniendiagrammen über benutzerdefinierte Zeiträume.

### 2. Detaillierte Kommentararchivierung

*   **Vollständige Archivierung:** Alle Kommentare und deren Antworten werden beim ersten Scan vollständig in Ihrer lokalen Datenbank gespeichert.
*   **Erkennung gelöschter Kommentare:** Bei jeder neuen Synchronisierung vergleicht TubeTracker die aktuellen API-Ergebnisse mit den lokal gespeicherten Daten. Kommentare, die nicht mehr verfügbar sind, werden nicht gelöscht, sondern in der Datenbank als `status: gelöscht` markiert.
*   **Kommentargeschichte:** Anzeige aller Kommentare, einschließlich derer, die später vom Autor oder Kanalbetreiber entfernt wurden, mit einem klaren Hinweis auf den Löschzeitpunkt.
*   **Sortierung & Suche:** Flexible Sortierung nach Datum, Likes und optionaler Sentiment-Bewertung sowie Volltextsuche/Filter.

### 3. Kommentar-Sentiment-Analyse (optional, lokal)

*   **Stimmungstrends:** Eine lokale Sentiment-Analyse (z. B. via Hugging Face Transformers) bewertet die Kommentare, um Stimmungstrends im Zeitverlauf zu visualisieren.
*   **Datenschutzfreundlich:** Die Analyse läuft lokal; es werden keine Inhalte an externe Dienste gesendet.

### 4. Automatische Keyword-Extraktion pro Video

*   **Top-Begriffe pro Video:** On-Demand-Extraktion der wichtigsten Begriffe aus den Kommentaren eines Videos (standardmäßig Top-5).
*   **N‑Gramme:** Unterstützung für Unigramme und Bigramme; Bigrams werden nur gebildet, wenn beide Wörter keine Stoppwörter sind.
*   **Qualitätsfilter:** Konfigurierbare Mindesthäufigkeit (min_occ) zur Unterdrückung von Rauschen.
*   **Stoppwort-Verwaltung:** Integrierte Stoppwort-Liste (DE/EN + anpassbar) mit Admin-UI zur Laufzeitpflege; Erweiterung per Umgebungsvariable und `instance/stopwords.json`.
*   **API-Endpunkte:**
    *   `GET /api/videos/<id>/top-keywords?limit=5&bigrams=true&min_occ=2`
    *   `GET /api/keywords/suggest?limit=20&bigrams=false&min_occ=3`
    *   `GET/PUT /api/admin/stopwords` (Lesen/Aktualisieren der benutzerdefinierten Stoppwörter)

## Technischer Aufbau (Für Self-Hosting)

*   **Frontend:** React-App mit moderner Dark-UI, Komponenten für Video-Kacheln, Kommentarlisten, Statistiken und einer Admin-Panel-Komponente zur Stoppwort-Verwaltung.
*   **Backend:** Python/Flask-API mit SQLAlchemy (ORM) und APScheduler für periodische Synchronisierungen mit der YouTube Data API.
*   **Datenbank:** Relationale Datenbank (z. B. PostgreSQL, MySQL oder SQLite) zur Speicherung von Videos, Metriken und Kommentaren.
*   **Automatisierung:** Interner Scheduler (APScheduler) mit konfigurierbarem Intervall.
*   **ML/NLP:** Lokale Sentiment-Pipeline (Transformers) und reguläre Tokenisierung mit konfigurierbarer Stoppwort-Liste für Keyword-Extraktion.

### Administration & Konfiguration

*   **Stoppwörter:**
    *   Basis-Set (DE/EN) + eigene Ergänzungen über `KEYWORD_STOPWORDS` (Umgebungsvariable, kommagetrennt) und `instance/stopwords.json`.
    *   Live-Aktualisierung via `PUT /api/admin/stopwords` ohne Neustart.
*   **Parameter:**
    *   Keyword-API: `limit`, `bigrams` (true/false), `min_occ`.
    *   Scheduler-Intervall (z. B. 15 Minuten) konfigurierbar.

## Innovative Verbesserungen (Weiterentwicklung)

*   **Keyword-Trends & Historisierung:** Periodische Snapshots der Top-Begriffe pro Video zur Darstellung von Trends über die Zeit.
*   **Relevanz-Scoring:** Erweiterung der Ranking-Metrik (z. B. TF‑IDF, PMI, Hybrid aus Häufigkeit, Kommentarabdeckung und Wortlänge).
*   **Leistung & Caching:** Caching/Memoization der Keyword-Berechnungen; optionale Materialisierung.
*   **Sicherheit:** Authentifizierung/Autorisierung für Admin-Endpunkte, Rate-Limiting.
*   **Multi-Plattform-Unterstützung:** Erweiterung über YouTube hinaus (z. B. Vimeo, Twitch).
