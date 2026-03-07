const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

// Topics that benefit from mixed question types (pure maths reasoning)
const MATHS_TOPICS = ["number", "algebra", "geometry", "statistics", "probability",
  "combinatorics", "logic", "mathematics", "trigonometry", "calculus"];

function isMathsTopic(topic) {
  const t = (topic || "").toLowerCase();
  return MATHS_TOPICS.some(k => t.includes(k));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) {
    return res.status(500).json({ error: "GROQ_API_KEY not configured" });
  }

  const body = req.body;

  // ── Direct AI call mode (hints, why wrong, lesson, motiv, worked example) ──
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

  // ── Quiz generation mode ───────────────────────────────────────────────────
  const { topic, numQuestions = 5, _topicOverride, _topicDesc, _tier, _difficulty, _systemExtra } = body;

  const topicName = _topicOverride || topic || "Mixed Maths";
  const topicDesc = _topicDesc || "";
  const tier      = _tier || "Challenger";
  const difficulty = _difficulty || "JMC level";
  const varietySeed = Math.floor(Math.random() * 10000);

  // Decide question type rules based on topic
  const allowMixed = isMathsTopic(topicName);

  const typeRules = allowMixed
    ? `Types allowed: "mcq" (4 options), "true_false" (options: ["True","False"]), "short_answer" (no options, correct_answer is the answer string).
Mix question types — use mostly mcq (at least 60%), some true_false, occasionally short_answer for calculation answers.`
    : `IMPORTANT: You MUST use ONLY type "mcq" for every single question. No short_answer, no true_false.
Each mcq question must have exactly 4 options. Only one option is correct. Make all 4 options plausible.`;

  const systemPrompt = `You are an expert educator creating quiz questions for UK students.
Difficulty: ${difficulty} (${tier} tier).
${_systemExtra || ""}
Always respond ONLY with valid JSON in exactly this format:
{
  "questions": [
    {
      "type": "mcq",
      "question_text": "...",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_answer": "Option A",
      "explanation": "..."
    }
  ]
}
${typeRules}
No preamble, no markdown fences, just the raw JSON object.`;

  const userPrompt = `Topic: ${topicName}${topicDesc ? " — " + topicDesc : ""}.
Generate exactly ${numQuestions} questions. Variety seed: ${varietySeed}.
${allowMixed ? "Mix question types. Reward reasoning and thinking, not just recall." : "ALL questions must be MCQ with 4 options. Make distractors realistic and educational."}`;

  try {
    const r = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: Math.min(4000, numQuestions * 350),
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
