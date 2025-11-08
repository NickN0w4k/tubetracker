import React from 'react';

function StatsBar({ stats }) {
  const items = [
    { key: 'total_videos', label: 'Videos', icon: '🎞️' },
    { key: 'total_comments', label: 'Kommentare', icon: '💬' },
    { key: 'deleted_comments', label: 'Gelöscht', icon: '🗑️' }
  ];

  return (
    <div className="stats-bar" role="list" aria-label="Statistiken Übersicht">
      {items.map(item => (
        <div className="stat-chip" role="listitem" key={item.key}>
          <span className="stat-icon" aria-hidden="true">{item.icon}</span>
          <span className="stat-metric">
            <span className="stat-value">{(stats[item.key] || 0).toLocaleString()}</span>
            <span className="stat-label">{item.label}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

export default StatsBar;
