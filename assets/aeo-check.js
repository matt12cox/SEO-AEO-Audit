// Optional automated AEO content check: attempts to fetch a live page
// directly from the browser (works only when the target site sends
// permissive CORS headers — most don't), falls back to pasted
// HTML/text, deterministically detects JSON-LD schema, and — if the
// user supplies their own Anthropic API key — asks Claude to judge
// whether the page is answer-first and uses customer search language.
//
// Calling the Anthropic API directly from a browser requires the
// 'anthropic-dangerous-direct-browser-access' header. That name is
// Anthropic's own warning label: it means the API key is exposed to
// anyone with access to this browser/device. Fine for a personal,
// locally-run tool; never ship a page with a key baked in to the
// public.

const ANTHROPIC_KEY_STORAGE = 'seo-aeo-audit:anthropic-key';
const API_URL = 'https://api.anthropic.com/v1/messages';

export function getStoredApiKey() {
  return localStorage.getItem(ANTHROPIC_KEY_STORAGE) || '';
}

export function storeApiKey(key) {
  localStorage.setItem(ANTHROPIC_KEY_STORAGE, key);
}

export async function tryAutoFetch(url) {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    return { ok: true, html };
  } catch (err) {
    return { ok: false, error: err.message || 'blocked (likely CORS)' };
  }
}

function extractVisibleText(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,noscript').forEach((el) => el.remove());
  const text = doc.body ? doc.body.textContent : '';
  return text.replace(/\s+/g, ' ').trim().slice(0, 12000);
}

export function detectSchema(html) {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const types = new Set();
  for (const [, json] of blocks) {
    try {
      const parsed = JSON.parse(json);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      items.forEach((item) => {
        const t = item && item['@type'];
        if (Array.isArray(t)) t.forEach((x) => types.add(x));
        else if (t) types.add(t);
      });
    } catch {
      // malformed JSON-LD — ignore this block, still counts as "present"
    }
  }
  return { present: blocks.length > 0, types: [...types] };
}

function looksLikeHtml(str) {
  return /<[a-z][\s\S]*>/i.test(str);
}

/**
 * @param {Object} opts
 * @param {string} opts.apiKey
 * @param {string} opts.model
 * @param {string} opts.url
 * @param {string} opts.content - raw pasted or fetched content (HTML or plain text)
 * @param {string[]} opts.targetQueries - real GSC non-branded queries, for grounding
 * @param {string} opts.siteName
 * @returns {Promise<{schema: {present:boolean,types:string[]}, analysis: Object}>}
 */
export async function analyzePage({ apiKey, model, url, content, targetQueries, siteName }) {
  const isHtml = looksLikeHtml(content);
  const schema = isHtml ? detectSchema(content) : { present: false, types: [] };
  const text = isHtml ? extractVisibleText(content) : content.trim().slice(0, 12000);

  if (!text) {
    throw new Error('No page content to analyze.');
  }

  const prompt = `You are auditing a business's web page for AEO (answer-engine optimization) readiness.

Site: ${siteName || 'unknown business'}
Page: ${url}
Real search queries customers use to find this kind of page (from Google Search Console, ranked by impressions): ${targetQueries.length ? targetQueries.join(', ') : '(none available)'}

Page text:
"""
${text}
"""

Answer two questions about this page:
1. answer_first: Does the page directly answer the core question/intent within the first 1-2 sentences, with concrete specifics (price, duration, location, etc.) rather than opening with marketing fluff?
2. customer_language: Does the page's wording match how customers actually search (the queries listed above), rather than relying only on internal/industry jargon?

Respond with ONLY a JSON object, no other text, in exactly this shape:
{"answer_first": {"verdict": "yes|partial|no", "evidence": "short quote or paraphrase from the page", "recommendation": "one sentence, empty string if verdict is yes"}, "customer_language": {"verdict": "yes|partial|no", "evidence": "short quote or paraphrase", "recommendation": "one sentence, empty string if verdict is yes"}}`;

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      // Prefilling the assistant turn with "{" stops Claude from adding any
      // preamble before the JSON — the response picks up mid-object, so we
      // stitch the "{" back on before parsing.
      messages: [
        { role: 'user', content: prompt },
        { role: 'assistant', content: '{' },
      ],
    }),
  });

  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body?.error?.message || '';
    } catch {
      /* ignore */
    }
    throw new Error(`Claude API ${res.status}${detail ? `: ${detail}` : ''}`);
  }

  const data = await res.json();
  const raw = `{${data.content?.[0]?.text || ''}`;

  if (data.stop_reason === 'max_tokens') {
    throw new Error("Claude's response was cut off before finishing (page content likely too long) — try pasting just the main visible text instead of the full page HTML.");
  }

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Could not find a JSON object in Claude's response. It started with: ${raw.slice(0, 150)}`);
  }
  let analysis;
  try {
    analysis = JSON.parse(jsonMatch[0]);
  } catch (err) {
    throw new Error(`Claude's response wasn't valid JSON (${err.message}). It started with: ${raw.slice(0, 150)}`);
  }

  return { schema, analysis };
}
