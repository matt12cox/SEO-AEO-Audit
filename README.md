# SEO / AEO Audit

A small client-side web app that produces the same SEO/AEO (search + AI
answer-engine) audit dashboard as the `seo-aeo-audit` Claude skill
(kept for reference in `reference/`), but as something you can run and
re-run yourself in a browser — pulling live data straight from Google
Search Console and GA4.

It's a static app: no backend, no server-side secrets. It talks to
Google's APIs directly from your browser using your own Google OAuth
credentials.

## What it does

1. You sign in with Google and grant read-only access to Search Console
   and GA4.
2. Pick a verified Search Console property, an optional GA4 property,
   a date range, and your brand terms (for branded vs. non-branded
   query splitting).
3. It pulls query-level and page-level Search Console performance,
   sitemap status, and GA4 sessions/engagement, and runs the same
   heuristics as the skill:
   - flags a missing sitemap
   - flags queries ranking #1–3 with zero clicks (classic Local
     Pack / Maps cannibalization pattern)
   - splits branded vs. non-branded clicks
   - finds non-branded queries with real impressions but weak
     rankings (content gaps)
   - builds a Now/Next/Later priority queue and a page-by-page
     content plan
   - gives a starting AEO checklist (schema, answer-first content,
     customer-language match) that's manual by default, or automated
     per-page if you set up the optional Claude check below
4. Renders it all into the same branded dashboard look as the
   original skill template, editable in place, with a one-click
   "Download standalone HTML" export you can hand to a client.
5. Each content-plan card has a "Copy draft-writing prompt for
   Claude" button — paste it into Claude (with the `seo-aeo-audit`
   skill, or `reference/SKILL.md`) to get the full publish-ready
   draft, since writing genuinely good, industry-fluent copy needs an
   LLM, not a heuristic.
6. A **Full Audit / Client Dashboard** toggle at the top of the results
   switches between the practitioner-facing audit above and a simpler,
   client-presentable report (see below) — both refreshable and
   exportable from the same data pull.

## Client Dashboard view

A second, simpler report built for showing directly to a client —
Executive Summary → Quick Wins → Content Gap Analysis → Top Pages
Audit — using only real GSC/GA4 data already pulled for the main
audit (no extra API calls, no paid keyword-research tool):

- **Executive summary**: 3-5 plain-English bullets synthesized from the
  same numbers as the full audit.
- **Quick wins**: queries already ranking position 4-20 with real
  impressions, ranked by estimated click uplift if they reached
  position 3. The uplift is `impressions × (benchmark CTR at position 3
  − benchmark CTR at current position)`, using a labeled industry CTR
  curve (Backlinko's 2026 organic CTR study, interpolated — see
  `CTR_BENCHMARK_SOURCE` in `assets/audit-engine.js`), never a
  measurement of this specific site's behavior at position 3. Every
  place this shows up says so explicitly — treat it as directional.
- **Content gap analysis**: the same non-branded-queries-with-no-page
  logic as the full audit's content plan, shown as a plain table.
- **Top pages audit**: cross-references GSC page-level clicks/CTR
  against GA4 landing-page sessions to flag pages whose CTR is well
  below the position's benchmark, or pages with GSC clicks but no
  matching GA4 sessions (a possible tracking gap, not necessarily a
  content problem).

This intentionally leaves out anything that would need a paid
keyword-volume/competitor-database tool (Semrush, Ahrefs, etc.) —
it's built to be free and scalable across any number of client sites,
since it only depends on each site's own connected GSC/GA4 accounts.

## One-time setup: Google OAuth credentials

This app needs a Google OAuth Client ID so it can ask Google for
permission to read your Search Console and GA4 data. Takes a few
minutes, does not require billing:

1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
   and create a project (or pick an existing one).
2. Under **APIs & Services → Library**, enable:
   - **Google Search Console API**
   - **Google Analytics Data API**
   - (optional, for auto-listing GA4 properties) **Google Analytics Admin API**
3. Under **APIs & Services → OAuth consent screen**, set it up as
   "External" + "Testing" and add your own Google account as a test
   user (this keeps it private to you, no Google review needed).
4. Back under **Credentials → Create Credentials → OAuth client ID**,
   choose **Web application**.
5. Under **Authorized JavaScript origins**, add the exact origin
   you'll run this app from, e.g. `http://localhost:8080` for local
   use, or your GitHub Pages / Netlify URL if you deploy it.
6. Copy the generated Client ID — the app will ask for it the first
   time you open it, and remembers it in `localStorage` after that.

## Optional: automated AEO content check

Two AEO checklist items — "answer-first content" and "content matches
how customers actually ask" — genuinely need judgment, not just a
number from an API. The dashboard has an "Automate the AEO content
check" panel for this that uses Claude directly from your browser:

1. Get an API key from [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys).
2. Paste it into the panel (remembered in `localStorage`, sent only to
   Anthropic — treat it like a password, and never deploy a copy of
   this app with a key baked in).
3. For each page you want checked, enter its URL and click **Try
   auto-fetch**. This will fail for most sites — browsers block
   cross-origin reads by default (the same restriction that keeps a
   random webpage from reading your other open tabs), and most
   ordinary sites don't opt out of it. When it fails, paste the page's
   HTML (view-source, or just the visible text) into the box below
   instead.
4. Click **Run AEO check**. Each page gets graded against your real
   top non-branded Search Console queries, so "matches customer
   language" is judged against actual search behavior, not a guess.
   Results land in the "AEO readiness" checklist below — click a row
   to expand it and see the evidence/recommendation per page.

This also deterministically detects JSON-LD schema (FAQPage, Service,
LocalBusiness, etc.) on any page whose HTML you provide — that part
doesn't need Claude at all.

Costs a small amount per page checked (a fraction of a cent to a
couple of cents on Sonnet, depending on page length).

## Running it

Any static file server works — this is plain HTML/CSS/JS with no
build step.

```bash
python3 -m http.server 8080
# or: npx serve .
```

Then open `http://localhost:8080` (matching whatever origin you
authorized above).

To make it permanently available, deploy the repo as-is to GitHub
Pages, Netlify, or similar, and add that URL as an authorized origin
in step 5 above.

## Project structure

```
index.html              app shell (setup → sign-in → scope → dashboard)
assets/app.css           chrome/wizard styling
assets/dashboard.css     the audit dashboard's visual design (also embedded
                          verbatim into exported standalone HTML files)
assets/google-auth.js    Google Identity Services OAuth wrapper
assets/api.js            Search Console + GA4 Data API calls
assets/audit-engine.js   data → findings/tickets/content-plan heuristics
assets/aeo-check.js      optional per-page Claude analysis + schema detection
assets/render.js         audit object → dashboard HTML, + standalone export
assets/main.js           screen wiring / app entry point
reference/SKILL.md              the original Claude skill this app is based on
reference/dashboard-template.html  the original dashboard template
```

## Scope notes

- Data only ever leaves your browser to go directly to Google's APIs
  — nothing is sent to any third-party server.
- The full skill (running inside Claude) also does industry research
  and writes complete, publish-ready content drafts by acting as an
  informed practitioner in the client's field. That step genuinely
  needs an LLM with web search, so it isn't reproduced here — instead
  each content-plan card gives you a ready-made prompt to hand to
  Claude for that part.
