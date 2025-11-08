import React from 'react';

function StatsCard({ title, value }) {
  return (
    <div className="stat-card">
      <h3>{title}</h3>
      <div className="value">{value.toLocaleString()}</div>
    </div>
  );
}

export default StatsCard;
