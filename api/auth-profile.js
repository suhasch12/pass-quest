/**
 * /api/auth-profile
 *
 * GET  ?token=<supabase_access_token>   — fetch profile + progress
 * POST { token, name?, exam_date? }     — upsert profile fields
 *
 * Uses Supabase REST API directly — no npm needed.
 * Env vars required:
 *   SUPABASE_URL      — your project URL e.g. https://xyz.supabase.co
 *   SUPABASE_ANON_KEY — your project's anon/public key
 */

const SB_URL   = () => process.env.SUPABASE_URL;
const SB_ANON  = () => process.env.SUPABASE_ANON_KEY;

// ── Supabase REST helpers ───────────────────────────────────────
async function sbGetUser(token) {
  const r = await fetch(`${SB_URL()}/auth/v1/user`, {
    headers: {
      'apikey':        SB_ANON(),
      'Authorization': `Bearer ${token}`,
    },
  });
  if (!r.ok) throw new Error('Invalid token or user not found');
  return r.json();
}

async function sbSelect(token, table, match) {
  const qs = Object.entries(match).map(([k,v]) => `${k}=eq.${encodeURIComponent(v)}`).join('&');
  const r = await fetch(`${SB_URL()}/rest/v1/${table}?${qs}&limit=1`, {
    headers: {
      'apikey':        SB_ANON(),
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
    },
  });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows[0] || null;
}

async function sbUpsert(token, table, data) {
  const r = await fetch(`${SB_URL()}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey':        SB_ANON(),
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
      'Prefer':        'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(data),
  });
  if (!r.ok) {
    const msg = await r.text();
    throw new Error(`Supabase upsert failed: ${msg}`);
  }
  const rows = await r.json();
  return Array.isArray(rows) ? rows[0] : rows;
}

async function sbSelectMany(token, table, match) {
  const qs = Object.entries(match).map(([k,v]) => `${k}=eq.${encodeURIComponent(v)}`).join('&');
  const r = await fetch(`${SB_URL()}/rest/v1/${table}?${qs}&order=updated_at.desc`, {
    headers: {
      'apikey':        SB_ANON(),
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
    },
  });
  if (!r.ok) return [];
  return r.json();
}

// ── Handler ─────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!SB_URL() || !SB_ANON()) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const token = req.method === 'GET'
    ? req.query.token
    : req.body?.token;

  if (!token) return res.status(401).json({ error: 'token required' });

  try {
    const user = await sbGetUser(token);
    const userId = user.id;
    const email  = user.email;

    // ── GET: return full profile ──────────────────────────────
    if (req.method === 'GET') {
      const [profile, xp, progress, sessions] = await Promise.all([
        sbSelect(token, 'profiles', { id: userId }),
        sbSelect(token, 'user_xp', { user_id: userId }),
        sbSelectMany(token, 'user_progress', { user_id: userId }),
        sbSelectMany(token, 'quiz_sessions', { user_id: userId }),
      ]);

      return res.status(200).json({
        id:                userId,
        email,
        name:              profile?.name || user.user_metadata?.full_name || 'User',
        subscription_tier: profile?.subscription_tier || 'free',
        exam_date:         profile?.exam_date || null,
        xp:                xp?.xp || 0,
        level:             xp?.level || 1,
        streak:            xp?.streak || 0,
        streak_freezes:    xp?.streak_freezes || 0,
        last_active:       xp?.last_active || null,
        badges:            xp?.badges || [],
        progress:          progress || [],
        sessions:          (sessions || []).slice(0, 30),
      });
    }

    // ── POST: upsert profile fields ───────────────────────────
    if (req.method === 'POST') {
      const { name, exam_date } = req.body;

      const update = { id: userId, email, updated_at: new Date().toISOString() };
      if (name !== undefined)      update.name = String(name).slice(0, 50);
      if (exam_date !== undefined) update.exam_date = exam_date;

      const profile = await sbUpsert(token, 'profiles', update);
      return res.status(200).json({ ok: true, profile });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    return res.status(401).json({ error: err.message });
  }
}
