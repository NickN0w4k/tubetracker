import React, { useMemo, useRef, useState } from 'react';
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

function MetricsChart({ metrics, videoTitle, channelTitle }) {
  const hasData = Array.isArray(metrics) && metrics.length > 0;
  const safeMetrics = Array.isArray(metrics) ? metrics : [];

  // UI toggles
  const [smooth, setSmooth] = useState(true);
  const [normalize, setNormalize] = useState(false); // Index 100
  const [growthPct, setGrowthPct] = useState(false); // % vs. erster Wert
  const [showLastPoint, setShowLastPoint] = useState(true);
  const [splitAxes, setSplitAxes] = useState(false); // getrennte Y-Achsen für Likes/Kommentare

  const labels = useMemo(() => (
    safeMetrics.map((m) => format(new Date(m.recorded_at), 'dd.MM.yyyy HH:mm', { locale: de }))
  ), [safeMetrics]);

  // base series
  const base = useMemo(() => ({
    views: safeMetrics.map((m) => m.view_count ?? null),
    likes: safeMetrics.map((m) => m.like_count ?? null),
    comments: safeMetrics.map((m) => m.comment_count ?? null),
  }), [safeMetrics]);

  // helpers
  const firstNonNull = (arr) => {
    for (let i = 0; i < arr.length; i++) if (arr[i] != null && isFinite(arr[i])) return arr[i];
    return null;
  };

  const scaleIndex100 = (arr) => {
    const baseVal = firstNonNull(arr);
    if (!baseVal || baseVal <= 0) return arr.map(v => (v == null ? null : 100));
    return arr.map(v => (v == null ? null : (v / baseVal) * 100));
  };

  const toGrowthPct = (arr) => {
    const baseVal = firstNonNull(arr);
    if (!baseVal || baseVal <= 0) return arr.map(v => (v == null ? null : 0));
    return arr.map(v => (v == null ? null : ((v / baseVal) - 1) * 100));
  };

  // mode selection (raw, index100, growth%)
  const transform = (arr) => {
    if (normalize) return scaleIndex100(arr);
    if (growthPct) return toGrowthPct(arr);
    return arr;
  };

  // Formatting
  const fmtNum = (v) => v == null ? '–' : v.toLocaleString('de-DE');
  const fmtPct = (v) => v == null ? '–' : `${v.toFixed(1)}%`;
  const isPercent = normalize || growthPct;

  // Gradients: scriptable backgroundColor
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

  // Datasets
  const viewsData = {
    labels,
    datasets: [
      mkDataset(
        'Aufrufe',
        transform(base.views),
        'rgb(75, 192, 192)',
        [
          { offset: 0, color: 'rgba(75, 192, 192, 0.35)' },
          { offset: 1, color: 'rgba(75, 192, 192, 0.05)' },
        ]
      ),
    ],
  };

  const engagementData = {
    labels,
    datasets: [
      {
        ...mkDataset(
          'Likes',
          transform(base.likes),
          'rgb(255, 99, 132)',
          [
            { offset: 0, color: 'rgba(255, 99, 132, 0.35)' },
            { offset: 1, color: 'rgba(255, 99, 132, 0.05)' },
          ]
        ),
        yAxisID: splitAxes ? 'yLikes' : 'y'
      },
      {
        ...mkDataset(
          'Kommentare',
          transform(base.comments),
          'rgb(54, 162, 235)',
          [
            { offset: 0, color: 'rgba(54, 162, 235, 0.35)' },
            { offset: 1, color: 'rgba(54, 162, 235, 0.05)' },
          ]
        ),
        yAxisID: splitAxes ? 'yComments' : 'y'
      }
    ],
  };

  // Custom tooltip
  const tooltip = {
    mode: 'index',
    intersect: false,
    callbacks: {
      label: (ctx) => {
        const raw = ctx.raw;
        const val = isPercent ? fmtPct(raw) : fmtNum(raw);
        return `${ctx.dataset.label}: ${val}`;
      },
      footer: (items) => {
        if (!growthPct) return '';
        // show delta since start for first item
        const it = items[0];
        const idx = it.dataIndex;
        const ds = it.dataset.data;
        const baseVal = firstNonNull(ds);
        const current = ds[idx];
        if (baseVal == null || current == null) return '';
        const delta = ((current / baseVal) - 1) * 100;
        const sign = delta >= 0 ? '+' : '';
        return `Δ seit Start: ${sign}${delta.toFixed(1)}%`;
      }
    }
  };

  // Axis formatting
  const optionsBase = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'nearest', axis: 'x', intersect: false },
    plugins: {
      legend: { position: 'top' },
      tooltip,
      lastPointLabel: { isPercent, show: showLastPoint },
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

  // Last-point label plugin
  const lastPointLabel = {
    id: 'lastPointLabel',
    afterDatasetsDraw(chart, _args, pluginOptions) {
      if (!pluginOptions?.show) return;
      const { ctx } = chart;
      const { datasets } = chart.data;
      const isPct = pluginOptions?.isPercent;
      ctx.save();
      datasets.forEach((ds, di) => {
        const meta = chart.getDatasetMeta(di);
        if (!meta || !meta.data) return;
        const arr = ds.data || [];
        // find last non-null
        let lastIndex = -1;
        for (let i = arr.length - 1; i >= 0; i--) {
          if (arr[i] != null && isFinite(arr[i])) { lastIndex = i; break; }
        }
        if (lastIndex < 0 || !meta.data[lastIndex]) return;
        const pt = meta.data[lastIndex];
        const { x, y } = pt.getProps(['x','y'], true);
        const valStr = isPct ? fmtPct(arr[lastIndex]) : fmtNum(arr[lastIndex]);
        const text = `${ds.label}: ${valStr}`;
        // draw pill label
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

  // refs and helpers for export & reset
  const viewsRef = useRef(null);
  const engagementRef = useRef(null);

  function exportCanvasWithHeader(canvas, filename, videoTitleLine, channelLine, metricLabel) {
    if (!canvas) return;
    const headerH = 120; // room for three lines
    const w = canvas.width;
    const h = canvas.height + headerH;
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const ctx = off.getContext('2d');
    // background
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, w, h);
    // header bar
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, 0, w, headerH);
    // title line
    ctx.fillStyle = '#e6eef8';
    ctx.font = 'bold 20px Inter, system-ui, -apple-system, Segoe UI, Roboto';
    ctx.fillText(videoTitleLine || 'Video', 16, 34);
    // channel line
    if (channelLine) {
      ctx.font = '14px Inter, system-ui, -apple-system, Segoe UI, Roboto';
      ctx.fillStyle = '#cfd6e2';
      ctx.fillText(channelLine, 16, 60);
    }
    // metric label line
    if (metricLabel) {
      ctx.font = '13px Inter, system-ui, -apple-system, Segoe UI, Roboto';
      ctx.fillStyle = '#aeb7c4';
      ctx.fillText(metricLabel, 16, 84);
    }
    // draw chart below header
    ctx.drawImage(canvas, 0, headerH, w, canvas.height);
    const url = off.toDataURL('image/png');
    const a = document.createElement('a'); a.href = url; a.download = filename || 'chart.png'; a.click();
  }

  return (
    <div>
      <div className="chart-controls">
        <label className="control-item">
          <input type="checkbox" checked={smooth} onChange={(e) => setSmooth(e.target.checked)} /> Glätten
        </label>
        <label className="control-item">
          <input type="checkbox" checked={normalize} onChange={(e) => { setNormalize(e.target.checked); if (e.target.checked) setGrowthPct(false); }} /> Skalieren (Index 100)
        </label>
        <label className="control-item">
          <input type="checkbox" checked={growthPct} onChange={(e) => { setGrowthPct(e.target.checked); if (e.target.checked) setNormalize(false); }} /> Wachstum %
        </label>
        <label className="control-item">
          <input type="checkbox" checked={showLastPoint} onChange={(e) => setShowLastPoint(e.target.checked)} /> Letzten Punkt beschriften
        </label>
        <label className="control-item">
          <input type="checkbox" checked={splitAxes} onChange={(e) => setSplitAxes(e.target.checked)} /> Getrennte Achsen (Likes/Kommentare)
        </label>
        <button
          type="button"
          className="control-item"
          style={{border:'1px solid rgba(255,255,255,0.15)',padding:'4px 10px',borderRadius:'8px',background:'transparent'}}
          onClick={() => {
            const c1 = viewsRef.current; const c2 = engagementRef.current;
            if (c1?.resetZoom) c1.resetZoom();
            if (c2?.resetZoom) c2.resetZoom();
          }}
        >Reset Zoom</button>
      </div>

      {!hasData ? (
        <div className="empty-state">Keine Metrikdaten verfügbar</div>
      ) : (
        <>
          <h3 style={{ marginBottom: '10px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span>Aufrufe im Zeitverlauf{isPercent ? ' (Prozentansicht)' : ''}</span>
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={() => {
                const canvas = viewsRef.current?.canvas;
                const vTitle = `${videoTitle || ''}`.trim();
                const cTitle = `${channelTitle || ''}`.trim();
                exportCanvasWithHeader(canvas, 'metriken_aufrufe.png', vTitle, cTitle, 'Aufrufe');
              }}
            >Export PNG</button>
          </h3>
          <div className="chart-container">
            <Line ref={viewsRef} options={optionsBase} data={viewsData} plugins={[lastPointLabel]} />
          </div>

          <h3 style={{ marginBottom: '10px', marginTop: '24px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span>Engagement im Zeitverlauf{isPercent ? ' (Prozentansicht)' : ''}</span>
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={() => {
                const canvas = engagementRef.current?.canvas;
                const vTitle = `${videoTitle || ''}`.trim();
                const cTitle = `${channelTitle || ''}`.trim();
                exportCanvasWithHeader(canvas, 'metriken_engagement.png', vTitle, cTitle, 'Likes & Kommentare');
              }}
            >Export PNG</button>
          </h3>
          <div className="chart-container">
            <Line ref={engagementRef} options={optionsBase} data={engagementData} plugins={[lastPointLabel]} />
          </div>
        </>
      )}
    </div>
  );
}

export default MetricsChart;
