const metricSelect = document.getElementById('metric');
const groupFilter = document.getElementById('groupFilter');
const chartEl = document.getElementById('chart');
const tooltip = document.getElementById('tooltip');
const themeToggle = document.getElementById('themeToggle');
const html = document.documentElement;

const state = {
  metric: 'digital',
  group: 'all',
  selected: null
};

const metricMeta = {
  digital: { label: 'Digital AI exposure', min: 0, max: 1 },
  ai: { label: 'Overall AI exposure', min: 0, max: 1 },
  automation: { label: 'Automation exposure', min: 0, max: 1 },
  pay: { label: 'Monthly pay', min: 2400, max: 9200 }
};

const palette = ['#2e7d32', '#81c784', '#ffd54f', '#ef5350', '#b71c1c'];

const isDark = matchMedia('(prefers-color-scheme: dark)').matches;
html.setAttribute('data-theme', isDark ? 'dark' : 'light');

themeToggle.addEventListener('click', () => {
  html.setAttribute('data-theme', html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  render();
});

metricSelect.addEventListener('change', () => {
  state.metric = metricSelect.value;
  render();
});

groupFilter.addEventListener('change', () => {
  state.group = groupFilter.value;
  state.selected = null;
  render();
});

window.addEventListener('resize', debounce(render, 80));

function init() {
  const groups = [...new Set(window.JOBS_DATA.map(d => d.group))].sort((a, b) => a.localeCompare(b));
  groups.forEach(group => {
    const option = document.createElement('option');
    option.value = group;
    option.textContent = group;
    groupFilter.appendChild(option);
  });
  render();
}

function filteredData() {
  if (state.group === 'all') return [...window.JOBS_DATA];
  return window.JOBS_DATA.filter(d => d.group === state.group);
}

function metricValue(item, metric) {
  if (metric === 'pay') return item.pay;
  return item[metric];
}

function colorForValue(value, metric) {
  const meta = metricMeta[metric];
  const t = Math.max(0, Math.min(1, (value - meta.min) / (meta.max - meta.min)));
  return d3.interpolateRgbBasis(palette)(t);
}

function render() {
  const data = filteredData();
  renderKpis(data);
  renderScale();
  renderChart(data);
  renderDetails();
}

function renderKpis(data) {
  const totalJobs = d3.sum(data, d => d.employment) || 0;
  document.getElementById('kpiJobs').textContent = formatCompact(totalJobs);
  document.getElementById('kpiOcc').textContent = data.length.toString();
  const top = [...data].sort((a, b) => metricValue(b, state.metric) - metricValue(a, state.metric))[0];
  document.getElementById('kpiTop').textContent = top ? top.title : 'â€”';
  const medianPay = d3.median(data, d => d.pay) || 0;
  document.getElementById('kpiPay').textContent = euro(medianPay);
}

function renderScale() {
  const scale = document.getElementById('scale');
  scale.style.background = state.metric === 'pay'
    ? 'linear-gradient(90deg,#2e7d32,#81c784,#ffd54f,#ef5350,#b71c1c)'
    : 'linear-gradient(90deg,#2e7d32,#81c784,#ffd54f,#ef5350,#b71c1c)';
}

function renderChart(data) {
  chartEl.innerHTML = '';
  if (!data.length) {
    chartEl.innerHTML = '<div style="padding:20px;color:#6d6252;">No jobs match this filter.</div>';
    return;
  }

  const width = chartEl.clientWidth || 800;
  const height = chartEl.clientHeight || 620;

  const root = d3.hierarchy({ children: data })
    .sum(d => d.employment || 0)
    .sort((a, b) => b.value - a.value);

  d3.treemap()
    .size([width, height])
    .paddingOuter(6)
    .paddingTop(10)
    .paddingInner(3)
    .round(true)(root);

  const svg = d3.select(chartEl)
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', `0 0 ${width} ${height}`);

  const node = svg.selectAll('g.node')
    .data(root.leaves())
    .enter()
    .append('g')
    .attr('class', 'node')
    .attr('transform', d => `translate(${d.x0},${d.y0})`);

  node.append('rect')
    .attr('rx', 12)
    .attr('ry', 12)
    .attr('width', d => Math.max(0, d.x1 - d.x0))
    .attr('height', d => Math.max(0, d.y1 - d.y0))
    .attr('fill', d => colorForValue(metricValue(d.data, state.metric), state.metric))
    .attr('stroke', 'rgba(0,0,0,0.08)')
    .on('mousemove', (event, d) => showTooltip(event, d))
    .on('mouseleave', hideTooltip)
    .on('click', (_, d) => {
      state.selected = d.data;
      renderDetails();
    });

  node.append('text')
    .attr('x', 10)
    .attr('y', 16)
    .attr('fill', 'white')
    .style('font-weight', 700)
    .style('font-size', d => `${Math.max(11, Math.min(18, (d.x1 - d.x0) / 16))}px`)
    .style('paint-order', 'stroke')
    .style('stroke', 'rgba(0,0,0,0.20)')
    .style('stroke-width', '3px')
    .style('stroke-linejoin', 'round')
    .each(function(d) {
      const w = d.x1 - d.x0;
      const h = d.y1 - d.y0;
      if (w < 100 || h < 56) return;
      const text = d3.select(this);
      const maxLines = Math.max(1, Math.min(2, Math.floor((h - 24) / 16)));
      const lines = wrapLabel(d.data.title, maxLines, Math.max(24, w - 20));
      lines.forEach((line, index) => {
        text.append('tspan')
          .attr('x', 10)
          .attr('dy', index === 0 ? 0 : 16)
          .text(line);
      });
      if (w > 140 && h > 92) {
        text.append('tspan')
          .attr('x', 10)
          .attr('dy', 18)
          .style('font-size', '12px')
          .style('font-weight', 500)
          .text(`${formatMetric(metricValue(d.data, state.metric), state.metric)} - ${formatCompact(d.data.employment)} workers`);
      }
    });
}

function renderDetails() {
  const selected = state.selected || filteredData()[0];
  if (!selected) return;
  state.selected = selected;

  const detailsPanel = document.querySelector('.side');
  const existing = detailsPanel.querySelector('.selection-panel');
  if (existing) existing.remove();

  const box = document.createElement('div');
  box.className = 'selection-panel';
  box.innerHTML = `
    <div class="details-content">
      <p class="small">${selected.group}</p>
      <div class="details-title">
        <div>
          <h2 style="margin:0">${selected.title}</h2>
          <p class="detail-copy">${selected.summary}</p>
        </div>
        <span class="language-pill">${selected.languageLabel}</span>
      </div>
      <div class="metrics-grid">
        <div class="metric-box"><span class="stat-label">Estimated jobs</span><strong>${formatCompact(selected.employment)}</strong></div>
        <div class="metric-box"><span class="stat-label">Median pay</span><strong>${euro(selected.pay)}</strong></div>
        <div class="metric-box"><span class="stat-label">AI exposure</span><strong>${Math.round(selected.ai * 100)}%</strong></div>
        <div class="metric-box"><span class="stat-label">Automation exposure</span><strong>${Math.round(selected.automation * 100)}%</strong></div>
        <div class="metric-box"><span class="stat-label">Digital exposure</span><strong>${Math.round(selected.digital * 100)}%</strong></div>
        <div class="metric-box"><span class="stat-label">Entry education</span><strong>${selected.education}</strong></div>
      </div>
      <div>
        <p class="details-kicker">Why this score</p>
        <p class="detail-copy">${selected.rationale}</p>
      </div>
      <div>
        <p class="details-kicker">Method note</p>
        <p class="detail-copy">${selected.source}</p>
      </div>
    </div>
  `;
  detailsPanel.appendChild(box);
}

function showTooltip(event, d) {
  const metric = state.metric;
  tooltip.style.opacity = 1;
  tooltip.style.transform = 'translateY(0)';
  tooltip.style.left = `${event.clientX + 16}px`;
  tooltip.style.top = `${event.clientY + 16}px`;
  tooltip.innerHTML = `
    <h3>${d.data.title}</h3>
    <div class="trow">Group: ${d.data.group}</div>
    <div class="trow">Workers: ${formatCompact(d.data.employment)}</div>
    <div class="trow">Digital AI exposure: ${Math.round(d.data.digital * 100)}%</div>
    <div class="trow">Overall AI exposure: ${Math.round(d.data.ai * 100)}%</div>
    <div class="trow">Automation exposure: ${Math.round(d.data.automation * 100)}%</div>
    <div class="trow">Monthly pay: ${euro(d.data.pay)}</div>
    <div class="trow">Outlook: ${d.data.outlook > 0 ? '+' : ''}${d.data.outlook}%</div>
    <div class="trow">${d.data.summary}</div>
  `;
  d3.select(event.currentTarget.parentNode).raise();
}

function hideTooltip() {
  tooltip.style.opacity = 0;
  tooltip.style.transform = 'translateY(8px)';
}

function formatMetric(value, metric) {
  if (metric === 'pay') return euro(value);
  return `${Math.round(value * 100)}%`;
}

function formatCompact(value) {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(value);
}

function euro(value) {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0
  }).format(value);
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function wrapLabel(label, maxLines, maxWidth) {
  const words = label.split(/\s+/);
  const lines = [];
  let current = '';

  const svg = d3.select(document.body)
    .append('svg')
    .style('position', 'absolute')
    .style('visibility', 'hidden')
    .style('width', 0)
    .style('height', 0);

  const measurer = svg.append('text').style('font-size', '16px').style('font-weight', 700);
  const fits = (text) => {
    measurer.text(text);
    return measurer.node().getComputedTextLength() <= maxWidth;
  };

  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (fits(trial)) {
      current = trial;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length >= maxLines - 1) break;
  }

  if (current && lines.length < maxLines) lines.push(current);
  svg.remove();

  if (lines.length === maxLines) {
    const lastIndex = lines.length - 1;
    let last = lines[lastIndex];
    while (last.length > 3 && !fits(`${last}…`)) {
      last = last.slice(0, -1);
    }
    lines[lastIndex] = `${last}…`;
  }

  return lines;
}

init();
