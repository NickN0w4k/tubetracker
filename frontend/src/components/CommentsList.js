import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

function CommentsList({ comments, onSortChange, currentSort, mode = 'all', onModeChange, onLoadMore, hasMore, loading, totals, sentimentFilter = 'all', onSentimentChange }) {
  const [expanded, setExpanded] = useState(() => new Set());
  const [allExpanded, setAllExpanded] = useState(false);

  // Infinite scroll refs
  const listRef = useRef(null);
  const sentinelRef = useRef(null);
  const loaderRef = useRef(null);
  const prevScrollTopRef = useRef(0);
  const prevScrollHeightRef = useRef(0);
  const prevLenRef = useRef(comments.length);

  // IntersectionObserver to trigger loading more
  useEffect(() => {
    if (!hasMore || !onLoadMore) return; // nothing to do
    const rootEl = listRef.current;
    const sentinel = sentinelRef.current;
    if (!rootEl || !sentinel) return;

    let ticking = false;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry && entry.isIntersecting && !loading && hasMore) {
          // prevent rapid re-triggering
          if (ticking) return;
          ticking = true;
          onLoadMore();
          // allow next trigger after a short delay
          setTimeout(() => { ticking = false; }, 400);
        }
      },
      {
        root: rootEl, // observe within the scrollable list
        // Preload a bit earlier and avoid flicker
        rootMargin: '200px 0px 200px 0px',
        threshold: 0.1,
      }
    );
    observer.observe(sentinel);
    return () => {
      observer.disconnect();
    };
  }, [hasMore, loading, onLoadMore]);

  // Capture scroll metrics right before we start loading more (append-only)
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    // when loading just turned on and we have existing items, snapshot
    if (loading && prevLenRef.current > 0) {
      prevScrollTopRef.current = el.scrollTop;
      prevScrollHeightRef.current = el.scrollHeight;
    }
  }, [loading]);

  // After items appended, restore scrollTop to prevent visual jump
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const prevLen = prevLenRef.current;
    if (comments.length > prevLen && prevLen > 0 && !loading) {
      // keep viewport anchored by restoring prior scrollTop
      const oldTop = prevScrollTopRef.current;
      if (Number.isFinite(oldTop)) {
        el.scrollTop = oldTop;
      }
    }
    prevLenRef.current = comments.length;
  }, [comments.length, loading]);

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return format(new Date(dateString), 'dd.MM.yyyy HH:mm', { locale: de });
    } catch {
      return 'N/A';
    }
  };

  // Group comments by parent_id (works best within current page)
  const { topLevelComments, repliesMap } = useMemo(() => {
    const tl = comments.filter((c) => !c.parent_id);
    const map = {};
    comments.forEach((c) => {
      if (c.parent_id) {
        if (!map[c.parent_id]) map[c.parent_id] = [];
        map[c.parent_id].push(c);
      }
    });
    return { topLevelComments: tl, repliesMap: map };
  }, [comments]);

  // Status mode filtering is now server-side; client keeps an extra guard
  const filteredComments = useMemo(() => {
    if (mode === 'active') return topLevelComments.filter(c => c.status === 'active');
    if (mode === 'deleted') return topLevelComments.filter(c => c.status === 'deleted');
    return topLevelComments;
  }, [topLevelComments, mode]);
  
  // Apply sentiment filter
  const finalComments = filteredComments; // sentiment is filtered on server now

  const toggleExpand = useCallback((id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleExpandAll = () => {
    if (allExpanded) {
      setExpanded(new Set());
      setAllExpanded(false);
    } else {
      setExpanded(new Set(finalComments.map(c => c.id)));
      setAllExpanded(true);
    }
  };

  const renderComment = (comment, isReply = false) => {
  if (mode === 'active' && comment.status === 'deleted') return null;
    const isExpanded = expanded.has(comment.id);
    const snippetLength = 140;
    const fullText = comment.text || '';
    const snippet = fullText.length > snippetLength ? fullText.slice(0, snippetLength) + '…' : fullText;

    // Sentiment badge
    const sentimentEmoji = {
      positive: '😊',
      neutral: '😐',
      negative: '😞'
    };
    const sentimentColor = {
      positive: '#4caf50',
      neutral: '#ff9800',
      negative: '#f44336'
    };

    return (
      <div key={comment.id} className={`comment-row ${comment.status} ${isReply ? 'reply' : ''}`}>
        <div className={`comment-shell ${isExpanded ? 'expanded' : 'collapsed'}`}>        
          <div className="comment-top">
            <div className="comment-author-line">
              <span className="comment-author">{comment.author}</span>
              {comment.sentiment && (
                <span 
                  className="sentiment-badge" 
                  style={{ backgroundColor: sentimentColor[comment.sentiment] }}
                  title={`${comment.sentiment} (${(comment.sentiment_score * 100).toFixed(1)}%)`}
                >
                  {sentimentEmoji[comment.sentiment]} {comment.sentiment}
                </span>
              )}
            </div>
            <div className="comment-date">
              {formatDate(comment.published_at)}
              {comment.status === 'deleted' && (
                <span className="deleted-badge" style={{ marginLeft: '8px' }}>
                  Gelöscht {formatDate(comment.deleted_at)}
                </span>
              )}
            </div>
          </div>
          <div className="comment-body">
            <div className="comment-text">{isExpanded ? fullText : snippet}</div>
            <div className="comment-meta">
              <span>👍 {comment.like_count}</span>
              {comment.updated_at !== comment.published_at && (
                <span>Bearb: {formatDate(comment.updated_at)}</span>
              )}
            </div>
            <button
              type="button"
              className="comment-toggle"
              onClick={() => toggleExpand(comment.id)}
              aria-expanded={isExpanded}
            >
              {isExpanded ? 'Weniger' : 'Mehr'}
            </button>
          </div>
        </div>
        {isExpanded && repliesMap[comment.comment_id] && (
          <div className="replies">
            {repliesMap[comment.comment_id].map((reply) => renderComment(reply, true))}
          </div>
        )}
      </div>
    );
  };

  const deletedCount = totals?.deleted ?? 0;
  const sentimentCounts = totals?.sentiment ?? { positive: 0, neutral: 0, negative: 0 };

  // Empty-state check must occur after hooks to satisfy rules-of-hooks
  if (!comments || comments.length === 0) {
    return <div className="empty-state">Keine Kommentare verfügbar</div>;
  }

  return (
    <div className="comments-wrapper">
      <div className="filter-controls compact">
        <div className="sort-control">
          <label htmlFor="status-mode">Status:</label>
          <select
            id="status-mode"
            value={mode}
            onChange={(e) => onModeChange && onModeChange(e.target.value)}
            className="sort-select"
          >
            <option value="all">Alle</option>
            <option value="active">Nur aktive</option>
            <option value="deleted">Nur gelöschte ({deletedCount})</option>
          </select>
        </div>
        <div className="sort-control">
          <label htmlFor="comment-sort">Sortieren:</label>
          <select 
            id="comment-sort" 
            value={currentSort || 'date_desc'} 
            onChange={(e) => onSortChange && onSortChange(e.target.value)}
            className="sort-select"
          >
            <option value="date_desc">Neueste zuerst</option>
            <option value="date_asc">Älteste zuerst</option>
            <option value="likes_desc">Meiste Likes</option>
            <option value="likes_asc">Wenigste Likes</option>
            <option value="sentiment_pos">Positivste zuerst</option>
            <option value="sentiment_neg">Negativste zuerst</option>
          </select>
        </div>
        <div className="sentiment-filters">
          <button 
            type="button" 
            className={`btn btn-secondary btn-small ${sentimentFilter === 'all' ? 'active' : ''}`}
            onClick={() => onSentimentChange && onSentimentChange('all')}
          >
            Alle
          </button>
          <button 
            type="button" 
            className={`btn btn-secondary btn-small ${sentimentFilter === 'positive' ? 'active' : ''}`}
            onClick={() => onSentimentChange && onSentimentChange('positive')}
            title={`${sentimentCounts.positive} positive`}
          >
            😊 ({sentimentCounts.positive})
          </button>
          <button 
            type="button" 
            className={`btn btn-secondary btn-small ${sentimentFilter === 'neutral' ? 'active' : ''}`}
            onClick={() => onSentimentChange && onSentimentChange('neutral')}
            title={`${sentimentCounts.neutral} neutral`}
          >
            😐 ({sentimentCounts.neutral})
          </button>
          <button 
            type="button" 
            className={`btn btn-secondary btn-small ${sentimentFilter === 'negative' ? 'active' : ''}`}
            onClick={() => onSentimentChange && onSentimentChange('negative')}
            title={`${sentimentCounts.negative} negative`}
          >
            😞 ({sentimentCounts.negative})
          </button>
        </div>
        <button type="button" className="btn btn-secondary btn-small" onClick={handleExpandAll}>
          {allExpanded ? 'Alle einklappen' : 'Alle ausklappen'}
        </button>
      </div>

      <div className="comments-list compact" ref={listRef}>
        {finalComments.map((comment) => renderComment(comment))}
        {/* Keep a stable loader area at the bottom to prevent scrollbar jump */}
        <div style={{height: hasMore ? 60 : 0}} ref={loaderRef}>
          {/* Sentinel for infinite scroll */}
          {hasMore && (
            <div ref={sentinelRef} style={{ height: 1 }} />
          )}
          {loading && hasMore && (
            <div style={{textAlign:'center',padding:'8px',color:'var(--muted)',fontSize:'.8rem'}}>Lade weitere…</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CommentsList;
