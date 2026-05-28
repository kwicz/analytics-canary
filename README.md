# Analytics Audit

A measurement audit tool built by [The Good](https://thegood.com) that surfaces broken tags, missing events, and data quality gaps across a client's full analytics stack — the kind of issues GA4's UI silently hides.

![Analytics Audit screenshot](screenshots/overview.png)

---

## What it audits

### Module 01 — GTM Container
Pulls the live container version via the Tag Manager API and runs smart checks:
- Tags that are paused, have no trigger, or are broken
- Universal Analytics tags still active after the July 2023 sunset
- Zero GA4 Configuration tags (events would be silently dropped)
- Multiple GA4 Configuration tags (inflates page_view and session counts)
- Triggers with no tags wired (dead weight)

### Module 02 — GA4 Events
Queries the GA4 Data API for the last 30 days and flags:
- Events with zero hits in the last 7 days but volume in the last 30 (tracking outage)
- Events below expected volume relative to their 30-day baseline
- Missing ecommerce events (`view_item_list`, `view_promotion`, `remove_from_cart`, etc.)
- Impossible funnel ratios (more purchases than begin_checkout = duplicate firing)
- Session starts significantly exceeding page views (GA4 config tag double-loading)

### Module 03 — BigQuery Deep Audit
Runs 7 SQL checks directly against the GA4 BQ export:

| # | Check | What it catches |
|---|---|---|
| Q1 | Purchase funnel conversion rates | Step-by-step drop-off; impossible ratios |
| Q2 | Purchase parameter completeness | Missing `transaction_id`, `value`, `currency`, `items[]` |
| Q3 | Duplicate event schemas | Same event fired with different parameter shapes |
| Q4 | Session source/medium coverage | NULL attribution inflating direct traffic |
| Q5 | Experiment impression tracking | A/B test assignment purity |
| Q6 | Daily event volume gaps | Days with zero hits on critical events |
| Q7 | Item data quality | `item_id`, `item_name`, `price`, `item_category` coverage on purchases |

All BQ findings feed into the unified severity report alongside GTM and GA4 findings.

---

## Getting started

### Prerequisites
- Node.js 18+
- A Google Cloud project with the following APIs enabled:
  - Tag Manager API
  - Google Analytics Data API
  - Google Analytics Admin API
  - BigQuery API
  - Cloud Resource Manager API
- An OAuth 2.0 Client ID (Web application type) with `http://localhost:8080` as an authorized JavaScript origin

### Install and run

```bash
npm install
npm start
# → http://localhost:8080
```

For development with auto-restart on file changes:

```bash
npm run dev
```

### One-time OAuth setup

1. Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials
2. Create Credentials → OAuth 2.0 Client ID → Web application
3. Add `http://localhost:8080` under Authorized JavaScript origins
4. Copy the Client ID — it ends in `.apps.googleusercontent.com`
5. Paste it into the Setup screen (it's saved to `localStorage` for future runs)

The app requests read-only scopes only:
- `tagmanager.readonly`
- `analytics.readonly`
- `cloudplatformprojects.readonly`
- `bigquery.readonly`

### Service account (optional)
For automated or headless runs, paste a service account JSON key instead of using OAuth. The account needs Viewer access on the GTM container, GA4 property, and BigQuery dataset.

---

## Architecture

No build step. The app is a single Express server serving static files + a small API layer.

```
server.js          Express server — auth, GTM/GA4/BQ API proxy
index.html         Entry point — loads React 18 + Babel standalone
app.jsx            Root component, routing, audit orchestration
flow.jsx           Setup form, Running screen, Report
modules.jsx        Overview, GTM module, GA4 module
bq-module.jsx      BigQuery module — live query runner, findings generator
components.jsx     Shared UI (Icon, Badge, Sparkline, etc.)
data.jsx           Demo data + BQ query definitions
app.css            Styles
```

The frontend uses React 18 via CDN with Babel standalone for JSX transpilation — no bundler required. All API calls are proxied through the Express server to keep OAuth tokens off the client.

### How findings work
- GTM and GA4 findings are generated server-side in `server.js` (`transformGTMVersion`, `transformGA4`)
- BQ findings are generated client-side in `bq-module.jsx` as each query completes
- All findings land in `window.findings` (GTM + GA4) and `window.bqFindings` (BQ)
- `window.findingsBy(severity)` combines both arrays — Overview and Report read from it automatically

---

## Demo mode

Run the app without credentials to see a fully populated demo with realistic findings. Use the **Tweaks** panel (bottom-right cog) to jump directly to the results view.

---

## Deployment

The app is a standard Node/Express server. Set the `PORT` environment variable if needed (defaults to `8080`).

For production, update the authorized JavaScript origins in your OAuth Client ID to include your public domain.

---

## Security notes

- OAuth tokens are stored in an in-memory session map on the server (not in cookies or localStorage) and expire after 1 hour
- All Google API calls are made server-side — the access token is never exposed to the browser beyond the initial OAuth callback
- No analytics data is stored, logged, or transmitted anywhere beyond your own Google APIs
