// Chart.js theming + small builders (neon glow lines, gradient areas, doughnut with centre text).
const Chart = window.Chart;
let registry = [];

export const PALETTE = ['#00e5ff', '#8b5cff', '#ff3d9a', '#ffb020', '#00e676', '#4d7cff', '#ff6d00', '#ff3d71'];
export const STATUS_COLORS = {
  Pending: '#ffb020', 'Under Review': '#4d7cff', Verified: '#00e5ff', Rejected: '#ff3d71', Appealed: '#8b5cff', Closed: '#00e676',
};
export const PRIORITY_COLORS = { Critical: '#ff3d71', High: '#ff6d00', Medium: '#ffb020', Low: '#00e676' };

const neon = {
  id: 'neon',
  beforeDatasetDraw(chart, args) {
    if (args.meta.type !== 'line') return;
    const { ctx } = chart; ctx.save();
    ctx.shadowColor = chart.data.datasets[args.index].borderColor; ctx.shadowBlur = 16;
  },
  afterDatasetDraw(chart, args) { if (args.meta.type === 'line') chart.ctx.restore(); },
};

const centerText = {
  id: 'centerText',
  afterDraw(chart, _a, opts) {
    if (!opts || !opts.text) return;
    const { ctx, chartArea: { left, right, top, bottom } } = chart;
    const cx = (left + right) / 2; const cy = (top + bottom) / 2;
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff'; ctx.font = '700 28px "Space Grotesk", Inter, sans-serif';
    ctx.shadowColor = 'rgba(0,229,255,.7)'; ctx.shadowBlur = 16;
    ctx.fillText(opts.text, cx, cy - (opts.sub ? 8 : 0));
    if (opts.sub) { ctx.shadowBlur = 0; ctx.fillStyle = '#8f9cd6'; ctx.font = '500 12px Inter, sans-serif'; ctx.fillText(opts.sub, cx, cy + 17); }
    ctx.restore();
  },
};

export function initCharts() {
  if (!Chart) return;
  Chart.register(neon, centerText);
  const d = Chart.defaults;
  d.color = '#9fb0ea';
  d.font.family = 'Inter, system-ui, sans-serif';
  d.font.size = 12;
  d.borderColor = 'rgba(158,178,255,.1)';
  d.maintainAspectRatio = false;
  d.animation = { duration: 1100, easing: 'easeOutQuart' };
  d.animations.colors = false; // gradients (CanvasGradient) cannot be tweened between frames
  d.plugins.legend.labels.usePointStyle = true;
  d.plugins.legend.labels.boxWidth = 8;
  d.plugins.legend.labels.boxHeight = 8;
  d.plugins.legend.labels.padding = 14;
  Object.assign(d.plugins.tooltip, {
    backgroundColor: 'rgba(8,12,40,.94)', borderColor: 'rgba(0,229,255,.5)', borderWidth: 1, padding: 12, cornerRadius: 12,
    titleColor: '#fff', bodyColor: '#c4cdf5', titleFont: { weight: '700', size: 13 }, boxPadding: 5, usePointStyle: true,
  });
}

export function mk(canvas, config) {
  if (!Chart || !canvas) return null;
  const ch = new Chart(canvas, config);
  registry.push(ch);
  return ch;
}
export function destroyCharts() { registry.forEach((c) => { try { c.destroy(); } catch (_) { /* already gone */ } }); registry = []; }

const hexA = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const areaFill = (color, a1 = .42) => (c) => {
  const { ctx, chartArea } = c.chart;
  if (!chartArea) return hexA(color, .2);
  const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
  g.addColorStop(0, hexA(color, a1)); g.addColorStop(1, hexA(color, 0));
  return g;
};
const barFill = (color, horiz = false) => (c) => {
  const { ctx, chartArea } = c.chart;
  if (!chartArea) return color;
  const g = horiz ? ctx.createLinearGradient(chartArea.left, 0, chartArea.right, 0) : ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
  g.addColorStop(0, hexA(color, .25)); g.addColorStop(1, color);
  return g;
};

const scales = (extra = {}) => ({
  x: { grid: { display: false }, border: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 14 }, ...(extra.x || {}) },
  y: { beginAtZero: true, border: { display: false }, grid: { color: 'rgba(158,178,255,.08)' }, ticks: { precision: 0, maxTicksLimit: 5 }, ...(extra.y || {}) },
});

export function lineArea(canvas, labels, data, { color = '#00e5ff', label = 'Violations', fill = true, tension = .38 } = {}) {
  return mk(canvas, {
    type: 'line',
    data: { labels, datasets: [{ label, data, borderColor: color, backgroundColor: fill ? areaFill(color) : 'transparent', borderWidth: 2.6, fill, tension, pointRadius: 0, pointHoverRadius: 6, pointHoverBackgroundColor: '#fff', pointHoverBorderColor: color, pointHoverBorderWidth: 3 }] },
    options: { interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: false } }, scales: scales() },
  });
}

export function sparkline(canvas, data, color = '#00e5ff') {
  return mk(canvas, {
    type: 'line',
    data: { labels: data.map((_, i) => i), datasets: [{ data, borderColor: color, backgroundColor: areaFill(color, .35), fill: true, borderWidth: 2, tension: .4, pointRadius: 0 }] },
    options: { animation: { duration: 900 }, events: [], plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false, beginAtZero: true } }, layout: { padding: 0 } },
  });
}

export function bars(canvas, labels, data, { color = '#8b5cff', label = 'Count', colors, horizontal = false, radius = 8 } = {}) {
  return mk(canvas, {
    type: 'bar',
    data: { labels, datasets: [{ label, data, backgroundColor: colors ? (c) => barFill(colors[c.dataIndex] || color, horizontal)(c) : barFill(color, horizontal), borderRadius: radius, borderSkipped: false, maxBarThickness: horizontal ? 18 : 34 }] },
    options: { indexAxis: horizontal ? 'y' : 'x', plugins: { legend: { display: false } }, scales: horizontal ? { x: scales().y, y: { ...scales().x, ticks: { autoSkip: false } } } : scales() },
  });
}

export function doughnut(canvas, labels, data, { colors = PALETTE, center, sub, cutout = '70%' } = {}) {
  return mk(canvas, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors.map((c) => hexA(c, .85)), borderColor: 'rgba(5,8,32,.9)', borderWidth: 3, hoverBackgroundColor: colors, hoverOffset: 8 }] },
    options: { cutout, plugins: { legend: { position: 'bottom' }, centerText: { text: center, sub } } },
  });
}

export function gauge(canvas, percent, color = '#00e676') {
  return mk(canvas, {
    type: 'doughnut',
    data: { datasets: [{ data: [percent, 100 - percent], backgroundColor: [color, 'rgba(255,255,255,.07)'], borderWidth: 0, borderRadius: [14, 0] }] },
    options: { rotation: -110, circumference: 220, cutout: '80%', events: [], plugins: { legend: { display: false }, tooltip: { enabled: false }, centerText: { text: `${percent}%`, sub: 'collected' } } },
  });
}

export function comboBarLine(canvas, labels, barData, lineData, { barLabel = 'Violations', lineLabel = 'Collected (₹)' } = {}) {
  return mk(canvas, {
    data: { labels, datasets: [
      { type: 'bar', label: barLabel, data: barData, backgroundColor: barFill('#4d7cff'), borderRadius: 8, borderSkipped: false, maxBarThickness: 40, yAxisID: 'y' },
      { type: 'line', label: lineLabel, data: lineData, borderColor: '#00e676', backgroundColor: 'transparent', borderWidth: 2.6, tension: .4, pointRadius: 4, pointBackgroundColor: '#050820', pointBorderColor: '#00e676', pointBorderWidth: 2, yAxisID: 'y2' },
    ] },
    options: {
      interaction: { mode: 'index', intersect: false },
      scales: { ...scales(), y2: { position: 'right', beginAtZero: true, grid: { display: false }, border: { display: false }, ticks: { maxTicksLimit: 5, callback: (v) => (v >= 1000 ? `${v / 1000}k` : v) } } },
      plugins: { legend: { position: 'top', align: 'end' } },
    },
  });
}

export function radar(canvas, labels, data, color = '#00e5ff') {
  return mk(canvas, {
    type: 'radar',
    data: { labels, datasets: [{ data, borderColor: color, backgroundColor: hexA(color, .2), borderWidth: 2, pointBackgroundColor: color, pointRadius: 3 }] },
    options: { plugins: { legend: { display: false } }, scales: { r: { grid: { color: 'rgba(158,178,255,.12)' }, angleLines: { color: 'rgba(158,178,255,.12)' }, pointLabels: { color: '#9fb0ea', font: { size: 11 } }, ticks: { display: false }, beginAtZero: true } } },
  });
}
