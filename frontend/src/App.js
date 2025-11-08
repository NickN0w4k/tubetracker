import React, { useState, useEffect } from 'react';
import axios from 'axios';
import VideoTile from './components/VideoTile';
import VideoDetailModal from './components/VideoDetailModal';
import StatsBar from './components/StatsBar';
import './App.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

function App() {
  const [videos, setVideos] = useState([]);
  const [stats, setStats] = useState({});
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [darkMode, setDarkMode] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('tt:darkMode')) || false;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle('theme-dark', darkMode);
    try {
      localStorage.setItem('tt:darkMode', JSON.stringify(darkMode));
    } catch {}
  }, [darkMode]);

  useEffect(() => {
    fetchVideos();
    fetchStats();
  }, []);

  const fetchVideos = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/videos`);
      setVideos(response.data);
      setLoading(false);
    } catch (err) {
      setError('Fehler beim Laden der Videos');
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/stats`);
      setStats(response.data);
    } catch (err) {
      console.error('Fehler beim Laden der Statistiken', err);
    }
  };

  const handleAddVideo = async (e) => {
    e.preventDefault();
    if (!newVideoUrl.trim()) return;

    setError('');
    setSuccess('');

    try {
      await axios.post(`${API_BASE_URL}/videos`, { url: newVideoUrl });
      setSuccess('Video erfolgreich hinzugefügt!');
      setNewVideoUrl('');
      fetchVideos();
      fetchStats();
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Hinzufügen des Videos');
    }
  };

  const handleDeleteVideo = async (videoId) => {
    if (!window.confirm('Möchten Sie dieses Video wirklich entfernen?')) return;

    try {
      await axios.delete(`${API_BASE_URL}/videos/${videoId}`);
      fetchVideos();
      fetchStats();
    } catch (err) {
      setError('Fehler beim Entfernen des Videos');
    }
  };

  const handleSyncVideo = async (videoId) => {
    try {
      await axios.post(`${API_BASE_URL}/videos/${videoId}/sync`);
      setSuccess('Video erfolgreich synchronisiert!');
      fetchVideos();
    } catch (err) {
      setError('Fehler bei der Synchronisierung');
    }
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <h1>TubeTracker</h1>
          <p>YouTube Video Archive & Analytics</p>
        </div>
        {/* removed theme toggle per request */}
      </header>

      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      <StatsBar stats={stats} />

      <section className="add-video-section">
        <h2>Neues Video hinzufügen</h2>
        <form onSubmit={handleAddVideo} className="add-video-form">
          <input
            type="text"
            placeholder="YouTube Video URL oder Video-ID eingeben..."
            value={newVideoUrl}
            onChange={(e) => setNewVideoUrl(e.target.value)}
          />
          <button type="submit" className="btn btn-primary">
            Hinzufügen
          </button>
        </form>
      </section>

      {loading ? (
        <div className="loading">Lade Videos...</div>
      ) : videos.length === 0 ? (
        <div className="empty-state">
          <h3>Noch keine Videos getrackt</h3>
          <p>Fügen Sie ein Video hinzu, um mit dem Tracking zu beginnen.</p>
        </div>
      ) : (
        <div className="videos-grid">
          {videos.map((video) => (
            <VideoTile
              key={video.id}
              video={video}
              onClick={(v) => setSelectedVideo(v)}
            />
          ))}
        </div>
      )}

      {selectedVideo && (
        <VideoDetailModal
          video={selectedVideo}
          onClose={() => setSelectedVideo(null)}
          onDelete={handleDeleteVideo}
          onSync={handleSyncVideo}
          allVideos={videos}
        />
      )}
    </div>
  );
}

export default App;
