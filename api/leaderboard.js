// Leaderboard using Upstash Redis REST API (plain fetch, no npm needed)
// Uses KV_REST_API_URL and KV_REST_API_TOKEN auto-added by Vercel KV integration

const MAX_ENTRIES = 50;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const url   = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    return res.status(500).json({ error: "KV store not configured" });
  }

  const { action, topic } = req.body;
  if (!topic) return res.status(400).json({ error: "topic required" });

  const key = "lb:" + topic.toLowerCase().replace(/[^a-z0-9]+/g, "_").substring(0, 60);

  if (action === "get") {
    try {
      const entries = await kvGet(url, token, key);
      return res.status(200).json({ entries: entries || [] });
    } catch (err) {
      return res.status(200).json({ entries: [], _err: err.message });
    }
  }

  if (action === "submit") {
    const { name, tier, score, total, pct } = req.body;
    if (!name || !tier || score === undefined || !total) {
      return res.status(400).json({ error: "Missing fields" });
    }
    const safeName = String(name).trim().substring(0, 20).replace(/[<>&"]/g, "") || "Anonymous";
    try {
      const existing = await kvGet(url, token, key) || [];
      const newEntry = {
        name: safeName, topic, tier, score, total, pct,
        date: new Date().toISOString().split("T")[0],
      };
      const updated = [...existing, newEntry]
        .sort((a, b) => b.pct - a.pct || b.score - a.score)
        .slice(0, MAX_ENTRIES);
      await kvSet(url, token, key, updated);
      const rank = updated.findIndex(
        e => e.name === safeName && e.pct === pct && e.score === score
      ) + 1;
      return res.status(200).json({ ok: true, rank, total: updated.length });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: "Unknown action" });
}

async function kvGet(url, token, key) {
  const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`KV GET failed: ${res.status}`);
  const data = await res.json();
  return data.result ? JSON.parse(data.result) : [];
}

async function kvSet(url, token, key, value) {
  const res = await fetch(`${url}/set/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(JSON.stringify(value)),
  });
  if (!res.ok) throw new Error(`KV SET failed: ${res.status}`);
}
