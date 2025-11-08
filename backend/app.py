from flask import Flask, request, jsonify, make_response
from flask_cors import CORS
from datetime import datetime, timezone
from models import db, Video, VideoMetric, Comment
from youtube_service import YouTubeService
from sentiment_service import get_analyzer
from config import Config
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
import logging
import os
from sqlalchemy import text, case
from collections import Counter
import re
import json

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config.from_object(Config)

# Explicit CORS setup for frontend at localhost:3000 and 127.0.0.1:3000
# and to ensure preflight (OPTIONS) requests are handled for /api/* routes.
cors = CORS(
    app,
    resources={r"/api/*": {"origins": ["http://localhost:3000", "http://127.0.0.1:3000"]}},
    supports_credentials=True,
)
db.init_app(app)

# Initialize YouTube service
youtube_service = YouTubeService(app.config['YOUTUBE_API_KEY'])

# Scheduler for automatic syncing
scheduler = BackgroundScheduler()


@app.before_request
def handle_preflight():
    if request.method == 'OPTIONS' and request.path.startswith('/api/'):
        resp = make_response()
        origin = request.headers.get('Origin')
        if origin in ['http://localhost:3000', 'http://127.0.0.1:3000']:
            resp.headers['Access-Control-Allow-Origin'] = origin
        else:
            resp.headers['Access-Control-Allow-Origin'] = 'null'
        resp.headers['Access-Control-Allow-Credentials'] = 'true'
        resp.headers['Access-Control-Allow-Headers'] = request.headers.get(
            'Access-Control-Request-Headers', 'Authorization, Content-Type')
        resp.headers['Access-Control-Allow-Methods'] = 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
        resp.status_code = 204
        return resp

@app.after_request
def enforce_cors(response):
    if request.path.startswith('/api/'):
        origin = request.headers.get('Origin')
        if origin in ['http://localhost:3000', 'http://127.0.0.1:3000']:
            response.headers['Access-Control-Allow-Origin'] = origin
            response.headers['Access-Control-Allow-Credentials'] = 'true'
            response.headers['Vary'] = 'Origin'
    return response


def sync_video(video_id):
    """Sync a single video's data from YouTube."""
    with app.app_context():
        video = Video.query.filter_by(video_id=video_id).first()
        if not video or not video.is_active:
            return
        
        logger.info(f"Syncing video: {video_id}")
        
        # Get current video details and metrics
        video_data = youtube_service.get_video_details(video_id)
        if not video_data:
            logger.error(f"Could not fetch video details for {video_id}")
            return
        
        # Update video info
        video.title = video_data['title']
        video.channel_title = video_data['channel_title']
        video.description = video_data['description']
        video.last_synced = datetime.now(timezone.utc)
        
        # Save metrics
        metric = VideoMetric(
            video_id=video.id,
            view_count=video_data['view_count'],
            like_count=video_data['like_count'],
            comment_count=video_data['comment_count']
        )
        db.session.add(metric)
        
        # Get current comments
        current_comments = youtube_service.get_video_comments(video_id, max_results=1000)
        current_comment_ids = {c['comment_id'] for c in current_comments}
        
        # Check for deleted comments
        stored_comments = Comment.query.filter_by(video_id=video.id, status='active').all()
        for stored_comment in stored_comments:
            if stored_comment.comment_id not in current_comment_ids:
                stored_comment.status = 'deleted'
                stored_comment.deleted_at = datetime.now(timezone.utc)
                # record history
                try:
                    from models import CommentHistory
                    hist = CommentHistory(comment_id=stored_comment.id, action='deleted', meta=None)
                    db.session.add(hist)
                except Exception:
                    pass
                logger.info(f"Marked comment as deleted: {stored_comment.comment_id}")
        
        # Add or update comments
        comments_to_analyze = []
        for comment_data in current_comments:
            existing_comment = Comment.query.filter_by(comment_id=comment_data['comment_id']).first()
            if existing_comment:
                # Update existing comment
                existing_comment.text = comment_data['text']
                existing_comment.like_count = comment_data['like_count']
                existing_comment.updated_at = comment_data['updated_at']
                # update last seen/timestamps
                existing_comment.last_seen = datetime.now(timezone.utc)
                if existing_comment.status == 'deleted':
                    existing_comment.status = 'active'
                    existing_comment.deleted_at = None
                    existing_comment.reinstated_at = datetime.now(timezone.utc)
                    # add history entry
                    try:
                        from models import CommentHistory
                        hist = CommentHistory(comment_id=existing_comment.id, action='reinstated', meta=None)
                        db.session.add(hist)
                    except Exception:
                        pass
                # Re-analyze sentiment if text changed and sentiment not yet set
                if not existing_comment.sentiment:
                    comments_to_analyze.append(existing_comment)
            else:
                # Add new comment
                new_comment = Comment(
                    video_id=video.id,
                    comment_id=comment_data['comment_id'],
                    parent_id=comment_data['parent_id'],
                    author=comment_data['author'],
                    author_channel_id=comment_data['author_channel_id'],
                    text=comment_data['text'],
                    like_count=comment_data['like_count'],
                    published_at=comment_data['published_at'],
                    updated_at=comment_data['updated_at'],
                    last_seen=datetime.now(timezone.utc)
                )
                db.session.add(new_comment)
                db.session.flush()  # Ensure ID is available
                comments_to_analyze.append(new_comment)
        
        # Batch sentiment analysis for new/updated comments (guarded by config)
        if comments_to_analyze:
            if not app.config.get('SENTIMENT_ENABLED', True):
                logger.info("Sentiment analysis is disabled via config; skipping analysis for comments")
            else:
                try:
                    analyzer = get_analyzer()
                    texts = [c.text for c in comments_to_analyze]
                    sentiments = analyzer.analyze_batch(texts)
                    min_conf = app.config.get('SENTIMENT_MIN_CONFIDENCE', 0.6)
                    for comment, sentiment_result in zip(comments_to_analyze, sentiments):
                        # sentiment_result may be None or dict {'sentiment','score','label'} depending on analyzer
                        if not sentiment_result:
                            comment.sentiment = None
                            comment.sentiment_score = None
                            comment.sentiment_label = None
                            continue
                        score = sentiment_result.get('score') or sentiment_result.get('confidence') or 0.0
                        # Accept label only if confidence above threshold
                        if score and float(score) >= float(min_conf):
                            comment.sentiment = sentiment_result.get('sentiment')
                            comment.sentiment_score = float(score)
                            comment.sentiment_label = sentiment_result.get('label')
                        else:
                            # store score but do not commit a label
                            comment.sentiment = None
                            comment.sentiment_score = float(score) if score is not None else None
                            comment.sentiment_label = sentiment_result.get('label') if 'label' in sentiment_result else None
                    logger.info(f"Analyzed sentiment for {len(comments_to_analyze)} comments")
                except Exception as e:
                    logger.warning(f"Sentiment analysis failed: {e}")
        
        db.session.commit()
        logger.info(f"Successfully synced video: {video_id}")


def sync_all_videos():
    """Sync all active videos."""
    with app.app_context():
        videos = Video.query.filter_by(is_active=True).all()
        for video in videos:
            try:
                sync_video(video.video_id)
            except Exception as e:
                logger.error(f"Error syncing video {video.video_id}: {e}")


@app.route('/api/videos', methods=['GET'])
def get_videos():
    """Get all tracked videos with latest metrics."""
    videos = Video.query.filter_by(is_active=True).all()
    result = []
    for v in videos:
        v_dict = v.to_dict()
        # Attach latest metric snapshot
        latest_metric = VideoMetric.query.filter_by(video_id=v.id).order_by(VideoMetric.recorded_at.desc()).first()
        if latest_metric:
            v_dict['latest_views'] = latest_metric.view_count
            v_dict['latest_likes'] = latest_metric.like_count
            v_dict['latest_comments'] = latest_metric.comment_count
        else:
            v_dict['latest_views'] = 0
            v_dict['latest_likes'] = 0
            v_dict['latest_comments'] = 0
        result.append(v_dict)
    return jsonify(result)


@app.route('/api/videos', methods=['POST'])
def add_video():
    """Add a new video to track."""
    data = request.json
    url_or_id = data.get('url') or data.get('video_id')
    
    if not url_or_id:
        return jsonify({'error': 'URL or video_id required'}), 400
    
    video_id = youtube_service.extract_video_id(url_or_id)
    
    # Check if already exists
    existing = Video.query.filter_by(video_id=video_id).first()
    if existing:
        if not existing.is_active:
            existing.is_active = True
            db.session.commit()
            return jsonify({'message': 'Video reactivated', 'video': existing.to_dict()})
        return jsonify({'error': 'Video already tracked'}), 400
    
    # Get video details
    video_data = youtube_service.get_video_details(video_id)
    if not video_data:
        return jsonify({'error': 'Could not fetch video details'}), 400
    
    # Create video record
    video = Video(
        video_id=video_data['video_id'],
        title=video_data['title'],
        channel_title=video_data['channel_title'],
        description=video_data['description'],
        published_at=video_data['published_at'],
        thumbnail_url=video_data['thumbnail_url'],
            last_synced=datetime.now(timezone.utc)
    )
    db.session.add(video)
    db.session.flush()
    
    # Save initial metrics
    metric = VideoMetric(
        video_id=video.id,
        view_count=video_data['view_count'],
        like_count=video_data['like_count'],
        comment_count=video_data['comment_count']
    )
    db.session.add(metric)
    
    # Get and save comments
    comments_data = youtube_service.get_video_comments(video_id, max_results=1000)
    new_comments = []
    for comment_data in comments_data:
        comment = Comment(
            video_id=video.id,
            comment_id=comment_data['comment_id'],
            parent_id=comment_data['parent_id'],
            author=comment_data['author'],
            author_channel_id=comment_data['author_channel_id'],
            text=comment_data['text'],
            like_count=comment_data['like_count'],
            published_at=comment_data['published_at'],
            updated_at=comment_data['updated_at']
        )
        db.session.add(comment)
        new_comments.append(comment)
    
    db.session.flush()  # Get IDs for comments
    
    # Batch sentiment analysis for initial comments
    if new_comments:
        try:
            analyzer = get_analyzer()
            texts = [c.text for c in new_comments]
            sentiments = analyzer.analyze_batch(texts)
            for comment, sentiment_result in zip(new_comments, sentiments):
                if sentiment_result:
                    comment.sentiment = sentiment_result['sentiment']
                    comment.sentiment_score = sentiment_result['score']
                    comment.sentiment_label = sentiment_result['label']
            logger.info(f"Analyzed sentiment for {len(new_comments)} initial comments")
        except Exception as e:
            logger.warning(f"Sentiment analysis failed during video add: {e}")
    
    db.session.commit()
    
    return jsonify({'message': 'Video added successfully', 'video': video.to_dict()}), 201


@app.route('/api/videos/<int:video_id>', methods=['DELETE'])
def delete_video(video_id):
    """Deactivate a video (soft delete)."""
    video = Video.query.get_or_404(video_id)
    video.is_active = False
    db.session.commit()
    return jsonify({'message': 'Video deactivated'})


@app.route('/api/videos/<int:video_id>/metrics', methods=['GET'])
def get_video_metrics(video_id):
    """Get metrics history for a video."""
    video = Video.query.get_or_404(video_id)
    metrics = VideoMetric.query.filter_by(video_id=video_id).order_by(VideoMetric.recorded_at).all()
    return jsonify([m.to_dict() for m in metrics])


@app.route('/api/videos/compare', methods=['GET'])
def compare_videos():
    """Compare metrics for two videos.

    Query params:
      video1 (required): first video internal id
      video2 (required): second video internal id
      limit (optional): max number of metric points per video (most recent N)

    Returns JSON with structure:
    {
      "video1": { "id": ..., "title": ..., "metrics": [ ... ] },
      "video2": { ... },
      "aligned": {
         "timestamps": [iso...],
         "video1": { "view_count": [...], "like_count": [...], "comment_count": [...] },
         "video2": { ... }
      },
      "latest": {
         "video1": {view_count, like_count, comment_count, recorded_at},
         "video2": {...},
         "delta": { "views": v2-v1, "likes": ..., "comments": ... }
      }
    }
    """
    v1_id = request.args.get('video1', type=int)
    v2_id = request.args.get('video2', type=int)
    max_points = request.args.get('max_points', default=250, type=int)
    strategy = (request.args.get('strategy', default='cover_both') or 'cover_both').lower()
    if strategy not in ('even', 'cover_both'):
        strategy = 'cover_both'
    if not v1_id or not v2_id:
        return jsonify({'error': 'video1 and video2 query parameters required'}), 400

    v1 = Video.query.get(v1_id)
    v2 = Video.query.get(v2_id)
    if not v1 or not v2:
        return jsonify({'error': 'One or both videos not found'}), 404

    # Fetch ALL metrics (ordered ascending for chart labels)
    full_m1 = VideoMetric.query.filter_by(video_id=v1_id).order_by(VideoMetric.recorded_at.asc()).all()
    full_m2 = VideoMetric.query.filter_by(video_id=v2_id).order_by(VideoMetric.recorded_at.asc()).all()

    # Build aligned timestamp union from full metrics; strings for JSON stability
    ts_set = set()
    for m in full_m1:
        ts_set.add(m.recorded_at.isoformat())
    for m in full_m2:
        ts_set.add(m.recorded_at.isoformat())
    union_timestamps = sorted(ts_set)

    def series_map(metrics_list):
        return {m.recorded_at.isoformat(): m for m in metrics_list}

    map1_full = series_map(full_m1)
    map2_full = series_map(full_m2)

    n = len(union_timestamps)

    def even_sample_from_list(idx_list, k):
        if k <= 0:
            return []
        if k >= len(idx_list):
            return list(idx_list)
        if k == 1:
            return [idx_list[0]]
        # positions across 0..len(idx_list)-1
        res = []
        last_pos = len(idx_list) - 1
        for i in range(k):
            pos = int((i * last_pos) / (k - 1))
            res.append(idx_list[pos])
        # ensure uniqueness and sorted
        res = sorted(set(res))
        # If dedup shrank list, top up by scanning idx_list
        while len(res) < k:
            for candidate in idx_list:
                if candidate not in res:
                    res.append(candidate)
                    if len(res) == k:
                        break
        return sorted(res)

    def even_sample_range(n_total, k, existing=None):
        existing = set(existing or [])
        if k <= 0:
            return []
        if k >= n_total:
            return list(range(n_total))
        selected = []
        last = n_total - 1
        i = 0
        while len(selected) < k and i < k:
            candidate = int((i * last) / (k - 1)) if k > 1 else 0
            if candidate not in existing and candidate not in selected:
                selected.append(candidate)
            i += 1
        # top up if collisions with existing reduced count
        j = 0
        while len(selected) < k and j < n_total:
            if j not in existing and j not in selected:
                selected.append(j)
            j += 1
        return sorted(selected)

    # Determine selected indices according to strategy
    if max_points and max_points > 0 and n > max_points:
        # Presence arrays per union timestamp
        idx_v1 = [i for i, ts in enumerate(union_timestamps) if ts in map1_full]
        idx_v2 = [i for i, ts in enumerate(union_timestamps) if ts in map2_full]
        if strategy == 'even':
            selected_indices = even_sample_range(n, max_points)
        else:  # cover_both
            # Take half from each series presence, then merge
            half = max_points // 2
            part1 = even_sample_from_list(idx_v1, min(half, len(idx_v1))) if idx_v1 else []
            part2 = even_sample_from_list(idx_v2, min(max_points - len(part1), len(idx_v2))) if idx_v2 else []
            merged = sorted(set([0, n - 1] + part1 + part2))
            if len(merged) > max_points:
                # even sample from merged to cap to max_points
                # Map merged into 0..len(merged)-1, sample, then map back
                picks_in_merged = even_sample_from_list(list(range(len(merged))), max_points)
                selected_indices = [merged[i] for i in picks_in_merged]
            elif len(merged) < max_points:
                # top-up with evenly spaced over the union avoiding duplicates
                need = max_points - len(merged)
                topup = even_sample_range(n, need, existing=set(merged))
                selected_indices = sorted(set(merged + topup))
            else:
                selected_indices = merged
    else:
        selected_indices = list(range(n))

    # Build aligned arrays restricted to selected indices
    timestamps = [union_timestamps[i] for i in selected_indices]

    def build_series(map_obj, field):
        out = []
        for ts in timestamps:
            m = map_obj.get(ts)
            out.append(getattr(m, field) if m else None)
        return out

    aligned = {
        'timestamps': timestamps,
        'video1': {
            'view_count': build_series(map1_full, 'view_count'),
            'like_count': build_series(map1_full, 'like_count'),
            'comment_count': build_series(map1_full, 'comment_count'),
        },
        'video2': {
            'view_count': build_series(map2_full, 'view_count'),
            'like_count': build_series(map2_full, 'like_count'),
            'comment_count': build_series(map2_full, 'comment_count'),
        }
    }

    # Latest should be based on full metrics, not sampled
    latest1 = full_m1[-1] if full_m1 else None
    latest2 = full_m2[-1] if full_m2 else None
    latest = {
        'video1': latest1.to_dict() if latest1 else None,
        'video2': latest2.to_dict() if latest2 else None,
        'delta': None
    }
    if latest1 and latest2:
        latest['delta'] = {
            'views': latest2.view_count - latest1.view_count,
            'likes': latest2.like_count - latest1.like_count,
            'comments': latest2.comment_count - latest1.comment_count
        }

    return jsonify({
        'video1': {'id': v1.id, 'title': v1.title},
        'video2': {'id': v2.id, 'title': v2.title},
        'aligned': aligned,
        'latest': latest,
        'sampling': {
            'strategy': strategy,
            'max_points': max_points,
            'union_length': n,
            'selected_count': len(timestamps)
        }
    })


@app.route('/api/videos/<int:video_id>/comments', methods=['GET'])
def get_video_comments(video_id):
    """Get comments for a video with pagination and status filter.

        Query params:
      - sort: date_desc (default) | date_asc | likes_desc | likes_asc | sentiment_pos | sentiment_neg
      - include_deleted: true|false (default true, ignored if deleted_only=true)
      - deleted_only: true|false (default false)
      - page: 1-based page index (default 1)
      - page_size: items per page (default 50)
            - sentiment: all|positive|neutral|negative (default all)

    Returns an object with items and pagination metadata.
    """
    Video.query.get_or_404(video_id)

    include_deleted = request.args.get('include_deleted', 'true').lower() == 'true'
    deleted_only = request.args.get('deleted_only', 'false').lower() == 'true'
    sort_by = request.args.get('sort', 'date_desc')
    sentiment = request.args.get('sentiment', 'all')
    page = max(1, request.args.get('page', default=1, type=int) or 1)
    page_size = min(200, max(1, request.args.get('page_size', default=50, type=int) or 50))

    query = Comment.query.filter_by(video_id=video_id)
    if deleted_only:
        query = query.filter_by(status='deleted')
    elif not include_deleted:
        query = query.filter_by(status='active')

    # Sentiment filtering
    if sentiment in ('positive','neutral','negative'):
        query = query.filter(Comment.sentiment == sentiment)

    # Sorting
    if sort_by == 'date_asc':
        query = query.order_by(Comment.published_at.asc())
    elif sort_by == 'likes_desc':
        query = query.order_by(Comment.like_count.desc())
    elif sort_by == 'likes_asc':
        query = query.order_by(Comment.like_count.asc())
    elif sort_by == 'sentiment_pos':
        query = query.order_by(
            case(
                (Comment.sentiment == 'positive', 1),
                (Comment.sentiment == 'neutral', 2),
                (Comment.sentiment == 'negative', 3),
                else_=4
            ),
            Comment.sentiment_score.desc().nullslast()
        )
    elif sort_by == 'sentiment_neg':
        query = query.order_by(
            case(
                (Comment.sentiment == 'negative', 1),
                (Comment.sentiment == 'neutral', 2),
                (Comment.sentiment == 'positive', 3),
                else_=4
            ),
            Comment.sentiment_score.asc().nullslast()
        )
    else:
        query = query.order_by(Comment.published_at.desc())

    # Pagination
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()

    # Global totals independent of filters (for stable UI counters)
    total_base = Comment.query.filter_by(video_id=video_id)
    total_all = total_base.count()
    deleted_total = total_base.filter_by(status='deleted').count()
    # Sentiment totals across all comments (ignore NULL sentiment)
    pos_total = total_base.filter(Comment.sentiment == 'positive').count()
    neu_total = total_base.filter(Comment.sentiment == 'neutral').count()
    neg_total = total_base.filter(Comment.sentiment == 'negative').count()
    return jsonify({
        'items': [c.to_dict() for c in items],
        'pagination': {
            'page': page,
            'page_size': page_size,
            'total': total,
            'total_pages': (total + page_size - 1) // page_size
        },
        'totals': {
            'all': total_all,
            'deleted': deleted_total,
            'sentiment': {
                'positive': pos_total,
                'neutral': neu_total,
                'negative': neg_total
            }
        }
    })


@app.route('/api/comments/<string:comment_id>/replies', methods=['GET'])
def get_comment_replies(comment_id):
    """Get replies for a given comment_id with optional filters.

        Query params:
      - include_deleted: true|false (default true)
      - deleted_only: true|false (default false)
      - sort: same options as parent
            - sentiment: all|positive|neutral|negative (default all)
    """
    include_deleted = request.args.get('include_deleted', 'true').lower() == 'true'
    deleted_only = request.args.get('deleted_only', 'false').lower() == 'true'
    sort_by = request.args.get('sort', 'date_desc')
    sentiment = request.args.get('sentiment', 'all')

    query = Comment.query.filter_by(parent_id=comment_id)
    if deleted_only:
        query = query.filter_by(status='deleted')
    elif not include_deleted:
        query = query.filter_by(status='active')

    if sentiment in ('positive','neutral','negative'):
        query = query.filter(Comment.sentiment == sentiment)

    if sort_by == 'date_asc':
        query = query.order_by(Comment.published_at.asc())
    elif sort_by == 'likes_desc':
        query = query.order_by(Comment.like_count.desc())
    elif sort_by == 'likes_asc':
        query = query.order_by(Comment.like_count.asc())
    elif sort_by == 'sentiment_pos':
        query = query.order_by(
            case(
                (Comment.sentiment == 'positive', 1),
                (Comment.sentiment == 'neutral', 2),
                (Comment.sentiment == 'negative', 3),
                else_=4
            ),
            Comment.sentiment_score.desc().nullslast()
        )
    elif sort_by == 'sentiment_neg':
        query = query.order_by(
            case(
                (Comment.sentiment == 'negative', 1),
                (Comment.sentiment == 'neutral', 2),
                (Comment.sentiment == 'positive', 3),
                else_=4
            ),
            Comment.sentiment_score.asc().nullslast()
        )
    else:
        query = query.order_by(Comment.published_at.desc())

    replies = query.all()
    return jsonify([c.to_dict() for c in replies])


@app.route('/api/videos/<int:video_id>/sync', methods=['POST'])
def manual_sync(video_id):
    """Manually trigger sync for a video."""
    video = Video.query.get_or_404(video_id)
    try:
        sync_video(video.video_id)
        return jsonify({'message': 'Sync completed successfully'})
    except Exception as e:
        logger.error(f"Error during manual sync: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/stats', methods=['GET'])
def get_stats():
    """Get overall statistics."""
    total_videos = Video.query.filter_by(is_active=True).count()
    total_comments = Comment.query.count()
    deleted_comments = Comment.query.filter_by(status='deleted').count()
    
    return jsonify({
        'total_videos': total_videos,
        'total_comments': total_comments,
        'deleted_comments': deleted_comments
    })


@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({'status': 'healthy', 'timestamp': datetime.now(timezone.utc).isoformat()})


@app.route('/api/videos/<int:video_id>/top-keywords', methods=['GET'])
def get_top_keywords(video_id):
    """Get top keywords (unigrams + optional bigrams) for a video.

    Query params:
      limit (default 5)
      bigrams=true|false (include bigrams)
      min_occ (default 2) minimum total occurrences
    """
    Video.query.get_or_404(video_id)
    limit = request.args.get('limit', default=5, type=int)
    use_bigrams = request.args.get('bigrams', 'true').lower() == 'true'
    min_occ = request.args.get('min_occ', default=2, type=int)

    comments = Comment.query.filter_by(video_id=video_id, status='active').all()
    if not comments:
        return jsonify([])

    counter = Counter()
    comment_contains = {}

    for c in comments:
        terms = _extract_terms(c.text or '', use_bigrams)
        counter.update(terms)
        for t in set(terms):
            comment_contains[t] = comment_contains.get(t, 0) + 1

    # Filter by min occurrence and sort by occurrence desc then comment_count desc then term length desc
    filtered = [
        (term, occ) for term, occ in counter.items() if occ >= min_occ
    ]
    filtered.sort(key=lambda x: (-x[1], -comment_contains.get(x[0], 0), -len(x[0])))

    items = []
    for term, occ in filtered[:limit]:
        items.append({
            'term': term,
            'occurrence_count': int(occ),
            'comment_count': int(comment_contains.get(term, 0)),
            'ngram': 2 if ' ' in term else 1
        })
    return jsonify(items)


_STOPWORDS_DE = {
    'der','die','das','und','ist','im','in','den','zu','mit','von','für','dass','auf','ein','eine','einer','eines','sind','auch','als','an','am','es','ich','du','er','sie','wir','ihr','man','nicht','nur','oder','aber','wenn','wie','so','mal','noch','schon','da','hier','dann','dem','des','was','wer','wird','über','unter','mehr','weniger','kein','keine','keinen','keiner','mich','mir','dich','dir','sein','seine','seinen','seiner','ihr','ihre','ihren','ihm','ihr','euch','uns','zum','zur','beim','vom','vom','beim','einem','einen','eines','soll','sollte','kann','können','könnte','muss','müssen','müsste','wurde','würde','werden','wurden','wären',
    # häufige Füllwörter/Verbformen
    'hat','sehr','hast','habt','haben','hätte','hättest','hätten','immer','nie','ganz','halt'
}
_STOPWORDS_EN = {
    'the','and','a','an','to','of','in','on','for','is','are','was','were','it','this','that','these','those','i','you','he','she','we','they','them','us','me','my','your','his','her','our','their','or','but','if','so','as','at','by','with','from','not','no','yes','be','been','have','has','had','do','did','does','can','could','should','would','will','just','more','most','some','any','other','there','here','then','than','very','also','too','into','out','up','down'
}
_STOPWORDS_MISC = {'http','https','www','com','net','org','youtu','youtube','video','channel','watch','amp'}

# Allow environment-based custom stopwords (comma-separated)
def _load_additional_stopwords():
    extra_env = {s.strip().lower() for s in os.environ.get('KEYWORD_STOPWORDS', '').split(',') if s.strip()}
    file_path = os.path.join(app.instance_path, 'stopwords.json')
    extra_file = set()
    try:
        if os.path.exists(file_path):
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if isinstance(data, list):
                    extra_file = {str(x).strip().lower() for x in data if str(x).strip()}
    except Exception as e:
        logger.warning(f"Failed to read custom stopwords file: {e}")
    return extra_env | extra_file

_RUNTIME_EXTRA_STOPWORDS = _load_additional_stopwords()

def _build_stopword_set():
    return _STOPWORDS_DE | _STOPWORDS_EN | _STOPWORDS_MISC | _RUNTIME_EXTRA_STOPWORDS

_STOPWORDS_ALL = _build_stopword_set()


def _tokenize_text(txt: str):
    # Keep unicode letters and numbers as token chars, split on everything else
    tokens = re.findall(r"[\w\-]+", txt.lower())
    cleaned = []
    for t in tokens:
        if len(t) < 3:
            continue
        if t.isdigit():
            continue
        if t in _STOPWORDS_ALL:
            continue
        cleaned.append(t)
    return cleaned

def _generate_ngrams(tokens, n):
    return [' '.join(tokens[i:i+n]) for i in range(len(tokens)-n+1)]

def _extract_terms(text: str, use_bigrams: bool):
    toks = _tokenize_text(text or '')
    terms = toks[:]
    if use_bigrams:
        bigrams = _generate_ngrams(toks, 2)
        # Filter bigrams containing any stopword token
        filtered_bigrams = [bg for bg in bigrams if all(part not in _STOPWORDS_ALL for part in bg.split())]
        terms.extend(filtered_bigrams)
    return terms

@app.route('/api/admin/stopwords', methods=['GET','PUT'])
def manage_stopwords():
    """GET returns combined stopwords (base + custom). PUT replaces custom (file + env unaffected).

    PUT body: { "stopwords": ["wort1", "wort2"] }
    Writes to instance/stopwords.json
    """
    global _RUNTIME_EXTRA_STOPWORDS, _STOPWORDS_ALL
    if request.method == 'GET':
        return jsonify({
            'base_count': len(_STOPWORDS_DE | _STOPWORDS_EN | _STOPWORDS_MISC),
            'custom_count': len(_RUNTIME_EXTRA_STOPWORDS),
            'custom': sorted(list(_RUNTIME_EXTRA_STOPWORDS)),
            'all': sorted(list(_STOPWORDS_ALL))
        })
    data = request.json or {}
    new_list = data.get('stopwords', [])
    if not isinstance(new_list, list):
        return jsonify({'error': 'stopwords must be a list'}), 400
    file_path = os.path.join(app.instance_path, 'stopwords.json')
    try:
        os.makedirs(app.instance_path, exist_ok=True)
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(new_list, f, ensure_ascii=False, indent=2)
        # Rebuild sets
        _RUNTIME_EXTRA_STOPWORDS = _load_additional_stopwords()
        _STOPWORDS_ALL = _build_stopword_set()
        return jsonify({'message': 'updated', 'custom_count': len(_RUNTIME_EXTRA_STOPWORDS)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/keywords/suggest', methods=['GET'])
def suggest_keywords():
    """Suggest frequent terms from comments (auto discovery).

    Query params:
      - video_id (optional): limit to a specific video
      - limit (optional, default 25): number of suggestions
      - bigrams=true|false (include bigrams)
      - min_occ (default 3)
    """
    limit = request.args.get('limit', default=25, type=int)
    video_id = request.args.get('video_id', type=int)
    use_bigrams = request.args.get('bigrams', 'true').lower() == 'true'
    min_occ = request.args.get('min_occ', default=3, type=int)

    query = Comment.query
    if video_id:
        query = query.filter_by(video_id=video_id)
    query = query.filter_by(status='active')
    comments = query.all()

    counter = Counter()
    comment_contains = {}

    for c in comments:
        terms = _extract_terms(c.text or '', use_bigrams)
        counter.update(terms)
        # Track unique tokens per comment for comment_count
        for t in set(terms):
            comment_contains[t] = comment_contains.get(t, 0) + 1

    # Apply min occurrence and order
    pairs = [(t, occ) for t, occ in counter.items() if occ >= min_occ]
    pairs.sort(key=lambda x: (-x[1], -comment_contains.get(x[0], 0), -len(x[0])))

    items = []
    for term, occ in pairs[:limit]:
        items.append({
            'term': term,
            'occurrence_count': int(occ),
            'comment_count': int(comment_contains.get(term, 0)),
            'ngram': 2 if ' ' in term else 1
        })

    return jsonify(items)


def _ensure_comment_sentiment_columns():
    """Add sentiment columns to comments table if they do not exist (for existing DBs).

    This avoids OperationalError when the mapped model has new columns but the
    SQLite table was created before. Safe to run multiple times.
    """
    try:
        engine = db.engine
        dialect = engine.dialect.name
        added = []
        if dialect == 'sqlite':
            # Inspect existing columns
            rows = db.session.execute(text("PRAGMA table_info('comments')")).mappings().all()
            existing_cols = {row['name'] for row in rows}
            stmts = []
            if 'sentiment' not in existing_cols:
                stmts.append("ALTER TABLE comments ADD COLUMN sentiment VARCHAR(20)")
                added.append('sentiment')
            if 'sentiment_score' not in existing_cols:
                stmts.append("ALTER TABLE comments ADD COLUMN sentiment_score REAL")
                added.append('sentiment_score')
            if 'sentiment_label' not in existing_cols:
                stmts.append("ALTER TABLE comments ADD COLUMN sentiment_label VARCHAR(50)")
                added.append('sentiment_label')
            if 'last_seen' not in existing_cols:
                stmts.append("ALTER TABLE comments ADD COLUMN last_seen DATETIME")
                added.append('last_seen')
            if 'reinstated_at' not in existing_cols:
                stmts.append("ALTER TABLE comments ADD COLUMN reinstated_at DATETIME")
                added.append('reinstated_at')
            for s in stmts:
                db.session.execute(text(s))
            if stmts:
                db.session.commit()
        else:
            # Generic fallback for other DBs
            try:
                cols_rs = db.session.execute(text(
                    "SELECT column_name FROM information_schema.columns WHERE table_name = 'comments'"
                ))
                existing_cols = {r[0] for r in cols_rs}
            except Exception:
                existing_cols = set()
            if 'sentiment' not in existing_cols:
                db.session.execute(text("ALTER TABLE comments ADD COLUMN sentiment VARCHAR(20)"))
                added.append('sentiment')
            if 'sentiment_score' not in existing_cols:
                db.session.execute(text("ALTER TABLE comments ADD COLUMN sentiment_score FLOAT"))
                added.append('sentiment_score')
            if 'sentiment_label' not in existing_cols:
                db.session.execute(text("ALTER TABLE comments ADD COLUMN sentiment_label VARCHAR(50)"))
                added.append('sentiment_label')
            try:
                # best-effort additions for last_seen and reinstated_at
                if 'last_seen' not in existing_cols:
                    db.session.execute(text("ALTER TABLE comments ADD COLUMN last_seen DATETIME"))
                    added.append('last_seen')
                if 'reinstated_at' not in existing_cols:
                    db.session.execute(text("ALTER TABLE comments ADD COLUMN reinstated_at DATETIME"))
                    added.append('reinstated_at')
            except Exception:
                # ignore failures, not critical
                pass
            if added:
                db.session.commit()
        if added:
            logger.info(f"Applied DB migration: added columns to comments -> {', '.join(added)}")
    except Exception as e:
        # Non-fatal: log and continue; requests may still fail until fixed
        logger.warning(f"Schema check/migration for comments failed: {e}")


def init_app():
    """Factory-style init for easier reuse in tests/WGI servers."""
    with app.app_context():
        db.create_all()
        # Lightweight runtime migration for existing SQLite DBs missing new columns
        _ensure_comment_sentiment_columns()
    return app


def _setup_scheduler():
    """Add the sync job and start the scheduler if not already running.

    This function is idempotent per-process and should be called only in the
    reloader child (WERKZEUG_RUN_MAIN=true) or when not using the reloader.
    """
    # Check if job already exists to prevent duplicates within this process
    existing_job = scheduler.get_job('sync_all_videos')
    if existing_job:
        logger.info("Scheduler job 'sync_all_videos' already exists, skipping add")
    else:
        # Allow configuring the sync cadence via environment/config
        sync_cron = app.config.get('SYNC_CRON') or ''
        sync_hours = app.config.get('SYNC_INTERVAL_HOURS', 24)
        if sync_cron:
            # If SYNC_CRON is provided, try to use it as a crontab/minute spec.
            try:
                # Prefer full crontab string parsing if available (e.g. "*/15 * * * *").
                trigger = CronTrigger.from_crontab(sync_cron)
                logger.info(f"Using crontab (from_crontab) for sync: {sync_cron}")
            except Exception:
                # Fallback: interpret SYNC_CRON as comma-separated minute list (e.g. "0,15,30,45")
                trigger = CronTrigger(minute=sync_cron)
                logger.info(f"Using cron minute spec for sync: {sync_cron}")
            job_name = f"Sync all videos (cron: {sync_cron})"
        else:
            # Fallback to interval trigger using hours
            try:
                hours = int(sync_hours)
            except Exception:
                hours = 24
            trigger = IntervalTrigger(hours=hours)
            logger.info(f"Using interval trigger for sync: every {hours} hour(s)")
            job_name = f"Sync all videos (interval {hours}h)"

        scheduler.add_job(
            func=sync_all_videos,
            trigger=trigger,
            id='sync_all_videos',
            name=job_name,
            replace_existing=True
        )
        logger.info("Added scheduler job 'sync_all_videos'")

    if not scheduler.running:
        scheduler.start()
        logger.info("Scheduler started with quarter-hour cron (00,15,30,45)")
    else:
        logger.info("Scheduler already running")


@app.route('/ping', methods=['GET'])
def ping():
    return 'pong', 200

@app.route('/api/_debug_routes', methods=['GET'])
def list_routes():
    """List all API routes for debugging (helps verify endpoints exist)."""
    output = []
    for rule in app.url_map.iter_rules():
        if rule.rule.startswith('/api/'):
            methods = ','.join(sorted(m for m in rule.methods if m not in ('HEAD', 'OPTIONS')))
            output.append({'path': rule.rule, 'methods': methods})
    return jsonify(output)


if __name__ == '__main__':
    init_app()
    # Determine debug mode and reloader child to avoid double scheduler
    debug_mode = True
    env_debug = os.environ.get('FLASK_DEBUG')
    if env_debug is not None:
        debug_mode = env_debug.lower() in ('1','true','yes','on')

    # Start scheduler only in reloader child or when not in debug mode
    if (not debug_mode) or (os.environ.get('WERKZEUG_RUN_MAIN') == 'true'):
        _setup_scheduler()
    else:
        logger.info("Skipping scheduler start in reloader parent process")

    port = int(os.environ.get('PORT', '5055'))
    app.run(debug=debug_mode, host='0.0.0.0', port=port)
