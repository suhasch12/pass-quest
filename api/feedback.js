/**
 * /api/feedback
 *
 * POST { rating, text, email, page, ts }  — submit feedback
 * GET  ?key=ANALYTICS_ADMIN_KEY           — view all feedback
 *
 * No Slack, no email service needed. Stored in Upstash KV.
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

export default async function handler(req, res) {

  /* ── Admin read ─────────────────────────────────────────── */
  if (req.method === 'GET') {
    const adminKey = process.env.ANALYTICS_ADMIN_KEY;
    if (adminKey && req.query.key !== adminKey)
      return res.status(401).json({ error: 'Unauthorised' });

    const index = (await kvGet('feedback:index')) || [];
    const items = await Promise.all(index.slice(0, 100).map(id => kvGet(`feedback:${id}`)));
    return res.status(200).json({ count: index.length, feedback: items.filter(Boolean) });
  }

  /* ── Submit feedback ────────────────────────────────────── */
  if (req.method !== 'POST') return res.status(405).end();

  const { rating, text, email, page, ts } = req.body || {};
  if (!text) return res.status(400).json({ error: 'text required' });

  const id    = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const entry = {
    id,
    rating:  Number(rating) || 0,
    text:    String(text).slice(0, 2000),
    email:   String(email  || '').slice(0, 200),
    page:    String(page   || '').slice(0, 100),
    ts:      ts || new Date().toISOString(),
    status:  'pending',
  };

  const index = (await kvGet('feedback:index')) || [];
  index.unshift(id);
  if (index.length > 500) index.length = 500;

  await Promise.allSettled([
    kvSet(`feedback:${id}`, entry),
    kvSet('feedback:index', index),
  ]);

  return res.status(200).json({ ok: true, id });
}
