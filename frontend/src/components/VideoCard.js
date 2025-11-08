import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import MetricsChart from './MetricsChart';
import MetricsCompareChart from './MetricsCompareChart';
import CompareSelector from './CompareSelector';
import CommentsList from './CommentsList';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

function VideoCard({ video, onDelete, onSync, allVideos }) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState('metrics');
  const [metrics, setMetrics] = useState([]);
  const [compareWithId, setCompareWithId] = useState(null);
  const [compareData, setCompareData] = useState(null);
  const [loadingCompare, setLoadingCompare] = useState(false);
  const [normalizeCompare, setNormalizeCompare] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentPage, setCommentPage] = useState(1);
  const [hasMoreComments, setHasMoreComments] = useState(true);
  const [commentMode, setCommentMode] = useState('all'); // all | active | deleted
  const [keywords, setKeywords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [commentSort, setCommentSort] = useState('date_desc');
  const [commentTotals, setCommentTotals] = useState({ all: 0, deleted: 0, sentiment: { positive: 0, neutral: 0, negative: 0 } });
  const [sentimentFilter, setSentimentFilter] = useState('all'); // all|positive|neutral|negative
  const [commentsInitialized, setCommentsInitialized] = useState(false);

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

  const fetchCompare = useCallback(async (otherId) => {
    if (!otherId) {
      setCompareData(null);
      return;
    }
    setLoadingCompare(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/videos/compare`, {
        params: { video1: video.id, video2: otherId }
      });
      setCompareData(response.data);
    } catch (err) {
      console.error('Fehler beim Vergleichen der Videos', err);
    }
    setLoadingCompare(false);
  }, [video.id]);

  useEffect(() => {
    if (expanded && activeTab === 'metrics' && metrics.length === 0) {
      fetchMetrics();
    }
    if (expanded && activeTab === 'comments' && !commentsInitialized) {
      fetchComments({ reset: true });
      setCommentsInitialized(true);
    }
    if (expanded && keywords.length === 0) {
      fetchKeywords();
    }
  }, [expanded, activeTab, metrics.length, commentsInitialized, keywords.length]);

  // Fetch compare data when selection changes
  useEffect(() => {
    if (activeTab === 'metrics' && expanded && compareWithId) {
      fetchCompare(compareWithId);
    }
  }, [compareWithId, activeTab, expanded, fetchCompare]);

  // Reset init flag when leaving comments view or collapsing
  useEffect(() => {
    if (!expanded || activeTab !== 'comments') {
      setCommentsInitialized(false);
    }
  }, [expanded, activeTab]);

  const handleSortChange = (newSort) => {
    setCommentSort(newSort);
    setCommentPage(1);
    setHasMoreComments(true);
    // ensure the new sort is applied immediately on first click
    fetchComments({ reset: true, page: 1, sort: newSort });
  };

  const handleModeChange = (mode) => {
    setCommentMode(mode);
    setCommentPage(1);
    setHasMoreComments(true);
    // apply the new mode immediately
    fetchComments({ reset: true, page: 1, mode });
    setCommentsInitialized(true);
  };

  const handleSentimentChange = (s) => {
    setSentimentFilter(s);
    setCommentPage(1);
    setHasMoreComments(true);
    // apply the new sentiment immediately
    fetchComments({ reset: true, page: 1, sentiment: s });
    setCommentsInitialized(true);
  };

  const loadMoreComments = () => {
    if (hasMoreComments && !loading && !loadingMore) {
      fetchComments();
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return format(new Date(dateString), 'dd.MM.yyyy HH:mm', { locale: de });
    } catch {
      return 'N/A';
    }
  };

  return (
    <div className="video-card">
      <div className="video-header" onClick={() => setExpanded(!expanded)}>
        <img
          src={video.thumbnail_url || 'https://via.placeholder.com/200x112?text=No+Thumbnail'}
          alt={video.title}
          className="video-thumbnail"
        />
        <div className="video-info">
          <h3>{video.title}</h3>
          <div className="channel">{video.channel_title}</div>
          {expanded && keywords.length > 0 && (
            <div className="video-keywords">
              <span className="keywords-label">🔑 Top Keywords:</span>
              {keywords.map((kw) => (
                <span key={kw.term} className="keyword-badge" title={`${kw.occurrence_count}× in ${kw.comment_count} Kommentaren`}>
                  {kw.term}
                </span>
              ))}
            </div>
          )}
          <div className="date">
            Hinzugefügt: {formatDate(video.added_at)} | 
            Letzte Sync: {formatDate(video.last_synced)}
          </div>
          <div className="video-actions" onClick={(e) => e.stopPropagation()}>
            <button className="btn btn-secondary" onClick={() => onSync(video.id)}>
              🔄 Sync
            </button>
            <button className="btn btn-danger" onClick={() => onDelete(video.id)}>
              🗑️ Entfernen
            </button>
            <a
              href={`https://www.youtube.com/watch?v=${video.video_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary"
            >
              🎬 YouTube öffnen
            </a>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="video-details">
          <div className="tabs">
            <button
              className={`tab ${activeTab === 'metrics' ? 'active' : ''}`}
              onClick={() => setActiveTab('metrics')}
            >
              📊 Metriken
            </button>
            <button
              className={`tab ${activeTab === 'comments' ? 'active' : ''}`}
              onClick={() => setActiveTab('comments')}
            >
              💬 Kommentare
            </button>
          </div>

          {activeTab === 'metrics' && (
            loading && metrics.length === 0 ? (
              <div className="loading">Lädt...</div>
            ) : (
              <>
                <div className="compare-controls" style={{marginBottom:'12px', display:'flex', gap:'12px', alignItems:'center', flexWrap:'wrap'}}>
                  <CompareSelector
                    allVideos={allVideos}
                    currentVideoId={video.id}
                    value={compareWithId}
                    onChange={(id) => setCompareWithId(id)}
                    buttonLabel="Vergleichen mit"
                  />
                  {compareWithId && (
                    <label style={{display:'flex', alignItems:'center', gap:'4px', fontSize:'.75rem'}}>
                      <input type="checkbox" checked={normalizeCompare} onChange={(e) => setNormalizeCompare(e.target.checked)} />
                      Normalisieren
                    </label>
                  )}
                </div>
                {!compareWithId && <MetricsChart metrics={metrics} />}
                {compareWithId && (
                  loadingCompare ? <div className="loading">Vergleich lädt...</div> : (
                    compareData ? (
                      <MetricsCompareChart
                        baseVideo={{ id: video.id, title: video.title }}
                        compareVideo={{ id: compareData.video2.id, title: compareData.video2.title }}
                        aligned={compareData.aligned}
                        normalize={normalizeCompare}
                        maxPoints={100}
                      />
                    ) : <div className="empty-state">Keine Vergleichsdaten</div>
                  )
                )}
              </>
            )
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
        </div>
      )}
    </div>
  );
}

export default VideoCard;
