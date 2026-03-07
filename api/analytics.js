/**
 * /api/analytics  — built-in event analytics + JS error tracking
 *
 * POST { event, props, ts }  — store event (called by front-end trackEvent)
 * GET  ?key=ANALYTICS_ADMIN_KEY  — view dashboard JSON
 *
 * Uses your existing Upstash KV. No new accounts needed.
 * Add ANALYTICS_ADMIN_KEY to Vercel env vars (any long random string).
 * Then visit: https://genius-quest.vercel.app/api/analytics?key=YOUR_KEY
 */

const kvUrl   = () => process.env.KV_REST_API_URL;
const kvToken = () => process.env.KV_REST_API_TOKEN;

async function kvGet(key) {
  if (!kvUrl()) return null;
  try {
    const r = await fetch(`${kvUrl()}/get/${encodeURIComponent(key)}`,
      { headers: { Authorization: `Bearer ${kvToken()}` } });
    const d = await r.json();
    return d.result ? JSON.parse(d.result) : null;
  } catch { return null; }
}

async function kvSet(key, val) {
  if (!kvUrl()) return;
  await fetch(`${kvUrl()}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${kvToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(val),
  }).catch(() => {});
}

async function kvIncr(key) {
  if (!kvUrl()) return;
  await fetch(`${kvUrl()}/incr/${encodeURIComponent(key)}`, {
    method: 'POST', headers: { Authorization: `Bearer ${kvToken()}` }
  }).catch(() => {});
}

export default async function handler(req, res) {

  /* ── Admin read endpoint ──────────────────────────────────── */
  if (req.method === 'GET') {
    const adminKey = process.env.ANALYTICS_ADMIN_KEY;
    if (adminKey && req.query.key !== adminKey)
      return res.status(401).json({ error: 'Unauthorised — pass ?key=YOUR_ANALYTICS_ADMIN_KEY' });

    const today = new Date().toISOString().slice(0, 10);
    const [allTime, daily, recent, errors] = await Promise.all([
      kvGet('analytics:counts'),
      kvGet(`analytics:daily:${today}`),
      kvGet('analytics:recent'),
      kvGet('analytics:errors'),
    ]);
    return res.status(200).json({
      as_of:         new Date().toISOString(),
      all_time:      allTime  || {},
      today:         daily    || {},
      recent_events: (recent  || []).slice(0, 50),
      recent_errors: (errors  || []).slice(0, 20),
    });
  }

  /* ── Event write ──────────────────────────────────────────── */
  if (req.method !== 'POST') return res.status(405).end();

  const { event, props, ts } = req.body || {};
  if (!event) return res.status(400).json({ error: 'event required' });

  const safe  = String(event).slice(0, 60).replace(/[^a-z0-9_]/g, '_');
  const today = new Date().toISOString().slice(0, 10);
  const entry = { event: safe, props: props || {}, ts: ts || Date.now() };

  await Promise.allSettled([
    kvIncr(`analytics:event:${safe}`),

    (async () => {
      const key = `analytics:daily:${today}`;
      const day = (await kvGet(key)) || {};
      day[safe] = (day[safe] || 0) + 1;
      await kvSet(key, day);
    })(),

    (async () => {
      const recent = (await kvGet('analytics:recent')) || [];
      recent.unshift(entry);
      if (recent.length > 200) recent.length = 200;
      await kvSet('analytics:recent', recent);
    })(),

    safe === 'js_error' && (async () => {
      const errs = (await kvGet('analytics:errors')) || [];
      errs.unshift(entry);
      if (errs.length > 50) errs.length = 50;
      await kvSet('analytics:errors', errs);
    })(),
  ]);

  return res.status(200).json({ ok: true });
}
