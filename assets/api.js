// Direct browser calls to the Google Search Console (webmasters v3) and
// GA4 Data API. Both support authenticated CORS requests from a browser,
// so no backend proxy is required.

const GSC_BASE = 'https://www.googleapis.com/webmasters/v3';
const GA4_DATA_BASE = 'https://analyticsdata.googleapis.com/v1beta';
const GA4_ADMIN_BASE = 'https://analyticsadmin.googleapis.com/v1beta';

async function authedFetch(url, token, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body?.error?.message || '';
    } catch {
      /* ignore */
    }
    throw new Error(`${url.split('?')[0]} → ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return res.json();
}

export async function gscListSites(token) {
  const data = await authedFetch(`${GSC_BASE}/sites`, token);
  return (data.siteEntry || []).filter((s) => s.permissionLevel !== 'siteUnverifiedUser');
}

export async function gscSearchAnalytics(token, siteUrl, { startDate, endDate, dimensions, rowLimit = 1000 }) {
  const data = await authedFetch(
    `${GSC_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    token,
    { method: 'POST', body: JSON.stringify({ startDate, endDate, dimensions, rowLimit }) }
  );
  return data.rows || [];
}

export async function gscSitemaps(token, siteUrl) {
  const data = await authedFetch(`${GSC_BASE}/sites/${encodeURIComponent(siteUrl)}/sitemaps`, token);
  return data.sitemap || [];
}

export async function ga4ListProperties(token) {
  try {
    const data = await authedFetch(`${GA4_ADMIN_BASE}/accountSummaries?pageSize=200`, token);
    const props = [];
    for (const acct of data.accountSummaries || []) {
      for (const p of acct.propertySummaries || []) {
        props.push({
          id: p.property.replace('properties/', ''),
          name: p.displayName,
          account: acct.displayName,
        });
      }
    }
    return props;
  } catch {
    return null; // caller falls back to manual entry
  }
}

export async function ga4RunReport(token, propertyId, body) {
  return authedFetch(`${GA4_DATA_BASE}/properties/${propertyId}:runReport`, token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
