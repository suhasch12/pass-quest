// Leaderboard — stores scores using Netlify Environment Variables API
// Works with drag-and-drop deploys, no npm packages needed
const MAX_ENTRIES = 50;
const SITE_ID = "790c8183-519d-45d7-be9e-0272e5380371";

export default async (req) => {
  const headers = { "Content-Type": "application/json" };
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  }

  let body;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers }); }

  const token = Netlify.env.get("NETLIFY_TOKEN");
  if (!token) {
    return new Response(JSON.stringify({ error: "NETLIFY_TOKEN not configured" }), { status: 500, headers });
  }

  const { action } = body;

  if (action === "get") {
    const { topic } = body;
    if (!topic) return new Response(JSON.stringify({ error: "topic required" }), { status: 400, headers });
    try {
      const entries = await getScores(topic, token);
      return new Response(JSON.stringify({ entries }), { status: 200, headers });
    } catch (err) {
      return new Response(JSON.stringify({ entries: [], _err: err.message }), { status: 200, headers });
    }
  }

  if (action === "submit") {
    const { name, topic, tier, score, total, pct } = body;
    if (!name || !topic || !tier || score === undefined || !total) {
      return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400, headers });
    }
    const safeName = String(name).trim().substring(0, 20).replace(/[<>&"]/g, "") || "Anonymous";
    try {
      const existing = await getScores(topic, token);
      const newEntry = { name: safeName, topic, tier, score, total, pct, date: new Date().toISOString().split("T")[0] };
      const updated = [...existing, newEntry]
        .sort((a, b) => b.pct - a.pct || b.score - a.score)
        .slice(0, MAX_ENTRIES);
      await setScores(topic, updated, token);
      const rank = updated.findIndex(e => e.name === safeName && e.pct === pct && e.score === score) + 1;
      return new Response(JSON.stringify({ ok: true, rank, total: updated.length }), { status: 200, headers });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
    }
  }

  return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers });
};

function envKey(topic) {
  // Env var key: LB_ + sanitised topic, max 64 chars
  return ("LB_" + topic.toUpperCase().replace(/[^A-Z0-9]+/g, "_")).substring(0, 64);
}

async function getScores(topic, token) {
  const key = envKey(topic);
  const res = await fetch(
    `https://api.netlify.com/api/v1/sites/${SITE_ID}/env/${key}`,
    { headers: { authorization: `Bearer ${token}` } }
  );
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`GET env failed: ${res.status}`);
  const data = await res.json();
  // Value is stored in the "all" context
  const val = data?.values?.find(v => v.context === "all")?.value || "[]";
  return JSON.parse(val);
}

async function setScores(topic, entries, token) {
  const key = envKey(topic);
  const value = JSON.stringify(entries);

  // Try update first, then create if 404
  const putRes = await fetch(
    `https://api.netlify.com/api/v1/sites/${SITE_ID}/env/${key}`,
    {
      method: "PUT",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ key, values: [{ value, context: "all" }] }),
    }
  );

  if (putRes.status === 404) {
    // Create new env var
    const postRes = await fetch(
      `https://api.netlify.com/api/v1/sites/${SITE_ID}/env`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify([{ key, values: [{ value, context: "all" }] }]),
      }
    );
    if (!postRes.ok) throw new Error(`POST env failed: ${postRes.status}`);
  } else if (!putRes.ok) {
    throw new Error(`PUT env failed: ${putRes.status}`);
  }
}

export const config = { path: "/api/leaderboard" };
