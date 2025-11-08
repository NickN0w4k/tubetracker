import React from 'react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

function VideoTile({ video, onClick }) {
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return format(new Date(dateString), 'dd.MM.yy HH:mm', { locale: de });
    } catch {
      return 'N/A';
    }
  };

  const formatNumber = (num) => {
    if (num == null) return '0';
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return num.toString();
  };

  return (
    <div className="video-tile" onClick={() => onClick(video)}>
      <div className="tile-thumb-wrapper">
        <img
          src={video.thumbnail_url || 'https://via.placeholder.com/320x180?text=No+Thumbnail'}
          alt={video.title}
          className="tile-thumb"
        />
        <div className="tile-overlay">
          <span className="tile-sync">🔄 {formatDate(video.last_synced)}</span>
        </div>
      </div>
      <div className="tile-content">
        <h3 className="tile-title" title={video.title}>{video.title}</h3>
        <p className="tile-channel">{video.channel_title}</p>
        <div className="tile-stats">
          <span className="tile-stat" title="Aufrufe">
            <span className="stat-icon">👁️</span>
            <span className="stat-value">{formatNumber(video.latest_views || 0)}</span>
          </span>
          <span className="tile-stat" title="Likes">
            <span className="stat-icon">👍</span>
            <span className="stat-value">{formatNumber(video.latest_likes || 0)}</span>
          </span>
          <span className="tile-stat" title="Kommentare">
            <span className="stat-icon">💬</span>
            <span className="stat-value">{formatNumber(video.latest_comments || 0)}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

export default VideoTile;
