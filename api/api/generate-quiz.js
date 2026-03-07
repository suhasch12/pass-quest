const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) {
    return res.status(500).json({ error: "GROQ_API_KEY not configured" });
  }

  const body = req.body;

  // Direct AI call mode (hints, why wrong, lesson, motiv, worked example)
  if (body._direct) {
    const { _prompt, _system } = body;
    try {
      const r = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 400,
          messages: [
            { role: "system", content: _system || "You are a helpful assistant." },
            { role: "user", content: _prompt },
          ],
        }),
      });
      const d = await r.json();
      const text = d.choices?.[0]?.message?.content || null;
      return res.status(200).json({ text });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Quiz generation mode
  const {
    topic, numQuestions = 5,
    _topicOverride, _topicDesc, _tier, _difficulty, _systemExtra,
  } = body;

  const topicName  = _topicOverride || topic || "Mixed Maths";
  const topicDesc  = _topicDesc    || "";
  const tier       = _tier         || "Challenger";
  const difficulty = _difficulty   || "JMC level";

  const varietySeed = Math.floor(Math.random() * 10000);

  const systemPrompt = `You are an expert UK maths teacher creating quiz questions aligned with UKMT philosophy — reward reasoning not recall.
Difficulty: ${difficulty} (${tier} tier).
${_systemExtra || ""}
Always respond ONLY with valid JSON in exactly this format:
{
  "questions": [
    {
      "type": "mcq",
      "question_text": "...",
      "options": ["A", "B", "C", "D"],
      "correct_answer": "A",
      "explanation": "..."
    }
  ]
}
Types allowed: "mcq" (4 options), "true_false" (options: ["True","False"]), "short_answer" (no options, correct_answer is the answer string).
No preamble, no markdown fences, just the JSON object.`;

  const userPrompt = `Topic: ${topicName}${topicDesc ? " — " + topicDesc : ""}.
Generate exactly ${numQuestions} varied questions. Variety seed: ${varietySeed}.
Mix question types. Make sure questions test genuine understanding, not just recall.`;

  try {
    const r = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: Math.min(4000, numQuestions * 320),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    const d = await r.json();
    const raw = d.choices?.[0]?.message?.content || "";
    const clean = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
