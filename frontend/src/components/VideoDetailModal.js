import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import MetricsChart from './MetricsChart';
import MetricsCompareChart from './MetricsCompareChart';
import CompareSelector from './CompareSelector';
import CommentsList from './CommentsList';
import KeywordsPanel from './KeywordsPanel';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

function VideoDetailModal({ video, onClose, onDelete, onSync, allVideos }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [metrics, setMetrics] = useState([]);
  const [compareWithId, setCompareWithId] = useState(null);
  const [compareData, setCompareData] = useState(null);
  const [loadingCompare, setLoadingCompare] = useState(false);
  const [normalizeCompare, setNormalizeCompare] = useState(false);
  const [compareMaxPoints, setCompareMaxPoints] = useState(120);
  const [compareStrategy, setCompareStrategy] = useState('cover_both');
  const [comments, setComments] = useState([]);
  const [commentPage, setCommentPage] = useState(1);
  const [hasMoreComments, setHasMoreComments] = useState(true);
  const [commentMode, setCommentMode] = useState('all');
  const [keywords, setKeywords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [commentSort, setCommentSort] = useState('date_desc');
  const [commentTotals, setCommentTotals] = useState({ all: 0, deleted: 0, sentiment: { positive: 0, neutral: 0, negative: 0 } });
  const [sentimentFilter, setSentimentFilter] = useState('all');
  const [commentsInitialized, setCommentsInitialized] = useState(false);

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return format(new Date(dateString), 'dd.MM.yyyy HH:mm', { locale: de });
    } catch {
      return 'N/A';
    }
  };

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/videos/${video.id}/metrics`);
      setMetrics(response.data);
    } catch (err) {
      console.error('Fehler beim Laden der Metriken', err);
    }
    setLoading(false);
  }, [video.id]);

  const fetchComments = useCallback(async (opts = {}) => {
    const { reset = false, page: pageOverride, mode: modeOverride, sentiment: sentimentOverride, sort: sortOverride } = opts;
    const page = reset ? 1 : (pageOverride ?? commentPage);
    const page_size = 50;
    const mode = modeOverride ?? commentMode;
    const deleted_only = mode === 'deleted';
    const include_deleted = mode !== 'active';
    const sentiment = sentimentOverride ?? sentimentFilter;
    const sort = sortOverride ?? commentSort;
    if (reset) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    try {
      const response = await axios.get(`${API_BASE_URL}/videos/${video.id}/comments`, {
        params: { sort, page, page_size, deleted_only, include_deleted, sentiment }
      });
      const { items, pagination, totals } = response.data;
      setComments((prev) => (reset ? items : [...prev, ...items]));
      setHasMoreComments(pagination.page < pagination.total_pages);
      setCommentPage(pagination.page + 1);
      if (totals) setCommentTotals(totals);
    } catch (err) {
      console.error('Fehler beim Laden der Kommentare', err);
    }
    if (reset) {
      setLoading(false);
    }
    setLoadingMore(false);
  }, [video.id, commentSort, commentPage, commentMode, sentimentFilter]);

  const fetchKeywords = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/videos/${video.id}/top-keywords`);
      setKeywords(response.data || []);
    } catch (err) {
      console.error('Fehler beim Laden der Keywords', err);
    }
  }, [video.id]);

  const fetchCompare = useCallback(async (otherId, opts = {}) => {
    if (!otherId) {
      setCompareData(null);
      return;
    }
    setLoadingCompare(true);
    try {
      const max_points = opts.max_points ?? compareMaxPoints;
      const strategy = opts.strategy ?? compareStrategy;
      const response = await axios.get(`${API_BASE_URL}/videos/compare`, {
        params: { video1: video.id, video2: otherId, max_points, strategy }
      });
      setCompareData(response.data);
    } catch (err) {
      console.error('Fehler beim Vergleichen der Videos', err);
    }
    setLoadingCompare(false);
  }, [video.id, compareMaxPoints, compareStrategy]);

  useEffect(() => {
    if (activeTab === 'metrics' && metrics.length === 0) {
      fetchMetrics();
    }
    if (activeTab === 'comments' && !commentsInitialized) {
      fetchComments({ reset: true });
      setCommentsInitialized(true);
    }
    if (activeTab === 'keywords' && keywords.length === 0) {
      fetchKeywords();
    }
  }, [activeTab, metrics.length, commentsInitialized, keywords.length, fetchMetrics, fetchComments, fetchKeywords]);

  useEffect(() => {
    if (activeTab === 'compare' && compareWithId) {
      fetchCompare(compareWithId);
    }
  }, [compareWithId, activeTab, fetchCompare]);

  useEffect(() => {
    if (activeTab !== 'comments') {
      setCommentsInitialized(false);
    }
  }, [activeTab]);

  const handleSortChange = (newSort) => {
    setCommentSort(newSort);
    setCommentPage(1);
    setHasMoreComments(true);
    fetchComments({ reset: true, page: 1, sort: newSort });
  };

  const handleModeChange = (mode) => {
    setCommentMode(mode);
    setCommentPage(1);
    setHasMoreComments(true);
    fetchComments({ reset: true, page: 1, mode });
    setCommentsInitialized(true);
  };

  const handleSentimentChange = (s) => {
    setSentimentFilter(s);
    setCommentPage(1);
    setHasMoreComments(true);
    fetchComments({ reset: true, page: 1, sentiment: s });
    setCommentsInitialized(true);
  };

  const loadMoreComments = () => {
    if (hasMoreComments && !loading && !loadingMore) {
      fetchComments();
    }
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-left">
            <img
              src={video.thumbnail_url || 'https://via.placeholder.com/160x90?text=No+Thumbnail'}
              alt={video.title}
              className="modal-thumb"
            />
            <div className="modal-info">
              <h2 className="modal-title">{video.title}</h2>
              <p className="modal-channel">{video.channel_title}</p>
              <div className="modal-dates">
                <span>Hinzugefügt: {formatDate(video.added_at)}</span>
                <span>•</span>
                <span>Sync: {formatDate(video.last_synced)}</span>
              </div>
            </div>
          </div>
          <div className="modal-actions">
            <button className="btn btn-secondary btn-small" onClick={() => onSync(video.id)}>
              🔄 Sync
            </button>
            <a
              href={`https://www.youtube.com/watch?v=${video.video_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary btn-small"
            >
              🎬 YouTube
            </a>
            <button className="btn btn-danger btn-small" onClick={() => { onDelete(video.id); handleClose(); }}>
              🗑️ Löschen
            </button>
            <button className="btn-close" onClick={handleClose}>✕</button>
          </div>
        </div>

        <div className="modal-tabs">
          <button
            className={`modal-tab ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            📋 Übersicht
          </button>
          <button
            className={`modal-tab ${activeTab === 'metrics' ? 'active' : ''}`}
            onClick={() => setActiveTab('metrics')}
          >
            📊 Metriken
          </button>
          <button
            className={`modal-tab ${activeTab === 'compare' ? 'active' : ''}`}
            onClick={() => setActiveTab('compare')}
          >
            ⚖️ Vergleich
          </button>
          <button
            className={`modal-tab ${activeTab === 'comments' ? 'active' : ''}`}
            onClick={() => setActiveTab('comments')}
          >
            💬 Kommentare
          </button>
          <button
            className={`modal-tab ${activeTab === 'keywords' ? 'active' : ''}`}
            onClick={() => setActiveTab('keywords')}
          >
            🔑 Keywords
          </button>
        </div>

        <div className="modal-body">
          {activeTab === 'overview' && (
            <div className="overview-section">
              <div className="overview-card">
                <h3>📊 Aktuelle Statistiken</h3>
                {loading && metrics.length === 0 ? (
                  <div className="loading">Lädt...</div>
                ) : metrics.length > 0 ? (
                  <div className="overview-stats">
                    <div className="overview-stat">
                      <span className="stat-label">👁️ Aufrufe</span>
                      <span className="stat-value">{metrics[metrics.length - 1]?.view_count?.toLocaleString('de-DE') || 0}</span>
                    </div>
                    <div className="overview-stat">
                      <span className="stat-label">👍 Likes</span>
                      <span className="stat-value">{metrics[metrics.length - 1]?.like_count?.toLocaleString('de-DE') || 0}</span>
                    </div>
                    <div className="overview-stat">
                      <span className="stat-label">💬 Kommentare</span>
                      <span className="stat-value">{metrics[metrics.length - 1]?.comment_count?.toLocaleString('de-DE') || 0}</span>
                    </div>
                  </div>
                ) : (
                  <p style={{color:'var(--muted)',fontSize:'.85rem'}}>Keine Metriken verfügbar</p>
                )}
              </div>
              <div className="overview-card">
                <h3>📝 Beschreibung</h3>
                <p className="overview-description">{video.description || 'Keine Beschreibung verfügbar'}</p>
              </div>
              {keywords.length === 0 && (
                <button className="btn btn-secondary" onClick={fetchKeywords}>🔑 Keywords laden</button>
              )}
              {keywords.length > 0 && (
                <div className="overview-card">
                  <h3>🔑 Top Keywords</h3>
                  <div className="overview-keywords">
                    {keywords.slice(0, 10).map((kw) => (
                      <span key={kw.term} className="keyword-badge" title={`${kw.occurrence_count}× in ${kw.comment_count} Kommentaren`}>
                        {kw.term}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'metrics' && (
            loading && metrics.length === 0 ? (
              <div className="loading">Lädt...</div>
            ) : (
              <MetricsChart metrics={metrics} videoTitle={video.title} channelTitle={video.channel_title} />
            )
          )}

          {activeTab === 'compare' && (
            <div className="compare-section">
              <div className="compare-controls-modal">
                <CompareSelector
                  allVideos={allVideos}
                  currentVideoId={video.id}
                  value={compareWithId}
                  onChange={(id) => setCompareWithId(id)}
                  buttonLabel="Video zum Vergleichen wählen"
                />
                {compareWithId && (
                  <label style={{display:'flex', alignItems:'center', gap:'4px', fontSize:'.8rem'}}>
                    <input type="checkbox" checked={normalizeCompare} onChange={(e) => setNormalizeCompare(e.target.checked)} />
                    Normalisieren (Index 100)
                  </label>
                )}
                {compareWithId && (
                  <div className="selects-row">
                    <div className="select-group">
                      <span className="select-label">Detailgrad</span>
                      <select
                        className="pretty-select"
                        value={compareMaxPoints}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          setCompareMaxPoints(val);
                          fetchCompare(compareWithId, { max_points: val });
                        }}
                      >
                        <option value={60}>60 Punkte</option>
                        <option value={120}>120 Punkte</option>
                        <option value={240}>240 Punkte</option>
                        <option value={400}>400 Punkte</option>
                      </select>
                    </div>
                    <div className="select-group">
                      <span className="select-label">Strategie</span>
                      <select
                        className="pretty-select"
                        value={compareStrategy}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCompareStrategy(val);
                          fetchCompare(compareWithId, { strategy: val });
                        }}
                      >
                        <option value="cover_both">Ausgewogen</option>
                        <option value="even">Gleichmäßig</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
              {!compareWithId && (
                <div className="empty-state">Wähle ein Video zum Vergleichen</div>
              )}
              {compareWithId && (
                loadingCompare ? <div className="loading">Vergleich lädt...</div> : (
                  compareData ? (
                    <MetricsCompareChart
                      baseVideo={{ id: video.id, title: video.title, channel_title: video.channel_title }}
                      compareVideo={{
                        id: compareData.video2.id,
                        title: compareData.video2.title,
                        channel_title: compareData.video2.channel_title || (allVideos?.find(v => v.id === compareWithId)?.channel_title) || ''
                      }}
                      aligned={compareData.aligned}
                      normalize={normalizeCompare}
                    />
                  ) : <div className="empty-state">Keine Vergleichsdaten</div>
                )
              )}
            </div>
          )}

          {activeTab === 'comments' && (
            <>
              {loading && comments.length === 0 && (
                <div className="loading">Lädt...</div>
              )}
              <CommentsList
                comments={comments}
                onSortChange={handleSortChange}
                currentSort={commentSort}
                mode={commentMode}
                onModeChange={handleModeChange}
                onLoadMore={loadMoreComments}
                hasMore={hasMoreComments}
                loading={loadingMore}
                totals={commentTotals}
                sentimentFilter={sentimentFilter}
                onSentimentChange={handleSentimentChange}
              />
            </>
          )}

          {activeTab === 'keywords' && (
            <KeywordsPanel videoId={video.id} initialKeywords={keywords} />
          )}
        </div>
      </div>
    </div>
  );
}

export default VideoDetailModal;
