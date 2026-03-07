const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

// Pure maths topics — these get mixed question types (MCQ + true/false + short answer)
const MATHS_KEYWORDS = ["number","algebra","geometry","statistics","probability",
  "combinatorics","trigonometry","calculus","arithmetic","quadratic","pythagoras"];

function isMathsTopic(topic) {
  const t = (topic || "").toLowerCase();
  return MATHS_KEYWORDS.some(k => t.includes(k));
}

// Robustly clean AI output and parse JSON
function parseAIJson(raw) {
  let s = raw
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  // Remove BOM / zero-width chars
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, "");

  // Replace smart quotes with straight quotes
  s = s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');

  // Replace em/en dashes with hyphens inside strings
  s = s.replace(/[\u2013\u2014]/g, "-");

  // Remove literal newlines/tabs inside JSON string values
  // (replace \n and \t that appear inside quoted strings with a space)
  s = s.replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, (match) =>
    match.replace(/\n/g, " ").replace(/\r/g, "").replace(/\t/g, " ")
  );

  // Find the JSON object boundaries
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found in response");
  s = s.slice(start, end + 1);

  return JSON.parse(s);
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

  // ── Direct mode (hints, explanations, coach messages) ─────────────────────
  if (body._direct) {
    try {
      const r = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 400,
          messages: [
            { role: "system", content: body._system || "You are a helpful assistant." },
            { role: "user", content: body._prompt },
          ],
        }),
      });
      const d = await r.json();
      return res.status(200).json({ text: d.choices?.[0]?.message?.content || null });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── Quiz generation mode ───────────────────────────────────────────────────
  const { numQuestions = 5, _topicOverride, _topicDesc, _tier, _difficulty, _systemExtra } = body;

  const topicName  = _topicOverride || body.topic || "Mixed Maths";
  const topicDesc  = _topicDesc || "";
  const tier       = _tier || "Challenger";
  const difficulty = _difficulty || "JMC level";
  const seed       = Math.floor(Math.random() * 10000);
  const mathsTopic = isMathsTopic(topicName);

  // ── Type rules — enforced SERVER SIDE, cannot be overridden by frontend ───
  const typeRules = mathsTopic
    ? `Allowed types: "mcq" (4 options), "true_false" (options: ["True","False"]), "short_answer" (no options field, correct_answer is a short string).
Use mostly "mcq" (at least 70%). Occasionally use "true_false" or "short_answer" for variety.`
    : `CRITICAL RULE: You MUST use ONLY type "mcq" for every question. Never use "short_answer" or "true_false".
Every question must have exactly 4 options as an array. Only one option is correct.
Make all 4 options plausible but only one correct. Distractors should be realistic and educational.`;

  const systemPrompt = `You are an expert educator creating quiz questions for UK students.
Difficulty: ${difficulty} (${tier} tier).
${_systemExtra || ""}

You MUST respond with ONLY a raw JSON object. No explanation, no markdown, no code fences.
Use only straight double quotes. No smart quotes. No em dashes. No special characters in JSON keys or values.
Use simple ASCII characters only in your JSON output.

JSON format:
{
  "questions": [
    {
      "type": "mcq",
      "question_text": "Question here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_answer": "Option A",
      "explanation": "Explanation here."
    }
  ]
}

${typeRules}`;

  const userPrompt = `Topic: ${topicName}${topicDesc ? " — " + topicDesc : ""}.
Generate exactly ${numQuestions} questions. Seed: ${seed}.
${mathsTopic
  ? "Mix question types. Reward reasoning over recall."
  : "ALL questions must be MCQ with exactly 4 options. Make options plausible and educational."}
Output ONLY the JSON object. Nothing else.`;

  try {
    const r = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: Math.min(4000, numQuestions * 380),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    const d = await r.json();
    const raw = d.choices?.[0]?.message?.content || "";
    const parsed = parseAIJson(raw);
    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: "Failed to parse questions: " + err.message });
  }
}
