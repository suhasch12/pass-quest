const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

export default async (req, context) => {
  const headers = { "Content-Type": "application/json" };
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });

  let body;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers }); }

  const apiKey = Netlify.env.get("GROQ_API_KEY");
  if (!apiKey) return new Response(JSON.stringify({ error: "GROQ_API_KEY not set" }), { status: 500, headers });

  // ── Direct text generation (hints, motivation, lessons) ──────────────────
  if (body._direct && body._prompt) {
    try {
      const r = await fetch(GROQ_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            ...(body._system ? [{ role: "system", content: body._system }] : []),
            { role: "user", content: body._prompt }
          ],
          temperature: 0.9,
          max_tokens: 300
        })
      });
      const d = await r.json();
      const text = d?.choices?.[0]?.message?.content || null;
      return new Response(JSON.stringify({ text }), { status: 200, headers });
    } catch { return new Response(JSON.stringify({ text: null }), { status: 200, headers }); }
  }

  // ── Quiz generation ────────────────────────────────────────────────────────
  const {
    age = 12,
    category = "Mathematics",
    numQuestions = 10,
    sessionId = "",
    usedQuestionIds = [],
    // New fields from restructured app
    _topicOverride = "",
    _topicDesc = "",
    _tier = "Challenger",
    _difficulty = "",
    _systemExtra = "",
  } = body;

  // Difficulty string
  const difficultyMap = {
    Explorer:   "Primary school level (ages 7-10). Simple, concrete, accessible. Avoid abstract notation.",
    Challenger: "UKMT Junior Mathematical Challenge level (ages 11-13). Accessible but requires genuine thinking. Some multi-step problems.",
    Olympian:   "UKMT Intermediate Mathematical Challenge level (ages 14-16). Multi-step reasoning required. Lateral thinking rewarded.",
    Champion:   "UKMT Senior Challenge / British Mathematical Olympiad level (ages 17+). Olympiad depth. Elegant solutions and proof-based thinking.",
  };
  const difficulty = _difficulty || difficultyMap[_tier] || difficultyMap["Challenger"];

  // Category instruction
  const topicName = _topicOverride || category;
  const isMaths   = _topicOverride !== "" || category === "Mathematics";

  let catInstruction;
  if (_topicOverride && _topicDesc) {
    catInstruction = `Generate ONLY questions about: "${_topicOverride}".
Description: ${_topicDesc}.
Every question must test a concept within this specific topic — no straying outside it.
UKMT philosophy: questions should reward reasoning and thinking carefully, not just rote recall.
Prefer questions where the student must combine ideas or think from an unusual angle.`;
  } else if (category === "Achievers") {
    catInstruction = "Generate EXTREMELY difficult Olympiad-level questions spanning all subjects.";
  } else if (category === "Riddles") {
    catInstruction = "Generate ONLY creative riddles and brain teasers. Use MCQ format.";
  } else if (category === "All" || category === "UK Maths — Mixed") {
    catInstruction = "Generate a BALANCED mix of UK maths questions covering: Number, Algebra, Geometry, Statistics and Combinatorics.";
  } else {
    catInstruction = `Generate ONLY questions from: ${category}. Cover diverse subtopics within this subject.`;
  }

  // Variety seed
  const timestamp = Date.now();
  const seeds = ["real-world applications","historical context","common misconceptions","advanced problem-solving","practical examples","unusual angles","pattern recognition","visual reasoning","everyday scenarios","elegant shortcuts"];
  const seed = seeds[Math.floor(timestamp / 1000) % seeds.length];

  const avoidNote = usedQuestionIds.length > 0
    ? `The student has already seen ${usedQuestionIds.length} questions. Generate COMPLETELY DIFFERENT questions — new subtopics, new approaches, no repeats.`
    : "This is a fresh session — generate varied, interesting questions.";

  const systemPrompt = `You are an expert educational quiz generator specialising in UK Mathematics at competition level.
You MUST respond with ONLY a valid JSON array. No markdown, no explanation, no code blocks — just the raw JSON array.

Generate exactly ${numQuestions} quiz questions with this exact structure:
[
  {
    "question_id": "q_${sessionId}_${timestamp}_0",
    "category": "Mathematics",
    "type": "MCQ",
    "question_text": "If the sum of three consecutive integers is 48, what is the smallest of the three?",
    "options": ["14","15","16","17"],
    "correct_answer": "15",
    "explanation": "Let the integers be n, n+1, n+2. Then 3n+3=48, so n=15.",
    "image_tag": ""
  }
]

Rules:
- Student age: ${age}. Tier: ${_tier}. Difficulty: ${difficulty}
- ${catInstruction}
- Focus this batch on: "${seed}" for variety.
- ${_systemExtra ? _systemExtra + "\n-" : ""} ${avoidNote}
- question_id format: q_${sessionId}_${timestamp}_N (N = 0,1,2,...)
- type must be exactly: "MCQ", "Short Answer", or "True/False"
- For MCQ: options array must have exactly 4 items
- For Short Answer: options must be empty [], answer is a short word/phrase/number
- For True/False: options must be ["True","False"]
- category: use "Mathematics" for all maths topics
- explanation: 1-3 sentences, educational. For incorrect MCQ options: briefly explain the common mistake.
- image_tag: always empty string ""
- Make questions genuinely interesting — avoid trivial arithmetic.
- RESPOND WITH ONLY THE JSON ARRAY. NOTHING ELSE.`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (attempt > 0) await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1500));

      const res = await fetch(GROQ_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Generate ${numQuestions} questions about "${topicName}" for age ${age} (${_tier} level). Return ONLY the JSON array.` }
          ],
          temperature: 1.0,
          max_tokens: 4000,
          response_format: { type: "json_object" }
        })
      });

      if (res.status === 429 && attempt < 2) { await new Promise(r => setTimeout(r, 3000)); continue; }
      if (!res.ok) { const t = await res.text(); throw new Error(`Groq API error ${res.status}: ${t}`); }

      const data = await res.json();
      let text = data?.choices?.[0]?.message?.content;
      if (!text) throw new Error("Empty response from Groq");

      text = text.trim();
      let questions;
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          questions = parsed;
        } else {
          const arr = Object.values(parsed).find(v => Array.isArray(v));
          if (arr) questions = arr;
          else throw new Error("No array found in response");
        }
      } catch {
        const match = text.match(/\[[\s\S]*\]/);
        if (match) { try { questions = JSON.parse(match[0]); } catch { throw new Error("Could not parse questions JSON"); } }
        else throw new Error("No JSON array in response");
      }

      if (!Array.isArray(questions) || questions.length === 0) throw new Error("Empty questions array");

      questions = questions.map((q, i) => ({
        ...q,
        question_id: `q_${sessionId}_${timestamp}_${i}`,
        options: Array.isArray(q.options) ? q.options : [],
        image_tag: ""
      }));

      return new Response(JSON.stringify({ questions, timestamp, added: questions.length }), { status: 200, headers });

    } catch (err) {
      if (attempt === 2) return new Response(JSON.stringify({ error: `Failed after 3 attempts: ${err.message}` }), { status: 500, headers });
    }
  }
};

export const config = { path: "/api/generate-quiz" };
