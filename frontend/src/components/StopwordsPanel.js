import React, { useEffect, useState } from 'react';
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

export default function StopwordsPanel() {
  const [custom, setCustom] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(`${API_BASE_URL}/admin/stopwords`);
      setCustom(res.data?.custom || []);
    } catch (e) {
      setError('Konnte Stopwords nicht laden');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const addWord = () => {
    const w = input.trim().toLowerCase();
    if (!w || w.length < 3) return;
    if (custom.includes(w)) return;
    setCustom([...custom, w]);
    setInput('');
  };

  const removeWord = (w) => {
    setCustom(custom.filter(x => x !== w));
  };

  const save = async () => {
    setSaved('');
    setError('');
    try {
      await axios.put(`${API_BASE_URL}/admin/stopwords`, { stopwords: custom });
      setSaved('Gespeichert');
    } catch (e) {
      setError('Speichern fehlgeschlagen');
    }
  };

  return (
    <div className="stopwords-panel">
      <div className="panel-header">
        <h2>🛡️ Stopwords</h2>
        <p className="panel-subtitle">Wörter, die bei der Keyword-Erkennung ignoriert werden</p>
      </div>
      {loading && <div className="loading">Lädt...</div>}
      {error && <div className="error">{error}</div>}
      {saved && <div className="success">{saved}</div>}

      <div className="stopwords-controls">
        <input
          type="text"
          placeholder="Wort hinzufügen (min. 3 Zeichen)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addWord(); }}
        />
        <button className="btn btn-primary" onClick={addWord}>Hinzufügen</button>
        <button className="btn btn-secondary" onClick={save}>Speichern</button>
      </div>

      <div className="stopwords-list">
        {custom.length === 0 ? (
          <div className="empty-state">Keine benutzerdefinierten Stopwords</div>
        ) : (
          <div className="chip-list">
            {custom.sort().map((w) => (
              <span key={w} className="chip">
                {w}
                <button className="chip-x" onClick={() => removeWord(w)} aria-label={`Entferne ${w}`}>×</button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
