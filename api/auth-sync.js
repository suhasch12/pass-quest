/**
 * /api/auth-sync
 *
 * POST { token, localData }
 *
 * Called once on first login to migrate localStorage → Supabase.
 * Merges data intelligently: takes the higher value for XP/score,
 * unions error logs, merges mastery per-topic (takes best score).
 *
 * localData shape:
 * {
 *   xp, level, streak, streak_freezes, badges,
 *   sessions: [...],
 *   mastery:  { [topic]: { correct, attempted } },
 *   error_log: [...],
 *   exam_date,
 *   name
 * }
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

async function sbSelect(token, table, match) {
  const qs = Object.entries(match).map(([k,v]) => `${k}=eq.${encodeURIComponent(v)}`).join('&');
  const r = await fetch(`${SB_URL()}/rest/v1/${table}?${qs}&limit=1`, {
    headers: {
      'apikey': SB_ANON(), 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json',
    },
  });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows[0] || null;
}

async function sbSelectMany(token, table, match) {
  const qs = Object.entries(match).map(([k,v]) => `${k}=eq.${encodeURIComponent(v)}`).join('&');
  const r = await fetch(`${SB_URL()}/rest/v1/${table}?${qs}`, {
    headers: {
      'apikey': SB_ANON(), 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json',
    },
  });
  if (!r.ok) return [];
  return r.json();
}

async function sbUpsert(token, table, data) {
  const r = await fetch(`${SB_URL()}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': SB_ANON(), 'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify(data),
  });
  if (!r.ok) {
    const msg = await r.text();
    throw new Error(`Supabase upsert failed (${table}): ${msg}`);
  }
}

async function sbInsertMany(token, table, rows) {
  if (!rows || !rows.length) return;
  const r = await fetch(`${SB_URL()}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': SB_ANON(), 'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json', 'Prefer': 'resolution=ignore-duplicates',
    },
    body: JSON.stringify(rows),
  });
  if (!r.ok) console.error(`Insert ${table} failed:`, await r.text());
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  if (!SB_URL() || !SB_ANON()) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const { token, localData } = req.body || {};
  if (!token) return res.status(401).json({ error: 'token required' });

  try {
    const user   = await sbGetUser(token);
    const userId = user.id;
    const email  = user.email;
    const local  = localData || {};

    // ── 1. Profiles ───────────────────────────────────────────
    const existingProfile = await sbSelect(token, 'profiles', { id: userId });
    if (!existingProfile) {
      await sbUpsert(token, 'profiles', {
        id:    userId,
        email,
        name:  local.name || user.user_metadata?.full_name || 'User',
        subscription_tier: 'free',
        exam_date: local.exam_date || null,
        updated_at: new Date().toISOString(),
      });
    }

    // ── 2. XP / Gamification ──────────────────────────────────
    const existingXP = await sbSelect(token, 'user_xp', { user_id: userId });
    const mergedXP = {
      user_id:        userId,
      xp:             Math.max(local.xp || 0, existingXP?.xp || 0),
      level:          Math.max(local.level || 1, existingXP?.level || 1),
      streak:         Math.max(local.streak || 0, existingXP?.streak || 0),
      streak_freezes: Math.max(local.streak_freezes || 0, existingXP?.streak_freezes || 0),
      badges:         JSON.stringify(
        [...new Set([
          ...(local.badges || []),
          ...(existingXP?.badges ? JSON.parse(existingXP.badges) : []),
        ])]
      ),
      last_active:    new Date().toISOString(),
      updated_at:     new Date().toISOString(),
    };
    await sbUpsert(token, 'user_xp', mergedXP);

    // ── 3. Topic Mastery ──────────────────────────────────────
    const localMastery  = local.mastery || {};
    const serverMastery = await sbSelectMany(token, 'user_progress', { user_id: userId });
    const serverMap     = Object.fromEntries(
      (serverMastery || []).map(r => [r.topic, r])
    );

    const masteryUpserts = Object.entries(localMastery).map(([topic, data]) => {
      const server = serverMap[topic];
      return {
        user_id:    userId,
        topic:      topic.slice(0, 200),
        correct:    Math.max(data.correct || 0, server?.correct || 0),
        attempted:  Math.max(data.attempted || 0, server?.attempted || 0),
        updated_at: new Date().toISOString(),
      };
    });
    if (masteryUpserts.length) {
      await sbInsertMany(token, 'user_progress', masteryUpserts);
    }

    // ── 4. Quiz Sessions (last 30) ────────────────────────────
    const sessions = (local.sessions || []).slice(-30).map(s => ({
      user_id:    userId,
      topic:      (s.topic || '').slice(0, 200),
      score:      Number(s.score) || 0,
      correct:    Number(s.correct) || 0,
      total:      Number(s.total) || 0,
      elapsed:    Number(s.elapsed) || 0,
      played_at:  s.date ? new Date(s.date).toISOString() : new Date().toISOString(),
    }));
    if (sessions.length) {
      await sbInsertMany(token, 'quiz_sessions', sessions);
    }

    return res.status(200).json({
      ok: true,
      synced: {
        xp:        mergedXP.xp,
        badges:    JSON.parse(mergedXP.badges).length,
        mastery:   masteryUpserts.length,
        sessions:  sessions.length,
      },
    });

  } catch (err) {
    console.error('sync error:', err);
    return res.status(500).json({ error: err.message });
  }
}
