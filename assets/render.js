// Renders a computed audit object into the branded dashboard markup
// (same visual language as reference/dashboard-template.html) and
// supports exporting the result as a standalone HTML file.

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function fmtNum(n) {
  if (n === null || n === undefined) return '—';
  return Math.round(n).toLocaleString();
}

function fmtPosition(n) {
  if (n === null || n === undefined) return '—';
  return n.toFixed(1);
}

function fmtDuration(seconds) {
  if (!seconds && seconds !== 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

function fmtPct(n) {
  if (n === null || n === undefined) return '—';
  return `${(n * 100).toFixed(1)}%`;
}

function renderFindings(findings) {
  return findings
    .map(
      (f) => `
      <div class="finding">
        <span class="tag ${f.tag}">${esc(f.tag)}</span>
        <h3>${esc(f.title)}</h3>
        <p>${esc(f.description)}</p>
      </div>`
    )
    .join('');
}

function renderProgress(progress) {
  if (!progress || progress.length === 0) return '';
  const cards = progress
    .map(
      (p) => `
      <div class="finding">
        <span class="tag ${p.tag}">${esc(p.tagLabel)}</span>
        <h3>${esc(p.title)}</h3>
        <p>${esc(p.description)}</p>
      </div>`
    )
    .join('');
  return `
  <section>
    <div class="sec-head"><span class="idx">00</span><h2>Progress since last audit</h2></div>
    <p class="sec-intro">Compared against the history file saved from the previous run.</p>
    <div class="findings">${cards}</div>
  </section>`;
}

function renderZeroClickTable(rows, siteName) {
  if (!rows || rows.length === 0) return '';
  const trs = rows
    .map(
      (r) => `
        <tr><td>${esc(r.query)}</td><td class="num">${fmtNum(r.impressions)}</td><td class="num"><span class="pos-pill">${fmtPosition(r.position)}</span></td><td class="zero">${r.clicks}</td></tr>`
    )
    .join('');
  return `
  <section>
    <div class="sec-head"><span class="idx">02</span><h2>#1 rankings, zero clicks</h2></div>
    <p class="sec-intro">These queries already place ${esc(siteName)} at or near the top of Google — but the click-through is going somewhere else, almost certainly the Local Pack / Google Maps panel, which sits above organic results for "near me" searches and often fully satisfies the searcher before they ever reach a website.</p>
    <table class="rank-table">
      <thead><tr><th>Query</th><th class="num">Impr.</th><th class="num">Position</th><th class="num">Clicks</th></tr></thead>
      <tbody>${trs}</tbody>
    </table>
    <p class="table-note">${rows.length} quer${rows.length === 1 ? 'y' : 'ies'} showing this pattern in the selected date range.</p>
  </section>`;
}

function renderTickets(tickets) {
  const labelMap = { now: '', next: 'Next', later: 'Later' };
  const classMap = { now: '', next: 'next', later: 'later' };
  return tickets
    .map(
      (t, i) => `
      <div class="ticket">
        <div class="num">${String(i + 1).padStart(3, '0')}</div>
        <div class="body"><h3>${esc(t.title)}</h3><p>${esc(t.description)}</p></div>
        <div class="stamp ${classMap[t.priority]}">${labelMap[t.priority] || 'Now'}</div>
      </div>`
    )
    .join('');
}

function renderPlanCards(plan) {
  if (!plan || plan.length === 0) {
    return '<p class="sec-intro">No content gaps identified in this range — non-branded queries are already ranking on page 1, or there is not enough query volume yet to identify gaps.</p>';
  }
  return plan
    .map(
      (p) => `
    <div class="plan-card">
      <div class="plan-head"><span class="url">/${esc(p.slug)}</span><span class="status">${esc(p.status)} · ${esc(p.timelineSlot)}</span></div>
      <div class="plan-body">
        <div class="plan-grid">
          <div><h4>Fix / Why</h4><ul><li contenteditable="true">${esc(p.why)}</li></ul></div>
          <div><h4>Target queries</h4><div>
            <span class="kw-chip">${esc(p.primaryKeyword)}</span>
            ${p.supportingKeywords.map((k) => `<span class="kw-chip">${esc(k)}</span>`).join('')}
          </div></div>
        </div>
        <div style="margin-top:14px;">
          <h4 style="font-family:'IBM Plex Mono',monospace;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:var(--steel);margin:0 0 6px;">Full draft</h4>
          <p style="font-size:14px;margin:0 0 8px;"><span class="mono">${esc(p.draftFilename)}</span> — ${esc(p.draftStatus)}</p>
          <button type="button" class="ghost-btn copy-prompt-btn" data-title="${esc(p.title)}" data-keyword="${esc(p.primaryKeyword)}" data-supporting="${esc(p.supportingKeywords.join(', '))}">Copy draft-writing prompt for Claude</button>
        </div>
      </div>
    </div>`
    )
    .join('');
}

function renderChecklist(items) {
  return items
    .map(
      (c) => `
      <div class="check-item ${c.done ? 'done' : 'todo'}"><span class="mark">${c.done ? '✓' : '+'}</span><p><strong>${esc(c.title)}</strong> ${esc(c.description)}</p></div>`
    )
    .join('');
}

function renderGa4Section(ga4) {
  if (!ga4 || ga4.status === 'no-data') {
    return `
    <p class="sec-intro">Search Console data only — GA4 returned no data for this range.</p>
    <div class="ga4-banner">
      <div class="pulse"></div>
      <p><strong>No GA4 data found.</strong> This means one of: (a) the GA4 tag isn't installed/firing on the live site, (b) the connected property isn't the one actually receiving traffic, or (c) tracking was installed too recently for data to have processed yet. Try a wider date range or confirm the property ID.</p>
    </div>`;
  }
  const early = ga4.status === 'early';
  const rows = ga4.breakdownRows
    .map(
      (r) => `
        <tr><td>${esc(r.sessionDefaultChannelGroup || '—')}</td><td class="mono">${esc(r.landingPage || '—')}</td><td class="num">${fmtNum(r.sessions)}</td><td class="num">${fmtDuration(r.averageSessionDuration)}</td></tr>`
    )
    .join('');
  return `
    <p class="sec-intro">${early ? `Early signal — only ${ga4.daysWithData} day(s) with recorded sessions in this range. Not yet a reliable trend; check back once there are a couple of weeks of steady traffic.` : `Trend and channel breakdown for the selected range.`}</p>
    <div class="ga4-banner" style="margin-bottom:20px;">
      <div class="pulse"></div>
      <p><strong>${fmtNum(ga4.totalSessions)} sessions</strong> · ${fmtPct(ga4.avgEngagementRate)} avg. engagement rate · ${fmtDuration(ga4.avgSessionDuration)} avg. session duration · ${fmtNum(ga4.totalConversions)} conversions</p>
    </div>
    <table class="rank-table">
      <thead><tr><th>Channel</th><th>Landing page</th><th class="num">Sessions</th><th class="num">Avg. duration</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4">No channel/landing-page breakdown available.</td></tr>'}</tbody>
    </table>`;
}

export function renderDashboardBody(audit, formMeta) {
  const { stats, findings, zeroClickTopRank, tickets, contentPlan, aeoChecklist, ga4, meta } = audit;
  const siteName = formMeta.siteName || meta.siteUrl;
  const siteCategory = formMeta.siteCategory || '';

  const statCards = [
    { value: fmtNum(stats.totalClicks), label: 'Total Clicks' },
    { value: fmtNum(stats.totalImpressions), label: 'Total Impressions' },
    { value: fmtNum(stats.nonBrandedClicks), label: 'Non-Branded Clicks', flag: stats.nonBrandedClicks === 0 },
    { value: fmtPosition(stats.avgPosition), label: 'Avg. Position', flag: false },
  ];

  return `
  <header class="masthead">
    <div class="eyebrow"><span class="dot"></span>${esc(siteName)}${siteCategory ? ` · ${esc(siteCategory)}` : ''}</div>
    <h1>Search &amp; Answer Engine <em>Audit.</em></h1>
    <div class="sub-meta">
      <p>Live findings from Google Search Console${ga4.status !== 'no-data' ? ' and GA4' : ''}, translated into a prioritized fix queue and a page-by-page content plan.</p>
      <div class="range-tag">${esc(meta.dateRangeLabel)}</div>
    </div>
  </header>

  <div class="stat-strip">
    ${statCards
      .map(
        (s) => `<div class="stat"><div class="num${s.flag ? ' flag' : ''}">${s.value}</div><div class="label">${esc(s.label)}</div></div>`
      )
      .join('')}
  </div>

  ${renderProgress(formMeta.progress)}

  <section>
    <div class="sec-head"><span class="idx">01</span><h2>What the data shows</h2></div>
    <div class="findings">${renderFindings(findings)}</div>
  </section>

  ${renderZeroClickTable(zeroClickTopRank, siteName)}

  <section>
    <div class="sec-head"><span class="idx">03</span><h2>Priority queue</h2></div>
    <p class="sec-intro">Ordered by impact and effort. NOW items are low-effort, high-impact; NEXT builds content depth; LATER compounds over time.</p>
    <div class="queue">${renderTickets(tickets)}</div>
  </section>

  <section>
    <div class="sec-head"><span class="idx">04</span><h2>Content development plan</h2></div>
    <p class="sec-intro">Page-by-page targets, pulled from the actual query gaps above rather than generic keyword guesses. Fields are editable — refine before exporting.</p>
    ${renderPlanCards(contentPlan)}
  </section>

  <section>
    <div class="sec-head"><span class="idx">05</span><h2>AEO readiness</h2></div>
    <p class="sec-intro">How AI answer engines (Google AI Overviews, ChatGPT, Perplexity) would currently read this site. Items marked "+" need manual verification against the live site.</p>
    <div class="checklist">${renderChecklist(aeoChecklist)}</div>
  </section>

  <section>
    <div class="sec-head"><span class="idx">06</span><h2>GA4 signal</h2></div>
    ${renderGa4Section(ga4)}
  </section>

  <footer>
    <span>${esc(meta.siteUrl)}${meta.ga4PropertyId ? ` · GA4: ${esc(meta.ga4PropertyId)}` : ''}</span>
    <span>Generated ${esc(new Date(meta.generatedAt).toLocaleString())}</span>
  </footer>`;
}

export function buildStandaloneHtml(bodyHtml, siteName, dashboardCss) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Search &amp; Answer Engine Audit — ${esc(siteName)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,500&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>${dashboardCss}</style>
</head>
<body>
<div class="wrap">${bodyHtml}</div>
</body>
</html>`;
}

export function slugForFile(name) {
  return String(name || 'site')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
