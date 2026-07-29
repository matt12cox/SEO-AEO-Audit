import { initAuth, signIn, getToken } from './google-auth.js';
import { gscListSites, gscSearchAnalytics, gscSitemaps, ga4ListProperties, ga4RunReport } from './api.js';
import { runAudit, normalizeGa4Report } from './audit-engine.js';
import { renderDashboardBody, buildStandaloneHtml, slugForFile } from './render.js';

const $ = (sel) => document.querySelector(sel);
const CLIENT_ID_KEY = 'seo-aeo-audit:client-id';

const els = {
  originHint: $('#origin-hint'),
  inputClientId: $('#input-client-id'),
  setupError: $('#setup-error'),
  btnSaveClientId: $('#btn-save-client-id'),

  connectStatus: $('#connect-status'),
  btnSignIn: $('#btn-sign-in'),
  scopeCard: $('#scope-card'),
  selectSite: $('#select-site'),
  inputSiteName: $('#input-site-name'),
  inputSiteCategory: $('#input-site-category'),
  inputBrandTerms: $('#input-brand-terms'),
  dateRangeGroup: $('#date-range-group'),
  selectGa4Property: $('#select-ga4-property'),
  inputGa4Manual: $('#input-ga4-property-manual'),
  ga4Note: $('#ga4-discovery-note'),
  btnRunAudit: $('#btn-run-audit'),

  loadingStatus: $('#loading-status'),

  dashboardMount: $('#dashboard-mount'),
  btnExport: $('#btn-export'),
  btnRerun: $('#btn-rerun'),
  btnReset: $('#btn-reset'),
  btnReset2: $('#btn-reset-2'),
};

let lastAudit = null;
let lastFormMeta = null;

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  els.btnReset.style.display = id === 'screen-setup' ? 'none' : 'inline-block';
}

function banner(container, message, kind = 'error') {
  container.innerHTML = `<div class="status-banner ${kind}">${message}</div>`;
}

function clearBanner(container) {
  container.innerHTML = '';
}

function dateStr(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function selectedRangeDays() {
  return Number(document.querySelector('input[name="range"]:checked').value);
}

function rangeLabel(days) {
  const map = { 28: 'Last 28 days', 90: 'Last 3 months', 180: 'Last 6 months', 365: 'Last 12 months' };
  return map[days] || `Last ${days} days`;
}

// ---------- Screen 1: setup ----------

els.originHint.textContent = window.location.origin;

const savedClientId = localStorage.getItem(CLIENT_ID_KEY);
if (savedClientId) {
  els.inputClientId.value = savedClientId;
  bootAuth(savedClientId);
}

els.btnSaveClientId.addEventListener('click', () => {
  const clientId = els.inputClientId.value.trim();
  if (!clientId.endsWith('.apps.googleusercontent.com')) {
    banner(els.setupError, 'That doesn’t look like a Google OAuth Client ID — it should end in .apps.googleusercontent.com.');
    return;
  }
  clearBanner(els.setupError);
  localStorage.setItem(CLIENT_ID_KEY, clientId);
  bootAuth(clientId);
});

async function bootAuth(clientId) {
  try {
    await initAuth(clientId);
    showScreen('screen-connect');
  } catch (err) {
    banner(els.setupError, `Couldn't initialize Google auth: ${err.message}`);
  }
}

// ---------- Screen 2: connect + scope ----------

els.btnSignIn.addEventListener('click', async () => {
  clearBanner(els.connectStatus);
  els.btnSignIn.disabled = true;
  els.btnSignIn.textContent = 'Signing in…';
  try {
    const token = await signIn();
    banner(els.connectStatus, 'Signed in.', 'success');
    await populateScope(token);
  } catch (err) {
    banner(els.connectStatus, `Sign-in failed: ${err.message}`);
  } finally {
    els.btnSignIn.disabled = false;
    els.btnSignIn.textContent = 'Sign in with Google';
  }
});

async function populateScope(token) {
  try {
    const sites = await gscListSites(token);
    if (sites.length === 0) {
      banner(els.connectStatus, 'No Search Console properties found for this Google account. Verify a property first at search.google.com/search-console.');
      return;
    }
    els.selectSite.innerHTML = sites
      .map((s) => `<option value="${s.siteUrl}">${s.siteUrl}</option>`)
      .join('');
  } catch (err) {
    banner(els.connectStatus, `Couldn't list Search Console sites: ${err.message}`);
    return;
  }

  try {
    const props = await ga4ListProperties(token);
    if (props && props.length > 0) {
      els.selectGa4Property.innerHTML =
        `<option value="">— none —</option>` +
        props.map((p) => `<option value="${p.id}">${p.name} (${p.account})</option>`).join('');
      els.selectGa4Property.style.display = '';
      els.inputGa4Manual.style.display = 'none';
      els.ga4Note.textContent = 'Auto-discovered from your Google account. Pick "none" to skip GA4.';
    } else {
      throw new Error('discovery unavailable');
    }
  } catch {
    els.selectGa4Property.style.display = 'none';
    els.inputGa4Manual.style.display = '';
    els.ga4Note.textContent = "Couldn't auto-discover GA4 properties — enter the numeric property ID manually (Admin → Property details in GA4), or leave blank to skip GA4.";
  }

  els.scopeCard.style.display = '';
}

els.dateRangeGroup.querySelectorAll('.radio-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    els.dateRangeGroup.querySelectorAll('.radio-chip').forEach((c) => c.classList.remove('selected'));
    chip.classList.add('selected');
  });
});

els.btnRunAudit.addEventListener('click', runFullAudit);

async function runFullAudit() {
  const token = getToken();
  if (!token) {
    banner(els.connectStatus, 'Session expired — sign in again.');
    showScreen('screen-connect');
    return;
  }

  const siteUrl = els.selectSite.value;
  const days = selectedRangeDays();
  const startDate = dateStr(days + 2);
  const endDate = dateStr(2); // GSC data typically lags ~2 days
  const brandTerms = els.inputBrandTerms.value.trim();
  const ga4PropertyId =
    els.selectGa4Property.style.display !== 'none' ? els.selectGa4Property.value : els.inputGa4Manual.value.trim();

  showScreen('screen-loading');

  try {
    els.loadingStatus.textContent = 'Pulling query and page performance from Search Console…';
    const [queryRows, pageRows, sitemaps] = await Promise.all([
      gscSearchAnalytics(token, siteUrl, { startDate, endDate, dimensions: ['query'], rowLimit: 1000 }),
      gscSearchAnalytics(token, siteUrl, { startDate, endDate, dimensions: ['page'], rowLimit: 1000 }),
      gscSitemaps(token, siteUrl),
    ]);

    let ga4Raw = null;
    if (ga4PropertyId) {
      els.loadingStatus.textContent = 'Pulling GA4 sessions and engagement data…';
      try {
        const [trendReport, breakdownReport] = await Promise.all([
          ga4RunReport(token, ga4PropertyId, {
            dateRanges: [{ startDate, endDate }],
            dimensions: [{ name: 'date' }],
            metrics: [
              { name: 'sessions' }, { name: 'engagedSessions' }, { name: 'engagementRate' },
              { name: 'averageSessionDuration' }, { name: 'conversions' }, { name: 'bounceRate' },
            ],
          }),
          ga4RunReport(token, ga4PropertyId, {
            dateRanges: [{ startDate, endDate }],
            dimensions: [{ name: 'sessionDefaultChannelGroup' }, { name: 'landingPage' }],
            metrics: [{ name: 'sessions' }, { name: 'averageSessionDuration' }],
            orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
            limit: 10,
          }),
        ]);
        ga4Raw = {
          trendRows: normalizeGa4Report(trendReport),
          breakdownRows: normalizeGa4Report(breakdownReport),
        };
      } catch (err) {
        ga4Raw = { trendRows: [], breakdownRows: [], error: err.message };
      }
    }

    els.loadingStatus.textContent = 'Synthesizing findings…';
    const audit = runAudit({
      queryRows, pageRows, sitemaps, brandTerms, ga4: ga4Raw,
      dateRangeLabel: rangeLabel(days), siteUrl, ga4PropertyId,
    });

    const formMeta = {
      siteName: els.inputSiteName.value.trim(),
      siteCategory: els.inputSiteCategory.value.trim(),
      progress: null,
    };

    lastAudit = audit;
    lastFormMeta = formMeta;

    els.dashboardMount.innerHTML = renderDashboardBody(audit, formMeta);
    wireDashboardInteractions();
    showScreen('screen-dashboard');
  } catch (err) {
    showScreen('screen-connect');
    banner(els.connectStatus, `Audit failed: ${err.message}`);
  }
}

// ---------- Screen 4: dashboard ----------

function wireDashboardInteractions() {
  els.dashboardMount.querySelectorAll('.copy-prompt-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const title = btn.dataset.title;
      const keyword = btn.dataset.keyword;
      const supporting = btn.dataset.supporting;
      const siteName = lastFormMeta?.siteName || lastAudit?.meta?.siteUrl || 'this site';
      const prompt = `Using the seo-aeo-audit skill's approach: write a complete, publish-ready draft for "${title}" on ${siteName}.\nPrimary keyword: ${keyword}\nSupporting keywords: ${supporting}\nOpen by directly answering the core question in the first 1-2 sentences, include concrete specifics (price/duration/etc, or [INSERT PRICE] placeholders), and suggest a title tag (<60 chars) and meta description (<155 chars). Match the site's existing tone.`;
      try {
        await navigator.clipboard.writeText(prompt);
        btn.textContent = 'Copied!';
        setTimeout(() => (btn.textContent = 'Copy draft-writing prompt for Claude'), 1800);
      } catch {
        prompt && window.prompt('Copy this prompt:', prompt);
      }
    });
  });
}

els.btnExport.addEventListener('click', async () => {
  if (!lastAudit) return;
  const css = await fetch('assets/dashboard.css').then((r) => r.text());
  const bodyHtml = els.dashboardMount.innerHTML;
  const siteName = lastFormMeta?.siteName || lastAudit.meta.siteUrl;
  const doc = buildStandaloneHtml(bodyHtml, siteName, css);
  const blob = new Blob([doc], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slugForFile(siteName)}-seo-audit.html`;
  a.click();
  URL.revokeObjectURL(url);
});

els.btnRerun.addEventListener('click', () => showScreen('screen-connect'));

function resetAll() {
  localStorage.removeItem(CLIENT_ID_KEY);
  window.location.reload();
}
els.btnReset.addEventListener('click', resetAll);
els.btnReset2.addEventListener('click', resetAll);
