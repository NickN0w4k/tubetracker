import React, { useState, useMemo, useRef } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  zoomPlugin
);

function MetricsCompareChart({ baseVideo, compareVideo, aligned, normalize = false }) {
  const hasData = aligned && aligned.timestamps && aligned.timestamps.length > 0;
  const timestamps = hasData ? aligned.timestamps : [];

  // Toggles (mirror single metrics chart)
  const [smooth, setSmooth] = useState(true);
  const [indexMode, setIndexMode] = useState(normalize); // start with prop
  const [growthPct, setGrowthPct] = useState(false);
  const [showLastPoint, setShowLastPoint] = useState(true);
  const [splitAxes, setSplitAxes] = useState(false);
  const viewsRef = useRef(null);
  const likesCommentsRef = useRef(null);

  const isPercent = indexMode || growthPct;

  const labels = timestamps.map(ts => {
    try {
      return format(new Date(ts), 'dd.MM.yyyy HH:mm', { locale: de });
    } catch {
      return ts;
    }
  });
  // Helpers
  const firstNonNull = (arr) => {
    for (let i = 0; i < arr.length; i++) if (arr[i] != null && isFinite(arr[i])) return arr[i];
    return null;
  };

  const toIndex100 = (arr) => {
    if (!indexMode) return arr;
    const base = firstNonNull(arr);
    if (!base || base <= 0) return arr.map(v => (v == null ? null : 100));
    return arr.map(v => (v == null ? null : (v / base) * 100));
  };
  const toGrowthPct = (arr) => {
    if (!growthPct) return arr;
    const base = firstNonNull(arr);
    if (!base || base <= 0) return arr.map(v => (v == null ? null : 0));
    return arr.map(v => (v == null ? null : ((v / base) - 1) * 100));
  };
  const transform = (arr) => {
    let out = arr;
    if (indexMode) out = toIndex100(out);
    if (growthPct) out = toGrowthPct(arr); // growth overrides index scaling for clarity
    return out;
  };

  const gradientFill = (colorStops) => (ctx) => {
    const chart = ctx.chart; const {ctx: c, chartArea} = chart;
    if (!chartArea) return 'transparent';
    const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    for (const stop of colorStops) g.addColorStop(stop.offset, stop.color);
    return g;
  };
  const mkDataset = (label, data, baseColor, fillStops) => ({
    label,
    data,
    borderColor: baseColor,
    backgroundColor: gradientFill(fillStops),
    fill: true,
    tension: smooth ? 0.25 : 0,
    spanGaps: true,
    pointRadius: 0,
    pointHoverRadius: 3,
  });

  // Use backend-provided aligned arrays directly (already sampled server-side)
  const v1_views = hasData ? aligned.video1.view_count : [];
  const v2_views = hasData ? aligned.video2.view_count : [];
  const v1_likes = hasData ? aligned.video1.like_count : [];
  const v2_likes = hasData ? aligned.video2.like_count : [];
  const v1_comments = hasData ? aligned.video1.comment_count : [];
  const v2_comments = hasData ? aligned.video2.comment_count : [];

  const viewsData = {
    labels,
    datasets: [
      mkDataset(
        `${baseVideo.title} Aufrufe`,
        transform(v1_views),
        'rgb(75, 192, 192)',
        [ {offset:0,color:'rgba(75,192,192,0.35)'},{offset:1,color:'rgba(75,192,192,0.05)'} ]
      ),
      mkDataset(
        `${compareVideo.title} Aufrufe`,
        transform(v2_views),
        'rgb(153, 102, 255)',
        [ {offset:0,color:'rgba(153,102,255,0.35)'},{offset:1,color:'rgba(153,102,255,0.05)'} ]
      ),
    ],
  };

  const likesCommentsData = {
    labels,
    datasets: [
      {
        ...mkDataset(`${baseVideo.title} Likes`, transform(v1_likes), 'rgb(255, 99, 132)', [ {offset:0,color:'rgba(255,99,132,0.35)'},{offset:1,color:'rgba(255,99,132,0.05)'} ]),
        yAxisID: splitAxes ? 'yLikes' : 'y'
      },
      {
        ...mkDataset(`${compareVideo.title} Likes`, transform(v2_likes), 'rgb(255, 159, 64)', [ {offset:0,color:'rgba(255,159,64,0.35)'},{offset:1,color:'rgba(255,159,64,0.05)'} ]),
        yAxisID: splitAxes ? 'yLikes' : 'y'
      },
      {
        ...mkDataset(`${baseVideo.title} Kommentare`, transform(v1_comments), 'rgb(54, 162, 235)', [ {offset:0,color:'rgba(54,162,235,0.35)'},{offset:1,color:'rgba(54,162,235,0.05)'} ]),
        yAxisID: splitAxes ? 'yComments' : 'y'
      },
      {
        ...mkDataset(`${compareVideo.title} Kommentare`, transform(v2_comments), 'rgb(255, 205, 86)', [ {offset:0,color:'rgba(255,205,86,0.35)'},{offset:1,color:'rgba(255,205,86,0.05)'} ]),
        yAxisID: splitAxes ? 'yComments' : 'y'
      }
    ],
  };

  const fmtNum = (v) => v == null ? '–' : v.toLocaleString('de-DE');
  const fmtPct = (v) => v == null ? '–' : `${v.toFixed(1)}%`;

  const tooltip = {
    mode: 'index',
    intersect: false,
    callbacks: {
      label: (ctx) => `${ctx.dataset.label}: ${isPercent ? fmtPct(ctx.raw) : fmtNum(ctx.raw)}`,
      footer: (items) => {
        if (!growthPct) return '';
        const it = items[0];
        const ds = it.dataset.data;
        const idx = it.dataIndex;
        const baseVal = firstNonNull(ds);
        const current = ds[idx];
        if (baseVal == null || current == null) return '';
        const delta = ((current / baseVal) - 1) * 100;
        const sign = delta >= 0 ? '+' : '';
        return `Δ seit Start: ${sign}${delta.toFixed(1)}%`;
      }
    }
  };

  const lastPointLabel = {
    id: 'lastPointLabelCompare',
    afterDatasetsDraw(chart, _args, pluginOptions) {
      if (!pluginOptions?.show) return;
      const { ctx } = chart; const { datasets } = chart.data;
      ctx.save();
      datasets.forEach((ds, di) => {
        const meta = chart.getDatasetMeta(di);
        if (!meta || !meta.data) return;
        const arr = ds.data || [];
        let lastIndex = -1;
        for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null && isFinite(arr[i])) { lastIndex = i; break; }
        if (lastIndex < 0) return;
        const el = meta.data[lastIndex];
        if (!el) return;
        const { x, y } = el.getProps(['x','y'], true);
        const isPct = pluginOptions?.isPercent;
        const valStr = isPct ? fmtPct(arr[lastIndex]) : fmtNum(arr[lastIndex]);
        const text = `${ds.label}: ${valStr}`;
        const padding = 6; const r = 6;
        ctx.font = '12px Inter, system-ui, -apple-system, Segoe UI, Roboto';
        const textW = ctx.measureText(text).width;
        const w = textW + padding * 2; const h = 22;
        const bx = Math.min(Math.max(x - w / 2, chart.chartArea.left + 4), chart.chartArea.right - w - 4);
        const by = Math.max(y - h - 8, chart.chartArea.top + 4);
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath();
        ctx.moveTo(bx + r, by);
        ctx.arcTo(bx + w, by, bx + w, by + h, r);
        ctx.arcTo(bx + w, by + h, bx, by + h, r);
        ctx.arcTo(bx, by + h, bx, by, r);
        ctx.arcTo(bx, by, bx + w, by, r);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillText(text, bx + padding, by + h/2 + 4);
      });
      ctx.restore();
    }
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'nearest', axis: 'x', intersect: false },
    plugins: {
      legend: { position: 'top' },
      tooltip,
      lastPointLabelCompare: { isPercent, show: showLastPoint },
      zoom: {
        zoom: {
          wheel: { enabled: true },
          pinch: { enabled: true },
          mode: 'x'
        },
        pan: { enabled: true, mode: 'x' }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { callback: (v) => (isPercent ? `${v}%` : v) }
      },
      ...(splitAxes ? {
        yLikes: {
          position: 'left',
          beginAtZero: true,
          grid: { drawOnChartArea: true },
          ticks: { callback: (v) => (isPercent ? `${v}%` : v) }
        },
        yComments: {
          position: 'right',
          beginAtZero: true,
          grid: { drawOnChartArea: false },
          ticks: { callback: (v) => (isPercent ? `${v}%` : v) }
        }
      } : {})
    }
  };

  function exportCanvasWithHeader(canvas, filename, headerTitle, headerSubtitle) {
    if (!canvas) return;
    const headerH = 70;
    const w = canvas.width;
    const h = canvas.height + headerH;
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const ctx = off.getContext('2d');
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, 0, w, headerH);
    ctx.fillStyle = '#e6eef8';
    ctx.font = 'bold 18px Inter, system-ui, -apple-system, Segoe UI, Roboto';
    ctx.fillText(headerTitle || 'TubeTracker', 16, 28);
    if (headerSubtitle) {
      ctx.font = '13px Inter, system-ui, -apple-system, Segoe UI, Roboto';
      ctx.fillStyle = '#cfd6e2';
      ctx.fillText(headerSubtitle, 16, 48);
    }
    ctx.drawImage(canvas, 0, headerH, w, canvas.height);
    const url = off.toDataURL('image/png');
    const a = document.createElement('a'); a.href = url; a.download = filename || 'vergleich.png'; a.click();
  }

  function exportCanvasWithTwoTitles(canvas, filename, titleLine1, titleLine2, subtitle, channel1, channel2) {
    if (!canvas) return;
    const headerH = 150; // taller to fit stacked titles + channel names + subtitle
    const w = canvas.width;
    const h = canvas.height + headerH;
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const ctx = off.getContext('2d');
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, 0, w, headerH);
    ctx.fillStyle = '#e6eef8';
    ctx.font = 'bold 18px Inter, system-ui, -apple-system, Segoe UI, Roboto';
    // First video title and channel stacked
    ctx.fillText(titleLine1 || 'Video 1', 16, 26);
    ctx.font = '12px Inter, system-ui, -apple-system, Segoe UI, Roboto';
    ctx.fillStyle = '#cfd6e2';
    if (channel1) ctx.fillText(channel1, 16, 44);
    // Second video title and channel stacked
    ctx.fillStyle = '#e6eef8';
    ctx.font = 'bold 18px Inter, system-ui, -apple-system, Segoe UI, Roboto';
    ctx.fillText(titleLine2 || 'Video 2', 16, 72);
    ctx.font = '12px Inter, system-ui, -apple-system, Segoe UI, Roboto';
    ctx.fillStyle = '#cfd6e2';
    if (channel2) ctx.fillText(channel2, 16, 90);
    // Subtitle
    if (subtitle) {
      ctx.font = '13px Inter, system-ui, -apple-system, Segoe UI, Roboto';
      ctx.fillStyle = '#aeb7c4';
      ctx.fillText(subtitle, 16, 116);
    }
    ctx.drawImage(canvas, 0, headerH, w, canvas.height);
    const url = off.toDataURL('image/png');
    const a = document.createElement('a'); a.href = url; a.download = filename || 'vergleich.png'; a.click();
  }

  return (
    <div className="compare-wrapper">
      <div className="chart-controls" style={{marginBottom:'8px'}}>
        <label className="control-item">
          <input type="checkbox" checked={smooth} onChange={e => setSmooth(e.target.checked)} /> Glätten
        </label>
        <label className="control-item">
          <input type="checkbox" checked={indexMode} onChange={e => { setIndexMode(e.target.checked); if (e.target.checked) setGrowthPct(false); }} /> Index 100
        </label>
        <label className="control-item">
          <input type="checkbox" checked={growthPct} onChange={e => { setGrowthPct(e.target.checked); if (e.target.checked) setIndexMode(false); }} /> Wachstum %
        </label>
        <label className="control-item">
          <input type="checkbox" checked={showLastPoint} onChange={e => setShowLastPoint(e.target.checked)} /> Letzten Punkt
        </label>
        <label className="control-item">
          <input type="checkbox" checked={splitAxes} onChange={e => setSplitAxes(e.target.checked)} /> Getrennte Achsen
        </label>
        <button
          type="button"
          className="control-item"
          style={{border:'1px solid rgba(255,255,255,0.15)',padding:'4px 10px',borderRadius:'8px',background:'transparent'}}
          onClick={() => {
            const c1 = viewsRef.current; const c2 = likesCommentsRef.current;
            if (c1?.resetZoom) c1.resetZoom();
            if (c2?.resetZoom) c2.resetZoom();
          }}
        >Reset Zoom</button>
      </div>
      {!hasData ? (
        <div className="empty-state">Keine Vergleichsdaten</div>
      ) : (
        <>
          <h3 style={{ marginBottom: '15px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span>Vergleich: Aufrufe{isPercent ? ' (Prozentansicht)' : ''}</span>
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={() => {
                const canvas = viewsRef.current?.canvas;
                const t1 = baseVideo?.title || 'Video 1';
                const t2 = compareVideo?.title || 'Video 2';
                const c1 = baseVideo?.channel_title || baseVideo?.channelTitle || '';
                const c2 = compareVideo?.channel_title || compareVideo?.channelTitle || '';
                exportCanvasWithTwoTitles(canvas, 'vergleich_aufrufe.png', t1, t2, 'Aufrufe', c1, c2);
              }}
            >Export PNG</button>
          </h3>
          <div className="chart-container">
            <Line ref={viewsRef} options={options} data={viewsData} plugins={[lastPointLabel]} />
          </div>
          <h3 style={{ marginBottom: '15px', marginTop: '30px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span>Vergleich: Likes & Kommentare{isPercent ? ' (Prozentansicht)' : ''}</span>
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={() => {
                const canvas = likesCommentsRef.current?.canvas;
                const t1 = baseVideo?.title || 'Video 1';
                const t2 = compareVideo?.title || 'Video 2';
                const c1 = baseVideo?.channel_title || baseVideo?.channelTitle || '';
                const c2 = compareVideo?.channel_title || compareVideo?.channelTitle || '';
                exportCanvasWithTwoTitles(canvas, 'vergleich_engagement.png', t1, t2, 'Likes & Kommentare', c1, c2);
              }}
            >Export PNG</button>
          </h3>
            <div className="chart-container">
              <Line ref={likesCommentsRef} options={options} data={likesCommentsData} plugins={[lastPointLabel]} />
            </div>
        </>
      )}
    </div>
  );
}

export default MetricsCompareChart;
