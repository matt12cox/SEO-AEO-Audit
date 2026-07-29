---
name: seo-aeo-audit
description: Runs a full SEO/AEO (search + AI answer-engine) audit for a website using connected Google Search Console and GA4 data, then acts as an industry-fluent content expert to produce a content development plan — keyword targets, publishing timeline, and full publish-ready drafts — plus a prioritized fix-it queue and a branded HTML dashboard. Tracks recommendations across refresh runs so it reports whether a past fix worked instead of re-listing the same gap. Use whenever the user asks for an SEO audit, an AEO/AI-search-visibility audit, a content strategy, content calendar, content briefs/drafts tied to search performance, a "search performance review," or wants recommendations based on GSC/GA4/rankings/organic traffic for any site — even without saying "audit," and even with just one of GSC or GA4. Also use to repeat/refresh a prior audit, check if a past recommendation worked, or run this for a different client/site.
---

# SEO / AEO Audit Skill

Produces a data-grounded SEO and AEO (answer-engine optimization) audit for one site at a time: what's actually happening in Search Console and GA4, what it means, and what to do about it — packaged as a fix-it queue, a content plan with full drafts, and a shareable HTML dashboard. On repeat runs, it compares against the last audit so recommendations evolve instead of repeating.

Never invent metrics. Every number in the output must come from an actual tool call. If a data source isn't available or returns nothing, say so plainly in the audit rather than estimating.

## 0. Scope check

Run this whole workflow **per site**. If the user manages multiple clients/properties, do not blend data across them — repeat the full workflow separately for each, and produce a separate dashboard/history file per site (name everything `<site-slug>-...`).

## 1. Check for a prior audit (the learning loop)

Before pulling fresh data, look for a history file from a previous run: `history/<site-slug>-history.json` in the current workspace/project folder. Whether this exists depends on environment:
- **Cowork or Claude Code with a persistent project folder**: the file will simply be there if this site's been audited before — check for it directly.
- **A standalone claude.ai conversation with no carried-over files**: there's nothing to check automatically. Ask the user if they have the previous audit's history file or dashboard to share, so you can compare. If they don't have it or this is the first audit, proceed without comparison — that's expected and fine, just don't fabricate a "before" state.

If a history file is found, load it. It contains, per prior recommendation: what was recommended, when, the baseline metric(s) for its target keyword/page at that time, and (if known) when the fix was implemented.

## 2. Get connected

Check current tool list for a connected analytics/marketing connector (e.g. Supermetrics, or any MCP tool exposing Google Search Console / GA4 data). If none is connected:
- `search_mcp_registry` with keywords like `["Google Search Console","Google Analytics","GA4","SEO"]`
- `suggest_connectors` with the results and let the user pick
- Wait for their choice before calling anything

Once connected, discover the actual data sources available (method depends on connector — for Supermetrics, use `data_source_discovery` filtered to "search console" / "analytics"). Don't assume a specific ds_id naming — different connectors label GSC/GA4 differently. Confirm AUTHENTICATED status for both before proceeding; if one is missing, get the login link and ask the user to authenticate, then re-check.

Pull the account/property list (`accounts_discovery` or equivalent) and **read the property/site name back to the user for confirmation** before pulling performance data — wrong-account mix-ups are common and hard to catch after the fact.

## 3. Scope the audit

Ask (via `ask_user_input_v0` if available, otherwise inline):
- Time range (28 days / 3 / 6 / 12 months)
- Focus: general SEO health, local SEO ("near me" / service-area), AEO/AI-answer visibility, or all of the above

Default to 3 months and "all of the above" if the user wants you to just proceed without asking.

## 4. Pull Search Console data

For the chosen date range, pull:
- **Query-level**: query, clicks, impressions, ctr, position (standard search performance report)
- **Page-level**: page/landing page, clicks, impressions, ctr, position
- **Sitemap status**: path, submitted, indexed, last downloaded, warnings, errors — this often returns "no data found," which itself means **no sitemap has ever been submitted** — flag this explicitly, it's a common and easy fix.

Look specifically for this pattern, common on local-business and small sites: **queries at or near position 1 with 0 clicks**. This usually means the Google Local Pack / Maps panel (or another SERP feature) is absorbing the click before the searcher reaches organic results. Call this out by name when it appears — it's one of the highest-value findings this audit surfaces, and totally invisible if you only look at aggregate CTR.

Also split clicks into branded vs. non-branded queries. A site living entirely on branded-term clicks (people who already know the business) with ~0 non-branded clicks is a distinct, important finding from a site with healthy generic-query traffic.

## 5. Pull GA4 data

Pull sessions, engaged sessions, engagement rate, average session duration, conversions, bounce rate — both as a daily trend and broken out by channel + landing page.

**If GA4 returns "no data found" across all date ranges tried (including a wide one like last 365 days):** don't guess. Say plainly that either (a) the GA4 tag isn't installed/firing on the live site, (b) the connected property isn't the one actually receiving traffic, or (c) tracking was installed too recently for data to have processed yet (GA4 typically takes an initial processing window — if the user confirms recent install, note that and offer to recheck later rather than treating it as broken).

**If GA4 has very little data (e.g. installed in the last few days):** present it, but explicitly label it as early signal, not a trend, and say roughly when it'll be reliable (a couple of weeks of steady traffic).

## 6. Verify against the live site

GSC/GA4 both lag reality — a page can exist and even get organic sessions before GSC shows it as indexed. Don't take "GSC only shows the homepage" as proof the site is single-page. Use `web_search` (e.g. `site:domain.com`) to surface actual live URLs, then `web_fetch` them to see the real current site structure, before writing findings about site structure or content gaps. If a URL isn't discoverable via search (e.g. genuinely unindexed), say so rather than guessing at its existence.

## 7. Compare against history (if a prior audit was found in step 1)

For every item in the prior history file, check its target keyword/page against the fresh data just pulled:
- **Not enough time has passed** (rule of thumb: under ~2 weeks since implementation) — don't judge it yet. Note it's still early.
- **Improved** — position moved up, impressions/clicks/indexing status improved meaningfully. Credit it explicitly in the findings ("the Murray Hill page fix is working — position moved from X to Y").
- **Unchanged / stalled** — implemented long enough ago (2+ weeks, ideally longer for content plays) with no meaningful movement in its target keyword. Don't just re-list the same recommendation again. Instead, diagnose *why* it might have stalled and propose a different next step, e.g.:
  - Content published but not indexed yet — check indexing directly rather than assuming
  - Indexed but thin/short relative to competitors — needs more depth
  - No internal links pointing to it from higher-authority pages
  - No external signal (citations, GBP posts, backlinks) reinforcing it
  - Targeting a keyword with intent or competition mismatch — may need retargeting
  - Give this its own clearly-labeled section in the findings ("Progress since last audit") rather than burying it in the generic findings cards.

If no history file was available, skip this step silently — don't apologize for missing data that was never expected to exist yet (e.g. a first-ever audit).

## 8. Synthesize findings

Organize into these categories, in this order of priority:
1. **Progress since last audit** (step 7 output, if applicable) — what worked, what stalled and why, before anything else
2. **Structural/technical** (indexing, sitemap, tracking installation) — usually highest-leverage, lowest-effort fixes
3. **Local Pack / map cannibalization** (if applicable — local business with #1-position, 0-click queries)
4. **Content gaps** (non-branded queries with impressions but no dedicated page/content targeting them)
5. **AEO readiness** (see below)

### AEO-specific notes
- Google retired the visual FAQ rich-result dropdown from Search in **May 2026**. Do NOT recommend FAQ schema on the promise of a rich-result snippet — that's no longer accurate for any site. The remaining value of FAQPage/Service/LocalBusiness schema is making content cleanly machine-readable for AI answer engines (AI Overviews, ChatGPT, Perplexity), not classic SERP appearance. State this distinction explicitly whenever recommending schema.
- Favor direct, extractable, answer-first content (concrete prices, durations, specifics) over marketing copy — this is what gets cited by AI answer engines.
- If the user asks how to actually add schema and the site isn't accessible via web_fetch (common — new/unindexed pages aren't reachable through search-based fetch), don't stall: ask what platform/host the site is on (Squarespace/Webflow/WordPress/custom+Git/Netlify without Git/etc.) since the "how" genuinely differs by platform, and tailor instructions accordingly. Offer to write the exact JSON-LD if the user pastes the real page content.

## 9. Research the client's industry (become the expert)

Before writing any content plan or draft, spend a few `web_search` calls understanding the specific industry/niche — not generic SEO advice, the actual subject matter. Look for: what customers in this space actually ask before buying/booking, common objections or confusions, terminology insiders use vs. terminology customers search for, and what competitors' content looks like. This is what separates a content plan that "sounds like SEO" from one that sounds like it was written by someone who knows the business.

Write everything downstream — keyword targets, drafts, tone — as this kind of informed practitioner, not as a generic marketer. Match the register the site itself already uses (checked in step 6) so new content doesn't clash with existing pages.

## 10. Build the content plan: keyword targets + timeline

For each content gap identified in step 8 (including any stalled item from step 7 that needs a *different* approach, not a repeat), produce a plan entry with:
- **Page/post title** and URL slug
- **Content type**: existing-page rewrite, new service/location page, blog post, or FAQ expansion
- **Primary keyword target** + 2-4 supporting keywords, pulled from real GSC query data wherever possible (not invented). If a gap is real but has no existing impression data (e.g. a genuinely new topic), say so explicitly rather than presenting a guessed term as if it came from GSC.
- **Search intent** (informational / local-commercial / transactional / comparison)
- **Why it closes an SEO or AEO gap** — be specific about which (e.g. "closes non-branded discovery gap" vs. "improves AI-answer citability")
- **Timeline**: sequence items across a realistic publishing cadence (e.g. weekly or biweekly for a small business, not 10 pieces in week one) — order by effort-to-impact, with structural/quick fixes from step 8 done first, then this content rolled out afterward. State actual target dates or week numbers ("Week 1", "Week 3") relative to the audit date, not vague "soon."

Present this as a calendar/table (in the dashboard or as a companion file — see step 12) before writing full drafts, and give the user a chance to react to scope/sequencing if the conversation allows for a check-in, especially if the plan is large (6+ pieces).

## 11. Write full content drafts

For every item in the content plan, write a complete, publish-ready draft — not a brief or outline. Each draft should:
- Open by directly answering the core question/intent within the first 1-2 sentences (AEO-friendly: front-loaded, extractable, quotable) before expanding
- Naturally incorporate the primary and supporting keywords without stuffing
- Include concrete, specific detail (real prices/durations/specifics gathered in earlier steps, or clearly marked placeholders like `[INSERT PRICE]` if the real figure isn't known) — specificity is what makes content both rank and get cited by AI answer engines
- Include a suggested title tag (under ~60 chars) and meta description (under ~155 chars)
- For FAQ-style content, format as clear Q&A pairs ready to drop into FAQPage schema (remember: schema still valuable for AI-answer parsing, not for the retired rich-result dropdown)
- Match the site's actual existing tone/voice from step 6, and reflect the industry fluency from step 9

Output each draft as its own file — use the `docx` skill if the user wants Word deliverables for client handoff, otherwise plain markdown files (one per piece) are fine. Name files by slug, e.g. `content-drafts/murray-hill-barber.md`. Don't cram full drafts into the HTML dashboard — link/list them from a "Content Plan" section instead, so the dashboard stays a scannable overview and the drafts stay easy to copy into a CMS.

## 12. Build the dashboard

Copy `assets/dashboard-template.html` to the workspace, then fill in every `{{PLACEHOLDER}}` with real figures and findings from steps 4-8, plus the content calendar from step 10 (each plan card should show its keyword targets and timeline slot, and link/name the corresponding draft file from step 11). If step 7 produced a progress comparison, give it its own section near the top of the dashboard, not folded silently into general findings. Do not leave placeholder text in the final file — every section should reflect this site's actual data. Follow the file's inline comments for what belongs in each section. Save the final file as `<site-slug>-seo-audit.html`, present it alongside all content-draft files from step 11 via `present_files` (or the file-share method available in the current environment).

Keep the same information architecture as the template: stat strip → progress-since-last-audit (if applicable) → findings cards → #1-rank/zero-click table (only include if applicable) → priority ticket queue (Now/Next/Later) → content plan cards per page (with keyword targets, timeline, draft filename) → AEO checklist → GA4 section (clearly labeled if data is early/thin/missing).

## 13. Save the history snapshot

Write/overwrite `history/<site-slug>-history.json` with this audit's state, so the *next* run (step 1) can compare against it. Include, for every open ticket and content-plan item:
- item name/description, date recommended, date implemented (if known/reported by the user)
- baseline metric snapshot at time of this audit (position, impressions, clicks, or indexing status — whatever's relevant to that item)
- status (open / implemented-too-early-to-judge / improved / stalled)

Keep this file machine-readable and compact — it's read by this skill, not meant as a human-facing deliverable. If the environment has no persistent storage (a one-off claude.ai conversation), still write it to the workspace and mention to the user that saving/re-uploading it next time is what enables the comparison in step 7.

## 14. Offer next steps

At the end, mention (don't push) that:
- This same workflow can be re-run for other client sites — just needs their GSC/GA4 authenticated under the same connector
- A recurring refresh (e.g. every 2-4 weeks) works well as a scheduled task in Claude Cowork, pointed at the same connectors and project folder — this is also what makes the history comparison in step 7 fully automatic, since Cowork's project folder persists between runs
- One-off technical fixes (schema, sitemap files, code-level changes) are often faster to execute directly in Claude Code if the user has repo/file access
