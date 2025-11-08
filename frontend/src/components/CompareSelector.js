import React, { useEffect, useMemo, useRef, useState } from 'react';

function useClickOutside(ref, onClose) {
  useEffect(() => {
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose?.();
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [ref, onClose]);
}

export default function CompareSelector({
  allVideos = [],
  currentVideoId,
  value,
  onChange,
  buttonLabel = 'Vergleichen mit',
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);
  useClickOutside(rootRef, () => setOpen(false));

  const options = useMemo(() => {
    const others = (allVideos || []).filter(v => v.id !== currentVideoId);
    if (!query.trim()) return others;
    const q = query.toLowerCase();
    return others.filter(v => (
      (v.title || '').toLowerCase().includes(q) ||
      (v.channel_title || '').toLowerCase().includes(q)
    ));
  }, [allVideos, currentVideoId, query]);

  const selected = useMemo(() => (allVideos || []).find(v => v.id === value), [allVideos, value]);

  return (
    <div className="compare-selector" ref={rootRef}>
      <button type="button" className="compare-button" onClick={() => setOpen(o => !o)}>
        {selected ? (
          <span className="compare-selected">
            <img src={selected.thumbnail_url || 'https://via.placeholder.com/48x27?text=No+Thumb'} alt="thumb"/>
            <span className="meta">
              <span className="title" title={selected.title}>{selected.title}</span>
              <span className="channel">{selected.channel_title}</span>
            </span>
          </span>
        ) : (
          <span className="placeholder">{buttonLabel}</span>
        )}
        <span className="chevron">▾</span>
      </button>
      {open && (
        <div className="compare-panel">
          <div className="compare-search">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Videos suchen..."
            />
            {value != null && (
              <button className="clear" onClick={() => { onChange?.(null); setOpen(false); }}>Kein Vergleich</button>
            )}
          </div>
          <div className="compare-list">
            {options.length === 0 && (
              <div className="empty">Keine Treffer</div>
            )}
            {options.map(v => (
              <button key={v.id} className="compare-item" onClick={() => { onChange?.(v.id); setOpen(false); }}>
                <img src={v.thumbnail_url || 'https://via.placeholder.com/64x36?text=No+Thumb'} alt="thumb"/>
                <div className="meta">
                  <div className="title" title={v.title}>{v.title}</div>
                  <div className="channel">{v.channel_title}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
