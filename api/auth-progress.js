/**
 * /api/auth-progress
 *
 * POST { token, action, ...payload }
 *
 * actions:
 *   save_session  — save a completed quiz session + update XP
 *   save_mastery  — update topic mastery
 *   save_xp       — update XP/level/streak
 *   get_error_log — fetch server-side error log
 *   save_error_log — save error log entries
 */

const SB_URL  = () => process.env.SUPABASE_URL;
const SB_ANON = () => process.env.SUPABASE_ANON_KEY;

async function sbGetUser(token) {
  const r = await fetch(`${SB_URL()}/auth/v1/user`, {
    headers: { 'apikey': SB_ANON(), 'Authorization': `Bearer ${token}` },
  });
  if (!r.ok) throw new Error('Invalid token');
  return r.json();
}

async function sbUpsert(token, table, data) {
  const payload = Array.isArray(data) ? data : [data];
  const r = await fetch(`${SB_URL()}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': SB_ANON(), 'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`Upsert ${table} failed: ${await r.text()}`);
}

async function sbInsert(token, table, data) {
  const r = await fetch(`${SB_URL()}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': SB_ANON(), 'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(`Insert ${table} failed: ${await r.text()}`);
}

async function sbSelectMany(token, table, match) {
  const qs = Object.entries(match).map(([k,v]) => `${k}=eq.${encodeURIComponent(v)}`).join('&');
  const r = await fetch(`${SB_URL()}/rest/v1/${table}?${qs}&order=created_at.desc`, {
    headers: { 'apikey': SB_ANON(), 'Authorization': `Bearer ${token}` },
  });
  if (!r.ok) return [];
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  if (!SB_URL() || !SB_ANON()) return res.status(500).json({ error: 'Supabase not configured' });

  const { token, action } = req.body || {};
  if (!token)  return res.status(401).json({ error: 'token required' });
  if (!action) return res.status(400).json({ error: 'action required' });

  try {
    const user   = await sbGetUser(token);
    const userId = user.id;

    // ── save_session ─────────────────────────────────────────
    if (action === 'save_session') {
      const { topic, score, correct, total, elapsed } = req.body;
      await sbInsert(token, 'quiz_sessions', {
        user_id:  userId,
        topic:    (topic || '').slice(0, 200),
        score:    Number(score)   || 0,
        correct:  Number(correct) || 0,
        total:    Number(total)   || 0,
        elapsed:  Number(elapsed) || 0,
        played_at: new Date().toISOString(),
      });
      return res.status(200).json({ ok: true });
    }

    // ── save_mastery ──────────────────────────────────────────
    if (action === 'save_mastery') {
      const { topic, correct, attempted } = req.body;
      await sbUpsert(token, 'user_progress', {
        user_id:    userId,
        topic:      (topic || '').slice(0, 200),
        correct:    Number(correct)   || 0,
        attempted:  Number(attempted) || 0,
        updated_at: new Date().toISOString(),
      });
      return res.status(200).json({ ok: true });
    }

    // ── save_xp ───────────────────────────────────────────────
    if (action === 'save_xp') {
      const { xp, level, streak, streak_freezes, badges } = req.body;
      await sbUpsert(token, 'user_xp', {
        user_id:        userId,
        xp:             Number(xp)             || 0,
        level:          Number(level)          || 1,
        streak:         Number(streak)         || 0,
        streak_freezes: Number(streak_freezes) || 0,
        badges:         JSON.stringify(badges  || []),
        last_active:    new Date().toISOString(),
        updated_at:     new Date().toISOString(),
      });
      return res.status(200).json({ ok: true });
    }

    // ── get_error_log ─────────────────────────────────────────
    if (action === 'get_error_log') {
      const rows = await sbSelectMany(token, 'error_log', { user_id: userId });
      return res.status(200).json({ entries: rows || [] });
    }

    // ── save_error_log ────────────────────────────────────────
    if (action === 'save_error_log') {
      const { entries } = req.body;
      if (!Array.isArray(entries)) return res.status(400).json({ error: 'entries must be array' });
      // Delete existing log for this user, replace with current
      await fetch(`${SB_URL()}/rest/v1/error_log?user_id=eq.${userId}`, {
        method: 'DELETE',
        headers: { 'apikey': SB_ANON(), 'Authorization': `Bearer ${token}` },
      });
      if (entries.length) {
        const rows = entries.slice(0, 100).map(e => ({
          user_id:        userId,
          question_key:   (e.key   || '').slice(0, 200),
          topic:          (e.topic || '').slice(0, 200),
          question_text:  (e.question_text || '').slice(0, 500),
          correct_answer: (e.correct_answer || '').slice(0, 200),
          explanation:    (e.explanation || '').slice(0, 1000),
          options:        JSON.stringify(e.options || []),
          created_at:     new Date().toISOString(),
        }));
        await sbInsert(token, 'error_log', rows);
      }
      return res.status(200).json({ ok: true, count: entries.length });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });

  } catch (err) {
    console.error('progress error:', err);
    return res.status(500).json({ error: err.message });
  }
}
