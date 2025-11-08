import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    # Database
    SQLALCHEMY_DATABASE_URI = os.getenv('DATABASE_URL', 'sqlite:///tubetracker.db')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # YouTube API
    YOUTUBE_API_KEY = os.getenv('YOUTUBE_API_KEY', '')
    
    # Scheduler
    # Scheduler: either provide a cron string via SYNC_CRON (e.g. "0,15,30,45" for quarter hours)
    # or provide an integer number of hours via SYNC_INTERVAL_HOURS (default 24).
    SYNC_CRON = os.getenv('SYNC_CRON', '')
    SYNC_INTERVAL_HOURS = int(os.getenv('SYNC_INTERVAL_HOURS', 24))
    # Sentiment analysis can be toggled via env and a minimum confidence threshold can be set.
    SENTIMENT_ENABLED = os.getenv('SENTIMENT_ENABLED', 'true').lower() in ('1', 'true', 'yes', 'on')
    try:
        SENTIMENT_MIN_CONFIDENCE = float(os.getenv('SENTIMENT_MIN_CONFIDENCE', '0.6'))
    except Exception:
        SENTIMENT_MIN_CONFIDENCE = 0.6
    
    # Secret Key
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-key-change-in-production')
