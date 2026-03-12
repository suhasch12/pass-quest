const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

const MATHS_KEYWORDS = ["number","algebra","geometry","statistics","probability",
  "combinatorics","trigonometry","calculus","arithmetic","quadratic","pythagoras"];

function isMathsTopic(topic) {
  return MATHS_KEYWORDS.some(k => (topic||"").toLowerCase().includes(k));
}

function parseAIJson(raw) {
  let s = raw
    .replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-");

  // Sanitise newlines inside JSON string values
  s = s.replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, m =>
    m.replace(/\n/g, " ").replace(/\r/g, "").replace(/\t/g, " ")
  );

  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object in response");
  return JSON.parse(s.slice(start, end + 1));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) return res.status(500).json({ error: "GROQ_API_KEY not configured" });

  const body = req.body;

  // ── Direct mode (hints, explanations) ─────────────────────
  if (body._direct) {
    try {
      const r = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({
          model: MODEL, max_tokens: 400,
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

  // ── Quiz generation ────────────────────────────────────────
  const { numQuestions = 5, _topicOverride, _topicDesc, _tier, _difficulty, _systemExtra } = body;
  const topicName = _topicOverride || body.topic || "Mixed Maths";
  const topicDesc = _topicDesc || "";
  const tier      = _tier || "Challenger";
  const difficulty = _difficulty || "JMC level";
  const seed      = Math.floor(Math.random() * 10000);
  const mathsTopic = isMathsTopic(topicName);

  const typeRules = mathsTopic
    ? `Allowed types: "mcq" (4 options, single correct), "true_false", "short_answer".
Use mostly "mcq" (70%+). Occasionally use other types for variety.
For single-answer MCQ: set multiple_correct: false, correct_answer to the correct option text.
For short_answer: omit options, set correct_answer to the short answer string.`
    : `CRITICAL: You MUST use ONLY type "mcq" for every question.
Each question must have exactly 4 options.
Most questions should be single-answer (multiple_correct: false).
Occasionally (20% of questions) you may include a genuinely multi-answer question where 2 options are correct.
For multi-answer questions: set multiple_correct: true, correct_options to array of correct option texts (2-3 items), and still include correct_answer as the first correct option.`;

  const systemPrompt = `You are an expert educator creating quiz questions for UK students.
Difficulty: ${difficulty} (${tier} tier).
${_systemExtra || ""}

Respond ONLY with a raw JSON object. No markdown, no code fences, no explanation.
Use only straight ASCII double quotes. No smart quotes. No em dashes. No special Unicode in JSON.

JSON format — ALWAYS include all fields shown:
{
  "questions": [
    {
      "type": "mcq",
      "question_text": "Which of these are UK national symbols?",
      "options": ["Union Flag", "Eiffel Tower", "Royal Coat of Arms", "Statue of Liberty"],
      "multiple_correct": true,
      "correct_options": ["Union Flag", "Royal Coat of Arms"],
      "correct_answer": "Union Flag",
      "explanation": "The Union Flag and Royal Coat of Arms are official UK national symbols."
    }
  ]
}

For single-answer MCQ, set multiple_correct to false and correct_options to [].
${typeRules}`;

  const userPrompt = `Topic: ${topicName}${topicDesc ? " - " + topicDesc : ""}.
Generate exactly ${numQuestions} questions. Seed: ${seed}.
${mathsTopic ? "Mix types. Reward reasoning." : "ALL questions MCQ. Include 1-2 multi-answer questions where appropriate."}
Output ONLY the JSON object. Nothing else.`;

  try {
    const r = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: Math.min(4000, numQuestions * 400),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    const d = await r.json();
    const raw = d.choices?.[0]?.message?.content || "";
    const parsed = parseAIJson(raw);

    // Normalise and validate each question
    parsed.questions = (parsed.questions || []).map(q => ({
      ...q,
      type: (q.type || "mcq").toLowerCase().replace(/[_\/\-\s]+/g, ""),
      multiple_correct: !!(q.multiple_correct),
      correct_options: Array.isArray(q.correct_options) ? q.correct_options : [],
    }));

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: "Failed to parse questions: " + err.message });
  }
}
