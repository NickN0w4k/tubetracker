import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

function KeywordsPanel({ videoId, initialKeywords = [] }) {
  const [keywords, setKeywords] = useState(initialKeywords);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialKeywords.length > 0) {
      setKeywords(initialKeywords);
    }
  }, [initialKeywords]);

  if (loading) {
    return <div className="loading">Lädt Keywords...</div>;
  }

  return (
    <div className="keywords-section">
      <h3>� Top Keywords aus Kommentaren</h3>
      {keywords.length === 0 ? (
        <div className="empty-state">Keine Keywords verfügbar</div>
      ) : (
        <div className="keyword-grid">
          {keywords.map((kw) => (
            <div key={kw.term} className="keyword-card">
              <div className="keyword-term">{kw.term}</div>
              <div className="keyword-stats">
                <span className="stat-badge">
                  {kw.occurrence_count}× Vorkommen
                </span>
                <span className="stat-badge secondary">
                  {kw.comment_count} Kommentare
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default KeywordsPanel;
