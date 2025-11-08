from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

class Video(db.Model):
    __tablename__ = 'videos'
    
    id = db.Column(db.Integer, primary_key=True)
    video_id = db.Column(db.String(20), unique=True, nullable=False, index=True)
    title = db.Column(db.String(500))
    channel_title = db.Column(db.String(200))
    description = db.Column(db.Text)
    published_at = db.Column(db.DateTime)
    thumbnail_url = db.Column(db.String(500))
    added_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_synced = db.Column(db.DateTime)
    is_active = db.Column(db.Boolean, default=True)
    
    metrics = db.relationship('VideoMetric', backref='video', lazy='dynamic', cascade='all, delete-orphan')
    comments = db.relationship('Comment', backref='video', lazy='dynamic', cascade='all, delete-orphan')
    
    def to_dict(self):
        return {
            'id': self.id,
            'video_id': self.video_id,
            'title': self.title,
            'channel_title': self.channel_title,
            'description': self.description,
            'published_at': self.published_at.isoformat() if self.published_at else None,
            'thumbnail_url': self.thumbnail_url,
            'added_at': self.added_at.isoformat() if self.added_at else None,
            'last_synced': self.last_synced.isoformat() if self.last_synced else None,
            'is_active': self.is_active
        }


class VideoMetric(db.Model):
    __tablename__ = 'video_metrics'
    
    id = db.Column(db.Integer, primary_key=True)
    video_id = db.Column(db.Integer, db.ForeignKey('videos.id'), nullable=False, index=True)
    recorded_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    view_count = db.Column(db.BigInteger, default=0)
    like_count = db.Column(db.Integer, default=0)
    comment_count = db.Column(db.Integer, default=0)
    
    def to_dict(self):
        return {
            'id': self.id,
            'video_id': self.video_id,
            'recorded_at': self.recorded_at.isoformat(),
            'view_count': self.view_count,
            'like_count': self.like_count,
            'comment_count': self.comment_count
        }


class Comment(db.Model):
    __tablename__ = 'comments'
    
    id = db.Column(db.Integer, primary_key=True)
    video_id = db.Column(db.Integer, db.ForeignKey('videos.id'), nullable=False, index=True)
    comment_id = db.Column(db.String(100), unique=True, nullable=False, index=True)
    parent_id = db.Column(db.String(100), index=True)  # For replies
    author = db.Column(db.String(200))
    author_channel_id = db.Column(db.String(100))
    text = db.Column(db.Text)
    like_count = db.Column(db.Integer, default=0)
    published_at = db.Column(db.DateTime)
    updated_at = db.Column(db.DateTime)
    status = db.Column(db.String(20), default='active')  # active, deleted
    deleted_at = db.Column(db.DateTime)
    last_seen = db.Column(db.DateTime)
    reinstated_at = db.Column(db.DateTime)
    first_seen = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Sentiment analysis fields
    sentiment = db.Column(db.String(20))  # positive, neutral, negative
    sentiment_score = db.Column(db.Float)  # confidence score (0-1)
    sentiment_label = db.Column(db.String(50))  # raw model label (e.g., "5 stars")

    def to_dict(self):
        return {
            'id': self.id,
            'video_id': self.video_id,
            'comment_id': self.comment_id,
            'parent_id': self.parent_id,
            'author': self.author,
            'author_channel_id': self.author_channel_id,
            'text': self.text,
            'like_count': self.like_count,
            'published_at': self.published_at.isoformat() if self.published_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'status': self.status,
            'deleted_at': self.deleted_at.isoformat() if self.deleted_at else None,
            'first_seen': self.first_seen.isoformat() if self.first_seen else None,
            'last_seen': self.last_seen.isoformat() if self.last_seen else None,
            'reinstated_at': self.reinstated_at.isoformat() if self.reinstated_at else None,
            'sentiment': self.sentiment,
            'sentiment_score': self.sentiment_score,
            'sentiment_label': self.sentiment_label
        }


class CommentHistory(db.Model):
    __tablename__ = 'comment_history'
    id = db.Column(db.Integer, primary_key=True)
    comment_id = db.Column(db.Integer, db.ForeignKey('comments.id'), nullable=False, index=True)
    action = db.Column(db.String(32))  # e.g., 'deleted','reinstated','edited','created'
    meta = db.Column(db.Text)  # optional JSON blob with details
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    comment = db.relationship('Comment', backref='history')
    
    def to_dict(self):
        # Return history event info
        return {
            'id': self.id,
            'comment_id': self.comment_id,
            'action': self.action,
            'meta': self.meta,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
