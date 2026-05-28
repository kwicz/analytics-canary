/* global window */
/* =============================================================
   Mock audit data — a realistic-feeling audit of a fictional
   ecommerce client. The audit deliberately surfaces a mix of
   critical, warning, and info severity issues so the UI has
   something to actually report.
   ============================================================= */

const auditMeta = {
  client: "peakperformance-supps.com",
  gtmContainer: "GTM-NXKD8M2",
  ga4Property: "G-9X4LV2KW7Q",
  bqDataset: "{{BQ_TABLE}}",
  ranAt: "May 27, 2026 · 11:42 ET",
  runDuration: "2m 14s",
  auditedBy: "stack-audit",
};

/* ---------- Module 1 — GTM ---------- */
const gtmTags = [
  { name: "GA4 Configuration",            type: "Google Analytics: GA4 Configuration", trigger: "All Pages",                 status: "firing",     lastFired: "3s ago",   notes: "" },
  { name: "GA4 Event — page_view",        type: "Google Analytics: GA4 Event",         trigger: "All Pages",                 status: "firing",     lastFired: "3s ago",   notes: "" },
  { name: "GA4 Event — view_item",        type: "Google Analytics: GA4 Event",         trigger: "PDP — DL view_item",        status: "firing",     lastFired: "8s ago",   notes: "" },
  { name: "GA4 Event — add_to_cart",      type: "Google Analytics: GA4 Event",         trigger: "Click — .pdp__atc-btn",     status: "broken",     lastFired: "4d ago",   notes: "CSS selector .pdp__atc-btn no longer exists in DOM" },
  { name: "GA4 Event — begin_checkout",   type: "Google Analytics: GA4 Event",         trigger: "Cart — DL begin_checkout",  status: "firing",     lastFired: "1m ago",   notes: "" },
  { name: "GA4 Event — purchase",         type: "Google Analytics: GA4 Event",         trigger: "Thank-you — DL purchase",   status: "misconfig",  lastFired: "6m ago",   notes: "transaction_id parameter unbound — pulls from {{DLV - order.id}} which returns undefined ~53% of pageviews" },
  { name: "Meta Pixel — Base",            type: "Custom HTML",                          trigger: "All Pages",                 status: "firing",     lastFired: "3s ago",   notes: "" },
  { name: "Meta Pixel — Purchase",        type: "Custom HTML",                          trigger: "Thank-you — DL purchase",   status: "firing",     lastFired: "6m ago",   notes: "" },
  { name: "TikTok Pixel — Base",          type: "Custom HTML",                          trigger: "All Pages",                 status: "notfiring",  lastFired: "never",    notes: "Defined but trigger condition (URL contains /tt-test) never matches in production" },
  { name: "Klaviyo — Identify",           type: "Custom HTML",                          trigger: "Login Success",             status: "firing",     lastFired: "12m ago",  notes: "" },
  { name: "Klaviyo — Viewed Product",     type: "Custom HTML",                          trigger: "PDP — DL view_item",        status: "firing",     lastFired: "8s ago",   notes: "" },
  { name: "Microsoft Clarity",            type: "Custom HTML",                          trigger: "All Pages",                 status: "firing",     lastFired: "3s ago",   notes: "" },
  { name: "Hotjar",                       type: "Custom HTML",                          trigger: "All Pages",                 status: "firing",     lastFired: "3s ago",   notes: "" },
  { name: "Optimizely — Snippet",         type: "Custom HTML",                          trigger: "All Pages",                 status: "warn",       lastFired: "3s ago",   notes: "Tag fires after first paint (avg 1.4s) — variant flicker likely on 12% of sessions" },
  { name: "Trustpilot Widget Loader",     type: "Custom HTML",                          trigger: "PDP — DL view_item",        status: "warn",       lastFired: "8s ago",   notes: "References variable {{Page Path Stripped}} which is undefined" },
  { name: "LinkedIn Insight",             type: "LinkedIn Insight",                     trigger: "All Pages",                 status: "notfiring",  lastFired: "never",    notes: "Tag paused. Defined 11 months ago — consider removing" },
];

const gtmCounts = {
  total: gtmTags.length,
  firing: gtmTags.filter(t => t.status === "firing").length,
  broken: gtmTags.filter(t => t.status === "broken" || t.status === "misconfig").length,
  notFiring: gtmTags.filter(t => t.status === "notfiring").length,
  warn: gtmTags.filter(t => t.status === "warn").length,
};

const gtmTriggers = [
  { name: "All Pages",                   type: "Page View",            tags: 6, status: "ok"   },
  { name: "Click — .pdp__atc-btn",       type: "Click — CSS selector", tags: 1, status: "broken", note: "Selector not present on live DOM" },
  { name: "PDP — DL view_item",          type: "Custom Event",         tags: 3, status: "ok"   },
  { name: "Cart — DL begin_checkout",    type: "Custom Event",         tags: 1, status: "ok"   },
  { name: "Thank-you — DL purchase",     type: "Custom Event",         tags: 2, status: "ok"   },
  { name: "URL contains /tt-test",       type: "Page View — Some",     tags: 1, status: "stale",  note: "Never matches in prod traffic — leftover from QA" },
  { name: "Login Success",               type: "Custom Event",         tags: 1, status: "ok"   },
];

const gtmVariables = [
  { name: "DLV - order.id",            type: "Data Layer Variable",  status: "broken", note: "Resolves on 47% of /thank-you pageviews — dataLayer push missing on Recharge subscription orders" },
  { name: "DLV - order.value",         type: "Data Layer Variable",  status: "ok" },
  { name: "DLV - order.currency",      type: "Data Layer Variable",  status: "ok" },
  { name: "DLV - order.items",         type: "Data Layer Variable",  status: "ok" },
  { name: "Page Path Stripped",        type: "Custom JavaScript",    status: "broken", note: "Throws ReferenceError on non-string window.location.pathname (~0.1%)" },
  { name: "User ID",                   type: "First-Party Cookie",   status: "ok" },
  { name: "GA4 Measurement ID",        type: "Constant",             status: "ok" },
];

/* ---------- Module 2 — GA4 ---------- */
const ga4Events = [
  { name: "page_view",          h7: 482193, h30: 2134872, conversion: false, status: "ok",    spark: [70,73,71,75,72,78,76,80,78,82,79,85,82,84,80] },
  { name: "session_start",      h7: 391440, h30: 1728810, conversion: false, status: "ok",    spark: [68,70,69,72,70,74,73,75,72,78,76,80,77,79,76] },
  { name: "user_engagement",    h7: 412889, h30: 1843921, conversion: false, status: "ok",    spark: [72,74,72,76,74,77,76,79,77,81,79,83,81,82,80] },
  { name: "scroll",             h7: 287011, h30: 1271049, conversion: false, status: "ok",    spark: [60,62,60,63,62,65,64,67,66,68,67,70,68,70,68] },
  { name: "view_item",          h7: 138209, h30: 612330,  conversion: false, status: "ok",    spark: [55,58,56,60,58,62,60,64,62,66,64,68,66,68,65] },
  { name: "select_item",        h7: 22481,  h30: 99012,   conversion: false, status: "ok",    spark: [40,42,41,44,42,45,44,46,45,47,46,48,47,48,46] },
  { name: "add_to_cart",        h7: 0,      h30: 14200,   conversion: false, status: "crit",  spark: [50,52,51,54,52,55,54,56,0,0,0,0,0,0,0], note: "Zero hits in last 4 days — tracking outage" },
  { name: "begin_checkout",     h7: 12389,  h30: 51927,   conversion: true,  status: "ok",    spark: [38,40,39,42,40,43,42,44,43,45,44,46,45,46,44] },
  { name: "add_payment_info",   h7: 9103,   h30: 39488,   conversion: false, status: "ok",    spark: [30,32,31,33,32,34,33,35,34,36,35,37,36,37,35] },
  { name: "purchase",           h7: 3212,   h30: 13809,   conversion: true,  status: "warn",  spark: [22,24,23,25,24,26,25,27,26,28,27,29,28,29,27], note: "47% of events missing transaction_id parameter" },
  { name: "search",             h7: 8012,   h30: 33920,   conversion: false, status: "ok",    spark: [25,27,26,28,27,29,28,30,29,31,30,32,31,32,30] },
  { name: "login",              h7: 1209,   h30: 4392,    conversion: false, status: "ok",    spark: [12,13,12,14,13,15,14,16,15,16,15,17,16,17,15] },
  { name: "sign_up",            h7: 89,     h30: 412,     conversion: true,  status: "ok",    spark: [4,5,4,5,4,5,4,6,5,6,5,6,5,6,5] },
  { name: "newsletter_signup",  h7: 412,    h30: 1809,    conversion: true,  status: "warn",  spark: [8,9,8,9,8,10,9,10,9,11,10,11,10,11,9], note: "Custom event — schema differs from form_submit standard" },
  { name: "view_promotion",     h7: 0,      h30: 0,       conversion: false, status: "info",  spark: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], note: "Recommended ecommerce event not implemented" },
];

const ga4MissingEvents = [
  { name: "view_promotion",   why: "Banner / promotion impressions not tracked. Cannot attribute revenue to merch placements." },
  { name: "select_promotion", why: "Banner / promotion clicks not tracked. Pairs with view_promotion for CTR analysis." },
  { name: "remove_from_cart", why: "Cannot diagnose cart abandonment at the line-item level." },
  { name: "view_cart",        why: "Cart-page entry is invisible. Funnel between PDP and begin_checkout has a missing rung." },
];

const ga4Conversions = [
  { name: "purchase",          h7: 3212, conversionRate: "1.84%", status: "warn",  note: "Tracked, but 47% missing transaction_id — revenue unreliable" },
  { name: "begin_checkout",    h7: 12389, conversionRate: "7.11%", status: "ok" },
  { name: "sign_up",           h7: 89,   conversionRate: "0.05%", status: "ok" },
  { name: "newsletter_signup", h7: 412,  conversionRate: "0.24%", status: "warn",  note: "Underfiring vs. site form submission rate — likely scoped to footer form only" },
];

/* ---------- Module 3 — BigQuery ---------- */
const bqQueries = [
  {
    id: "funnel",
    title: "Purchase funnel conversion rates",
    why: "Measures step-by-step drop-off from product view through to purchase. Unusually low rates isolate friction points; impossible rates (later step > earlier step) confirm tracking breakage.",
    sql: `-- Purchase funnel event counts · last 30 days
SELECT
  COUNTIF(event_name = 'view_item')       AS view_item,
  COUNTIF(event_name = 'add_to_cart')     AS add_to_cart,
  COUNTIF(event_name = 'begin_checkout')  AS begin_checkout,
  COUNTIF(event_name = 'purchase')        AS purchase
FROM \`{{BQ_TABLE}}.events_*\`
WHERE _TABLE_SUFFIX BETWEEN
  FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY))
  AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
  AND event_name IN ('view_item','add_to_cart','begin_checkout','purchase');`,
    mockResult: {
      view_item: 612330,
      add_to_cart: 14200,
      begin_checkout: 51927,
      purchase: 13809,
    },
  },
  {
    id: "params",
    title: "Purchase parameter completeness",
    why: "Purchase events without transaction_id, value, currency, or items make revenue data unusable. This query measures how often each parameter is populated.",
    sql: `-- Purchase parameter completeness · last 30 days
-- currency lives in event_params, not the ecommerce struct
SELECT
  COUNT(*) AS purchase_events,
  COUNTIF(ecommerce.transaction_id IS NOT NULL) AS with_transaction_id,
  COUNTIF(ecommerce.purchase_revenue IS NOT NULL) AS with_value,
  COUNTIF(
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'currency') IS NOT NULL
  ) AS with_currency,
  COUNTIF(ARRAY_LENGTH(items) > 0) AS with_items
FROM \`{{BQ_TABLE}}.events_*\`
WHERE _TABLE_SUFFIX BETWEEN
  FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY))
  AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
  AND event_name = 'purchase';`,
    mockResult: {
      purchase_events: 13809,
      with_transaction_id: 6492,
      with_value: 13720,
      with_currency: 13740,
      with_items: 13041,
    },
  },
  {
    id: "dupes",
    title: "Duplicate event schemas",
    why: "When the same event_name is fired with different parameter shapes, aggregates become meaningless. This finds events that have more than one distinct parameter set.",
    sql: `-- Custom-parameter schema consistency · last 14 days
-- Excludes standard GA4 auto-collected params so only real business-logic
-- inconsistencies surface (e.g. purchase sending different custom params)
SELECT
  event_name,
  COUNT(DISTINCT TO_JSON_STRING(
    ARRAY(
      SELECT key FROM UNNEST(event_params)
      WHERE key NOT IN (
        'ga_session_id','ga_session_number','page_location','page_title','page_referrer',
        'engaged_session_event','engagement_time_msec','session_engaged','entrances',
        'percent_scrolled','link_url','link_domain','link_classes','link_id','link_text',
        'outbound','file_name','file_extension','video_current_time','video_duration',
        'video_percent','video_provider','video_title','video_url','campaign','source',
        'medium','term','content','gclid','debug_mode','ignore_referrer',
        'firebase_event_origin','screen_resolution','language','synthetic_bundle'
      )
      ORDER BY key
    )
  )) AS distinct_schemas,
  COUNT(*) AS event_count
FROM \`{{BQ_TABLE}}.events_*\`
WHERE _TABLE_SUFFIX BETWEEN
  FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 14 DAY))
  AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
GROUP BY event_name
HAVING distinct_schemas > 1
  AND event_count > 50
ORDER BY distinct_schemas DESC;`,
    mockResult: [
      {
        event_name: "add_to_cart", distinct_schemas: 3, event_count: 14200,
        // schemaVariants used for demo drill-down only (live mode re-queries BQ)
        schemaVariants: [
          { params: ["currency", "items", "value"],                              event_count: 12440 },
          { params: ["items", "value"],                                           event_count: 1180 },
          { params: ["currency", "items", "transaction_id", "value"],             event_count: 580  },
        ],
      },
      {
        event_name: "newsletter_signup", distinct_schemas: 2, event_count: 1809,
        schemaVariants: [
          { params: ["email_type", "list_name"],  event_count: 1622 },
          { params: ["email_type"],               event_count: 187  },
        ],
      },
      {
        event_name: "purchase", distinct_schemas: 2, event_count: 13809,
        schemaVariants: [
          { params: ["coupon", "currency", "items", "shipping", "tax", "transaction_id", "value"], event_count: 12300 },
          { params: ["currency", "items", "transaction_id", "value"],                              event_count: 1509 },
        ],
      },
    ],
  },
  {
    id: "source",
    title: "Session source / medium coverage",
    why: "Sessions with a NULL source/medium can't be attributed. High null rates suggest GA4 tagging on entry pages is firing before the gtag config or that consent mode is silently blocking enrichment.",
    sql: `-- Session source/medium null coverage · last 7 days
-- Uses session_start events; ga_session_id is in event_params not a top-level column
SELECT
  COUNT(*) AS sessions,
  COUNTIF(traffic_source.source IS NULL) AS null_source,
  ROUND(COUNTIF(traffic_source.source IS NULL) / COUNT(*) * 100, 2) AS null_pct
FROM \`{{BQ_TABLE}}.events_*\`
WHERE _TABLE_SUFFIX BETWEEN
  FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY))
  AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
  AND event_name = 'session_start';`,
    mockResult: {
      sessions: 89421,
      null_source: 11894,
      null_pct: 13.30,
    },
  },
  {
    id: "experiment",
    title: "A/B test variant assignment integrity",
    why: "If experiment events fire before the page is ready or after the user has scrolled, variant assignment is contaminated. This counts experiment events by assignment timing.",
    sql: `-- Experiment variant assignment timing · last 30 days
SELECT
  (SELECT value.string_value FROM UNNEST(event_params)
   WHERE key = 'experiment_id') AS experiment_id,
  (SELECT value.string_value FROM UNNEST(event_params)
   WHERE key = 'variant_id') AS variant_id,
  COUNT(*) AS assignments,
  COUNTIF((SELECT value.int_value FROM UNNEST(event_params)
    WHERE key = 'engagement_time_msec') > 1000) AS post_engagement_assignments
FROM \`{{BQ_TABLE}}.events_*\`
WHERE event_name = 'experiment_impression'
  AND _TABLE_SUFFIX BETWEEN
    FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY))
    AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
GROUP BY experiment_id, variant_id
ORDER BY experiment_id, variant_id;`,
    mockResult: [
      { experiment_id: "pdp-hero-v3", variant_id: "control",  assignments: 24081, post_engagement_assignments: 3204 },
      { experiment_id: "pdp-hero-v3", variant_id: "treatment", assignments: 24210, post_engagement_assignments: 3199 },
      { experiment_id: "cart-cta-04", variant_id: "control",  assignments: 12903, post_engagement_assignments: 1411 },
      { experiment_id: "cart-cta-04", variant_id: "treatment", assignments: 12851, post_engagement_assignments: 1398 },
    ],
  },
  {
    id: "gaps",
    title: "Daily event volume — gap detection",
    why: "GA4's UI smooths over outages. This pulls daily counts for key events so you can spot the day tracking went dark.",
    sql: `-- Daily volume of business-critical events · last 30 days
SELECT
  PARSE_DATE('%Y%m%d', event_date) AS day,
  event_name,
  COUNT(*) AS hits
FROM \`{{BQ_TABLE}}.events_*\`
WHERE _TABLE_SUFFIX BETWEEN
  FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY))
  AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
  AND event_name IN
    ('view_item','add_to_cart','begin_checkout','purchase')
GROUP BY day, event_name
ORDER BY day, event_name;`,
    mockResult: {
      summary: "add_to_cart counts → 0 on May 24, 25, 26, 27. All other events steady.",
      flagged: [
        { event_name: "add_to_cart", first_zero_day: "2026-05-24", days_at_zero: 4 },
      ],
    },
  },
  {
    id: "items",
    title: "Item data quality",
    why: "Purchases without item_id, item_name, or price make product-level revenue analysis impossible in GA4, Looker Studio, and any downstream BI tool. This checks field coverage across all items arrays on purchase events.",
    sql: `-- Item field coverage on purchase events · last 30 days
SELECT
  COUNT(*) AS purchase_events,
  COUNTIF(EXISTS(SELECT 1 FROM UNNEST(items) WHERE item_id       IS NOT NULL)) AS with_item_id,
  COUNTIF(EXISTS(SELECT 1 FROM UNNEST(items) WHERE item_name     IS NOT NULL)) AS with_item_name,
  COUNTIF(EXISTS(SELECT 1 FROM UNNEST(items) WHERE price         IS NOT NULL)) AS with_price,
  COUNTIF(EXISTS(SELECT 1 FROM UNNEST(items) WHERE item_category IS NOT NULL)) AS with_category,
  COUNTIF(ARRAY_LENGTH(items) = 0 OR items IS NULL)                            AS no_items
FROM \`{{BQ_TABLE}}.events_*\`
WHERE _TABLE_SUFFIX BETWEEN
  FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY))
  AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
  AND event_name = 'purchase';`,
    mockResult: {
      purchase_events: 13809,
      with_item_id: 13521,
      with_item_name: 13631,
      with_price: 13720,
      with_category: 8041,
      no_items: 768,
    },
  },
];

/* ---------- Aggregate findings (used in Overview + Report) ---------- */
const findings = [
  {
    severity: "critical", module: "GTM", id: "gtm-atc-broken",
    title: "GA4 add_to_cart tag is not firing on the live site",
    desc: "The GA4 Event — add_to_cart tag in container GTM-NXKD8M2 is wired to a click trigger on CSS selector .pdp__atc-btn. That selector does not exist on the current PDP DOM — the May 23 PDP redesign renamed it to .product__add-to-cart. Tag has fired zero times in 4 days.",
    fix: "Update the click trigger to match .product__add-to-cart, or migrate to a dataLayer push from the PDP component. Verify via GTM Preview before publishing.",
  },
  {
    severity: "critical", module: "GA4", id: "ga4-atc-zero",
    title: "add_to_cart event has zero hits in the last 7 days",
    desc: "Confirmed downstream of the GTM breakage above. GA4 has recorded no add_to_cart events since May 24. 30-day baseline was ~2,000/day. This invalidates funnel analysis between view_item and begin_checkout.",
    fix: "Same root cause as the GTM issue. After fixing the trigger, backfill annotation in GA4 with a note on the outage window so it's flagged in future analyses.",
  },
  {
    severity: "critical", module: "BQ", id: "bq-purchase-txid",
    title: "47% of purchase events are missing transaction_id",
    desc: "Out of 13,809 purchase events in the last 30 days, only 6,492 have transaction_id populated. The dataLayer variable DLV - order.id resolves on standard orders but not on Recharge subscription orders, which use a different push schema.",
    fix: "Add a fallback in the GA4 purchase tag: read transaction_id from {{DLV - order.id}} OR {{DLV - subscription.id}}. Coordinate with the Recharge integration team to standardize the dataLayer push if possible.",
  },
  {
    severity: "warning", module: "GTM", id: "gtm-optimizely-late",
    title: "Optimizely snippet loads after first paint",
    desc: "The Optimizely tag is set to fire on All Pages but resolves on average 1.4s after first contentful paint. ~12% of sessions are exposed to original content before variant assignment, producing visible flicker and contaminating exposure data.",
    fix: "Move the Optimizely snippet inline in <head> as a synchronous script, or migrate to server-side variant assignment so the page renders in the assigned variant on first paint.",
  },
  {
    severity: "warning", module: "GTM", id: "gtm-trustpilot-var",
    title: "Trustpilot Widget Loader references a broken variable",
    desc: "Tag uses {{Page Path Stripped}}, a custom JavaScript variable. That variable throws ReferenceError when window.location.pathname is non-string (rare but reproducible). Trustpilot tag silently fails to render on those pageviews.",
    fix: "Guard the JS variable with a typeof check. Or — preferred — remove the variable entirely and use the built-in {{Page Path}} variable, which is stable.",
  },
  {
    severity: "warning", module: "BQ", id: "bq-dupe-schemas",
    title: "add_to_cart has 3 distinct parameter schemas",
    desc: "Some add_to_cart events ship with {item_id, price, quantity}; some with {item_id, price, quantity, variant}; some with the legacy {productId, price}. Aggregates over add_to_cart in GA4 silently mix all three, producing misleading averages.",
    fix: "Pick one schema (the GA4 standard items[] array is recommended). Migrate all add_to_cart firing surfaces — PDP, recommendations module, quick-add — to the chosen schema. Annotate the migration date.",
  },
  {
    severity: "warning", module: "BQ", id: "bq-source-null",
    title: "13.3% of sessions have NULL traffic source",
    desc: "11,894 of 89,421 sessions in the last 7 days have no traffic_source.source attribution. This is above the ~5% norm for a healthy GA4 install. Likely cause: gtag config runs after first event on slow connections, or advanced consent mode is dropping the source before enrichment.",
    fix: "Audit the consent mode wait_for_update setting — should be ≥500ms. Confirm the GA4 config tag fires synchronously before any GA4 event tags. Re-check after one week.",
  },
  {
    severity: "info", module: "GA4", id: "ga4-missing-promo",
    title: "Recommended ecommerce events not implemented",
    desc: "view_promotion, select_promotion, remove_from_cart, and view_cart are missing. None of these are critical, but their absence makes promotion attribution and cart-page analysis impossible.",
    fix: "Prioritize view_promotion and select_promotion if the brand runs paid placements on the homepage. remove_from_cart is nice-to-have for line-item abandonment analysis.",
  },
  {
    severity: "info", module: "GTM", id: "gtm-linkedin-unused",
    title: "Unused tags can be cleaned up",
    desc: "LinkedIn Insight has been paused for 11 months. TikTok Pixel — Base has a trigger condition (URL contains /tt-test) that never matches in production traffic. Both can probably be deleted, reducing container weight and audit surface.",
    fix: "Confirm with marketing that neither is planned to be re-enabled in the next quarter. If not, delete and publish. Container version control retains them in history if rollback is ever needed.",
  },
  {
    severity: "info", module: "GTM", id: "gtm-consent",
    title: "Consent mode is configured but not in advanced mode",
    desc: "Basic consent mode is detected on the container. Advanced mode (which sends cookieless pings before consent and recovers ~30-40% of attribution on EU traffic) is not configured.",
    fix: "If EU traffic is a meaningful share of revenue, evaluate advanced consent mode. Coordinate with privacy/legal on the cookieless ping behavior.",
  },
];

/* expose */
// findingsBy reads window.findings + window.bqFindings dynamically so that:
// - live GA4 run replaces window.findings without touching this function
// - BQ module appends to window.bqFindings as queries complete
Object.assign(window, {
  auditMeta, gtmTags, gtmCounts, gtmTriggers, gtmVariables,
  ga4Events, ga4MissingEvents, ga4Conversions,
  bqQueries, findings,
  bqFindings: [],
  findingsBy: (sev) => [...(window.findings || []), ...(window.bqFindings || [])].filter(f => f.severity === sev),
});
