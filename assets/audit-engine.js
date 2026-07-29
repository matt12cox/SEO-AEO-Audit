// Ports the analysis heuristics from SKILL.md (steps 4, 7, 8) onto raw
// GSC/GA4 API rows. Never invents numbers — everything here is derived
// directly from what the APIs returned.

function sum(rows, key) {
  return rows.reduce((acc, r) => acc + (r[key] || 0), 0);
}

function weightedAvgPosition(rows) {
  const totalImpr = sum(rows, 'impressions');
  if (!totalImpr) return null;
  const weighted = rows.reduce((acc, r) => acc + r.position * (r.impressions || 0), 0);
  return weighted / totalImpr;
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
}

function buildBrandMatcher(brandTermsCsv) {
  const terms = (brandTermsCsv || '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (!terms.length) return () => false;
  return (query) => {
    const q = query.toLowerCase();
    return terms.some((t) => q.includes(t));
  };
}

/**
 * Normalizes a GA4 Data API runReport response into plain rows.
 * @param {Object} report - response from properties:runReport
 * @returns {Array<Object>} rows keyed by dimension/metric header name
 */
export function normalizeGa4Report(report) {
  if (!report || !report.rows) return [];
  const dimHeaders = (report.dimensionHeaders || []).map((h) => h.name);
  const metricHeaders = (report.metricHeaders || []).map((h) => h.name);
  return report.rows.map((row) => {
    const out = {};
    row.dimensionValues.forEach((v, i) => (out[dimHeaders[i]] = v.value));
    row.metricValues.forEach((v, i) => (out[metricHeaders[i]] = Number(v.value)));
    return out;
  });
}

/**
 * @param {Object} raw
 * @param {Array} raw.queryRows - GSC searchAnalytics rows, dimensions=['query']
 * @param {Array} raw.pageRows - GSC searchAnalytics rows, dimensions=['page']
 * @param {Array} raw.sitemaps - GSC sitemaps.list rows
 * @param {string} raw.brandTerms - comma-separated brand terms
 * @param {Object|null} raw.ga4 - { trend: rows[], breakdown: rows[] } or null if unavailable
 * @param {string} raw.dateRangeLabel
 * @param {string} raw.siteUrl
 * @param {string} raw.ga4PropertyId
 */
export function runAudit(raw) {
  const queryRows = (raw.queryRows || []).map((r) => ({
    query: r.keys[0],
    clicks: r.clicks || 0,
    impressions: r.impressions || 0,
    ctr: r.ctr || 0,
    position: r.position || 0,
  }));
  const pageRows = (raw.pageRows || []).map((r) => ({
    page: r.keys[0],
    clicks: r.clicks || 0,
    impressions: r.impressions || 0,
    ctr: r.ctr || 0,
    position: r.position || 0,
  }));

  const isBranded = buildBrandMatcher(raw.brandTerms);
  const branded = queryRows.filter((r) => isBranded(r.query));
  const nonBranded = queryRows.filter((r) => !isBranded(r.query));

  const totalClicks = sum(queryRows, 'clicks');
  const totalImpressions = sum(queryRows, 'impressions');
  const avgPosition = weightedAvgPosition(queryRows);
  const brandedClicks = sum(branded, 'clicks');
  const nonBrandedClicks = sum(nonBranded, 'clicks');

  const noSitemap = (raw.sitemaps || []).length === 0;

  // Local Pack / zero-click cannibalization: near-top position, real
  // impressions, zero clicks.
  const zeroClickTopRank = queryRows
    .filter((r) => r.position > 0 && r.position <= 3 && r.clicks === 0 && r.impressions > 0)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 15);

  // Content gaps: non-branded queries with meaningful impressions but weak
  // ranking (page 2+), i.e. demand exists but no page is winning it.
  const contentGapCandidatesFull = nonBranded
    .filter((r) => r.impressions >= 10 && r.position > 10)
    .sort((a, b) => b.impressions - a.impressions);
  const contentGapCandidates = contentGapCandidatesFull.slice(0, 12);
  const contentGapStats = {
    nonBrandedQueryCount: nonBranded.length,
    qualifyingCount: contentGapCandidatesFull.length,
    minImpressions: 10,
    minPosition: 10,
  };

  const topNonBrandedQueries = nonBranded
    .slice()
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 10)
    .map((r) => r.query);

  const findings = [];

  findings.push(
    noSitemap
      ? {
          tag: 'critical',
          title: 'No sitemap submitted',
          description:
            'Search Console returned no sitemap data for this property. That usually means an XML sitemap has never been submitted — a fast, low-effort fix that helps Google discover and (re)crawl pages faster.',
        }
      : {
          tag: 'good',
          title: 'Sitemap present',
          description: `${raw.sitemaps.length} sitemap${raw.sitemaps.length === 1 ? '' : 's'} submitted and on file with Search Console.`,
        }
  );

  if (zeroClickTopRank.length > 0) {
    findings.push({
      tag: 'critical',
      title: `${zeroClickTopRank.length} quer${zeroClickTopRank.length === 1 ? 'y ranks' : 'ies rank'} #1–3 with zero clicks`,
      description:
        'Likely the Google Local Pack / Maps panel (or another SERP feature) is absorbing the click before the searcher reaches organic results. See the table below.',
    });
  }

  if (totalClicks > 0 && nonBrandedClicks === 0) {
    findings.push({
      tag: 'critical',
      title: 'Zero non-branded clicks',
      description:
        'Every click in this range came from branded queries — people who already knew the business by name. There is currently no measurable discovery traffic from people searching generically for this kind of product/service.',
    });
  } else if (totalClicks > 0) {
    const pct = Math.round((nonBrandedClicks / totalClicks) * 100);
    findings.push({
      tag: pct >= 30 ? 'good' : 'warn',
      title: `${pct}% of clicks are non-branded`,
      description: `${nonBrandedClicks} of ${totalClicks} total clicks came from generic (non-branded) queries — this is the discovery/new-customer channel, as opposed to branded search from people who already know the business.`,
    });
  }

  if (contentGapCandidates.length > 0) {
    findings.push({
      tag: 'warn',
      title: `${contentGapCandidates.length} content gap${contentGapCandidates.length === 1 ? '' : 's'} identified`,
      description:
        'These non-branded queries generate real impressions but rank beyond page 1 — demand exists without a page winning it yet. See the content plan below.',
    });
  }

  // Priority queue
  const tickets = [];
  if (noSitemap) {
    tickets.push({
      priority: 'now',
      title: 'Submit an XML sitemap',
      description: 'Generate and submit a sitemap.xml in Search Console — low effort, speeds up indexing of every other fix below.',
    });
  }
  if (zeroClickTopRank.length > 0) {
    tickets.push({
      priority: 'now',
      title: 'Investigate Local Pack / Maps cannibalization',
      description: `Confirm whether ${zeroClickTopRank[0].query}${zeroClickTopRank.length > 1 ? ` and ${zeroClickTopRank.length - 1} similar quer${zeroClickTopRank.length - 1 === 1 ? 'y' : 'ies'}` : ''} are being satisfied by the Local Pack. Strengthen the Google Business Profile listing so both organic and Maps convert.`,
    });
  }
  if (totalClicks > 0 && nonBrandedClicks === 0) {
    tickets.push({
      priority: 'now',
      title: 'Build a non-branded discovery path',
      description: 'No generic-query traffic currently exists. Prioritize the highest-impression content gaps below to start capturing new-customer search demand.',
    });
  }
  contentGapCandidates.slice(0, 5).forEach((c, i) => {
    tickets.push({
      priority: i < 2 ? 'next' : 'later',
      title: `Target "${c.query}" with dedicated content`,
      description: `${c.impressions} impressions, currently averaging position ${c.position.toFixed(1)}. No page is winning this query yet.`,
    });
  });
  tickets.push({
    priority: 'later',
    title: 'Re-run this audit in 2–4 weeks',
    description: 'Track whether fixes above move the needle before adding new recommendations on top of unproven ones.',
  });

  // Content plan cards, one per gap candidate
  const contentPlan = contentGapCandidates.map((c, i) => {
    const supporting = contentGapCandidates
      .filter((o) => o.query !== c.query)
      .slice(0, 3)
      .map((o) => o.query);
    return {
      title: c.query.replace(/\b\w/g, (ch) => ch.toUpperCase()),
      slug: slugify(c.query),
      status: 'Proposed',
      timelineSlot: `Week ${i * 2 + 1}`,
      primaryKeyword: c.query,
      supportingKeywords: supporting,
      why: `Closes non-branded discovery gap — ${c.impressions} impressions at position ${c.position.toFixed(1)}, no dedicated page currently targets this.`,
      draftFilename: `content-drafts/${slugify(c.query)}.md`,
      draftStatus: 'Not yet drafted — copy the prompt below into Claude (with the seo-aeo-audit skill) for a publish-ready draft.',
    };
  });

  // AEO checklist — auto-mark what the data can confirm, leave the rest as
  // manual todo items since verifying on-page schema/content requires
  // inspecting the live site, which the API data alone can't confirm.
  const aeoChecklist = [
    {
      done: !noSitemap,
      title: 'Sitemap submitted',
      description: noSitemap ? 'Not yet submitted — see priority queue.' : 'Confirmed present in Search Console.',
    },
    {
      done: totalClicks > 0 && nonBrandedClicks > 0,
      title: 'Non-branded discovery traffic exists',
      description:
        totalClicks > 0 && nonBrandedClicks > 0
          ? 'Site is earning clicks from people who did not already know the business by name.'
          : 'No confirmed non-branded clicks yet in this range.',
    },
    {
      done: false,
      title: 'Answer-first content',
      description: 'Manually verify: do key pages answer the core question in the first 1–2 sentences, with concrete specifics (price, duration, etc.)?',
    },
    {
      done: false,
      title: 'FAQPage / Service / LocalBusiness schema',
      description:
        'Manually verify on the live site. Note: Google retired the FAQ rich-result dropdown in May 2026 — schema is still worth adding, but for AI-answer-engine parsing (AI Overviews, ChatGPT, Perplexity), not a SERP snippet.',
    },
    {
      done: false,
      title: 'Content matches how customers actually ask',
      description: 'Manually verify: does the site use customer search language, not just internal/industry terminology?',
    },
  ];

  return {
    meta: {
      siteUrl: raw.siteUrl,
      ga4PropertyId: raw.ga4PropertyId || null,
      dateRangeLabel: raw.dateRangeLabel,
      generatedAt: new Date().toISOString(),
    },
    stats: {
      totalClicks,
      totalImpressions,
      avgPosition,
      nonBrandedClicks,
      brandedClicks,
      indexedPages: pageRows.length,
    },
    findings,
    zeroClickTopRank,
    tickets,
    contentPlan,
    contentGapStats,
    topNonBrandedQueries,
    aeoChecklist,
    ga4: summarizeGa4(raw.ga4),
    pageRows,
  };
}

/**
 * Merges Claude-analyzed per-page AEO findings into the baseline checklist
 * built by runAudit(). Called after the user runs the optional AEO content
 * check, so this stays separate from runAudit (which only ever uses
 * GSC/GA4 numbers, never live page content).
 * @param {Array} baselineChecklist - audit.aeoChecklist from runAudit()
 * @param {Array} pageResults - [{ url, schema?: {present,types}, analysis?: {answer_first, customer_language}, error? }]
 */
export function buildAeoChecklistWithPageResults(baselineChecklist, pageResults) {
  const checklist = baselineChecklist.map((c) => ({ ...c }));

  const schemaChecked = pageResults.filter((p) => p.schema);
  if (schemaChecked.length) {
    const idx = checklist.findIndex((c) => c.title.includes('schema'));
    if (idx >= 0) {
      const anyPresent = schemaChecked.some((p) => p.schema.present);
      checklist[idx] = {
        ...checklist[idx],
        done: anyPresent,
        description: anyPresent
          ? `JSON-LD schema found on ${schemaChecked.filter((p) => p.schema.present).length} of ${schemaChecked.length} page(s) checked. Note: valuable for AI-answer-engine parsing, not the retired FAQ rich-result dropdown.`
          : `No JSON-LD schema block detected on ${schemaChecked.length} page(s) checked.`,
        detail: schemaChecked.map((p) => ({
          url: p.url,
          verdict: p.schema.present ? `Found${p.schema.types.length ? ` (${p.schema.types.join(', ')})` : ''}` : 'Not found',
          note: p.schema.present ? '' : 'No <script type="application/ld+json"> block detected on this page.',
        })),
      };
    }
  }

  const analyzed = pageResults.filter((p) => p.analysis);
  if (analyzed.length) {
    const answerFirstIdx = checklist.findIndex((c) => c.title === 'Answer-first content');
    if (answerFirstIdx >= 0) {
      const failing = analyzed.filter((p) => p.analysis.answer_first.verdict !== 'yes');
      checklist[answerFirstIdx] = {
        ...checklist[answerFirstIdx],
        done: failing.length === 0,
        description: failing.length === 0
          ? `Confirmed answer-first across ${analyzed.length} page(s) checked.`
          : `${failing.length} of ${analyzed.length} page(s) checked don't open by directly answering the core question — see below.`,
        detail: analyzed.map((p) => ({
          url: p.url,
          verdict: p.analysis.answer_first.verdict,
          note: p.analysis.answer_first.recommendation || p.analysis.answer_first.evidence || '',
        })),
      };
    }
    const customerLangIdx = checklist.findIndex((c) => c.title === 'Content matches how customers actually ask');
    if (customerLangIdx >= 0) {
      const failing = analyzed.filter((p) => p.analysis.customer_language.verdict !== 'yes');
      checklist[customerLangIdx] = {
        ...checklist[customerLangIdx],
        done: failing.length === 0,
        description: failing.length === 0
          ? `Confirmed customer-language match across ${analyzed.length} page(s) checked.`
          : `${failing.length} of ${analyzed.length} page(s) checked lean on internal/industry language over how customers actually search — see below.`,
        detail: analyzed.map((p) => ({
          url: p.url,
          verdict: p.analysis.customer_language.verdict,
          note: p.analysis.customer_language.recommendation || p.analysis.customer_language.evidence || '',
        })),
      };
    }
  }

  const failed = pageResults.filter((p) => p.error);
  if (failed.length) {
    checklist.push({
      done: false,
      title: `${failed.length} page(s) couldn't be checked`,
      description: failed.map((p) => `${p.url}: ${p.error}`).join(' · '),
    });
  }

  return checklist;
}

function summarizeGa4(ga4) {
  if (!ga4 || !ga4.trendRows || ga4.trendRows.length === 0) {
    return { status: 'no-data', trendRows: [], breakdownRows: [] };
  }
  const trendRows = ga4.trendRows;
  const breakdownRows = ga4.breakdownRows || [];
  const totalSessions = sum(trendRows, 'sessions');
  const totalConversions = sum(trendRows, 'conversions');
  const avgEngagementRate =
    trendRows.reduce((acc, r) => acc + (r.engagementRate || 0), 0) / trendRows.length;
  const avgSessionDuration =
    trendRows.reduce((acc, r) => acc + (r.averageSessionDuration || 0), 0) / trendRows.length;
  const daysWithData = trendRows.filter((r) => (r.sessions || 0) > 0).length;
  return {
    status: daysWithData < 14 ? 'early' : 'ok',
    daysWithData,
    totalSessions,
    totalConversions,
    avgEngagementRate,
    avgSessionDuration,
    trendRows,
    breakdownRows: breakdownRows
      .slice()
      .sort((a, b) => (b.sessions || 0) - (a.sessions || 0))
      .slice(0, 10),
  };
}
