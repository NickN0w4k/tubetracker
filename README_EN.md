# TubeTracker 🎥

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](/LICENSE)

Self‑Hosted YouTube Video Archive & Analytics

TubeTracker archives video metrics and comments over time, detects deleted and reinstated comments, provides interactive comparison charts, and can be configured to sync via cron or interval — full data ownership, no third‑party cloud required.

## ✨ Key Features

- 📊 Time series tracking for views, likes and comments
- 🔄 Server‑side sampling & comparison: normalization (index 100), growth %, smoothing, last‑point labels, zoom/pan, separate/shared Y‑axes
- 💬 Comment archive with deleted & reinstated detection (status transitions + history events)
- 🧠 Optional sentiment analysis (toggleable; configurable confidence threshold)
- 🏷 Keyword extraction (unigrams/bigrams) with configurable stopwords
- 📤 Per‑chart PNG export with header (video/channel/title/metric)
- ⏱ Automatic synchronization: Cron via `SYNC_CRON` or interval via `SYNC_INTERVAL_HOURS`
- 🌓 Unified dark "glassy" UI
- 🔒 Fully self‑hosted (SQLite/Postgres)

## 🚀 Quickstart

### Requirements

- YouTube Data API key
- Docker & Docker Compose (recommended)
- Or Python 3.9+ and Node.js 18+ for manual install

### Docker (recommended)

1. Clone the repo:
```bash
git clone https://github.com/NickN0w4k/tubetracker.git
cd tubetracker
```

2. Create backend env and edit it:

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
Set `YOUTUBE_API_KEY` and optionally `SYNC_CRON` / `SYNC_INTERVAL_HOURS`, `SENTIMENT_ENABLED`, `SENTIMENT_MIN_CONFIDENCE`, `PORT` (default 5055).

3. Start the app:
```bash
docker-compose up -d
```

4. Open:
- Frontend: http://localhost:3000
- Backend:  http://localhost:5055 (API under /api)

### Manual install (alternative)

#### Backend

1. Change to backend folder:
```bash
cd backend
```

2. Create virtualenv and activate:
```bash
python -m venv venv
venv\Scripts\activate  # Windows
source venv/bin/activate  # Linux/Mac
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Copy `.env.sample` to `.env` and set your API key & options.

5. Start backend:
```bash
python app.py
```

#### Frontend

1. Change to frontend folder:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start frontend:
```bash
npm start
```

## 📖 Usage

### Add a video

- Open the web UI
- Enter the YouTube URL in the input (e.g. `https://www.youtube.com/watch?v=xvFZjo5PgG0`)
- Click `Add`

The app will fetch video info, store initial metrics, and archive comments.

### View metrics

- Click a video card to open details
- Switch to the "📊 Metrics" tab to see views/likes/comments over time

### Browse comments

- Open the "💬 Comments" tab
- Use filters for deleted comments, sentiment, or sort order
- Deleted comments are highlighted and carry a deletion timestamp

### Manual sync

Click the "🔄 Sync" button on a video to fetch the latest data immediately.

## 🔧 Configuration & Env vars

Sample `backend/.env`:
```env
YOUTUBE_API_KEY=your_api_key_here
DATABASE_URL=sqlite:///tubetracker.db

# Sync: cron (preferred) or interval
SYNC_CRON=0,15,30,45
SYNC_INTERVAL_HOURS=24

# Sentiment
SENTIMENT_ENABLED=true
SENTIMENT_MIN_CONFIDENCE=0.6

# Server
PORT=5055
SECRET_KEY=change-me
```

For production, consider PostgreSQL:
```env
DATABASE_URL=postgresql://user:password@localhost:5432/tubetracker
```

## 📊 API endpoints (excerpt)

- `GET /api/videos` - list tracked videos
- `POST /api/videos` - add a video
- `DELETE /api/videos/{id}` - deactivate a video
- `POST /api/videos/{id}/sync` - trigger sync for a video
- `GET /api/videos/{id}/metrics` - metrics history
- `GET /api/videos/{id}/comments` - comments (filters: deleted_only/include_deleted/sentiment, sorting, pagination)
- `GET /api/videos/compare?video1=..&video2=..&max_points=..&strategy=even|cover_both` - aligned, sampled series
- `GET /api/videos/{id}/top-keywords?limit=5&bigrams=true&min_occ=2` - top keywords
- `GET /api/admin/stopwords` (GET/PUT) - manage custom stopwords

## 🛠 Tech stack

### Backend
- Flask, SQLAlchemy, APScheduler, YouTube Data API v3
### Frontend
- React, Chart.js, Axios

## 🎯 Roadmap

- [x] Reinstated comment detection
- [x] Keyword extraction
- [x] PNG chart export with header
- [ ] Sentiment timeline visualization
- [ ] Formal DB migrations (Alembic)
- [ ] E2E tests (Playwright)

## 🐛 Troubleshooting

- "Could not fetch video details": verify API key and quota, ensure YouTube Data API is enabled.
- "Comments are disabled": the video has comments disabled; metrics will still be stored.
- Slow sentiment model download: Docker build pre-caches the model. Without Docker, first run may be slower.

## 📄 License

MIT License — see `LICENSE`

## 🤝 Contributing

Pull requests are welcome. For larger changes, open an issue first.

## 🔐 Privacy

All data is stored locally. No third parties receive content (except the YouTube API calls needed to fetch data).

---

Made with ❤️ for transparency and data ownership
