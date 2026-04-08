const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

const MATHS_KEYWORDS = ["number","algebra","geometry","statistics","probability",
  "combinatorics","trigonometry","calculus","arithmetic","quadratic","pythagoras"];

function isMathsTopic(topic) {
  return MATHS_KEYWORDS.some(k => (topic||"").toLowerCase().includes(k));
}

/**
 * Robust JSON parser — handles truncated responses by extracting
 * whatever complete question objects exist before the cut-off.
 */
function parseAIJson(raw) {
  // Clean up the raw string
  let s = raw
    .replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-");

  // Sanitise newlines inside JSON string values
  s = s.replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, m =>
    m.replace(/\n/g, " ").replace(/\r/g, "").replace(/\t/g, " ")
  );

  // Try full parse first
  const start = s.indexOf("{");
  if (start === -1) throw new Error("No JSON object in response");

  // Attempt 1: parse the full object
  try {
    const end = s.lastIndexOf("}");
    if (end !== -1) {
      return JSON.parse(s.slice(start, end + 1));
    }
  } catch(e1) {
    // Fall through to recovery
  }

  // Attempt 2: recover partial questions array from truncated JSON
  // Find "questions" array and extract complete objects
  const qStart = s.indexOf('"questions"');
  const arrStart = qStart !== -1 ? s.indexOf("[", qStart) : -1;

  if (arrStart !== -1) {
    // Find all complete question objects by matching { ... }
    const questions = [];
    let depth = 0;
    let objStart = -1;

    for (let i = arrStart; i < s.length; i++) {
      const ch = s[i];
      // Skip characters inside strings
      if (ch === '"') {
        i++; // skip opening quote
        while (i < s.length && s[i] !== '"') {
          if (s[i] === '\\') i++; // skip escaped char
          i++;
        }
        continue;
      }
      if (ch === '{') {
        if (depth === 0) objStart = i;
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0 && objStart !== -1) {
          try {
            const obj = JSON.parse(s.slice(objStart, i + 1));
            if (obj.question_text || obj.questionText) {
              questions.push(obj);
            }
          } catch(e) {
            // skip malformed object
          }
          objStart = -1;
        }
      }
    }

    if (questions.length > 0) {
      console.log(`[generate-quiz] Recovered ${questions.length} questions from truncated JSON`);
      return { questions };
    }
  }

  throw new Error("Could not parse AI response as JSON");
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
  const {
    numQuestions = 5,
    _topicOverride, _topicDesc, _tier, _difficulty,
    _systemExtra, _batchInfo
  } = body;

  // Cap at 15 per call to prevent truncation — frontend batches larger requests
  const safeNumQ  = Math.min(parseInt(numQuestions) || 5, 15);
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
Set multiple_correct: false for all questions.
Set correct_answer to the exact text of the correct option.`;

  const batchNote = _batchInfo ? `\n\nIMPORTANT: ${_batchInfo}` : '';

  const systemPrompt = `You are an expert educator creating quiz questions for UK students.
Difficulty: ${difficulty} (${tier} tier).
${_systemExtra || ""}

CRITICAL FACTUAL UPDATES FOR UK CONTENT (2024):
- The UK monarch is KING CHARLES III (Queen Elizabeth II died September 2022)
- The Prime Minister is HEAD OF GOVERNMENT (lives at 10 Downing Street)
- The monarch is HEAD OF STATE with a ceremonial role only
- King Charles III is the Supreme Governor of the Church of England
- Never answer "the Queen" for current UK monarchy questions — it is the KING

Respond ONLY with a raw JSON object. No markdown, no code fences, no explanation.
Use only straight ASCII double quotes. No smart quotes. No em dashes. No special Unicode in JSON.
Keep all text values on a single line — no newlines inside JSON string values.

JSON format:
{
  "questions": [
    {
      "type": "mcq",
      "question_text": "Question here?",
      "options": ["A option", "B option", "C option", "D option"],
      "multiple_correct": false,
      "correct_options": [],
      "correct_answer": "A option",
      "explanation": "Why A is correct."
    }
  ]
}

${typeRules}`;

  // Build no-repeat hint from question texts passed by client
  const usedTexts = Array.isArray(body.usedQuestionTexts) ? body.usedQuestionTexts.slice(0, 30) : [];
  const noRepeatHint = usedTexts.length > 0
    ? `\n\nCRITICAL: Do NOT repeat or paraphrase any of these already-asked questions: ${usedTexts.join(' | ')}`
    : '';

  const userPrompt = `Topic: ${topicName}${topicDesc ? " - " + topicDesc : ""}.
Generate exactly ${safeNumQ} questions. Seed: ${seed}.${batchNote}${noRepeatHint}
Output ONLY the JSON object. Nothing else.`;

  // Calculate token budget — be generous to avoid truncation
  const tokenBudget = Math.max(800, safeNumQ * 320);

  try {
    const r = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: tokenBudget,
        temperature: 0.7,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!r.ok) {
      const errText = await r.text();
      throw new Error(`Groq API error ${r.status}: ${errText.slice(0, 200)}`);
    }

    const d = await r.json();

    // Check for Groq-level errors
    if (d.error) throw new Error(`Groq: ${d.error.message || JSON.stringify(d.error)}`);

    const raw = d.choices?.[0]?.message?.content || "";
    if (!raw) throw new Error("Empty response from AI");

    // Log finish reason for debugging
    const finishReason = d.choices?.[0]?.finish_reason;
    if (finishReason === "length") {
      console.warn(`[generate-quiz] Response truncated (finish_reason=length). Attempting recovery.`);
    }

    const parsed = parseAIJson(raw);

    // Normalise and validate each question
    const questions = (parsed.questions || []).map(q => ({
      ...q,
      type: (q.type || "mcq").toLowerCase().replace(/[_\/\-\s]+/g, ""),
      multiple_correct: !!(q.multiple_correct),
      correct_options: Array.isArray(q.correct_options) ? q.correct_options : [],
      // Ensure question_id for deduplication
      question_id: q.question_id || `q_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
    })).filter(q => q.question_text && q.correct_answer);

    if (!questions.length) throw new Error("No valid questions in response");

    return res.status(200).json({ questions });
  } catch (err) {
    console.error("[generate-quiz] Error:", err.message);
    return res.status(500).json({ error: "Failed to generate questions: " + err.message });
  }
}
