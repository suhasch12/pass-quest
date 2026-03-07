// Leaderboard using Vercel KV (free key-value store, built into Vercel)
// @vercel/kv is available automatically — no install needed on Vercel
import { kv } from "@vercel/kv";

const MAX_ENTRIES = 50;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { action, topic } = req.body;
  if (!topic) return res.status(400).json({ error: "topic required" });

  const key = "lb:" + topic.toLowerCase().replace(/[^a-z0-9]+/g, "_").substring(0, 60);

  if (action === "get") {
    try {
      const entries = (await kv.get(key)) || [];
      return res.status(200).json({ entries });
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
      const existing = (await kv.get(key)) || [];
      const newEntry = {
        name: safeName, topic, tier, score, total, pct,
        date: new Date().toISOString().split("T")[0],
      };
      const updated = [...existing, newEntry]
        .sort((a, b) => b.pct - a.pct || b.score - a.score)
        .slice(0, MAX_ENTRIES);
      await kv.set(key, updated);
      const rank = updated.findIndex(e => e.name === safeName && e.pct === pct && e.score === score) + 1;
      return res.status(200).json({ ok: true, rank, total: updated.length });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: "Unknown action" });
}
