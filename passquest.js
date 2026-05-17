/* PassQuest — all scripts */

// ═══════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════
const SID = 's' + Date.now().toString(36);
const USED_IDS = new Set(); // tracks question_ids across sessions
const _sessionQTexts = new Set(); // tracks question texts WITHIN current session

let state = {
  tier: 'Challenger',
  age: 12,
  topic: '',
  topicDesc: '',
  numQ: 10,
  defaultNumQ: 10,
  questions: [],
  idx: 0,
  answers: {},          // idx -> {chosen, correct}
  hintShown: false,
  aiLoading: false,
  allSubjectsAge: 14,
};

// pending modal tier selection
let pendingTier = null;
let pendingAge = null;

let lastTopic = '', lastDesc = '', lastNum = 10;

// Tier metadata
const TIER_META = {
  Explorer:   { age:9,  desc:'KS2 level — Primary Maths, ages 7-10',              tc:'var(--t1)', tcb:'var(--t1b)', style:'border-color:#15803d;background:#dcfce7' },
  Challenger: { age:12, desc:'UKMT JMC level — Junior Maths Challenge, ages 11-13', tc:'var(--t2)', tcb:'var(--t2b)', style:'border-color:#1d4ed8;background:#dbeafe' },
  Olympian:   { age:15, desc:'UKMT IMC level — Intermediate Challenge, ages 14-16', tc:'var(--t3)', tcb:'var(--t3b)', style:'border-color:#7e22ce;background:#f3e8ff' },
  Champion:   { age:17, desc:'UKMT Senior/BMO level — Senior Maths Challenge, ages 17+', tc:'var(--t4)', tcb:'var(--t4b)', style:'border-color:#9f1239;background:#ffe4e6' },
};
const TIER_ICONS = { Explorer:'', Challenger:'⚡', Olympian:'', Champion:'' };

// ═══════════════════════════════════════════════════════════
// PAGE ROUTING
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// BUILT-IN ANALYTICS & ERROR TRACKING  (no external account)
// Events stored in Upstash KV via /api/analytics
// View at: GET /api/analytics?key=YOUR_ANALYTICS_ADMIN_KEY
// ═══════════════════════════════════════════════════════════
// ── Coming Soon — Notify Me handler ───────────────────────
function notifyMe(track, inputId) {
  var email = (document.getElementById(inputId) || {}).value || '';
  var ok = document.getElementById('notify-' + track + '-ok');
  if (!email || !email.includes('@')) {
    var el = document.getElementById(inputId);
    if (el) { el.style.borderColor = '#ef4444'; setTimeout(function(){ el.style.borderColor = '#d1d5db'; }, 1400); }
    return;
  }
  // Store locally + send to analytics
  var waitlist = JSON.parse(localStorage.getItem('pq_waitlist') || '{}');
  if (!waitlist[track]) waitlist[track] = [];
  if (!waitlist[track].includes(email)) waitlist[track].push(email);
  localStorage.setItem('pq_waitlist', JSON.stringify(waitlist));
  trackEvent('waitlist_signup', { track: track, email: email });
  // Send to feedback endpoint so you receive it
  fetch('/api/feedback', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ type: 'waitlist', track: track, email: email, ts: new Date().toISOString() })
  }).catch(function(){});
  var inp = document.getElementById(inputId);
  if (inp) inp.value = '';
  if (ok) { ok.style.display = 'block'; }
}

function trackEvent(name, props) {
  try {
    fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: name, props: props || {}, ts: Date.now() }),
      keepalive: true
    }).catch(function(){});
  } catch(_) {}
}

// Capture unhandled JS errors silently → /api/analytics
window.addEventListener('error', function(e) {
  trackEvent('js_error', { msg: e.message, src: (e.filename||'').split('/').pop(), line: e.lineno });
});
window.addEventListener('unhandledrejection', function(e) {
  trackEvent('js_error', { msg: String(e.reason).slice(0, 200) });
});

// ─── MASTERY / DASHBOARD HELPERS ────────────────────────────
function updateMastery(topic, correct, total) {
  const mastery = JSON.parse(localStorage.getItem('gq_mastery') || '{}');
  if (!mastery[topic]) mastery[topic] = { correct: 0, attempted: 0 };
  mastery[topic].correct   += correct;
  mastery[topic].attempted += total;
  localStorage.setItem('gq_mastery', JSON.stringify(mastery));
  // If signed in, sync to Supabase
  syncProgressToServer(topic, mastery[topic].correct, mastery[topic].attempted);
}

function getMasteryPct(topic) {
  const mastery = JSON.parse(localStorage.getItem('gq_mastery') || '{}');
  const d = mastery[topic];
  if (!d || !d.attempted) return 0;
  return Math.min(100, Math.round((d.correct / d.attempted) * 100));
}

function getSessionStats() {
  const sessions = JSON.parse(localStorage.getItem('gq_sessions') || '[]');
  if (!sessions.length) return null;
  const totalSecs = sessions.reduce((a, s) => a + (s.elapsed || 0), 0);
  const avgScore  = Math.round(sessions.reduce((a, s) => a + s.score, 0) / sessions.length);
  const streak    = calcStreak(sessions);
  const lastSession = sessions[sessions.length - 1];
  return { totalSecs, avgScore, streak, count: sessions.length, lastSession, sessions };
}

function calcStreak(sessions) {
  if (!sessions.length) return 0;
  const days = new Set(sessions.map(s => s.date.slice(0, 10)));
  const today = new Date().toISOString().slice(0, 10);
  let streak = 0, d = new Date();
  while (true) {
    const key = d.toISOString().slice(0, 10);
    if (days.has(key)) { streak++; d.setDate(d.getDate() - 1); }
    else if (key === today) { d.setDate(d.getDate() - 1); }
    else break;
  }
  return streak;
}

function fmtSecs(s) {
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60);
  if (h > 0) return h + 'h ' + m + 'm';
  return m > 0 ? m + 'm' : s + 's';
}

function renderLitukDashboard() {
  const stats = getSessionStats();
  const litukSessions = stats ? stats.sessions.filter(s => s.topic && s.topic.includes('Life in the UK')) : [];
  const totalSecs = litukSessions.reduce((a,s) => a+(s.elapsed||0), 0);
  const avgScore = litukSessions.length ? Math.round(litukSessions.reduce((a,s)=>a+s.score,0)/litukSessions.length) : 0;
  const mockSessions = litukSessions.filter(s => s.topic.includes('Mock Test'));
  const bestMock = mockSessions.length ? Math.max(...mockSessions.map(s=>s.score)) : null;
  
  // Render dashboard stats
  const dash = document.getElementById('lituk-dash');
  if (!dash) return;
  dash.innerHTML = `
    <div class="ldash-grid">
      <div class="ldash-card">
        <div class="ldash-icon">&#9200;</div>
        <div class="ldash-val">${fmtSecs(totalSecs) || '0m'}</div>
        <div class="ldash-lbl">Time Studied</div>
      </div>
      <div class="ldash-card">
        <div class="ldash-icon">&#128197;</div>
        <div class="ldash-val">${litukSessions.length}</div>
        <div class="ldash-lbl">Sessions</div>
      </div>
      <div class="ldash-card">
        <div class="ldash-icon">&#127919;</div>
        <div class="ldash-val">${avgScore ? avgScore+'%' : '--'}</div>
        <div class="ldash-lbl">Avg Score</div>
      </div>
      <div class="ldash-card ${bestMock !== null && bestMock >= 75 ? 'ldash-card-pass' : ''}">
        <div class="ldash-icon">&#127942;</div>
        <div class="ldash-val">${bestMock !== null ? bestMock+'%' : '--'}</div>
        <div class="ldash-lbl">Best Mock</div>
      </div>
    </div>
    ${litukSessions.length === 0 ? '<p class="ldash-empty">Complete a practice session to see your stats here.</p>' : ''}
  `;

  // Render chapter mastery rings
  const chapters = [
    { key: 'Life in the UK: The Values and Principles of the UK', label: 'Ch.1 Values' },
    { key: 'Life in the UK: What is the UK?', label: 'Ch.2 Geography' },
    { key: 'Life in the UK: A Long and Illustrious History', label: 'Ch.3 History' },
    { key: 'Life in the UK: A Modern Thriving Society', label: 'Ch.4 Society' },
    { key: 'Life in the UK: The UK Government, the Law and Your Role', label: 'Ch.5 Government' },
  ];
  const chGrid = document.getElementById('lituk-ch-mastery');
  if (chGrid) {
    chGrid.innerHTML = chapters.map(ch => {
      const pct = getMasteryPct(ch.key);
      const r = 22, circ = 2 * Math.PI * r;
      const dash2 = (pct/100) * circ;
      const col = pct >= 75 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444';
      return `<div class="ch-mastery-item">
        <svg width="56" height="56" viewBox="0 0 56 56">
          <circle cx="28" cy="28" r="${r}" fill="none" stroke="var(--bdr2)" stroke-width="4"/>
          <circle cx="28" cy="28" r="${r}" fill="none" stroke="${col}" stroke-width="4"
            stroke-dasharray="${dash2} ${circ}" stroke-dashoffset="${circ/4}" stroke-linecap="round"/>
          <text x="28" y="33" text-anchor="middle" font-size="11" font-weight="700" fill="var(--tx)">${pct}%</text>
        </svg>
        <div class="ch-mastery-lbl">${ch.label}</div>
      </div>`;
    }).join('');
  }
}

function showPage(name) {
  // Gamification hook
  if (window._showPageGamificationHook) window._showPageGamificationHook(name);
  // Toggle in-quiz class to hide feedback FAB during quiz
  document.body.classList.toggle('in-quiz', name === 'quiz');
  // Track previous page for back-navigation
  const current = document.querySelector('.page.on');
  if (current && current.id !== 'quiz-page') {
    state.prevPage = current.id.replace('-page', '');
  }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('on'));
  document.getElementById(name + '-page').classList.add('on');
  // Update sidebar active state
  document.querySelectorAll('.side-tab').forEach(t => t.classList.remove('on'));
  const tabMap = {
    home:'tab-home', maths:'tab-maths',
    driving:'tab-driving', lituk:'tab-lituk',
    cscs:'tab-cscs', gcse:'tab-gcse', allsubjects:'tab-all', istqb:'tab-istqb', prince2:'tab-prince2',
    ailiteracy:'tab-ai', pathways:'tab-pathway-driver',
    qa:'tab-qa', sia:'tab-sia', az900:'tab-az900',
    foodsafety:'tab-foodsafety', itil:'tab-itil',
    citb:'tab-citb', psm:'tab-psm',
    ielts:'tab-ielts', aws:'tab-aws'
  };
  const activeTab = document.getElementById(tabMap[name]);
  if (activeTab) activeTab.classList.add('on');
  // Page-specific init
  if (name === 'lituk') setTimeout(renderLitukDashboard, 50);
  if (name === 'driving') setTimeout(renderDrivingPage, 50);
  if (name === 'home') setTimeout(renderHeroProfile, 50);
  window.scrollTo(0, 0);
}

function goHome() {
  stopTimer();
  // Return to the page the user came from, not always maths
  const returnTo = state.prevPage || 'home';
  showPage(returnTo);
}

// ═══════════════════════════════════════════════════════════
// TIER MANAGEMENT
// ═══════════════════════════════════════════════════════════
function selectTier(el) {
  document.querySelectorAll('#tier-strip .tier-btn').forEach(b => b.classList.remove('on'));
  el.classList.add('on');
  state.tier = el.dataset.tier;
  state.age  = parseInt(el.dataset.age);
  updateNavTierPill();
}

function updateNavTierPill() {
  document.getElementById('nav-tier-icon').textContent = TIER_ICONS[state.tier];
  document.getElementById('nav-tier-name').textContent = state.tier;
  const pill = document.getElementById('nav-tier-pill');
  const meta = TIER_META[state.tier];
  // reset inline styles then apply
  pill.style.cssText = '';
  const colorMap = {
    Explorer:'background:#dcfce7;color:#15803d',
    Challenger:'background:#dbeafe;color:#1d4ed8',
    Olympian:'background:#f3e8ff;color:#7e22ce',
    Champion:'background:#ffe4e6;color:#9f1239',
  };
  pill.setAttribute('style', colorMap[state.tier]);
}

function openTierModal() {
  pendingTier = state.tier;
  pendingAge = state.age;
  // sync modal selections
  document.querySelectorAll('#tier-modal .opt-btn').forEach(b => {
    b.classList.toggle('on', b.dataset.tier === state.tier);
  });
  updateModalNote(state.tier);
  document.getElementById('tier-modal').classList.add('on');
  document.body.style.overflow = 'hidden';
}

function closeTierModal(e) {
  if (e && e.target !== document.getElementById('tier-modal')) return;
  document.getElementById('tier-modal').classList.remove('on');
  document.body.style.overflow = '';
}

function modalSelectTier(el) {
  document.querySelectorAll('#tier-modal .opt-btn').forEach(b => b.classList.remove('on'));
  el.classList.add('on');
  pendingTier = el.dataset.tier;
  pendingAge = parseInt(el.dataset.age);
  updateModalNote(pendingTier);
}

function updateModalNote(tier) {
  const note = document.getElementById('modal-tier-note');
  const meta = TIER_META[tier];
  note.innerHTML = `${TIER_ICONS[tier]} <strong>${tier}</strong> — ${meta.desc}`;
}

function applyTier() {
  state.tier = pendingTier;
  state.age  = pendingAge;
  // sync home tier strip
  document.querySelectorAll('#tier-strip .tier-btn').forEach(b => {
    b.classList.toggle('on', b.dataset.tier === state.tier);
  });
  updateNavTierPill();
  closeTierModal();
}

// ═══════════════════════════════════════════════════════════
// ALL-SUBJECTS AGE
// ═══════════════════════════════════════════════════════════
function selectAge(el) {
  document.querySelectorAll('#age-row button').forEach(b => {
    b.classList.remove('btn-navy');
    b.classList.add('btn-ghost');
  });
  el.classList.remove('btn-ghost');
  el.classList.add('btn-navy');
  state.allSubjectsAge = parseInt(el.dataset.age);
}

// ═══════════════════════════════════════════════════════════
// START QUIZ
// ═══════════════════════════════════════════════════════════
let _timerInterval = null;
let _timerSeconds = 0;

function startTimer() {
  stopTimer();
  _timerSeconds = 0;
  _timerInterval = setInterval(() => {
    _timerSeconds++;
    const m = Math.floor(_timerSeconds / 60);
    const s = _timerSeconds % 60;
    const el = document.getElementById('q-timer');
    if (el) el.textContent = m + ':' + String(s).padStart(2, '0');
  }, 1000);
}

function stopTimer() {
  if (_timerInterval) { clearInterval(_timerInterval); _timerInterval = null; }
}

function startQuiz(topic, desc, numQ) {
  lastTopic = topic;
  lastDesc  = desc;
  // Remember which page launched this quiz for correct back navigation
  state.prevPage = state.prevPage || 'home';
  // If caller passes a specific large count (Mock Test = 24) respect it,
  // otherwise use the nav dropdown selection
  const qcount = (numQ && numQ >= 20) ? numQ : (state.defaultNumQ || 10);
  lastNum   = qcount;

  // Update breadcrumb
  try {
    const bc = document.getElementById('quiz-breadcrumb');
    const bcSection = document.getElementById('bc-section');
    const bcTopic = document.getElementById('bc-topic');
    if (bc && bcSection && bcTopic) {
      const section = topic.includes('Driving') || topic.includes('DVSA') ? 'Driving Theory'
                    : topic.includes('Life in the UK') ? 'Life in the UK'
                    : topic.includes('CSCS') ? 'CSCS Card'
                    : topic.includes('Maths') ? 'Maths'
                    : 'All Subjects';
      bcSection.textContent = section;
      bcSection.onclick = () => {
        const pageMap = {'Driving Theory':'driving','Life in the UK':'lituk','CSCS Card':'cscs','Maths':'home','All Subjects':'allsubjects'};
        showPage(pageMap[section] || 'home');
      };
      bcTopic.textContent = topic.replace(/^(CSCS|DVSA|Driving Theory|Life in the UK):\s*/,'');
      bc.style.display = 'block';
    }
  } catch(e) {}

  state.topic    = topic;
  state.topicDesc = desc;
  state.numQ     = qcount;
  state.questions = [];
  state.idx      = 0;
  state.answers  = {};

  // Determine age: for Maths topics use tier age, for All Subjects use allSubjectsAge
  const isAllSubjects = document.getElementById('allsubjects-page').classList.contains('on');
  const age = isAllSubjects ? state.allSubjectsAge : state.age;

  // Save the page we're on now before switching to quiz
  const activePage = document.querySelector('.page.on');
  if (activePage && activePage.id !== 'quiz-page') {
    state.prevPage = activePage.id.replace('-page', '');
  }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('on'));
  document.getElementById('quiz-page').classList.add('on');
  renderLoading();
  startTimer();
  loadQuestions(topic, desc, qcount, age);
}

async function loadQuestions(topic, topicDesc, numQ, age) {
  // Clear session-level dedup tracker for this new quiz
  _sessionQTexts.clear();
  const usedArr = Array.from(USED_IDS).slice(-60);

  // Build a rich system prompt for UK Maths topics
  const isLitUK = topic.includes('Life in the UK');
  const isMathsTopic = !isLitUK && (topic.includes(':') || topic.includes('Maths') || topic.includes('Number') ||
    topic.includes('Algebra') || topic.includes('Geometry') || topic.includes('Statistics') ||
    topic.includes('Probability') || topic.includes('Combinatorics') || topic.includes('Logic') ||
    topic.includes('Mathematics'));

  const difficultyMap = {
    Explorer:   'Primary school level, ages 7-10. Simple, concrete, accessible.',
    Challenger: 'UKMT Junior Mathematical Challenge level, ages 11-13. Accessible but requires real thinking, multi-step for some.',
    Olympian:   'UKMT Intermediate Mathematical Challenge level, ages 14-16. Multi-step reasoning required, some lateral thinking.',
    Champion:   'UKMT Senior Mathematical Challenge / BMO level, ages 17+. Olympiad depth, proof-based thinking, elegant solutions.',
  };
  const difficulty = difficultyMap[state.tier] || difficultyMap['Challenger'];

  const topicInstruction = isLitUK
    ? `TOPIC: ${topic}. Generate official-format Life in the UK test questions about: ${topicDesc}.
CRITICAL: ALL questions MUST be type "mcq" with exactly 4 options. No short_answer or true_false.
Base questions strictly on the official Life in the UK handbook content (2024 edition).
Questions should test factual knowledge as required by the real test.
Options should be plausible but only one clearly correct per the official handbook.
Keep language clear and accessible for adult learners.
IMPORTANT FACTUAL UPDATES (2024): The UK monarch is now KING CHARLES III (not Queen Elizabeth II — she died September 2022).
The Prime Minister is the HEAD OF GOVERNMENT (not the monarch). The monarch is HEAD OF STATE with a ceremonial role.
The Supreme Governor of the Church of England is the MONARCH (King Charles III), not the Prime Minister.
The person who lives at 10 Downing Street is the PRIME MINISTER.
Do NOT use "Queen" when referring to the current monarch — use "the King" or "the monarch".`
    : isMathsTopic
    ? `TOPIC: ${topic}. DESCRIPTION: ${topicDesc}.
CRITICAL: ALL questions MUST be type "mcq" with exactly 4 options (A, B, C, D). Never generate short_answer or true_false questions.
Generate ONLY questions specifically about this topic and its subtopics.
UKMT philosophy: questions should REWARD REASONING AND THINKING, not just recall.
Questions should be accessible yet still challenge students who think carefully.
Prefer multi-step problems where the student must combine ideas.
Avoid straightforward "what is 3×4?" questions — instead ask questions where the path to the answer requires genuine thought.
Each question must have exactly 4 plausible options with only one correct answer.`
    : `TOPIC: ${topic}. Generate questions from: ${topicDesc}.
IMPORTANT: You MUST generate MCQ (multiple choice) questions with exactly 4 options for ALL questions in this topic.
Do NOT generate short_answer or true_false questions for this topic — only type "mcq" with 4 distinct options.
Each option should be plausible but only one correct. Make distractors realistic and educational.`;

  const body = {
    age,
    category: isMathsTopic ? 'Mathematics' : topic.split(':')[0].trim(),
    numQuestions: numQ,
    sessionId: SID,
    usedQuestionIds: usedArr,
    usedQuestionTexts: Array.from(_sessionQTexts).slice(-30).map(function(t){ return t.slice(0, 60); }),
    _topicOverride: topic,
    _topicDesc: topicDesc,
    _tier: state.tier,
    _systemExtra: topicInstruction,
    _difficulty: difficulty,
  };

  // For large quizzes (>15Q), batch into smaller calls to avoid JSON truncation
  const BATCH_SIZE = 10;
  try {
    let allQuestions = [];
    if (numQ <= BATCH_SIZE) {
      // Single call for small quizzes
      const data = await fetchQuizBatch({ ...body, numQuestions: numQ });
      allQuestions = data.questions || [];
    } else {
      // Split into batches and merge
      const batches = [];
      let remaining = numQ;
      while (remaining > 0) {
        batches.push(Math.min(BATCH_SIZE, remaining));
        remaining -= BATCH_SIZE;
      }
      // Update loading text for large quizzes
      const loadDiv = document.querySelector('#q-wrap div[style*="flex-direction:column"]');
      if (loadDiv) {
        const txt = loadDiv.querySelector('div:last-child');
        if (txt) txt.textContent = `Generating ${numQ} questions (0/${batches.length} batches)…`;
      }
      for (let i = 0; i < batches.length; i++) {
        const batchBody = { ...body, numQuestions: batches[i] };
        // Pass previously generated question texts so AI avoids repeating them
        batchBody.usedQuestionTexts = allQuestions.slice(-30).map(q => (q.question_text || '').slice(0, 60));
        batchBody._batchInfo = `Batch ${i + 1} of ${batches.length}. Generate DIFFERENT questions — do NOT repeat any of these already-generated questions: ${batchBody.usedQuestionTexts.join(' | ')}. Cover different subtopics.`;
        try {
          const data = await fetchQuizBatch(batchBody);
          allQuestions = allQuestions.concat(data.questions || []);
        } catch(batchErr) {
          // Retry once with smaller batch
          try {
            const retryBody = { ...batchBody, numQuestions: Math.min(batches[i], 8) };
            const retryData = await fetchQuizBatch(retryBody);
            allQuestions = allQuestions.concat(retryData.questions || []);
            console.log(`[PassQuest] Batch ${i+1} retry succeeded`);
          } catch(retryErr) {
            console.warn(`[PassQuest] Batch ${i+1} failed twice: ${retryErr.message}`);
            if (!allQuestions.length && i === batches.length - 1) throw retryErr;
          }
        }
        // Update loading text
        const loadDiv2 = document.querySelector('#q-wrap div[style*="flex-direction:column"]');
        if (loadDiv2) {
          const txt2 = loadDiv2.querySelector('div:last-child');
          if (txt2) txt2.textContent = `Generating questions… (${Math.min(allQuestions.length, numQ)}/${numQ} ready)`;
        }
      }
    }

    if (!allQuestions.length) throw new Error('No questions returned from AI. Check your GROQ_API_KEY in Vercel env vars.');
    // Warn if we got significantly fewer than requested (partial batch failure)
    if (allQuestions.length < numQ * 0.5) {
      console.warn(`[PassQuest] Only got ${allQuestions.length}/${numQ} questions — partial set`);
    }

    // Normalise + dedup by question text (prevents duplicates within this batch set)
    // Use a LOCAL seen set — do NOT filter against _sessionQTexts during generation
    // (that would drop valid questions from later batches)
    const seen = new Set();
    allQuestions = allQuestions.filter(q => {
      if (q.type) q.type = q.type.toLowerCase().replace(/[_\/\-\s]+/g, '');
      // Use longer key (120 chars) to reduce false collision rate
      const key = (q.question_text || '').trim().toLowerCase().slice(0, 120);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    // Now register all kept questions into session set (for cross-quiz dedup)
    allQuestions.forEach(q => {
      const key = (q.question_text || '').trim().toLowerCase().slice(0, 120);
      _sessionQTexts.add(key);
      USED_IDS.add(q.question_id || key);
    });

    // Shuffle if merged from batches to avoid clumping
    if (numQ > BATCH_SIZE) {
      for (let i = allQuestions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allQuestions[i], allQuestions[j]] = [allQuestions[j], allQuestions[i]];
      }
    }

    // If dedup caused fewer questions than requested, do one top-up batch
    if (allQuestions.length < numQ) {
      const deficit = numQ - allQuestions.length;
      if (deficit >= 3) {
        try {
          const topupBody = { ...body, numQuestions: Math.min(deficit + 3, 15) };
          topupBody.usedQuestionTexts = allQuestions.map(q => (q.question_text||'').slice(0,60));
          topupBody._batchInfo = `Top-up batch. Need ${deficit} more questions. Do NOT repeat: ${topupBody.usedQuestionTexts.slice(-20).join(' | ')}`;
          const topup = await fetchQuizBatch(topupBody);
          const topupSeen = new Set(allQuestions.map(q => (q.question_text||'').trim().toLowerCase().slice(0,120)));
          (topup.questions || []).forEach(q => {
            if (q.type) q.type = q.type.toLowerCase().replace(/[_\/\-\s]+/g,'');
            const k = (q.question_text||'').trim().toLowerCase().slice(0,120);
            if (k && !topupSeen.has(k)) { topupSeen.add(k); allQuestions.push(q); }
          });
        } catch(e) { /* silent — use what we have */ }
      }
    }
    state.questions = allQuestions.slice(0, numQ);
    renderQuestion(0);
  } catch(err) {
    renderError(err.message);
  }
}

async function fetchQuizBatch(body, attempt) {
  attempt = attempt || 1;
  const res = await fetch('/api/generate-quiz', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  // Retry once on 429 (rate limit) or 500
  if (!res.ok) {
    if (attempt < 2 && (res.status === 429 || res.status === 500)) {
      await new Promise(function(r) { setTimeout(r, 2500); });
      return fetchQuizBatch(body, 2);
    }
    const errText = await res.text().catch(function() { return ''; });
    let msg = 'API error ' + res.status;
    try { msg = JSON.parse(errText).error || msg; } catch(e) {}
    throw new Error(msg);
  }
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}



// ═══════════════════════════════════════════════════════════
// QUIZ RENDERING
// ═══════════════════════════════════════════════════════════
function renderLoading() {
  document.getElementById('q-wrap').innerHTML = `
    <div style="display:flex;justify-content:center;align-items:center;padding:80px 0;flex-direction:column;gap:16px">
      <div class="spin"></div>
      <div style="font-size:.85rem;color:var(--mu)">Generating questions…</div>
    </div>`;
  hideBottomBtns();
}

function renderError(msg) {
  document.getElementById('q-wrap').innerHTML = `
    <div class="card" style="padding:32px;text-align:center;margin:20px 0">
      <div style="font-size:2rem;margin-bottom:12px">⚠️</div>
      <div style="font-family:'Manrope',sans-serif;font-weight:700;font-size:1.1rem;color:var(--navy);margin-bottom:8px">
        Couldn't load questions
      </div>
      <div style="font-size:.82rem;color:var(--mu);margin-bottom:20px">${msg}</div>
      <button class="btn btn-navy" onclick="goHome()">Back to Topics</button>
    </div>`;
}

function renderQuestion(idx) {
  // Clear multi-pending when navigating to a different question
  if (idx !== state.idx) state._multiPending = [];
  state.idx = idx;
  const q = state.questions[idx];
  const total = state.questions.length;

  // Update sticky progress bar
  const fill = document.getElementById('quiz-top-progress-fill');
  if (fill) fill.style.width = (((idx) / total) * 100) + '%';

  // Update header
  document.getElementById('q-topic-label').textContent = state.topic;
  document.getElementById('q-counter').textContent = `${idx+1} / ${total}`;
  document.getElementById('q-prog').style.width = `${((idx+1)/total)*100}%`;

  // Dots
  const dotRow = document.getElementById('dot-row');
  dotRow.innerHTML = state.questions.map((_, i) => {
    const ans = state.answers[i];
    let cls = i === idx ? 'cur' : ans ? (ans.correct ? 'ok' : 'bad') : '';
    return `<div class="dot ${cls}"></div>`;
  }).join('');

  // Build topic colour for this pillar
  const tc = getTopicColor(state.topic);

  // Render question card
  const isAnswered = state.answers[idx] !== undefined;
  const chosen = isAnswered ? state.answers[idx].chosen : null;
  const correct = q.correct_answer;
  const wasCorrect = isAnswered && state.answers[idx].correct;

  // Determine question type (normalised to lowercase, underscores removed)
  const qtype = (q.type || 'shortanswer').toLowerCase().replace(/[_\/\-\s]+/g, '');
  const isMCQ = qtype === 'mcq' && q.options && q.options.length >= 2;
  const isTF  = qtype === 'truefalse' || qtype === 'tf';

  // Store options globally so onclick handlers can reference by index (avoids quoting issues)
  window._qopts = (isMCQ ? q.options : (isTF ? (q.options && q.options.length >= 2 ? q.options : ['True','False']) : []));

  // Multi-answer support
  const isMulti = !!(q.multiple_correct) || !!(q.correct_options && q.correct_options.length > 1);
  const correctSet = isMulti
    ? new Set((q.correct_options || []).map(s => s.trim().toLowerCase()))
    : null;

  function makeOptBtn(opt, oi, letters) {
    const letter = letters[oi] || String(oi+1);
    if (isMulti) {
      // Checkbox-style multi-select
      const isInCorrect = correctSet.has(opt.trim().toLowerCase());
      let cls = 'opt opt-check';
      let tick = '';
      if (isAnswered) {
        // chosen is stored as "A|||B|||C" string — split it back into array
        const chosenRaw = state.answers[idx].chosen || '';
        const chosenArr = typeof chosenRaw === 'string' ? chosenRaw.split('|||') : (Array.isArray(chosenRaw) ? chosenRaw : []);
        const chosenSet = new Set(chosenArr.map(s => s.trim().toLowerCase()));
        const wasChosen = chosenSet.has(opt.trim().toLowerCase());
        if (isInCorrect) { cls += ' cor'; tick = ' <span class="opt-tick">&#10003;</span>'; }
        else if (wasChosen) { cls += ' wrg'; tick = ' <span class="opt-tick">&#10007;</span>'; }
        else { cls += ' dim'; }
      } else {
        // pending handled by DOM .sel class — no state needed
      }
      const role = 'checkbox';
      const checked = isAnswered
        ? (correctSet.has(opt.trim().toLowerCase()) ? 'true' : 'false')
        : ((state._multiPending || []).includes(oi) ? 'true' : 'false');
      return '<button class="' + cls + '" role="' + role + '" aria-checked="' + checked + '" data-oi="' + oi + '" '
        + (isAnswered ? 'disabled' : '') + ' onclick="toggleMultiOpt(' + oi + ')" tabindex="0">'
        + '<span class="opt-letter opt-checkbox">' + (((state._multiPending||[]).includes(oi) && !isAnswered) ? '&#10003;' : letter) + '</span>'
        + '<span class="opt-text">' + escHtml(opt) + '</span>'
        + tick + '</button>';
    } else {
      // Single-answer radio style
      let cls = 'opt';
      let tick = '';
      if (isAnswered) {
        if (opt === correct) { cls += ' cor'; tick = ' <span class="opt-tick">&#10003;</span>'; }
        else if (opt === chosen && opt !== correct) { cls += ' wrg'; tick = ' <span class="opt-tick">&#10007;</span>'; }
        else { cls += ' dim'; }
      }
      return '<button class="' + cls + '" role="radio" aria-checked="' + (opt === chosen ? 'true' : 'false') + '" '
        + (isAnswered ? 'disabled' : '') + ' onclick="answerByIndex(' + oi + ')" tabindex="0">'
        + '<span class="opt-letter">' + letter + '</span>'
        + '<span class="opt-text">' + escHtml(opt) + '</span>'
        + tick + '</button>';
    }
  }

  // Image support for driving theory questions
  const imageHtml = q.imageUrl
    ? `<div class="q-image-wrap"><img src="${escHtml(q.imageUrl)}" alt="Question image" loading="lazy"/></div>`
    : '';

  // Determine grid layout: 2-col if all options are short, else single col
  const allShort = isMCQ && q.options && q.options.every(o => String(o).length <= 40);
  const gridClass = allShort ? 'mcq-grid' : 'mcq-grid single-col';

  let optionsHtml = '';
  if (isMCQ) {
    const multiHint = isMulti
      ? '<div class="multi-hint" role="note">&#9745; Select all that apply</div>'
      : '';
    const pendingCount = (state._multiPending || []).length;
    const submitBtn = ''; // Submit button rendered in bottom bar via updateBottomBtns
    optionsHtml = multiHint
      + '<div class="' + gridClass + '" role="group" aria-label="' + (isMulti ? 'Multiple choice — select all correct' : 'Single choice') + '">'
      + q.options.map((opt, oi) => makeOptBtn(opt, oi, ['A','B','C','D'])).join('')
      + '</div>' + submitBtn;
  } else if (isTF) {
    const tfOpts = window._qopts;
    optionsHtml = '<div class="mcq-grid single-col">'
      + tfOpts.map((opt, oi) => makeOptBtn(opt, oi, ['A','B'])).join('')
      + '</div>';
  } else {
    // Fallback: if AI sent non-MCQ, render as best-effort MCQ or show retry
    const fallbackOpts = q.options && q.options.length >= 2
      ? q.options
      : (q.correct_answer ? [q.correct_answer, 'None of the above', 'Cannot be determined', 'More information needed'] : ['A', 'B', 'C', 'D']);
    const fallbackCorrect = q.correct_answer || fallbackOpts[0];
    optionsHtml = '<div class="mcq-grid single-col" role="group" aria-label="Single choice">'
      + fallbackOpts.slice(0,4).map((opt, oi) => {
          let cls = 'opt';
          let tick = '';
          if (isAnswered) {
            if (opt === correct || opt === fallbackCorrect) { cls += ' cor'; tick = ' <span class="opt-tick">&#10003;</span>'; }
            else if (opt === chosen) { cls += ' wrg'; tick = ' <span class="opt-tick">&#10007;</span>'; }
            else { cls += ' dim'; }
          }
          return '<button class="' + cls + '" role="radio" aria-checked="' + (opt === chosen ? 'true' : 'false') + '" '
            + (isAnswered ? 'disabled' : '') + ' onclick="answerByIndex(' + oi + ')" tabindex="0">'
            + '<span class="opt-letter">' + ['A','B','C','D'][oi] + '</span>'
            + '<span class="opt-text">' + escHtml(opt) + '</span>'
            + tick + '</button>';
        }).join('')
      + '</div>';
  }

  // Feedback section
  // Premium micro-copy — mentor voice
  const _correctPhrases = ['Excellent Observation','Precision Mastery','Concept Confirmed','Spot On','Sharp Thinking'];
  const _incorrectPhrases = ['Refining Knowledge','Opportunity for Growth','Learning in Progress','Almost There — Review This'];
  const _correctLabel  = _correctPhrases[Math.floor(Math.random() * _correctPhrases.length)];
  const _incorrectLabel = _incorrectPhrases[Math.floor(Math.random() * _incorrectPhrases.length)];

  let feedbackHtml = '';
  if (isAnswered) {
    const fb = wasCorrect
      ? `<div class="feedback-box ok"><div class="feedback-label">✓ ${_correctLabel}</div><div class="feedback-txt">${escHtml(q.explanation)}</div></div>`
      : `<div class="feedback-box bad">
          <div class="feedback-label">✗ ${_incorrectLabel}</div>
          <div style="font-size:.78rem;font-weight:700;color:var(--bad);margin-bottom:5px">✓ Correct answer: ${escHtml(correct)}</div>
          <div class="feedback-txt">${escHtml(q.explanation)}</div>
        </div>`;
    feedbackHtml = fb;
  }

  document.getElementById('q-wrap').innerHTML = `
    <div class="q-card rise" style="--tc:${tc.tc};--tcb:${tc.tcb}">
      <div class="q-category-badge">${escHtml(state.topic)}</div>
      ${imageHtml}
      <div class="q-text">${escHtml(q.question_text)}</div>
      <div class="options">${optionsHtml}</div>
    </div>
    ${feedbackHtml}
    <div id="ai-zone"></div>
  `;

  // Focus short answer input
  if (!isAnswered && qtype === 'shortanswer') {
    setTimeout(() => document.getElementById('sa-input')?.focus(), 50);
  }

  // Bottom buttons
  updateBottomBtns(isAnswered, idx, total);
}

function updateBottomBtns(answered, idx, total) {
  // Show flag button only in mock mode
  const flagQuiz = document.getElementById('btn-flag-quiz');
  if (flagQuiz) {
    flagQuiz.style.display = _isMockMode ? 'flex' : 'none';
    flagQuiz.classList.toggle('flagged', _flaggedQs && _flaggedQs.has(idx));
    flagQuiz.textContent = (_flaggedQs && _flaggedQs.has(idx)) ? '🚩 Flagged' : '🚩 Flag';
  }
  const btnHint    = document.getElementById('btn-hint');
  const btnWhy     = document.getElementById('btn-why');
  const btnLesson  = document.getElementById('btn-lesson');
  const btnNext    = document.getElementById('btn-next');
  const btnResults = document.getElementById('btn-results');
  const btnConfirm = document.getElementById('btn-confirm-multi');

  const q = state.questions[idx];
  const isMulti = q && (!!(q.multiple_correct) || !!(q.correct_options && q.correct_options.length > 1));
  const pendingCount = (state._multiPending || []).length;

  btnHint.style.display    = (!answered && !isMulti) ? 'inline-flex' : 'none';
  btnWhy.style.display     = (answered && !state.answers[idx]?.correct) ? 'inline-flex' : 'none';
  btnLesson.style.display  = answered ? 'inline-flex' : 'none';
  btnNext.style.display    = (answered && idx < total - 1) ? 'inline-flex' : 'none';
  btnResults.style.display = (answered && idx === total - 1) ? 'inline-flex' : 'none';

  // Confirm button for multi-answer questions
  if (btnConfirm) {
    if (isMulti && !answered) {
      btnConfirm.style.display = 'inline-flex';
      btnConfirm.disabled = false; // never disabled — submitMulti guards empty
      btnConfirm.style.pointerEvents = 'auto';
      btnConfirm.style.opacity = pendingCount === 0 ? '0.5' : '1';
      btnConfirm.textContent = pendingCount === 0
        ? 'Select at least one'
        : '✓ Confirm ' + pendingCount + ' Answer' + (pendingCount > 1 ? 's' : '');
    } else {
      btnConfirm.style.display = 'none';
    }
  }
}

function hideBottomBtns() {
  ['btn-hint','btn-why','btn-lesson','btn-next','btn-results','btn-confirm-multi']
    .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
}

// ═══════════════════════════════════════════════════════════
// ANSWERING
// ═══════════════════════════════════════════════════════════
function answerByIndex(oi) {
  const chosen = (window._qopts || [])[oi];
  if (chosen !== undefined) {
    window._lastClickedOptIdx = oi;
    answer(String(chosen));
  }
}

function toggleMultiOpt(oi) {
  if (state.answers[state.idx]) return;

  var btn = document.querySelector('#q-wrap button[data-oi="' + oi + '"]');
  if (!btn) return;

  var isNowSelected = !btn.classList.contains('sel');
  var letter = btn.querySelector('.opt-letter');

  if (isNowSelected) {
    btn.classList.add('sel');
    btn.style.borderColor = 'var(--ok)';
    btn.style.background = 'var(--okb)';
    if (letter) { letter.textContent = '\u2713'; letter.style.background = 'var(--ok)'; letter.style.color = '#fff'; }
  } else {
    btn.classList.remove('sel');
    btn.style.borderColor = '';
    btn.style.background = '';
    if (letter) { letter.textContent = ['A','B','C','D'][oi] || String(oi); letter.style.background = ''; letter.style.color = ''; }
  }

  // Count from DOM - DOM is the single source of truth
  var selectedBtns = document.querySelectorAll('#q-wrap button.sel');
  var count = selectedBtns.length;
  var btnConfirm = document.getElementById('btn-confirm-multi');
  if (btnConfirm) {
    btnConfirm.style.opacity = count === 0 ? '0.5' : '1';
    btnConfirm.textContent = count === 0
      ? 'Select at least one'
      : '\u2713 Confirm ' + count + ' Answer' + (count > 1 ? 's' : '');
  }
}

function submitMulti() {
  var q = state.questions[state.idx];

  // Read entirely from DOM - no state._multiPending dependency whatsoever
  var selectedBtns = document.querySelectorAll('#q-wrap button.sel');
  if (!selectedBtns.length) {
    showELToast('Please select at least one answer first');
    return;
  }

  var chosenTexts = Array.from(selectedBtns).map(function(b) {
    var t = b.querySelector('.opt-text');
    return t ? t.textContent.trim() : '';
  }).filter(Boolean);

  if (!chosenTexts.length) {
    showELToast('Please select at least one answer first');
    return;
  }

  var chosen = chosenTexts.join('|||');
  var correctSet = new Set((q.correct_options || [q.correct_answer]).map(function(s){ return String(s).trim().toLowerCase(); }));
  var chosenSet  = new Set(chosenTexts.map(function(s){ return s.toLowerCase(); }));
  var correct = correctSet.size === chosenSet.size && Array.from(correctSet).every(function(v){ return chosenSet.has(v); });

  state.answers[state.idx] = { chosen: chosen, correct: correct };
  state._multiPending = [];
  updateErrorLog(q, correct, state.topic);
  renderQuestion(state.idx);
}

function answer(chosen) {
  const q = state.questions[state.idx];
  const correct = chosen.trim().toLowerCase() === q.correct_answer.trim().toLowerCase();
  state.answers[state.idx] = { chosen, correct };
  // Weakness Tracker: add wrong answers, remove corrected ones
  updateErrorLog(q, correct, state.topic);
  // Gamification micro-interaction hook
  if (window._answerMicroHook) window._answerMicroHook(chosen, correct);
  renderQuestion(state.idx);
}

function submitSA() {
  const input = document.getElementById('sa-input');
  if (!input) return;
  const val = input.value.trim();
  if (!val) return;
  answer(val);
}

function nextQ() {
  if (state.idx < state.questions.length - 1) {
    renderQuestion(state.idx + 1);
    window.scrollTo(0, 0);
  }
}

// ═══════════════════════════════════════════════════════════
// AI HELPERS
// ═══════════════════════════════════════════════════════════
async function callAI(prompt, system) {
  try {
    const r = await fetch('/api/generate-quiz', {
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({_direct:true,_prompt:prompt,_system:system})
    });
    const d = await r.json();
    return d.text || null;
  } catch{ return null; }
}



async function fetchWhy() {
  const q = state.questions[state.idx];
  const ans = state.answers[state.idx];
  const btn = document.getElementById('btn-why');
  btn.disabled = true; btn.textContent = '⟳ …';
  const zone = document.getElementById('ai-zone');
  zone.innerHTML = '<div class="ai-panel"><div class="ai-label">Why wrong?</div><div class="spin" style="width:20px;height:20px;border-width:2px"></div></div>';
  const why = await callAI(
    `Question: "${q.question_text}". Correct answer: "${q.correct_answer}". Student answered: "${ans.chosen}". In 2 kind sentences, explain why they were wrong and what to remember.`,
    'You are a kind, encouraging maths teacher.'
  );
  zone.innerHTML = why
    ? `<div class="ai-panel"><div class="ai-label"> Why wrong?</div>${escHtml(why)}</div>`
    : '';
  btn.style.display = 'none';
}

async function fetchLesson() {
  const q = state.questions[state.idx];
  const btn = document.getElementById('btn-lesson');
  btn.disabled = true; btn.textContent = '⟳ …';
  const zone = document.getElementById('ai-zone');
  zone.innerHTML = '<div class="ai-panel"><div class="ai-label">Deep dive</div><div class="spin" style="width:20px;height:20px;border-width:2px"></div></div>';
  const lesson = await callAI(
    `Topic: ${state.topic}. Question: "${q.question_text}". Correct: "${q.correct_answer}". Give a 80-word mini-lesson for age ${state.age} on the key concept. Use plain text.`,
    'You are an expert maths tutor. Write a concise, clear mini-lesson.'
  );
  zone.innerHTML = lesson
    ? `<div class="ai-panel"><div class="ai-label"> Mini Lesson — ${escHtml(state.topic)}</div>${escHtml(lesson)}</div>`
    : '';
  btn.style.display = 'none';
}

// ═══════════════════════════════════════════════════════════
// RESULTS
// ═══════════════════════════════════════════════════════════
function maybeShowSupportCTA() {
  try {
    var count = parseInt(localStorage.getItem('pq_quiz_count') || '0') + 1;
    localStorage.setItem('pq_quiz_count', count);
    var banner = document.getElementById('support-cta-banner');
    if (banner) banner.style.display = (count % 3 === 0) ? 'block' : 'none';
  } catch(e) {}
}

function showResults() {
  stopTimer();
  // Save session to localStorage for dashboard
  try {
    const sessions = JSON.parse(localStorage.getItem('gq_sessions') || '[]');
    const elapsed = _timerSeconds || 0;
    const correct = Object.values(state.answers).filter(a => a && a.correct).length;
    const total = Object.keys(state.answers).length || state.numQ;
    sessions.push({
      date: new Date().toISOString(),
      topic: state.topic,
      score: Math.round((correct/total)*100),
      correct, total,
      elapsed // seconds
    });
    // Keep last 200 sessions
    if (sessions.length > 200) sessions.splice(0, sessions.length - 200);
    localStorage.setItem('gq_sessions', JSON.stringify(sessions));
    // Update chapter mastery
    updateMastery(state.topic, correct, total);
  } catch(e) {}
  const timeTaken = _timerSeconds;
  maybeShowSupportCTA();
  const total = state.questions.length;
  const score = Object.values(state.answers).filter(a => a.correct).length;
  const pct = Math.round((score/total)*100);

  document.getElementById('res-topic').textContent = state.topic;
  const userName = _currentUser && !_currentUser.isGuest ? _currentUser.name + ' · ' : '';

  // Determine if this is an adult compliance test (no age/tier labels)
  const isAdultTest = state.topic && (
    state.topic.includes('Life in the UK') ||
    state.topic.includes('Driving Theory') ||
    state.topic.includes('DVSA') ||
    state.topic.includes('CSCS') ||
    state.topic.includes('Mock Test')
  );

  if (isAdultTest) {
    // Show PASS/FAIL instead of tier/age
    const passThreshold = state.topic.includes('Life in the UK') ? 75 : 86;
    const passed = pct >= passThreshold;
    document.getElementById('res-tier').innerHTML = userName
      + (passed
        ? `<span style="display:inline-flex;align-items:center;gap:5px;background:#dcfce7;color:#166534;border:1.5px solid #86efac;border-radius:8px;padding:3px 12px;font-weight:800;font-size:.9rem">✅ PASS</span>`
        : `<span style="display:inline-flex;align-items:center;gap:5px;background:#fee2e2;color:#991b1b;border:1.5px solid #fca5a5;border-radius:8px;padding:3px 12px;font-weight:800;font-size:.9rem">❌ FAIL — ${passThreshold}% required</span>`);
  } else {
    document.getElementById('res-tier').textContent = `${userName}${TIER_ICONS[state.tier]} ${state.tier} level · ${state.age} year age group`;
  }
  const tm = Math.floor(timeTaken/60) + ':' + String(timeTaken%60).padStart(2,'0');
  document.getElementById('res-time').textContent = `⏱ Time: ${tm}`;
  document.getElementById('score-pct').textContent = pct + '%';
  document.getElementById('score-frac').textContent = `${score}/${total}`;

  // Medal
  const { emoji, name, bg, msg } = getMedal(pct);
  document.getElementById('medal-emoji').textContent = emoji;
  document.getElementById('medal-name').textContent = name;
  document.getElementById('medal-sub').textContent = msg;
  document.getElementById('medal-banner').style.background = bg;

  // Score ring colour
  const ring = document.getElementById('score-ring');
  ring.style.borderColor = pct >= 85 ? '#F59E0B' : pct >= 65 ? '#94a3b8' : pct >= 50 ? '#c2410c' : '#9ca3af';

  // Question review list
  const list = document.getElementById('result-q-list');
  list.innerHTML = state.questions.map((q, i) => {
    const ans = state.answers[i];
    const ok  = ans?.correct;
    return `
      <div class="rq ${ok?'':'bad-q'}" id="rq-${i}">
        <div class="rq-head" onclick="toggleRQ(${i})">
          <span class="rq-icon">${ok ? '✅' : '❌'}</span>
          <span class="rq-txt">${i+1}. ${escHtml(q.question_text.substring(0,80))}${q.question_text.length>80?'…':''}</span>
          <span class="rq-chevron">›</span>
        </div>
        <div class="rq-body">
          <div class="rq-ans">✓ ${escHtml(q.correct_answer)}</div>
          ${ans && !ok ? `<div style="color:var(--bad);font-size:.78rem;margin-bottom:6px">Your answer: ${escHtml(typeof ans.chosen === 'string' ? ans.chosen.replace(/\|\|\|/g, ', ') : ans.chosen)}</div>` : ''}
          <div class="rq-exp">${escHtml(q.explanation)}</div>
        </div>
      </div>`;
  }).join('');

  showPage('results');
  // Complete the progress bar
  const fill = document.getElementById('quiz-top-progress-fill');
  if (fill) fill.style.width = '100%';
  fetchMotiv(score, total);
  // Gamification: XP, mascot, confetti
  _showResultsGamification();
  // Check career pathway badges
  checkCareerBadges();
  // Weakness Tracker: show specialized banner if this was a review session
  renderErrorLogResultsBanner(score, total);

  // Share card: show if score >= 75%
  const shareSection = document.getElementById('share-card-section');
  if (shareSection) shareSection.style.display = pct >= 75 ? 'block' : 'none';
}

function toggleRQ(i) {
  document.getElementById(`rq-${i}`).classList.toggle('open');
}

function getMedal(pct) {
  if (pct >= 85) return { emoji:'🥇', name:'Gold', bg:'#fffbeb', msg:'Outstanding — UKMT Gold standard!' };
  if (pct >= 65) return { emoji:'🥈', name:'Silver', bg:'#f8fafc', msg:'Strong performance — keep building on this.' };
  if (pct >= 50) return { emoji:'🥉', name:'Bronze', bg:'#fff7ed', msg:'Good effort — review the questions you missed.' };
  return { emoji:'💪', name:'Keep Practising', bg:'#f8fafc', msg:'Every practice session makes you stronger.' };
}



// ═══════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════
function getTopicColor(topic) {
  const t = topic.toLowerCase();
  if (t.includes('number') || t.includes('arithmetic')) return { tc:'#1d4ed8', tcb:'#dbeafe' };
  if (t.includes('algebra'))   return { tc:'#7e22ce', tcb:'#f3e8ff' };
  if (t.includes('geometry') || t.includes('measures')) return { tc:'#0d9488', tcb:'#ccfbf1' };
  if (t.includes('statistics') || t.includes('probability')) return { tc:'#be185d', tcb:'#fce7f3' };
  if (t.includes('combinatorics') || t.includes('logic')) return { tc:'#c2410c', tcb:'#ffedd5' };
  if (t.includes('science'))   return { tc:'#16a34a', tcb:'#dcfce7' };
  if (t.includes('english'))   return { tc:'#d97706', tcb:'#fef3c7' };
  if (t.includes('computer'))  return { tc:'#7c3aed', tcb:'#ede9fe' };
  return { tc:'#374151', tcb:'#f1f5f9' };
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

// Keyboard: Escape closes modal
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.getElementById('tier-modal').classList.remove('on');
    document.body.style.overflow = '';
  }
});

// Init
updateNavTierPill();

// ═══ USER LOGIN / PROFILE ══════════════════════════════════
let _currentUser = null; // { name, isGuest }

// ═══════════════════════════════════════════════════════════
// SUPABASE AUTH ENGINE
// Replace the two REPLACE_ values with your Supabase project details
// Get them from: supabase.com → Your Project → Settings → API
// ═══════════════════════════════════════════════════════════

const SUPABASE_URL  = 'https://mwdqxwaxngjnoegfbawe.supabase.co';
const SUPABASE_ANON = 'f211ca6e-7f41-493b-bd5b-90b360a26154';

let _sb        = null;   // Supabase client instance
let _sbSession = null;   // current auth session
let _sbProfile = null;   // cached server profile

function initSupabase() {
  if (SUPABASE_URL.startsWith('REPLACE')) return null;
  try {
    return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
  } catch(e) {
    console.warn('Supabase init failed:', e);
    return null;
  }
}

// ── Auth view switcher ──────────────────────────────────────
function showAuthView(view) {
  ['choose','profile','confirm'].forEach(v => {
    const el = document.getElementById('auth-view-' + v);
    if (el) el.style.display = (v === view) ? 'block' : 'none';
  });
}

// ── Open / close modal ──────────────────────────────────────
function openLoginModal() {
  document.getElementById('login-modal').classList.add('on');
  document.body.style.overflow = 'hidden';
  if (_sbSession) {
    showAuthView('profile');
  } else {
    showAuthView('choose');
    // Show/hide sections based on whether Supabase is configured
    const configured = !!_sb;
    const oauthBtns       = document.getElementById('auth-oauth-btns');
    const emailSection    = document.getElementById('auth-email-section');
    const notConfigured   = document.getElementById('auth-not-configured');
    if (oauthBtns)     oauthBtns.style.display     = configured ? 'block' : 'none';
    if (emailSection)  emailSection.style.display   = configured ? 'block' : 'none';
    if (notConfigured) notConfigured.style.display  = configured ? 'none'  : 'block';
    if (configured) setTimeout(() => document.getElementById('auth-email')?.focus(), 100);
  }
}

function closeLoginModal() {
  document.getElementById('login-modal').classList.remove('on');
  document.body.style.overflow = '';
}

// ── GitHub OAuth (free, no billing required) ────────────────
async function authGitHub() {
  if (!_sb) { showAuthError('Sign-in not configured yet.'); return; }
  const { error } = await _sb.auth.signInWithOAuth({
    provider: 'github',
    options: { redirectTo: window.location.origin },
  });
  if (error) showAuthError(error.message);
}
// Keep old name in case anything else references it
const authGoogle = authGitHub;

// ── Email / Password sign-in or sign-up ─────────────────────
async function authEmailSubmit() {
  if (!_sb) {
    showAuthError('Sign-in not available yet. Please continue as Guest.');
    return;
  }

  const email = document.getElementById('auth-email').value.trim();
  const pass  = document.getElementById('auth-pass').value;
  const btn   = document.getElementById('auth-submit-btn');
  showAuthError('');

  if (!email)       { showAuthError('Please enter your email address.'); return; }
  if (pass.length < 6) { showAuthError('Password must be at least 6 characters.'); return; }

  btn.disabled = true;
  btn.textContent = 'Signing in…';

  // Try sign-in first
  let { data, error } = await _sb.auth.signInWithPassword({ email, password: pass });

  if (error && (error.message.includes('Invalid login') || error.message.includes('Email not confirmed'))) {
    // Account doesn't exist — sign up
    btn.textContent = 'Creating account…';
    ({ data, error } = await _sb.auth.signUp({ email, password: pass }));

    if (!error && data?.user && !data?.session) {
      // Email confirmation required
      document.getElementById('auth-confirm-email').textContent = email;
      showAuthView('confirm');
      btn.disabled = false;
      btn.textContent = 'Sign In / Sign Up →';
      return;
    }
  }

  btn.disabled = false;
  btn.textContent = 'Sign In / Sign Up →';

  if (error) { showAuthError(error.message); return; }
  if (data?.session) {
    await onSignedIn(data.session);
    closeLoginModal();
  }
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  if (el) el.textContent = msg;
}

// ── Sign out ────────────────────────────────────────────────
async function authSignOut() {
  if (_sb) await _sb.auth.signOut().catch(() => {});
  _sbSession = null;
  _sbProfile = null;
  _currentUser = { name: 'Guest', isGuest: true };
  localStorage.removeItem('gq_user');
  updateUserPill();
  closeLoginModal();
  showELToast('Signed out. Your progress is still saved locally.');
}

// ── After successful sign-in: sync & load profile ───────────
async function onSignedIn(session) {
  _sbSession = session;
  const token = session.access_token;

  // Build local data snapshot for sync
  const xpData = JSON.parse(localStorage.getItem('gq_xp_data') || '{}');
  const localData = {
    name:           (_currentUser && !_currentUser.isGuest) ? _currentUser.name : null,
    xp:             xpData.xp             || 0,
    level:          xpData.level          || 1,
    streak:         xpData.streak         || 0,
    streak_freezes: parseInt(localStorage.getItem('pq_streak_freezes') || '0'),
    badges:         JSON.parse(localStorage.getItem('gq_badges') || '[]'),
    sessions:       JSON.parse(localStorage.getItem('gq_sessions') || '[]'),
    mastery:        JSON.parse(localStorage.getItem('gq_mastery') || '{}'),
    exam_date:      localStorage.getItem('pq_exam_date') || null,
  };

  // Sync localStorage → Supabase (fire and forget on sign-in)
  fetch('/api/auth-sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, localData }),
    keepalive: true,
  }).then(r => r.json()).then(d => {
    if (d.ok) console.log('[PassQuest] Synced to Supabase:', d.synced);
  }).catch(e => console.warn('[PassQuest] Sync failed:', e));

  // Fetch full server profile
  try {
    const r = await fetch('/api/auth-profile?token=' + encodeURIComponent(token));
    _sbProfile = await r.json();

    const name = _sbProfile.name || session.user.user_metadata?.full_name || session.user.email;
    _currentUser = { name, isGuest: false, email: session.user.email };
    localStorage.setItem('gq_user', JSON.stringify(_currentUser));
    updateUserPill();

    // Update profile modal content
    const pName  = document.getElementById('auth-profile-name');
    const pEmail = document.getElementById('auth-profile-email');
    if (pName)  pName.textContent  = name;
    if (pEmail) pEmail.textContent = session.user.email;

    const tierBadge = document.getElementById('auth-tier-badge');
    if (tierBadge) {
      const isPro = _sbProfile.subscription_tier === 'pro';
      tierBadge.style.background = isPro ? '#fef3c7' : '#dcfce7';
      tierBadge.style.color      = isPro ? '#92400e' : '#15803d';
      tierBadge.textContent      = isPro ? '★ Pro Account' : '✓ Free Account';
    }

    setTimeout(renderHeroProfile, 100);
  } catch(e) {
    console.warn('[PassQuest] Profile fetch failed:', e);
  }
}

// ── Guest / legacy login fallback ───────────────────────────
function loginGuest(nameHint) {
  const name = nameHint || 'Guest';
  _currentUser = { name, isGuest: !nameHint };
  localStorage.setItem('gq_user', JSON.stringify(_currentUser));
  updateUserPill();
  closeLoginModal();
}

// ── Keep nav user pill in sync ───────────────────────────────
function updateUserPill() {
  const pill   = document.getElementById('nav-user-pill');
  const avatar = document.getElementById('nav-user-avatar');
  const nameEl = document.getElementById('nav-user-name');
  if (!pill) return;
  pill.style.display = 'flex';
  if (_currentUser && !_currentUser.isGuest) {
    nameEl.textContent = _currentUser.name;
    avatar.textContent = _currentUser.name.charAt(0).toUpperCase();
    avatar.style.background = _sbSession ? '#1d6c3a' : '#2d3561';
    pill.title = _sbSession ? '☁ Signed in — progress syncing' : 'Profile';
  } else {
    nameEl.textContent  = 'Guest';
    avatar.textContent  = 'G';
    avatar.style.background = '#6b6878';
    pill.title = 'Click to create free account';
  }
}

// ── Sync mastery to server after each quiz ───────────────────
async function syncProgressToServer(topic, correct, attempted) {
  if (!_sbSession) return;
  const token = _sbSession.access_token;
  fetch('/api/auth-progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, action: 'save_mastery', topic, correct, attempted }),
    keepalive: true,
  }).catch(() => {});
}

// ── Init on page load ───────────────────────────────────────
// ═══ CAREER PATHWAYS FILTER ═══════════════════════════════
function filterPathways(role, btn) {
  // Update active button
  document.querySelectorAll('.role-filter-btn').forEach(function(b) {
    b.classList.remove('on');
  });
  if (btn) btn.classList.add('on');

  // Show/hide pathway cards
  document.querySelectorAll('.pathway-card').forEach(function(card) {
    const roles = (card.dataset.roles || '').split(' ');
    if (role === 'all' || roles.indexOf(role) !== -1) {
      card.style.display = '';
    } else {
      card.style.display = 'none';
    }
  });
}

// ═══ CAREER BADGE SYSTEM ══════════════════════════════════
// Checks if user has earned career badges based on quiz performance
function checkCareerBadges() {
  var sessions = JSON.parse(localStorage.getItem('gq_sessions') || '[]');
  var earned = getBadgesEarned();
  var newBadges = [];

  var careerBadgeDefs = [
    {
      id: 'career_site_ready',
      icon: '🏗️',
      name: 'Site-Ready',
      check: function() {
        return sessions.some(function(s) {
          return s.topic && s.topic.includes('CSCS') && s.score >= 90;
        });
      }
    },
    {
      id: 'career_road_ready',
      icon: '🚗',
      name: 'Road-Ready',
      check: function() {
        return sessions.some(function(s) {
          return (s.topic && s.topic.includes('Theory') || s.topic && s.topic.includes('DVSA')) && s.score >= 86;
        });
      }
    },
    {
      id: 'career_pm_ready',
      icon: '📋',
      name: 'PM-Ready',
      check: function() {
        return sessions.some(function(s) {
          return s.topic && s.topic.includes('PRINCE2') && s.score >= 70;
        });
      }
    },
    {
      id: 'career_qa_certified',
      icon: '🧪',
      name: 'QA-Certified',
      check: function() {
        var hasISTQB = sessions.some(function(s) { return s.topic && s.topic.includes('ISTQB') && s.score >= 65; });
        var hasAI    = sessions.some(function(s) { return s.topic && s.topic.includes('AI Literacy') && s.score >= 70; });
        return hasISTQB && hasAI;
      }
    },
    {
      id: 'career_citizenship_ready',
      icon: '🇬🇧',
      name: 'Citizenship-Ready',
      check: function() {
        return sessions.some(function(s) {
          return s.topic && s.topic.includes('Life in the UK') && s.score >= 75;
        });
      }
    },
    {
      id: 'career_tech_ready',
      icon: '💻',
      name: 'Tech-Ready',
      check: function() {
        var hasGCSE = sessions.some(function(s) { return s.topic && s.topic.includes('GCSE') && s.score >= 60; });
        var hasAI   = sessions.some(function(s) { return s.topic && s.topic.includes('AI Literacy') && s.score >= 70; });
        return hasGCSE && hasAI;
      }
    },
    {
      id: 'ai_literate',
      icon: '🤖',
      name: 'AI Literate',
      check: function() {
        return sessions.some(function(s) {
          return s.topic && s.topic.includes('AI Literacy') && s.score >= 75;
        });
      }
    },
  ];

  careerBadgeDefs.forEach(function(b) {
    if (earned.indexOf(b.id) === -1 && b.check()) {
      earned.push(b.id);
      newBadges.push(b);
    }
  });

  if (newBadges.length) {
    localStorage.setItem('gq_badges', JSON.stringify(earned));
    setTimeout(function() {
      newBadges.forEach(function(b) {
        showBadgeToast(b);
      });
    }, 1200);
  }
}

function initUser() {
  _sb = initSupabase();

  if (_sb) {
    // Listen for auth changes (also handles OAuth redirect callbacks)
    _sb.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        await onSignedIn(session);
      } else if (event === 'SIGNED_OUT') {
        _sbSession = null;
        updateUserPill();
      }
    });

    // Restore existing session silently
    _sb.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        onSignedIn(session);
      } else {
        const saved = localStorage.getItem('gq_user');
        if (saved) {
          _currentUser = JSON.parse(saved);
          updateUserPill();
        } else {
          setTimeout(() => openLoginModal(), 600);
        }
      }
    });

  } else {
    // Supabase not configured yet — localStorage-only mode
    const saved = localStorage.getItem('gq_user');
    if (saved) {
      _currentUser = JSON.parse(saved);
      updateUserPill();
    } else {
      setTimeout(() => openLoginModal(), 600);
    }
  }
}

// ═══ LITUK PRE-TEST MODAL ══════════════════════════════════
let _ltmTopic = '', _ltmDesc = '', _ltmNum = 10;

function openLitukTest(topic, desc, defaultN) {
  _ltmTopic = topic;
  _ltmDesc = desc;
  _ltmNum = defaultN || 10;

  document.getElementById('ltm-title').textContent = topic.replace('Life in the UK: ', '');
  document.getElementById('ltm-desc').textContent = desc.length > 80 ? desc.slice(0,80) + '…' : desc;

  // Set active Q button
  document.querySelectorAll('.ltm-q-btn').forEach(b => {
    b.classList.toggle('on', parseInt(b.dataset.n) === _ltmNum);
  });

  // Update mastery ring
  const pct = getMasteryPct(topic);
  const circ = 2 * Math.PI * 16;
  const arc = (pct / 100) * circ;
  const ring = document.getElementById('ltm-ring-arc');
  if (ring) {
    ring.setAttribute('stroke-dasharray', `${arc} ${circ}`);
    ring.setAttribute('stroke', pct >= 75 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444');
  }
  document.getElementById('ltm-mastery-pct').textContent = pct + '% correct so far';

  document.getElementById('lituk-test-modal').classList.add('on');
}

function closeLitukTestModal(e) {
  if (!e || e.target === document.getElementById('lituk-test-modal')) {
    document.getElementById('lituk-test-modal').classList.remove('on');
  }
}

function selectLtmQ(btn) {
  document.querySelectorAll('.ltm-q-btn').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  _ltmNum = parseInt(btn.dataset.n);
}

function beginLitukTest() {
  document.getElementById('lituk-test-modal').classList.remove('on');
  startQuiz(_ltmTopic, _ltmDesc, _ltmNum);
}

// ═══════════════════════════════════════════════════════════
// GAMIFICATION ENGINE
// ═══════════════════════════════════════════════════════════

// ── XP & Level System ─────────────────────────────────────
const XP_PER_CORRECT = 10;
const XP_PER_QUIZ    = 25;
const XP_BONUS_PERFECT = 50;
const LEVEL_THRESHOLDS = [0,100,250,500,900,1400,2100,3000,4200,5800,8000];

function getXPData() {
  return JSON.parse(localStorage.getItem('gq_xp_data') || '{"xp":0,"level":1,"totalCorrect":0,"quizzes":0}');
}
function saveXPData(d) {
  localStorage.setItem('gq_xp_data', JSON.stringify(d));
}
function getLevelFromXP(xp) {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i]) return i + 1;
  }
  return 1;
}
function getXPForNextLevel(level) {
  return LEVEL_THRESHOLDS[Math.min(level, LEVEL_THRESHOLDS.length - 1)] || 9999;
}
function getLevelTitle(level) {
  const titles = ['','Newcomer','Apprentice','Explorer','Scholar','Challenger','Achiever','Expert','Master','Champion','Legend','Genius'];
  return titles[Math.min(level, titles.length - 1)] || 'Genius';
}

function awardXP(correct, total) {
  const d = getXPData();
  const xpGained = (correct * XP_PER_CORRECT) + XP_PER_QUIZ + (correct === total ? XP_BONUS_PERFECT : 0);
  const oldLevel = getLevelFromXP(d.xp);
  d.xp += xpGained;
  d.totalCorrect += correct;
  d.quizzes += 1;
  d.level = getLevelFromXP(d.xp);
  saveXPData(d);
  checkBadges(d, correct, total);
  if (d.level > oldLevel) showLevelUpToast(d.level);
  return xpGained;
}

// ── Badge System ───────────────────────────────────────────
const BADGES = [
  { id:'first_quiz',    icon:'🎯', name:'First Steps',       desc:'Complete your first quiz',           check: (d,_,__,sessions) => sessions.length >= 1 },
  { id:'perfect',       icon:'💯', name:'Perfect Score',     desc:'Score 100% on any quiz',             check: (_,c,t) => c === t && t >= 5 },
  { id:'streak3',       icon:'🔥', name:'On Fire',           desc:'3-day study streak',                 check: (d,_,__,sessions) => calcStreak(sessions) >= 3 },
  { id:'streak7',       icon:'⚡', name:'Lightning Streak',  desc:'7-day study streak',                 check: (d,_,__,sessions) => calcStreak(sessions) >= 7 },
  { id:'100correct',    icon:'🏹', name:'Sharp Shooter',     desc:'100 correct answers total',          check: (d) => d.totalCorrect >= 100 },
  { id:'500correct',    icon:'⚔️', name:'Warrior',           desc:'500 correct answers total',          check: (d) => d.totalCorrect >= 500 },
  { id:'lituk_scholar', icon:'🇬🇧', name:'Citizenship Scholar', desc:'Complete a Life in the UK quiz', check: (_,__,___,sessions) => sessions.some(s => s.topic && s.topic.includes('Life in the UK')) },
  { id:'mock_pass',     icon:'🏆', name:'Mock Champion',     desc:'Pass a full mock test (≥75%)',       check: (_,c,t,sessions) => sessions.some(s => s.topic?.includes('Mock Test') && s.score >= 75) },
  { id:'ukmt',          icon:'🧮', name:'UKMT Conqueror',    desc:'Score 85%+ on a Maths quiz',        check: (_,c,t) => t >= 5 && (c/t) >= 0.85 && !(['Life in the UK','All Subjects'].some(x => (window._lastQuizTopic||'').includes(x))) },
  { id:'level5',        icon:'🌟', name:'Star Student',      desc:'Reach Level 5',                      check: (d) => d.level >= 5 },
  { id:'marathon',      icon:'🏃', name:'Marathon Learner',  desc:'Complete 20 quizzes',               check: (d) => d.quizzes >= 20 },
  { id:'night_owl',     icon:'🦉', name:'Night Owl',         desc:'Study after 9pm',                   check: () => new Date().getHours() >= 21 },
];

function getBadgesEarned() {
  return JSON.parse(localStorage.getItem('gq_badges') || '[]');
}
function checkBadges(xpData, correct, total) {
  const earned = getBadgesEarned();
  const sessions = JSON.parse(localStorage.getItem('gq_sessions') || '[]');
  const newBadges = [];
  for (const b of BADGES) {
    if (!earned.includes(b.id) && b.check(xpData, correct, total, sessions)) {
      earned.push(b.id);
      newBadges.push(b);
    }
  }
  localStorage.setItem('gq_badges', JSON.stringify(earned));
  if (newBadges.length) setTimeout(() => newBadges.forEach(showBadgeToast), 1200);
  return newBadges;
}

function showBadgeToast(badge) {
  const el = document.createElement('div');
  el.className = 'streak-toast';
  el.innerHTML = `${badge.icon} New Badge: <strong>${badge.name}</strong>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function showLevelUpToast(level) {
  const el = document.createElement('div');
  el.className = 'streak-toast';
  el.style.background = 'linear-gradient(135deg,#2d3561,#1a1a4e)';
  el.style.color = '#fff';
  el.innerHTML = `🎉 Level Up! You're now <strong>${getLevelTitle(level)}</strong> (Lv.${level})`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ── Hero Profile Renderer ──────────────────────────────────
function renderHeroProfile() {
  const mount = document.getElementById('hero-profile-mount');
  if (!mount) return;
  const d = getXPData();
  const sessions = JSON.parse(localStorage.getItem('gq_sessions') || '[]');
  const streak = calcStreak(sessions);
  const level = getLevelFromXP(d.xp);
  const nextXP = getXPForNextLevel(level);
  const prevXP = LEVEL_THRESHOLDS[level - 1] || 0;
  const progress = Math.min(100, Math.round(((d.xp - prevXP) / Math.max(1, nextXP - prevXP)) * 100));
  const userName = _currentUser && !_currentUser.isGuest ? _currentUser.name : 'Guest';
  const initial = userName.charAt(0).toUpperCase();
  const earned = getBadgesEarned();
  const avgScore = sessions.length ? Math.round(sessions.reduce((a,s)=>a+s.score,0)/sessions.length) : 0;

  mount.innerHTML = `
    <div class="hero-profile">
      <div class="hero-top">
        <div class="hero-avatar-wrap">
          <div class="hero-avatar">${initial}</div>
          <div class="hero-level-badge">Lv.${level} ${getLevelTitle(level)}</div>
        </div>
        <div class="hero-info">
          <div class="hero-name">${userName}</div>
          <div class="hero-tagline">${d.xp} XP · ${d.quizzes} quizzes · ${d.totalCorrect} correct</div>
          <div class="hero-xp-bar-wrap" style="margin-top:8px">
            <div class="hero-xp-label">
              <span>Lv.${level}</span><span>${d.xp} / ${nextXP} XP</span>
            </div>
            <div class="hero-xp-track">
              <div class="hero-xp-fill" style="width:${progress}%"></div>
            </div>
          </div>
        </div>
      </div>
      <div class="hero-stats">
        <div class="hero-stat" style="position:relative">
          <div class="hero-stat-val"><span class="streak-fire">🔥</span> ${streak}</div>
          <div class="hero-stat-lbl">Day Streak</div>
          ${streak >= 7 ? '<div class="streak-milestone">🏆 WEEK</div>' : streak >= 3 ? '<div class="streak-milestone">⚡ HOT</div>' : ''}
        </div>
        <div class="hero-stat">
          <div class="hero-stat-val">⭐ ${d.xp}</div>
          <div class="hero-stat-lbl">Total XP</div>
        </div>
        <div class="hero-stat">
          <div class="hero-stat-val">${avgScore}%</div>
          <div class="hero-stat-lbl">Avg Score</div>
        </div>
        <div class="hero-stat">
          <div class="hero-stat-val">🏅 ${earned.length}</div>
          <div class="hero-stat-lbl">Badges</div>
        </div>
      </div>
    </div>

    <div id="targeted-practice-mount"></div>
    <div id="exam-readiness-mount"></div>
    <div id="exam-countdown-mount"></div>
    <div id="radar-chart-mount"></div>

    <div class="badges-section">
      <div class="badges-title">🏅 Achievements</div>
      <div class="badges-grid">
        ${BADGES.map(b => {
          const isEarned = earned.includes(b.id);
          return `<div class="badge-item ${isEarned?'earned':''}" title="${b.desc}">
            ${isEarned ? '<div class="badge-new-glow"></div>' : ''}
            <span class="badge-icon">${b.icon}</span>
            <div class="badge-name">${b.name}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

// ── Confetti Engine ────────────────────────────────────────

// ════════════════════════════════════════════════════════════
//  GAMIFICATION ENGINE v2
// ════════════════════════════════════════════════════════════

// ── Web Audio API Sound Engine ─────────────────────────────
let _audioCtx = null;
function getAudioCtx() {
  if (!_audioCtx) {
    try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
  }
  return _audioCtx;
}

function playCorrectSound() {
  const ctx = getAudioCtx(); if (!ctx) return;
  // Happy ascending chord: C5 → E5 → G5
  [[523.25, 0], [659.25, .1], [783.99, .2]].forEach(([freq, delay]) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
    gain.gain.setValueAtTime(0, ctx.currentTime + delay);
    gain.gain.linearRampToValueAtTime(.18, ctx.currentTime + delay + .02);
    gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + delay + .45);
    osc.start(ctx.currentTime + delay);
    osc.stop(ctx.currentTime + delay + .45);
  });
}

function playWrongSound() {
  const ctx = getAudioCtx(); if (!ctx) return;
  // Descending dissonant: D4 → Bb3
  [[293.66, 0], [233.08, .15]].forEach(([freq, delay]) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
    gain.gain.setValueAtTime(0, ctx.currentTime + delay);
    gain.gain.linearRampToValueAtTime(.09, ctx.currentTime + delay + .02);
    gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + delay + .35);
    osc.start(ctx.currentTime + delay);
    osc.stop(ctx.currentTime + delay + .35);
  });
}

function playLevelUpSound() {
  const ctx = getAudioCtx(); if (!ctx) return;
  // Fanfare: G4-B4-D5-G5
  [[392, 0],[493.88, .12],[587.33, .24],[783.99, .36]].forEach(([freq, delay]) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
    gain.gain.setValueAtTime(0, ctx.currentTime + delay);
    gain.gain.linearRampToValueAtTime(.22, ctx.currentTime + delay + .03);
    gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + delay + .6);
    osc.start(ctx.currentTime + delay);
    osc.stop(ctx.currentTime + delay + .6);
  });
}

function playStreakSound() {
  const ctx = getAudioCtx(); if (!ctx) return;
  // Woosh + ding
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(300, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + .4);
  gain.gain.setValueAtTime(0.2, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .55);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + .55);
}

// ── Enhanced Confetti ─────────────────────────────────────
function launchConfetti(intensity) {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const count = intensity === 'epic' ? 220 : 130;
  const SHAPES = ['rect','circle','star','triangle'];
  const COLORS = ['#f59e0b','#22c55e','#3b82f6','#ef4444','#a855f7','#ec4899','#14b8a6','#fde68a','#bbf7d0'];

  const particles = Array.from({length:count}, () => ({
    x: Math.random() * canvas.width,
    y: intensity === 'epic' ? (Math.random() * canvas.height * .3) : (-10 - Math.random() * 60),
    r: 4 + Math.random() * 8,
    vx: (Math.random() - .5) * 5,
    vy: 1.5 + Math.random() * 4,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    rot: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - .5) * .15,
    shape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
    alpha: 1,
    decay: .006 + Math.random() * .004
  }));

  function drawStar(ctx, x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i * 4 * Math.PI / 5) - Math.PI / 2;
      const b = (i * 4 * Math.PI / 5 + 2 * Math.PI / 5) - Math.PI / 2;
      i === 0 ? ctx.moveTo(x + r * Math.cos(a), y + r * Math.sin(a))
              : ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
      ctx.lineTo(x + (r/2.5) * Math.cos(b), y + (r/2.5) * Math.sin(b));
    }
    ctx.closePath();
  }

  let running = true;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = 0;
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += .06; // gravity
      p.rot += p.rotSpeed;
      p.alpha -= p.decay;
      if (p.alpha <= 0) return;
      alive++;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fillStyle = p.color;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      if (p.shape === 'rect') {
        ctx.fillRect(-p.r/2, -p.r * .7, p.r, p.r * 1.4);
      } else if (p.shape === 'circle') {
        ctx.beginPath(); ctx.arc(0, 0, p.r * .7, 0, Math.PI*2); ctx.fill();
      } else if (p.shape === 'star') {
        drawStar(ctx, 0, 0, p.r);
        ctx.fill();
      } else { // triangle
        ctx.beginPath();
        ctx.moveTo(0, -p.r); ctx.lineTo(p.r*.8, p.r*.6); ctx.lineTo(-p.r*.8, p.r*.6);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    });
    if (alive > 0) requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  draw();
}

// ── XP Toast Popup ─────────────────────────────────────────
function showXPToast(amount, x, y) {
  const el = document.createElement('div');
  el.className = 'xp-toast';
  el.textContent = '+' + amount + ' XP';
  el.style.cssText = 'position:fixed;font-family:"Fraunces",serif;font-size:1.15rem;font-weight:900;color:#22c55e;pointer-events:none;z-index:10000;text-shadow:0 2px 8px rgba(0,0,0,.2);';
  el.style.left = (x - 30) + 'px';
  el.style.top  = (y - 10) + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1100);
}

// ── Badge Unlock Toast ──────────────────────────────────────
function showBadgeUnlockToast(badge) {
  let toast = document.getElementById('badge-unlock-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'badge-unlock-toast';
    toast.className = 'badge-unlock-toast';
    document.body.appendChild(toast);
  }
  toast.innerHTML = '<span class="badge-unlock-icon">' + badge.icon + '</span><div><div style="font-size:.72rem;opacity:.7;font-weight:600">Achievement Unlocked!</div><div>' + badge.name + '</div></div>';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
  playLevelUpSound();
}

// ── Streak Modal ────────────────────────────────────────────
function showStreakModal(streak) {
  document.getElementById('streak-modal-num').textContent = streak;
  const msgs = ["Amazing dedication!", "Keep the momentum going!", "You're unstoppable!", "Consistency is key!", "Your future self thanks you!"];
  document.getElementById('streak-modal-sub').textContent = msgs[Math.min(Math.floor(streak/3), msgs.length-1)];
  document.getElementById('streak-modal').classList.add('on');
  playStreakSound();
  launchConfetti('normal');
}
function closeStreakModal() {
  document.getElementById('streak-modal').classList.remove('on');
}

// ── Level Up Effect ─────────────────────────────────────────
function triggerLevelUp() {
  const ov = document.getElementById('levelup-overlay');
  if (!ov) return;
  ov.style.display = 'block';
  ov.style.animation = 'none';
  void ov.offsetWidth;
  ov.style.animation = 'levelup-flash .9s ease-out both';
  setTimeout(() => { ov.style.display = 'none'; }, 950);
  playLevelUpSound();
}

// ── Enhanced Answer Animation ───────────────────────────────
function triggerAnswerAnim(btn, isCorrect) {
  if (!btn) return;
  btn.classList.remove('anim-correct','anim-wrong','confirmed-correct');
  void btn.offsetWidth;
  btn.classList.add(isCorrect ? 'anim-correct' : 'anim-wrong');

  if (isCorrect) {
    playCorrectSound();
    const rect = btn.getBoundingClientRect();
    showXPToast(XP_PER_CORRECT, rect.left + rect.width/2, rect.top);
    if (navigator.vibrate) navigator.vibrate([25]);
    // Add persistent checkmark after anim
    setTimeout(() => {
      btn.classList.remove('anim-correct');
      btn.classList.add('confirmed-correct');
    }, 620);
  } else {
    playWrongSound();
    if (navigator.vibrate) navigator.vibrate([60, 40, 80]);
  }
  setTimeout(() => btn.classList.remove('anim-wrong'), 600);
}

// ── Mascot Expression Engine ───────────────────────────────
function setMascotMood(pct) {
  const svg = document.getElementById('mascot-svg');
  const mouth = document.getElementById('mascot-mouth');
  const star1 = document.getElementById('star1');
  const star2 = document.getElementById('star2');
  if (!svg || !mouth) return;

  svg.classList.remove('mascot-cheer','mascot-sad');

  if (pct === 100) {
    // Pure joy
    mouth.setAttribute('d', 'M40 43 Q50 54 60 43');
    mouth.setAttribute('stroke-width', '2.5');
    if (star1) { star1.style.opacity='1'; star2.style.opacity='1'; }
    svg.classList.add('mascot-ecstatic');
    // Add eyebrow raise
    const brows = document.getElementById('mascot-brows');
    if (brows) brows.setAttribute('d', 'M38 26 Q43 23 48 26 M52 26 Q57 23 62 26');
  } else if (pct >= 75) {
    // Happy
    mouth.setAttribute('d', 'M42 43 Q50 51 58 43');
    mouth.setAttribute('stroke-width', '2');
    svg.classList.add('mascot-cheer');
  } else if (pct >= 50) {
    // Neutral/encouraging
    mouth.setAttribute('d', 'M43 46 Q50 47 57 46');
    mouth.setAttribute('stroke-width', '2');
  } else if (pct >= 25) {
    // Concerned
    mouth.setAttribute('d', 'M43 47 Q50 44 57 47');
    mouth.setAttribute('stroke-width', '2');
    svg.classList.add('mascot-sad');
  } else {
    // Sad but encouraging
    mouth.setAttribute('d', 'M43 49 Q50 44 57 49');
    mouth.setAttribute('stroke-width', '2');
    svg.classList.add('mascot-sad');
  }
}

// ── Flashcard Carousel ─────────────────────────────────────
let _fcCards = [];
let _fcIdx = 0;
let _fcFlipped = false;

function buildFlashcards(chapter) {
  // Extract key facts from study panels based on topic
  const panelMap = {
    '1': document.getElementById('sp-1'),
    '2': document.getElementById('sp-2'),
    '3': document.getElementById('sp-3'),
    '4': document.getElementById('sp-4'),
    '5': document.getElementById('sp-5'),
  };
  // Build cards from study facts in the panel
  const chNum = chapter ? chapter.toString() : '1';
  const panel = panelMap[chNum];
  if (!panel) return [];

  const cards = [];
  panel.querySelectorAll('.study-section').forEach(sec => {
    const heading = sec.querySelector('h4')?.textContent || '';
    sec.querySelectorAll('.study-fact span:last-child').forEach(fact => {
      const text = fact.textContent.trim();
      if (text.length > 20 && text.length < 200) {
        // Try to split into Q&A at the first ' — ' or ': '
        const splitIdx = text.indexOf(' — ');
        if (splitIdx > 0) {
          cards.push({
            category: heading,
            q: text.slice(0, splitIdx).trim(),
            a: text.slice(splitIdx + 3).trim()
          });
        } else {
          cards.push({ category: heading, q: 'Key Fact:', a: text });
        }
      }
    });
  });
  return cards.slice(0, 12); // max 12 cards
}

function renderFlashcardCarousel(mountId, chapterNum) {
  const mount = document.getElementById(mountId);
  if (!mount) return;
  _fcCards = buildFlashcards(chapterNum);
  if (!_fcCards.length) { mount.innerHTML = ''; return; }
  _fcIdx = 0; _fcFlipped = false;

  mount.innerHTML = `
    <div class="flashcard-carousel">
      <div class="badges-title" style="margin-bottom:8px">📚 Quick Review — Flip the cards before you quiz</div>
      <div class="fc-progress-bar">
        <div class="fc-progress-fill" id="fc-fill" style="width:${(1/_fcCards.length)*100}%"></div>
      </div>
      <div class="flashcard-stage" id="fc-stage">
        <div class="flashcard" id="fc-card" onclick="flipCard()">
          <div class="flashcard-face flashcard-front">
            <div class="flashcard-eyebrow" id="fc-cat"></div>
            <div class="flashcard-q" id="fc-q"></div>
            <div class="flashcard-hint">👆 Tap to reveal answer</div>
          </div>
          <div class="flashcard-face flashcard-back">
            <div class="flashcard-eyebrow">Answer</div>
            <div class="flashcard-a" id="fc-a"></div>
          </div>
        </div>
      </div>
      <div class="fc-nav">
        <button class="fc-btn" id="fc-prev" onclick="fcNav(-1)">← Prev</button>
        <div class="fc-dots" id="fc-dots"></div>
        <button class="fc-btn" id="fc-next" onclick="fcNav(1)">Next →</button>
      </div>
    </div>`;
  updateFlashcard();
}

function updateFlashcard() {
  const card = document.getElementById('fc-card');
  const q    = document.getElementById('fc-q');
  const a    = document.getElementById('fc-a');
  const cat  = document.getElementById('fc-cat');
  const fill = document.getElementById('fc-fill');
  const dots = document.getElementById('fc-dots');
  const prev = document.getElementById('fc-prev');
  const next = document.getElementById('fc-next');
  if (!card || !q) return;

  const c = _fcCards[_fcIdx];
  cat.textContent  = c.category;
  q.textContent    = c.q;
  a.textContent    = c.a;
  card.classList.remove('flipped');
  _fcFlipped = false;

  fill.style.width = ((_fcIdx + 1) / _fcCards.length * 100) + '%';
  dots.innerHTML = _fcCards.map((_,i) =>
    `<div class="fc-dot ${i === _fcIdx ? 'on' : ''}"></div>`
  ).join('');
  prev.disabled = _fcIdx === 0;
  next.disabled = _fcIdx === _fcCards.length - 1;
}

function flipCard() {
  const card = document.getElementById('fc-card');
  if (!card) return;
  _fcFlipped = !_fcFlipped;
  card.classList.toggle('flipped', _fcFlipped);
  // Play a soft click sound on flip
  const ctx = getAudioCtx();
  if (ctx) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = _fcFlipped ? 440 : 330;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .18);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + .18);
  }
  // Brief rainbow glow on reveal
  if (_fcFlipped) {
    card.classList.add('glowing');
    setTimeout(() => card.classList.remove('glowing'), 1800);
  }
}

function fcNav(dir) {
  _fcIdx = Math.max(0, Math.min(_fcCards.length - 1, _fcIdx + dir));
  updateFlashcard();
}

// ── Answer micro-interaction hook (called from answer()) ────
window._answerMicroHook = function(chosen, correct) {
  // Find button by matching opt-text content (most reliable approach)
  const btns = document.querySelectorAll('#q-options button.opt');
  let matched = null;
  btns.forEach(btn => {
    const optText = btn.querySelector('.opt-text');
    if (optText && optText.textContent.trim().toLowerCase() === chosen.trim().toLowerCase()) {
      matched = btn;
    }
  });
  // Fallback: use stored click index
  if (!matched && window._lastClickedOptIdx !== undefined) {
    matched = btns[window._lastClickedOptIdx] || null;
  }
  if (matched) triggerAnswerAnim(matched, correct);
  // Play sound
  if (correct) { try { playCorrectSound(); } catch(e){} }
  else          { try { playWrongSound();   } catch(e){} }
};

// ── showResults XP + mascot hook (called at end of showResults) ──
function _showResultsGamification() {
  const total = state.questions.length;
  const score = Object.values(state.answers).filter(a => a.correct).length;
  const pct   = Math.round((score/total)*100);

  window._lastQuizTopic = state.topic;

  // Award XP
  const xpGained = awardXP(score, total);

  // Show XP summary bar
  const bar = document.getElementById('xp-summary-bar');
  if (bar) {
    bar.style.display = 'flex';
    document.getElementById('xp-earned-num').textContent = '+' + xpGained;
    document.getElementById('xp-earned-title').textContent =
      pct === 100 ? '🎉 Perfect! Bonus XP Awarded!' :
      pct >= 75 ? '⭐ Great Work — XP Earned' : '💪 Keep Going — XP Earned';
    const d = getXPData();
    document.getElementById('xp-earned-sub').textContent =
      `Total: ${d.xp} XP · Level ${getLevelFromXP(d.xp)} ${getLevelTitle(getLevelFromXP(d.xp))}`;
    document.getElementById('xp-earned-badge').textContent = pct === 100 ? '🏆' : pct >= 75 ? '🥇' : '📚';
  }

  // Show mascot
  const box = document.getElementById('motiv-box');
  if (box) {
    box.style.display = 'flex';
    setMascotMood(pct);
    // Show XP badge in coach bubble
    const badge = document.getElementById('coach-xp-badge');
    const xpText = document.getElementById('coach-xp-text');
    if (badge && xpText) {
      badge.style.display = 'inline-flex';
      xpText.textContent = `+${xpGained} XP earned!`;
    }
  }

  // Confetti for good scores — tiered by performance + test type
  const isMockTest = total >= 20;
  const isAdultPass = pct >= 86 && (state.topic||'').match(/Driving|DVSA|Mock/i)
                   || pct >= 75 && (state.topic||'').match(/Life in the UK|CSCS|GCSE/i);
  if (pct === 100) {
    setTimeout(() => launchConfetti('epic'), 300);
    setTimeout(() => playLevelUpSound(), 600);
  } else if (isMockTest && (pct >= 75 || isAdultPass)) {
    // Mock test pass — epic celebration
    setTimeout(() => launchConfetti('epic'), 300);
    setTimeout(() => playLevelUpSound(), 600);
  } else if (pct >= 75) {
    setTimeout(() => launchConfetti('normal'), 300);
    setTimeout(() => playCorrectSound(), 500);
  }

  // Check for new badges unlocked this quiz
  setTimeout(() => {
    const prev = JSON.parse(localStorage.getItem('gq_badges') || '[]');
    const newBadges = checkBadges();
    newBadges.filter(b => !prev.includes(b.id)).forEach((b, i) => {
      setTimeout(() => showBadgeUnlockToast(b), i * 1800 + 800);
    });
  }, 600);

  // Check streak (was today new?)
  try {
    const today = new Date().toDateString();
    const lastDay = localStorage.getItem('gq_last_day');
    if (lastDay !== today) {
      const streak = calcStreak(JSON.parse(localStorage.getItem('gq_sessions') || '[]'));
      localStorage.setItem('gq_last_day', today);
      if (streak > 1) setTimeout(() => showStreakModal(streak), 1200);
    }
  } catch(e) {}

  // Streak toast
  const sessions = JSON.parse(localStorage.getItem('gq_sessions') || '[]');
  const streak = calcStreak(sessions);
  if (streak > 1) {
    setTimeout(() => {
      const el = document.createElement('div');
      el.className = 'streak-toast';
      el.innerHTML = `🔥 ${streak} Day Streak! Keep it up!`;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 3000);
    }, 800);
  }
};

// ── Hero profile render hook (called from showPage) ──────────
// Injected via window._showPageGamificationHook
window._showPageGamificationHook = function(name) {
  if (name === 'home') setTimeout(renderHeroProfile, 50);
};

// ── Add flashcard to study panel footer ───────────────────
function toggleStudyPanel(n) {
  const panel = document.getElementById('sp-' + n);
  if (!panel) return;
  panel.classList.toggle('open');
  // Render flashcards when panel opens
  if (panel.classList.contains('open')) {
    const mountId = 'fc-mount-' + n;
    if (!document.getElementById(mountId)) {
      const body = panel.querySelector('.study-panel-body');
      if (body) {
        const fc = document.createElement('div');
        fc.id = mountId;
        body.insertBefore(fc, body.firstChild);
      }
    }
    renderFlashcardCarousel('fc-mount-' + n, n);
  }
}

// ── Initial render ─────────────────────────────────────────
setTimeout(renderHeroProfile, 200);

// ═══════════════════════════════════════════════════════════
// DRIVING THEORY ENGINE
// ═══════════════════════════════════════════════════════════

const DT_CATEGORIES = [
  { id:'Road Signs',              icon:'🚦', total:15 },
  { id:'Alertness',               icon:'👁', total:8  },
  { id:'Attitudes',               icon:'🤝', total:6  },
  { id:'Safety and Your Vehicle', icon:'🔧', total:8  },
  { id:'Safety Margins',          icon:'📏', total:6  },
  { id:'Hazard Awareness',        icon:'⚠', total:8  },
  { id:'Vulnerable Road Users',   icon:'🚶', total:6  },
  { id:'Other Types of Vehicle',  icon:'🚛', total:4  },
  { id:'Vehicle Handling',        icon:'🏎', total:6  },
  { id:'Motorway Rules',          icon:'🛣', total:7  },
  { id:'Rules of the Road',       icon:'📋', total:8  },
  { id:'Road and Traffic Signs',  icon:'🛑', total:6  },
  { id:'Documents',               icon:'📄', total:4  },
  { id:'Accidents',               icon:'🚨', total:5  },
  { id:'Vehicle Loading',         icon:'📦', total:4  },
];

function getDTProgress() {
  return JSON.parse(localStorage.getItem('gq_dt_progress') || '{}');
}
function saveDTProgress(data) {
  localStorage.setItem('gq_dt_progress', JSON.stringify(data));
}
function getDTCatProgress(cat) {
  const p = getDTProgress();
  return p[cat] || { correct: 0, attempted: 0 };
}
function recordDTAnswer(cat, correct) {
  const p = getDTProgress();
  if (!p[cat]) p[cat] = { correct: 0, attempted: 0 };
  p[cat].attempted++;
  if (correct) p[cat].correct++;
  saveDTProgress(p);
}

let _dtQuestions = null;
async function loadDTQuestions() {
  if (_dtQuestions) return _dtQuestions;
  try {
    const r = await fetch('theory-questions.json');
    const d = await r.json();
    _dtQuestions = d.questions;
    return _dtQuestions;
  } catch(e) {
    console.warn('theory-questions.json not loaded:', e);
    _dtQuestions = [];
    return _dtQuestions;
  }
}

async function renderDrivingPage() {
  const qs = await loadDTQuestions();
  const prog = getDTProgress();
  const sessions = JSON.parse(localStorage.getItem('gq_sessions') || '[]');
  const streak = calcStreak(sessions);

  const totalCorrect = Object.values(prog).reduce((a,c) => a + c.correct, 0);
  const el1 = document.getElementById('dt-stat-done');
  const el2 = document.getElementById('dt-stat-streak');
  if (el1) el1.textContent = totalCorrect;
  if (el2) el2.textContent = streak;

  const totalQ = qs.length || 100;
  const overallPct = Math.min(100, Math.round((totalCorrect / totalQ) * 100));
  const overallEl   = document.getElementById('dt-overall-pct');
  const overallSub  = document.getElementById('dt-overall-sub');
  const overallFill = document.getElementById('dt-overall-fill');
  const overallArc  = document.getElementById('dt-ring-arc');
  if (overallEl)   overallEl.textContent   = overallPct + '%';
  if (overallSub)  overallSub.textContent  = totalCorrect + ' of ' + totalQ + ' questions answered correctly';
  if (overallFill) overallFill.style.width = overallPct + '%';
  if (overallArc) {
    const circ = 2 * Math.PI * 18;
    overallArc.setAttribute('stroke-dasharray', (overallPct / 100 * circ) + ' ' + circ);
  }

  const grid = document.getElementById('dt-cat-grid');
  if (!grid) return;
  grid.innerHTML = DT_CATEGORIES.map(cat => {
    const p = prog[cat.id] || { correct: 0, attempted: 0 };
    const catQs = qs.filter(q => q.category === cat.id);
    const catTotal = catQs.length || cat.total;
    const pct = catTotal > 0 ? Math.min(100, Math.round((p.correct / catTotal) * 100)) : 0;
    const complete = pct >= 80;
    const safeId = cat.id.replace(/[^a-z0-9]/gi, '_');
    return '<div class="dt-cat-card ' + (complete ? 'complete' : '') + '" onclick="startDrivingCategoryQuiz(\'' + cat.id.replace(/'/g,"\\'") + '\')">'
      + '<span class="dt-cat-icon">' + cat.icon + '</span>'
      + '<div class="dt-cat-name">' + cat.id + '</div>'
      + '<div class="dt-cat-progress-track"><div class="dt-cat-progress-fill" style="width:' + pct + '%"></div></div>'
      + '<div class="dt-cat-label">' + p.correct + '/' + catTotal + ' correct &nbsp; ' + pct + '%</div>'
      + '</div>';
  }).join('');
}

function selectVehicle(btn, type) {
  document.querySelectorAll('.dt-veh-btn').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
}

async function startDrivingCategoryQuiz(category) {
  const qs = await loadDTQuestions();
  const catQs = qs.filter(q => q.category === category);
  if (!catQs.length) { alert('No questions found for: ' + category); return; }
  const shuffled = catQs.slice().sort(() => Math.random() - .5);
  const selected = shuffled.slice(0, Math.min(10, shuffled.length));
  startDrivingQuiz(selected, category + ' — Theory', false);
}

let _mockTimer = null;
let _mockSeconds = 57 * 60;
let _flaggedQs = new Set();
let _isMockMode = false;

async function startDrivingMockTest() {
  const qs = await loadDTQuestions();
  if (!qs.length) { alert('Question bank loading, please try again.'); return; }
  const shuffled = qs.slice().sort(() => Math.random() - .5);
  const selected = shuffled.slice(0, 50);
  _flaggedQs = new Set();
  _isMockMode = true;
  _mockSeconds = 57 * 60;
  startDrivingQuiz(selected, 'DVSA Mock Test — 50 Questions', true);
}

function startDrivingQuiz(questions, topic, isMock) {
  const mapped = questions.map(q => ({
    question_text: q.questionText,
    options: q.options,
    correct_answer: q.correctAnswer,
    explanation: q.explanation,
    imageUrl: q.imageUrl || null,
    type: 'mcq',
    _dtCategory: q.category,
    _isDriving: true,
  }));
  state.questions = mapped;
  state.topic = topic;
  state.answers = {};
  state.idx = 0;
  state.prevPage = 'driving';
  startTimer();
  renderQuestion(0);
  showPage('quiz');
  if (isMock) {
    startMockTimer();
    document.getElementById('quiz-page').style.paddingTop = '56px';
  } else {
    hideMockTimer();
    document.getElementById('quiz-page').style.paddingTop = '';
  }
}

function startMockTimer() {
  const bar = document.getElementById('mock-timer-bar');
  if (bar) bar.classList.add('on');
  clearInterval(_mockTimer);
  updateMockTimerDisplay();
  _mockTimer = setInterval(() => {
    _mockSeconds--;
    updateMockTimerDisplay();
    if (_mockSeconds <= 0) { clearInterval(_mockTimer); showReviewScreen(); }
  }, 1000);
}

function hideMockTimer() {
  const bar = document.getElementById('mock-timer-bar');
  if (bar) bar.classList.remove('on');
  clearInterval(_mockTimer);
}

function updateMockTimerDisplay() {
  const el = document.getElementById('mock-timer-display');
  if (!el) return;
  const m = Math.floor(_mockSeconds / 60);
  const s = _mockSeconds % 60;
  el.textContent = String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
  el.classList.toggle('urgent', _mockSeconds < 300);
  const pill = document.getElementById('mock-progress-pill');
  if (pill) pill.textContent = 'Q ' + (state.idx + 1) + ' / ' + state.questions.length;
  const flagBtn = document.getElementById('btn-flag-top');
  if (flagBtn) {
    const f = _flaggedQs.has(state.idx);
    flagBtn.classList.toggle('flagged', f);
    flagBtn.textContent = f ? '🚩 Flagged' : '🚩 Flag';
  }
}

function toggleFlag() {
  if (!_isMockMode) return;
  if (_flaggedQs.has(state.idx)) _flaggedQs.delete(state.idx);
  else _flaggedQs.add(state.idx);
  updateMockTimerDisplay();
  const flagQuiz = document.getElementById('btn-flag-quiz');
  if (flagQuiz) {
    flagQuiz.classList.toggle('flagged', _flaggedQs.has(state.idx));
    flagQuiz.textContent = _flaggedQs.has(state.idx) ? '🚩 Flagged' : '🚩 Flag';
  }
}

function showReviewScreen() {
  clearInterval(_mockTimer);
  const screen = document.getElementById('review-screen');
  if (!screen) return;
  // Reset filter to 'all' and update button states
  _reviewFilter = 'all';
  document.querySelectorAll('.review-filter-btn').forEach(b => b.classList.remove('on'));
  const allBtn = document.getElementById('rf-all');
  if (allBtn) allBtn.classList.add('on');
  // Render grid
  renderReviewGrid();
  const flaggedSection = document.getElementById('review-flagged-section');
  const flaggedList    = document.getElementById('review-flagged-list');
  if (_flaggedQs.size > 0 && flaggedSection && flaggedList) {
    flaggedSection.style.display = 'block';
    flaggedList.innerHTML = Array.from(_flaggedQs).sort((a,b)=>a-b).map(function(i) {
      const q = state.questions[i];
      const answered = state.answers[i] !== undefined;
      return '<div style="padding:10px;background:var(--sur-low);border-radius:var(--r);border:1.5px solid #f59e0b;margin-bottom:8px;cursor:pointer" onclick="jumpToQuestion(' + i + ')">'
        + '<div style="font-size:.72rem;font-weight:700;color:#f59e0b;margin-bottom:3px">Q' + (i+1) + ' ' + (answered ? '✓ Answered' : '— Not answered') + '</div>'
        + '<div style="font-size:.8rem;color:var(--tx)">' + escHtml(q.question_text.slice(0,80)) + (q.question_text.length > 80 ? '…' : '') + '</div>'
        + '</div>';
    }).join('');
  } else if (flaggedSection) {
    flaggedSection.style.display = 'none';
  }
  screen.classList.add('on');
}

function closeReviewScreen() {
  document.getElementById('review-screen').classList.remove('on');
  if (_isMockMode && _mockSeconds > 0) {
    _mockTimer = setInterval(function() {
      _mockSeconds--;
      updateMockTimerDisplay();
      if (_mockSeconds <= 0) { clearInterval(_mockTimer); showReviewScreen(); }
    }, 1000);
  }
}

function jumpToQuestion(idx) {
  document.getElementById('review-screen').classList.remove('on');
  renderQuestion(idx);
}

function submitMockFinal() {
  document.getElementById('review-screen').classList.remove('on');
  hideMockTimer();
  _isMockMode = false;
  document.getElementById('quiz-page').style.paddingTop = '';
  state.questions.forEach(function(q, i) {
    if (q._isDriving && q._dtCategory && state.answers[i] !== undefined) {
      recordDTAnswer(q._dtCategory, state.answers[i].correct);
    }
  });
  const correct = Object.values(state.answers).filter(function(a){return a.correct;}).length;
  const total   = state.questions.length;
  checkTheoryBadges(Math.round((correct/total)*100), correct, total);
  showResults();
}

function checkTheoryBadges(pct, correct, total) {
  const earned = getBadgesEarned();
  const newBadges = [];
  const theoryBadgeDefs = [
    { id:'highway_novice',   icon:'🛣', name:'Highway Code Novice',  check: function() { return total > 0; } },
    { id:'perfect_mock',     icon:'🏁', name:'Perfect Mock Test',    check: function() { return total >= 50 && correct === total; } },
    { id:'road_sign_master', icon:'🚦', name:'Road Sign Master',     check: function() { return getDTCatProgress('Road Signs').correct >= 10; } },
    { id:'theory_pass',      icon:'✅', name:'Theory Test Ready',    check: function() { return total >= 50 && pct >= 86; } },
  ];
  theoryBadgeDefs.forEach(function(b) {
    if (!earned.includes(b.id) && b.check()) {
      earned.push(b.id);
      newBadges.push(b);
    }
  });
  localStorage.setItem('gq_badges', JSON.stringify(earned));
  if (newBadges.length) setTimeout(function() { newBadges.forEach(showBadgeToast); }, 1400);
}

// Hook nextQ for mock timer pill update
const _origNextQ2 = nextQ;
nextQ = function() {
  _origNextQ2();
  if (_isMockMode) setTimeout(updateMockTimerDisplay, 50);
};

// Hook goHome to clean up mock state
const _origGoHome2 = goHome;
goHome = function() {
  if (_isMockMode) { hideMockTimer(); _isMockMode = false; }
  document.getElementById('quiz-page').style.paddingTop = '';
  _origGoHome2();
};

// Add theory badges to the main BADGES array for hero profile display
BADGES.push(
  { id:'highway_novice',   icon:'🛣', name:'Highway Novice',    desc:'Complete a Theory quiz',     check: function(d,c,t,s){ return s.some(function(x){return x.topic && x.topic.includes('Theory');}); } },
  { id:'perfect_mock',     icon:'🏁', name:'Perfect Mock',      desc:'100% on Mock (50 Qs)',        check: function(d,c,t){ return t >= 50 && c === t; } },
  { id:'road_sign_master', icon:'🚦', name:'Road Sign Master',  desc:'10+ Road Signs correct',     check: function(){ return getDTCatProgress('Road Signs').correct >= 10; } }
);

// Override the gamification showPage hook to also handle driving tab
window._showPageGamificationHook = function(name) {
  if (name === 'home')    setTimeout(renderHeroProfile,   50);
  if (name === 'driving') setTimeout(renderDrivingPage,   50);
};





// ═══ STUDY PANELS ═════════════════════════════════════════
// (toggleStudyPanel is defined in the Gamification block below with flashcard support)
// Open first panel by default
document.addEventListener('DOMContentLoaded', function() {
  const first = document.getElementById('sp-1');
  if (first) first.classList.add('open');
});

// ═══════════════════════════════════════════════════════════
// ERROR LOG — TARGETED PRACTICE SYSTEM
// ═══════════════════════════════════════════════════════════

// ── Stable question key ────────────────────────────────────
// Derived from question text + correct answer — works for
// both AI-generated and static driving theory questions.
function getQuestionKey(q) {
  var text = (q.question_text || q.questionText || '').trim();
  var ans  = (q.correct_answer || q.correctAnswer || '').trim();
  return (text.slice(0, 60) + '|' + ans.slice(0, 20))
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

// ── localStorage helpers ───────────────────────────────────
function getErrorLog() {
  try { return JSON.parse(localStorage.getItem('userErrorLog') || '[]'); }
  catch(e) { return []; }
}
function saveErrorLog(log) {
  localStorage.setItem('userErrorLog', JSON.stringify(log));
}

// ── Core: called from answer() after every response ────────
function updateErrorLog(q, correct, topic) {
  var key = getQuestionKey(q);
  if (!key) return;
  var log = getErrorLog();

  if (correct) {
    // Correct answer — remove from weakness tracker if present
    var before = log.length;
    log = log.filter(function(entry) { return entry.key !== key; });
    if (log.length < before) saveErrorLog(log);
  } else {
    // Wrong answer — add to log if not already there
    var exists = log.some(function(entry) { return entry.key === key; });
    if (!exists) {
      log.push({
        key:            key,
        topic:          topic || state.topic || '',
        question_text:  q.question_text  || q.questionText  || '',
        options:        q.options        || [],
        correct_answer: q.correct_answer || q.correctAnswer || '',
        explanation:    q.explanation    || '',
        imageUrl:       q.imageUrl       || null,
        type:           q.type           || 'mcq',
        addedAt:        Date.now()
      });
      saveErrorLog(log);
    }
  }
}

// ── Start a Targeted Practice session ─────────────────────
function startErrorLogReview() {
  var log = getErrorLog();
  if (!log.length) {
    showELToast('Your Weakness Tracker is empty — no weak areas yet! Keep practising. 🎉');
    return;
  }

  // Shuffle and cap at 20 per session
  var shuffled = log.slice().sort(function() { return Math.random() - 0.5; });
  var batch = shuffled.slice(0, 20);

  // Map to internal question format
  var mapped = batch.map(function(entry) {
    return {
      question_text:    entry.question_text,
      options:          entry.options,
      correct_answer:   entry.correct_answer,
      explanation:      entry.explanation,
      imageUrl:         entry.imageUrl || null,
      type:             entry.type || 'mcq',
      _errorLogKey:     entry.key,
      _isReviewSession: true
    };
  });

  // Track session context for the results screen
  window._elSessionCtx = {
    totalInLogBefore: log.length,
    batchSize:        batch.length,
    isReviewSession:  true
  };

  state.questions = mapped;
  state.topic     = 'Targeted Practice — Weak Areas';
  state.answers   = {};
  state.idx       = 0;
  state.prevPage  = 'home';

  startTimer();
  renderQuestion(0);
  showPage('quiz');
}

function showELToast(msg) {
  var el = document.createElement('div');
  el.className = 'streak-toast';
  el.style.cssText = 'background:#22c55e;bottom:80px';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(function() { el.remove(); }, 3500);
}

// ── Render specialised results banner ─────────────────────
function renderErrorLogResultsBanner(score, total) {
  var container = document.getElementById('el-results-container');
  if (!container) return;

  var ctx = window._elSessionCtx;
  if (!ctx || !ctx.isReviewSession) {
    container.style.display = 'none';
    return;
  }
  window._elSessionCtx = null; // consume

  var remaining = getErrorLog().length;
  var mastered  = score;
  var emoji     = mastered === total ? '🏆' : mastered > Math.floor(total / 2) ? '💪' : '📚';

  container.style.display = 'block';
  container.innerHTML =
    '<div class="el-results-banner">' +
      '<div style="font-size:2.2rem;margin-bottom:8px">' + emoji + '</div>' +
      '<div class="el-results-headline">You mastered <em>' + mastered + ' out of ' + total + '</em> weak areas!</div>' +
      '<div class="el-results-sub">' +
        (mastered > 0
          ? mastered + ' question' + (mastered > 1 ? 's' : '') + ' removed from your Weakness Tracker.'
          : 'Keep at it — every attempt builds memory.') +
      '</div>' +
      '<div class="el-results-stats">' +
        '<div class="el-stat-chip">' +
          '<div class="el-stat-chip-val" style="color:#4ade80">' + mastered + '</div>' +
          '<div class="el-stat-chip-lbl">Mastered</div>' +
        '</div>' +
        '<div class="el-stat-chip">' +
          '<div class="el-stat-chip-val" style="color:#fbbf24">' + (total - mastered) + '</div>' +
          '<div class="el-stat-chip-lbl">Still shaky</div>' +
        '</div>' +
        '<div class="el-stat-chip">' +
          '<div class="el-stat-chip-val" id="el-rem-count" style="color:' + (remaining === 0 ? '#4ade80' : '#f87171') + '">' + remaining + '</div>' +
          '<div class="el-stat-chip-lbl">Left in log</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="el-remaining-update">' +
      '<div class="el-remaining-icon">' + (remaining === 0 ? '🎉' : '🎯') + '</div>' +
      '<div class="el-remaining-text">' +
        '<div class="el-remaining-title">' + (remaining === 0 ? 'Weakness Tracker cleared — you\'re on fire!' : 'Weakness Tracker updated') + '</div>' +
        '<div class="el-remaining-sub">' + remaining + ' concept' + (remaining !== 1 ? 's' : '') + ' still need' + (remaining === 1 ? 's' : '') + ' practice</div>' +
      '</div>' +
      (remaining > 0
        ? '<button class="tp-cta" onclick="startErrorLogReview()">Retry →</button>'
        : '<span style="font-size:1.4rem">✅</span>') +
    '</div>';

  // Animate the remaining count
  setTimeout(function() {
    var el = document.getElementById('el-rem-count');
    if (el) el.classList.add('el-count-anim');
  }, 500);
}

// ── Render Targeted Practice card on Hero Dashboard ────────
function renderTargetedPractice() {
  var mount = document.getElementById('targeted-practice-mount');
  if (!mount) return;
  var log   = getErrorLog();
  var count = log.length;

  if (count === 0) {
    mount.innerHTML =
      '<div class="targeted-practice-card" style="cursor:default;margin-bottom:16px">' +
        '<div class="tp-empty">' +
          '<span class="tp-empty-icon">✅</span>' +
          'Weakness Tracker is empty — no weak areas detected yet!' +
        '</div>' +
      '</div>';
    return;
  }

  // Group by topic for subtitle chips
  var topics = {};
  log.forEach(function(e) {
    var t = (e.topic || 'General').split(' — ')[0].split(':')[0].trim();
    topics[t] = (topics[t] || 0) + 1;
  });
  var topicKeys = Object.keys(topics).slice(0, 2);

  mount.innerHTML =
    '<div class="targeted-practice-card" onclick="startErrorLogReview()" style="margin-bottom:16px">' +
      '<div class="tp-card-inner">' +
        '<div class="tp-icon-wrap">' +
          '🎯' +
          '<div class="tp-count-badge">' + count + '</div>' +
        '</div>' +
        '<div class="tp-info">' +
          '<div class="tp-title">Targeted Practice</div>' +
          '<div class="tp-subtitle">Spaced Repetition · Active Recall</div>' +
          '<div class="tp-meta">' +
            '<span class="tp-pill">🔥 ' + count + ' Concept' + (count !== 1 ? 's' : '') + ' to Review</span>' +
            topicKeys.map(function(k) {
              return '<span class="tp-pill" style="background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.12);color:rgba(255,255,255,.45);font-size:.62rem">' + k.slice(0, 18) + '</span>';
            }).join('') +
          '</div>' +
        '</div>' +
        '<button class="tp-cta" onclick="event.stopPropagation();startErrorLogReview()">Review →</button>' +
      '</div>' +
    '</div>';
}

// ── Extend renderHeroProfile to inject Targeted Practice ──
var _elOrigRenderHero = renderHeroProfile;
renderHeroProfile = function() {
  _elOrigRenderHero();
  renderTargetedPractice();
  renderExamReadiness();
  renderExamCountdown();
  renderRadarChart();
};

// ═══ THEME ════════════════════════════════════════════════
function cycleTheme() {
  const current = localStorage.getItem('gq_theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem('gq_theme', next);
  applyTheme(next);
}
function applyTheme(mode) {
  const html = document.documentElement;
  if (mode === 'dark') {
    html.setAttribute('data-theme', 'dark');
  } else {
    html.removeAttribute('data-theme');
  }
  const icon = document.getElementById('theme-icon');
  if (icon) icon.textContent = mode === 'dark' ? '☾' : '☼';
}
// Apply saved theme on load (default light)
applyTheme(localStorage.getItem('gq_theme') || 'light');

// ═══ DONATE / FEEDBACK / SHARE ════════════════════════════
function openDonate() {
  document.getElementById('donate-modal').classList.add('on');
  document.body.style.overflow = 'hidden';
}
function closeDonate(e) {
  if (e && e.target !== document.getElementById('donate-modal')) return;
  document.getElementById('donate-modal').classList.remove('on');
  document.body.style.overflow = '';
}

function shareApp() {
  const url = 'https://pass-quest.vercel.app';
  const text = 'Check out PassQuest — free UK exam practice with AI questions!';
  if (navigator.share) {
    navigator.share({ title: 'PassQuest', text, url }).catch(() => {});
  } else {
    navigator.clipboard.writeText(url).then(() => {
      showELToast('Link copied to clipboard! 🔗');
    }).catch(() => {
      window.prompt('Copy this link:', url);
    });
  }
  closeDonate();
}

let _selectedStar = 0;
function openFeedback() {
  _selectedStar = 0;
  document.querySelectorAll('.star-btn').forEach(b => b.classList.remove('on'));
  const ta = document.getElementById('feedback-text');
  const em = document.getElementById('feedback-email');
  if (ta) ta.value = '';
  if (em) em.value = '';
  document.getElementById('feedback-modal').classList.add('on');
  document.body.style.overflow = 'hidden';
}
function closeFeedback(e) {
  if (e && e.target !== document.getElementById('feedback-modal')) return;
  document.getElementById('feedback-modal').classList.remove('on');
  document.body.style.overflow = '';
}
function setStar(n) {
  _selectedStar = n;
  document.querySelectorAll('.star-btn').forEach((b, i) => {
    b.classList.toggle('on', i < n);
    b.style.color = i < n ? '#f59e0b' : 'var(--mu)';
  });
}
async function submitFeedback() {
  const text  = (document.getElementById('feedback-text')?.value || '').trim();
  const email = (document.getElementById('feedback-email')?.value || '').trim();
  const btn   = document.getElementById('feedback-submit-btn');
  if (!text) { document.getElementById('feedback-text')?.focus(); return; }
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
  try {
    await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: _selectedStar, text, email, ts: Date.now() }),
      keepalive: true
    });
  } catch(e) {}
  if (btn) { btn.disabled = false; btn.textContent = 'Send Feedback'; }
  closeFeedback();
  showELToast('Thanks for your feedback! 💙');
}

// ═══ SHARE SCORE CARD ════════════════════════════════════════
async function shareScoreCard() {
  const topic = (document.getElementById('res-topic')?.textContent || 'Quiz').slice(0, 40);
  const pct   = document.getElementById('score-pct')?.textContent || '0%';
  const frac  = document.getElementById('score-frac')?.textContent || '';
  const year  = new Date().getFullYear();

  // Draw card on canvas
  const canvas = document.getElementById('score-card-canvas');
  if (!canvas) return;
  canvas.width = 600; canvas.height = 315;
  const ctx = canvas.getContext('2d');

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, 600, 315);
  grad.addColorStop(0, '#1E3A8A');
  grad.addColorStop(1, '#1e40af');
  ctx.fillStyle = grad;
  ctx.roundRect(0, 0, 600, 315, 20);
  ctx.fill();

  // Subtle grid pattern
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  for (let x = 0; x < 600; x += 30) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,315); ctx.stroke(); }
  for (let y = 0; y < 315; y += 30) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(600,y); ctx.stroke(); }

  // Logo text
  ctx.font = 'bold 26px serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('Pass', 40, 60);
  ctx.fillStyle = '#F59E0B';
  ctx.fillText('Quest', 40 + ctx.measureText('Pass').width + 3, 60);

  // Mountain emoji
  ctx.font = '28px sans-serif';
  ctx.fillText('⛰️', 530, 60);

  // Divider
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(40, 72, 520, 1);

  // PASS / FAIL badge
  const pctNum = parseInt(pct);
  const passed = pctNum >= 75;
  const badgeText = passed ? '✓ PASS' : '✗ FAIL';
  const badgeBg   = passed ? '#16a34a' : '#dc2626';
  ctx.fillStyle = badgeBg;
  ctx.beginPath();
  ctx.roundRect(220, 88, 160, 36, 10);
  ctx.fill();
  ctx.font = 'bold 18px sans-serif';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.fillText(badgeText, 300, 112);

  // Big score
  ctx.font = 'bold 76px sans-serif';
  ctx.fillStyle = '#F59E0B';
  ctx.textAlign = 'center';
  ctx.fillText(pct, 300, 192);

  // Fraction
  ctx.font = '20px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText(frac + ' correct', 300, 220);

  // Topic
  ctx.font = 'bold 17px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(topic, 300, 256);

  // Footer
  ctx.font = '13px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText(`pass-quest.vercel.app · ${year}`, 300, 295);

  ctx.textAlign = 'left';

  // Try Web Share API first (mobile)
  if (navigator.share) {
    try {
      canvas.toBlob(async blob => {
        const file = new File([blob], 'my-passquest-result.png', { type: 'image/png' });
        const shareText = passed
          ? `🎉 I just ${badgeText} on PassQuest! Scored ${pct} on ${topic}. Practise free at pass-quest.vercel.app`
          : `📚 Scored ${pct} on ${topic} on PassQuest — still practising! Try it free at pass-quest.vercel.app`;
        await navigator.share({
          title: `I scored ${pct} on PassQuest!`,
          text: shareText,
          files: [file]
        });
      }, 'image/png');
      return;
    } catch(e) {}
  }

  // Fallback: download the image
  const link = document.createElement('a');
  link.download = 'my-passquest-result.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
  showELToast('Score card downloaded! Share it on WhatsApp or social media 🎉');
}

// ═══ EXAM READINESS GAUGE ════════════════════════════════════════════════
function renderExamReadiness() {
  const mount = document.getElementById('exam-readiness-mount');
  if (!mount) return;
  const sessions = JSON.parse(localStorage.getItem('gq_sessions') || '[]');
  const d = getXPData();
  if (!sessions.length) { mount.innerHTML = ''; return; }

  const avgScore  = Math.round(sessions.reduce((a,s)=>a+s.score,0)/sessions.length);
  const attempted = Math.min(d.totalCorrect + sessions.reduce((a,s)=>a+(s.total||0),0), 500);
  const coverage  = Math.round((attempted / 500) * 100);
  const readiness = Math.min(100, Math.round(avgScore * 0.65 + coverage * 0.35));

  // Pass probability: sigmoid-ish curve anchored to pass thresholds
  const passPct  = Math.min(100, Math.round(Math.pow(readiness / 100, 1.6) * 100));

  // GCSE Grade band (1-9) for maths/gcse users
  const grade = readiness >= 92 ? '8-9'
              : readiness >= 80 ? '7'
              : readiness >= 70 ? '6'
              : readiness >= 60 ? '5'
              : readiness >= 50 ? '4'
              : readiness >= 40 ? '3'
              : readiness >= 28 ? '2'
              : '1';

  const colour = readiness < 40 ? '#ef4444'
               : readiness < 65 ? '#f59e0b'
               : readiness < 80 ? '#22c55e'
               : '#00CFC8';
  const label  = readiness < 40 ? 'Needs Work'
               : readiness < 65 ? 'Building Up'
               : readiness < 80 ? 'Good Progress'
               : readiness < 92 ? 'Nearly Ready'
               : 'Exam Ready ✓';

  const R = 52, CX = 64, CY = 64;
  const circ = 2 * Math.PI * R;

  // State: 0 = Readiness, 1 = Pass Probability
  window._gaugeView = window._gaugeView || 0;

  function gaugeHTML(view) {
    const val    = view === 0 ? readiness : passPct;
    const filled = circ * (val / 100);
    const gap    = circ - filled;
    const centreTop  = view === 0 ? `${val}%` : `${val}%`;
    const centreSub  = view === 0 ? 'Readiness' : 'Pass Chance';
    const titleText  = view === 0 ? 'Exam Readiness Score' : 'Predicted Pass Probability';
    const bar1Label  = view === 0 ? 'Avg Score' : 'Avg Score';
    const bar2Label  = view === 0 ? 'Coverage'  : 'Practice Depth';
    const bar2Val    = view === 0 ? coverage    : Math.min(100, Math.round(coverage * 1.1));
    const gradeNote  = view === 1
      ? `<div style="margin-top:8px;font-size:.74rem;color:var(--mu)">
          GCSE Est. Grade: <strong style="color:${colour}">${grade}</strong>
          &nbsp;·&nbsp; Pass: <strong style="color:${colour}">${passPct >= 60 ? 'Likely ✓' : passPct >= 40 ? 'Possible' : 'At Risk'}</strong>
        </div>`
      : '';
    return `
    <div id="readiness-card" onclick="(function(el){el.style.opacity='0';setTimeout(()=>{window._gaugeView=(window._gaugeView===0?1:0);document.getElementById('exam-readiness-mount').innerHTML='';renderExamReadiness();setTimeout(()=>{el.style.opacity='1'},50)},200)})(this.closest('[id=readiness-card]')|| this)"
      style="background:#fff;border:1px solid var(--bdr);border-radius:20px;
      padding:18px 20px;margin-bottom:16px;cursor:pointer;user-select:none;
      box-shadow:0 4px 20px rgba(15,23,42,.07);transition:box-shadow .2s,opacity .3s"
      title="Click to toggle view">

      <!-- Toggle hint -->
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div style="font-size:.65rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--mu)">
          ${view === 0 ? '📊 Readiness · click to toggle' : '🎯 Pass Probability · click to toggle'}
        </div>
        <div style="display:flex;gap:4px">
          <div style="width:7px;height:7px;border-radius:50%;background:${view===0?colour:'var(--bdr)'}"></div>
          <div style="width:7px;height:7px;border-radius:50%;background:${view===1?colour:'var(--bdr)'}"></div>
        </div>
      </div>

      <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap">
        <!-- SVG Ring -->
        <div style="flex-shrink:0;position:relative;width:120px;height:120px">
          <svg width="120" height="120" viewBox="0 0 128 128" style="transform:rotate(-90deg)">
            <defs>
              <linearGradient id="ringGrad${view}" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#ef4444"/>
                <stop offset="50%" stop-color="#f59e0b"/>
                <stop offset="100%" stop-color="#00CFC8"/>
              </linearGradient>
            </defs>
            <circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="var(--sur-low)" stroke-width="12"/>
            <circle cx="${CX}" cy="${CY}" r="${R}" fill="none"
              stroke="url(#ringGrad${view})" stroke-width="12"
              stroke-linecap="round"
              stroke-dasharray="${filled} ${gap}"/>
          </svg>
          <div style="position:absolute;inset:0;display:flex;flex-direction:column;
            align-items:center;justify-content:center;gap:1px">
            <div style="font-family:'Manrope',sans-serif;font-size:1.6rem;font-weight:900;
              line-height:1;color:${colour}">${centreTop}</div>
            <div style="font-size:.54rem;font-weight:700;letter-spacing:.05em;
              text-transform:uppercase;color:var(--mu)">${centreSub}</div>
          </div>
        </div>

        <!-- Text info -->
        <div style="flex:1;min-width:130px">
          <div style="font-family:'Manrope',sans-serif;font-weight:700;font-size:.98rem;
            color:var(--tx);margin-bottom:4px">${titleText}</div>
          <div style="display:inline-flex;align-items:center;gap:6px;
            padding:3px 10px;border-radius:20px;font-size:.72rem;font-weight:700;
            background:${colour}18;color:${colour};margin-bottom:10px">${label}</div>
          <div style="display:flex;flex-direction:column;gap:5px">
            <div style="display:flex;justify-content:space-between">
              <span style="font-size:.73rem;color:var(--mu)">${bar1Label}</span>
              <span style="font-size:.75rem;font-weight:700;color:var(--tx)">${avgScore}%</span>
            </div>
            <div style="height:4px;background:var(--sur-low);border-radius:99px;overflow:hidden">
              <div style="height:100%;width:${avgScore}%;background:${colour};border-radius:99px"></div>
            </div>
            <div style="display:flex;justify-content:space-between;margin-top:2px">
              <span style="font-size:.73rem;color:var(--mu)">${bar2Label}</span>
              <span style="font-size:.75rem;font-weight:700;color:var(--tx)">${bar2Val}%</span>
            </div>
            <div style="height:4px;background:var(--sur-low);border-radius:99px;overflow:hidden">
              <div style="height:100%;width:${bar2Val}%;background:#6366f1;border-radius:99px"></div>
            </div>
          </div>
          ${gradeNote}
        </div>
      </div>
    </div>`;
  }

  mount.innerHTML = gaugeHTML(window._gaugeView);
}

// ═══ STREAK FREEZE ═══════════════════════════════════════════════════════
const STREAK_FREEZE_COST = 50; // XP cost

function getStreakFreezes() {
  return parseInt(localStorage.getItem('pq_streak_freezes') || '0');
}
function setStreakFreezes(n) {
  localStorage.setItem('pq_streak_freezes', Math.max(0, n));
}
function useStreakFreeze() {
  const f = getStreakFreezes();
  if (f > 0) { setStreakFreezes(f - 1); return true; }
  return false;
}
function buyStreakFreeze() {
  const d = getXPData();
  if (d.xp < STREAK_FREEZE_COST) {
    showELToast(`Need ${STREAK_FREEZE_COST} XP — you have ${d.xp} XP`);
    return;
  }
  if (getStreakFreezes() >= 3) {
    showELToast('Max 3 freezes — use one first!');
    return;
  }
  d.xp -= STREAK_FREEZE_COST;
  saveXPData(d);
  setStreakFreezes(getStreakFreezes() + 1);
  showELToast(`🧊 Streak Freeze purchased! You have ${getStreakFreezes()} freeze(s)`);
  renderHeroProfile();
}

// ─── Auto-apply freeze if streak would break ────────────────────────────
function checkAndApplyStreakFreeze(sessions) {
  if (!sessions.length) return;
  const last = new Date(sessions[sessions.length - 1].date);
  const now  = new Date();
  const dayGap = Math.floor((now - last) / 86400000);
  if (dayGap === 2 && getStreakFreezes() > 0) {
    useStreakFreeze();
    // Inject a synthetic "freeze" session for yesterday
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
    sessions.push({ date: yesterday.toISOString().split('T')[0], score: 0, total: 0, _freeze: true });
    localStorage.setItem('gq_sessions', JSON.stringify(sessions));
    showELToast('🧊 Streak Freeze automatically used — streak saved!');
  }
}

// ─── Inject freeze button into hero stat card ───────────────────────────
// Patched into renderHeroProfile output via MutationObserver
(function() {
  const obs = new MutationObserver(() => {
    const streakStat = document.querySelector('.hero-stat');
    if (!streakStat || streakStat.dataset.freezeInjected) return;
    streakStat.dataset.freezeInjected = '1';
    const freezes = getStreakFreezes();
    const d = getXPData();
    const canBuy = d.xp >= STREAK_FREEZE_COST && freezes < 3;
    const freezeHtml = `<div style="margin-top:5px">
      ${freezes > 0
        ? `<span style="font-size:.6rem;background:rgba(99,102,241,.15);color:#6366f1;
            padding:2px 7px;border-radius:20px;font-weight:700">🧊 ×${freezes}</span>`
        : canBuy
          ? `<button onclick="buyStreakFreeze()" style="font-size:.58rem;padding:2px 8px;
              border-radius:20px;background:rgba(99,102,241,.12);color:#6366f1;
              border:1px solid #c7d2fe;cursor:pointer;font-weight:700;white-space:nowrap">
              🧊 Buy (${STREAK_FREEZE_COST} XP)</button>`
          : `<span style="font-size:.58rem;color:rgba(255,255,255,.35)">No freeze</span>`
      }
    </div>`;
    streakStat.insertAdjacentHTML('beforeend', freezeHtml);
  });
  document.addEventListener('DOMContentLoaded', () => {
    const mount = document.getElementById('hero-profile-mount');
    if (mount) obs.observe(mount, { childList: true, subtree: true });
  });
})();

// ─── Run freeze check on load ────────────────────────────────────────────
(function() {
  const sessions = JSON.parse(localStorage.getItem('gq_sessions') || '[]');
  if (sessions.length) checkAndApplyStreakFreeze(sessions);
})();

// ═══ GOAL-ORIENTED ONBOARDING ══════════════════════════════
function setStudyGoal(goal) {
  localStorage.setItem('pq_study_goal', goal);
  // Update button styles
  document.querySelectorAll('.onboard-goal-btn').forEach(function(btn) {
    var active = btn.dataset.goal === goal;
    btn.style.borderColor = active ? 'var(--navy)' : 'var(--bdr)';
    btn.style.background = active ? 'var(--tcb, #dbeafe)' : '#fff';
    btn.style.boxShadow = active ? '0 0 0 3px rgba(30,58,138,.12)' : '0 2px 8px rgba(15,23,42,.06)';
  });
  // Filter course grid
  var titleEl = document.getElementById('course-section-title');
  var labels = { 'uk-tests':'🇬🇧 UK Tests & Licences', 'professional':'🎓 Career Certifications', 'school':'📐 School & Maths' };
  if (titleEl && labels[goal]) titleEl.textContent = labels[goal];

  var goalMap = {
    'uk-tests': ['driving','lituk','cscs','gcse','foodsafety','citb','ielts'],
    'professional': ['istqb','prince2','itil','psm','aws','ai','ailiteracy'],
    'school': ['maths','allsubjects']
  };
  var show = goalMap[goal] || [];
  document.querySelectorAll('[data-course-page]').forEach(function(card) {
    var page = card.dataset.coursePage || '';
    card.style.display = (show.length === 0 || show.some(function(s){ return page.includes(s); })) ? '' : 'none';
  });
}

// Restore goal on page load
(function() {
  var saved = localStorage.getItem('pq_study_goal');
  if (saved) setTimeout(function(){ setStudyGoal(saved); }, 100);
})();

// ═══ PANIC BUTTON — EXAM COUNTDOWN ══════════════════════════
function savePanicDate(dateStr) {
  if (!dateStr) return;
  var subject = document.getElementById('panic-subject-sel');
  if (subject) localStorage.setItem('pq_exam_subject', subject.value);
  localStorage.setItem('pq_exam_date', dateStr);
  renderPanicBanner();
}

function renderPanicBanner() {
  // Set min date to today
  var inp2 = document.getElementById('panic-date-input');
  if (inp2) inp2.min = new Date().toISOString().split('T')[0];
  var banner = document.getElementById('panic-banner');
  if (!banner) return;
  var dateStr = localStorage.getItem('pq_exam_date');
  var subject = localStorage.getItem('pq_exam_subject') || 'driving';

  // Restore date input
  var inp = document.getElementById('panic-date-input');
  var sel = document.getElementById('panic-subject-sel');
  if (inp && dateStr) inp.value = dateStr;
  if (sel && subject) sel.value = subject;

  if (!dateStr) { banner.style.display = 'none'; return; }

  var exam = new Date(dateStr);
  var now  = new Date(); now.setHours(0,0,0,0); exam.setHours(0,0,0,0);
  var diff = Math.round((exam - now) / 86400000);
  if (diff < 0) { banner.style.display = 'none'; return; }

  // Calculate daily Q target
  var xpData = JSON.parse(localStorage.getItem('gq_xp_data') || '{}');
  var done = xpData.totalCorrect || 0;
  var bankSize = { driving:100, lituk:120, cscs:50, istqb:80, prince2:60, itil:60, psm:80, gcse:60, foodsafety:50, citb:50 };
  var total = bankSize[subject] || 100;
  var remaining = Math.max(0, total - done);
  var perDay = diff > 0 ? Math.ceil(remaining / diff) : remaining;

  var subjectNames = { driving:'Driving Theory', lituk:'Life in UK', cscs:'CSCS Card',
    istqb:'ISTQB CTFL', prince2:'PRINCE2', itil:'ITIL 4', psm:'PSM I Scrum',
    gcse:'GCSE CS', foodsafety:'Food Safety L2', citb:'CITB MAP' };

  var emoji = diff <= 3 ? '🚨' : diff <= 7 ? '⏰' : diff <= 14 ? '📅' : '🎯';
  var urgency = diff <= 3 ? 'EXAM VERY SOON!' : diff <= 7 ? 'Final week push!' : diff <= 14 ? 'Last fortnight!' : 'On track';

  document.getElementById('panic-emoji').textContent = emoji;
  document.getElementById('panic-title').textContent = (subjectNames[subject] || 'Your exam') + ' — ' + urgency;
  document.getElementById('panic-sub').textContent = 'Answer ' + perDay + ' questions today to cover the full bank by exam day';
  document.getElementById('panic-days').textContent = diff;
  document.getElementById('panic-daily').textContent = perDay;

  banner.style.display = 'block';
}

// Init panic banner on home page load
window._showPageGamificationHook = (function(_orig) {
  return function(name) {
    if (_orig) _orig(name);
    if (name === 'home') setTimeout(renderPanicBanner, 80);
  };
})(window._showPageGamificationHook);

setTimeout(renderPanicBanner, 200);

// ═══ CSS for onboarding goal buttons ═════════════════════════
(function() {
  var style = document.createElement('style');
  style.textContent = '.onboard-goal-btn:hover{border-color:var(--navy)!important;transform:translateY(-2px);box-shadow:0 6px 20px rgba(30,58,138,.14)!important}';
  document.head.appendChild(style);
})();

// Init user on load
initUser();


/* ────────────────────────────────────────────────── */


// ═══ CSCS Notify ════════════════════════════════════════
function cscsNotifySubmit() {
  var email = (document.getElementById('cscs-notify-email') || {}).value || '';
  var confirm = document.getElementById('cscs-notify-confirm');
  if (!email || !email.includes('@')) {
    alert('Please enter a valid email address.');
    return;
  }
  // Store locally (backend integration can be added later)
  var list = JSON.parse(localStorage.getItem('pq_cscs_notify') || '[]');
  if (!list.includes(email)) list.push(email);
  localStorage.setItem('pq_cscs_notify', JSON.stringify(list));
  if (confirm) confirm.style.display = 'block';
  var inp = document.getElementById('cscs-notify-email');
  if (inp) inp.value = '';
}

(function injectYearTags() {
  var yr = new Date().getFullYear();
  var nextYr = yr + 1;
  // Use current year if after September (new academic/exam cycle), else current year
  var displayYr = (new Date().getMonth() >= 8) ? nextYr : yr;
  var litukTag = document.getElementById('lituk-year-tag');
  var drivingTag = document.getElementById('driving-year-tag');
  if (litukTag) litukTag.textContent = '\u2713 Updated for ' + displayYr;
  if (drivingTag) drivingTag.textContent = '\u2713 Updated for ' + displayYr + ' \u00b7 DVSA Official Content';
})();

// ═══ FEATURE 2: Exam Countdown Widget ════════════════════
function renderExamCountdown() {
  var mount = document.getElementById('exam-countdown-mount');
  if (!mount) return;
  var saved = localStorage.getItem('pq_exam_date') || '';
  mount.innerHTML = '<div class="exam-countdown-card">' +
    '<h4>📅 My Exam Date</h4>' +
    '<input class="exam-date-input" type="date" id="exam-date-picker"' +
    ' value="' + saved + '"' +
    ' min="' + new Date().toISOString().split('T')[0] + '"' +
    ' onchange="saveExamDate(this.value)">' +
    '<div id="exam-countdown-display"></div>' +
    '</div>';
  if (saved) updateExamDisplay(saved);
}

function saveExamDate(val) {
  localStorage.setItem('pq_exam_date', val);
  updateExamDisplay(val);
}

function updateExamDisplay(dateStr) {
  var display = document.getElementById('exam-countdown-display');
  if (!display || !dateStr) return;
  var examDate = new Date(dateStr);
  var now = new Date();
  now.setHours(0,0,0,0);
  examDate.setHours(0,0,0,0);
  var diff = Math.round((examDate - now) / 86400000);
  if (diff < 0) {
    display.className = 'exam-countdown-display safe';
    display.innerHTML = '<div class="exam-days">🎉 Exam day has passed!</div>' +
      '<div class="exam-goal">We hope it went well — set a new date to keep practising.</div>';
    return;
  }
  if (diff === 0) {
    display.className = 'exam-countdown-display';
    display.innerHTML = '<div class="exam-days">🚨 Exam is TODAY!</div>' +
      '<div class="exam-goal">Good luck — you\'ve got this!</div>';
    return;
  }
  var urgent = diff <= 14;
  display.className = 'exam-countdown-display' + (urgent ? '' : ' safe');
  // Daily goal: assume ~500 questions in bank, calc how many per day needed
  var totalQs = 500;
  var xpData = JSON.parse(localStorage.getItem('gq_xp_data') || '{}');
  var done = xpData.totalCorrect || 0;
  var remaining = Math.max(0, totalQs - done);
  var perDay = diff > 0 ? Math.ceil(remaining / diff) : remaining;
  var emoji = diff <= 7 ? '🚨' : diff <= 14 ? '⏰' : '📅';
  display.innerHTML = '<div class="exam-days">' + emoji + ' ' + diff + ' Day' + (diff === 1 ? '' : 's') + ' Until Your Exam!</div>' +
    '<div class="exam-goal">To finish the question bank: aim for <strong>' + perDay + ' question' + (perDay === 1 ? '' : 's') + ' per day</strong>' +
    ' (' + remaining + ' remaining out of ' + totalQs + ')</div>';
}

// ═══ FEATURE 3: PWA — Install Prompt ═════════════════════
var _pwaInstallPrompt = null;

window.addEventListener('beforeinstallprompt', function(e) {
  e.preventDefault();
  _pwaInstallPrompt = e;
  var btn = document.getElementById('btn-pwa-install');
  if (btn) btn.classList.add('visible');
});

window.addEventListener('appinstalled', function() {
  var btn = document.getElementById('btn-pwa-install');
  if (btn) btn.classList.remove('visible');
  _pwaInstallPrompt = null;
});

function triggerPwaInstall() {
  if (!_pwaInstallPrompt) return;
  _pwaInstallPrompt.prompt();
  _pwaInstallPrompt.userChoice.then(function(result) {
    if (result.outcome === 'accepted') {
      var btn = document.getElementById('btn-pwa-install');
      if (btn) btn.classList.remove('visible');
    }
    _pwaInstallPrompt = null;
  });
}

// Register Service Worker
// ── Review / Testimonial System ───────────────────────────────
var _rvStars = 0;
function setReviewStar(v) {
  _rvStars = v;
  document.querySelectorAll('.rv-star').forEach(function(s) {
    s.style.opacity = parseInt(s.dataset.v) <= v ? '1' : '.35';
    s.style.color   = parseInt(s.dataset.v) <= v ? '#f59e0b' : '';
  });
  var labels = ['','Poor','Fair','Good','Great','Excellent!'];
  var el = document.getElementById('rv-star-val');
  if (el) el.textContent = labels[v] || '';
}

document.addEventListener('DOMContentLoaded', function() {
  var ta = document.getElementById('rv-text');
  var cc = document.getElementById('rv-char-count');
  if (ta && cc) ta.addEventListener('input', function() { cc.textContent = ta.value.length + ' / 280'; });
  renderReviewsGrid();
});

function submitReview() {
  var nameEl    = document.getElementById('rv-name');
  var subjectEl = document.getElementById('rv-subject');
  var textEl    = document.getElementById('rv-text');
  var errEl     = document.getElementById('rv-error');
  var name    = nameEl    ? nameEl.value.trim()    : '';
  var subject = subjectEl ? subjectEl.value        : '';
  var text    = textEl    ? textEl.value.trim()    : '';

  if (!name)            { if(errEl){errEl.textContent='Please enter your name.';errEl.style.display='block';}    return; }
  if (!subject)         { if(errEl){errEl.textContent='Please select a subject.';errEl.style.display='block';}   return; }
  if (_rvStars < 1)     { if(errEl){errEl.textContent='Please select a star rating.';errEl.style.display='block';} return; }
  if (text.length < 20) { if(errEl){errEl.textContent='Review must be at least 20 characters.';errEl.style.display='block';} return; }
  if (errEl) errEl.style.display = 'none';

  var reviews = JSON.parse(localStorage.getItem('pq_reviews') || '[]');
  var review = { name: name, subject: subject, text: text, stars: _rvStars, date: new Date().toISOString() };
  reviews.unshift(review);
  if (reviews.length > 10) reviews.length = 10;
  localStorage.setItem('pq_reviews', JSON.stringify(reviews));

  try {
    fetch('/api/feedback', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ type:'review', name: name, subject: subject, stars: _rvStars, text: text, ts: new Date().toISOString() })
    }).catch(function(){});
  } catch(e){}

  var wrap = document.getElementById('review-form-wrap');
  var succ = document.getElementById('rv-success');
  if (wrap) wrap.style.display = 'none';
  if (succ) succ.style.display = 'block';
  renderReviewsGrid();
  trackEvent('review_submitted', { stars: _rvStars, subject: subject });
}

function renderReviewsGrid() {
  var grid = document.getElementById('user-reviews-grid');
  if (!grid) return;
  var reviews = JSON.parse(localStorage.getItem('pq_reviews') || '[]');
  if (!reviews.length) { grid.style.display = 'none'; return; }

  var starsSVG = function(n) {
    var s = '';
    for (var i = 0; i < n; i++) s += '<svg viewBox="0 0 20 20" style="width:13px;height:13px;fill:#f59e0b"><path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"/></svg>';
    return s;
  };
  var initials = function(n) { return n.split(' ').map(function(w){return w[0]||'';}).join('').toUpperCase().slice(0,2); };
  var timeSince = function(d) {
    var s = Math.floor((Date.now() - new Date(d)) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s/60) + 'm ago';
    if (s < 86400) return Math.floor(s/3600) + 'h ago';
    return Math.floor(s/86400) + 'd ago';
  };

  var header = '<div style="grid-column:1/-1;font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--mu);padding-bottom:6px;border-bottom:1px solid var(--bdr);margin-bottom:4px">✨ Recent Community Reviews</div>';
  var userCards = reviews.map(function(r) {
    return '<div class="t-card" style="border-color:#dbeafe;border-left:3px solid #3b82f6">'
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">'
      + '<div class="t-stars">' + starsSVG(r.stars) + '</div>'
      + '<span style="font-size:.68rem;color:var(--mu)">' + timeSince(r.date) + '</span>'
      + '</div>'
      + '<p class="t-quote">"' + escHtml(r.text) + '"</p>'
      + '<div class="t-author">'
      + '<div class="t-avatar" style="background:#dbeafe;color:#1e3a8a">' + initials(r.name) + '</div>'
      + '<div><div class="t-name">' + escHtml(r.name) + '</div>'
      + '<div class="t-label">' + escHtml(r.subject) + ' · Verified User ✓</div></div>'
      + '</div></div>';
  }).join('');

  grid.style.display = 'grid';
  grid.innerHTML = header + userCards;
}



// ── Most Asked Questions Toggle ───────────────────────────────
function toggleDTNotes() {
  var container = document.getElementById('dt-notes-container');
  var icon = document.getElementById('dt-notes-toggle-icon');
  var label = document.getElementById('dt-notes-toggle-label');
  if (!container) return;
  var isOpen = container.style.display !== 'none';
  container.style.display = isOpen ? 'none' : 'block';
  if (icon) icon.textContent = isOpen ? '▼' : '▲';
  if (label) label.textContent = isOpen ? 'Open Notes' : 'Close Notes';
}

function toggleMAQ(subject) {
  var container = document.getElementById('maq-' + subject + '-container');
  var btn = document.getElementById('maq-' + subject + '-btn');
  var icon = document.getElementById('maq-' + subject + '-icon');
  if (!container) return;
  var isOpen = container.style.display !== 'none';
  container.style.display = isOpen ? 'none' : 'block';
  if (icon) icon.textContent = isOpen ? '▼' : '▲';
  if (btn) btn.innerHTML = '<span id="maq-' + subject + '-icon">' + (isOpen ? '▼' : '▲') + '</span> ' + (isOpen ? 'Show Questions' : 'Hide Questions');
  if (!isOpen) {
    setTimeout(function() {
      var bannerEl = btn ? btn.closest('[onclick]') : null;
      if (bannerEl) bannerEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }
}

function toggleMAQCat(headEl) {
  var panel = headEl.closest('.maq-cat-panel');
  if (!panel) return;
  panel.classList.toggle('open');
}

// ── Study Notes Panel (Life in the UK) ───────────────────────
function toggleStudyNotes() {
  var container = document.getElementById('lituk-notes-container');
  var icon = document.getElementById('notes-toggle-icon');
  var btn = document.getElementById('notes-toggle-btn');
  if (!container) return;
  var isOpen = container.style.display !== 'none';
  container.style.display = isOpen ? 'none' : 'block';
  if (icon) icon.textContent = isOpen ? '▼' : '▲';
  if (btn) btn.innerHTML = (isOpen ? '▼' : '▲') + ' ' + (isOpen ? 'Open Notes' : 'Close Notes');
  if (!isOpen) {
    setTimeout(function() {
      var banner = document.getElementById('lituk-notes-banner');
      if (banner) banner.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }
}

function toggleNCP(n) {
  var panel = document.getElementById('ncp-' + n);
  if (!panel) return;
  panel.classList.toggle('open');
}

// ═══════════════════════════════════════════════════════════
// RADAR CHART — Maths Pillar Mastery (Reviewer Rec #4)
// ═══════════════════════════════════════════════════════════
function renderRadarChart() {
  var mount = document.getElementById('radar-chart-mount');
  if (!mount) return;

  var pillars = [
    { key: 'Number', topics: ['Number & Arithmetic','Number: Primes','Number: Fractions','Number: Percentages','Number: Powers','Number: Ratio','Number: Sequences'] },
    { key: 'Algebra', topics: ['Algebra','Algebra: Expressions','Algebra: Linear','Algebra: Quadratics','Algebra: Simultaneous','Algebra: Inequalities','Algebra: Graphs'] },
    { key: 'Geometry', topics: ['Geometry','Geometry: Angles','Geometry: Area','Geometry: Circles','Geometry: Volume','Geometry: Pythagoras','Geometry: Trigonometry','Geometry: Vectors'] },
    { key: 'Stats', topics: ['Statistics','Statistics: Mean','Statistics: Charts','Statistics: Frequency','Probability: Basic','Probability: Tree','Probability: Venn'] },
    { key: 'Logic', topics: ['Combinatorics','Combinatorics: Counting','Combinatorics: Permutations','Combinatorics: Combinations','Logic: Deductive','Logic: Number Theory','Logic: UKMT'] },
  ];

  var mastery = JSON.parse(localStorage.getItem('gq_mastery') || '{}');
  var hasMathsData = false;

  var scores = pillars.map(function(p) {
    var totalC = 0, totalA = 0;
    Object.keys(mastery).forEach(function(k) {
      if (p.topics.some(function(t) { return k.toLowerCase().includes(t.toLowerCase()); })) {
        totalC += mastery[k].correct || 0;
        totalA += mastery[k].attempted || 0;
      }
    });
    if (totalA > 0) hasMathsData = true;
    return totalA > 0 ? Math.min(100, Math.round((totalC / totalA) * 100)) : 0;
  });

  if (!hasMathsData) { mount.innerHTML = ''; return; }

  // SVG radar chart
  var cx = 110, cy = 110, r = 80;
  var axes = pillars.length;
  var step = (2 * Math.PI) / axes;

  function polar(val, idx, radius) {
    var angle = idx * step - Math.PI / 2;
    return {
      x: cx + radius * (val / 100) * Math.cos(angle),
      y: cy + radius * (val / 100) * Math.sin(angle),
    };
  }
  function axisEnd(idx) {
    var angle = idx * step - Math.PI / 2;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  }

  // Grid rings
  var rings = [25, 50, 75, 100].map(function(pct) {
    var pts = pillars.map(function(_, i) {
      var angle = i * step - Math.PI / 2;
      return (cx + (r * pct / 100) * Math.cos(angle)) + ',' + (cy + (r * pct / 100) * Math.sin(angle));
    });
    return '<polygon points="' + pts.join(' ') + '" fill="none" stroke="var(--bdr2)" stroke-width="1" opacity="0.6"/>';
  }).join('');

  // Axes
  var axisLines = pillars.map(function(_, i) {
    var e = axisEnd(i);
    return '<line x1="' + cx + '" y1="' + cy + '" x2="' + e.x + '" y2="' + e.y + '" stroke="var(--bdr2)" stroke-width="1.5"/>';
  }).join('');

  // Data polygon
  var dataPoints = scores.map(function(s, i) { var p = polar(s || 2, i, r); return p.x + ',' + p.y; }).join(' ');

  // Labels
  var labels = pillars.map(function(p, i) {
    var e = axisEnd(i);
    var lx = cx + (r + 18) * Math.cos(i * step - Math.PI / 2);
    var ly = cy + (r + 18) * Math.sin(i * step - Math.PI / 2);
    var anchor = lx < cx - 5 ? 'end' : lx > cx + 5 ? 'start' : 'middle';
    var score = scores[i];
    var col = score >= 75 ? '#22c55e' : score >= 50 ? '#f59e0b' : score > 0 ? '#ef4444' : 'var(--mu)';
    return '<text x="' + lx + '" y="' + (ly - 4) + '" text-anchor="' + anchor + '" font-size="9" font-weight="700" fill="var(--tx)">' + p.key + '</text>'
         + '<text x="' + lx + '" y="' + (ly + 7) + '" text-anchor="' + anchor + '" font-size="8" fill="' + col + '">' + score + '%</text>';
  }).join('');

  var avgScore = Math.round(scores.reduce(function(a,b){return a+b;}, 0) / scores.length);
  var weakest = pillars[scores.indexOf(Math.min.apply(null, scores))].key;
  var strongest = pillars[scores.indexOf(Math.max.apply(null, scores))].key;

  mount.innerHTML =
    '<div style="background:var(--sur);border:1.5px solid var(--bdr2);border-radius:16px;padding:16px 20px;margin-bottom:16px">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px">'
    + '<div>'
    + '<div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--mu)">📊 Maths Mastery Radar</div>'
    + '<div style="font-size:.78rem;color:var(--mu);margin-top:2px">5 UKMT Pillars · Based on your practice history</div>'
    + '</div>'
    + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
    + '<span style="font-size:.68rem;padding:3px 9px;border-radius:20px;background:#dcfce7;color:#166534;font-weight:700">💪 ' + strongest + '</span>'
    + '<span style="font-size:.68rem;padding:3px 9px;border-radius:20px;background:#fee2e2;color:#991b1b;font-weight:700">🎯 ' + weakest + '</span>'
    + '</div>'
    + '</div>'
    + '<div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap">'
    + '<svg width="220" height="220" viewBox="0 0 220 220" xmlns="http://www.w3.org/2000/svg">'
    + rings + axisLines
    + '<polygon points="' + dataPoints + '" fill="rgba(30,58,138,.18)" stroke="#1E3A8A" stroke-width="2" stroke-linejoin="round"/>'
    + labels
    + '</svg>'
    + '<div style="flex:1;min-width:120px">'
    + '<div style="font-family:\'Fraunces\',serif;font-size:1.6rem;font-weight:800;color:var(--navy);line-height:1">' + avgScore + '%</div>'
    + '<div style="font-size:.72rem;color:var(--mu);margin-bottom:12px">Average across all pillars</div>'
    + pillars.map(function(p, i) {
        var s = scores[i];
        var col = s >= 75 ? '#22c55e' : s >= 50 ? '#f59e0b' : s > 0 ? '#ef4444' : 'var(--lite)';
        return '<div style="margin-bottom:6px">'
          + '<div style="display:flex;justify-content:space-between;font-size:.72rem;margin-bottom:2px">'
          + '<span style="font-weight:600;color:var(--tx)">' + p.key + '</span>'
          + '<span style="font-weight:700;color:' + col + '">' + s + '%</span>'
          + '</div>'
          + '<div style="height:4px;background:var(--sur-low);border-radius:2px;overflow:hidden">'
          + '<div style="height:100%;width:' + s + '%;background:' + col + ';border-radius:2px;transition:width .8s ease"></div>'
          + '</div></div>';
      }).join('')
    + '</div>'
    + '</div>'
    + '</div>';
}

// ═══════════════════════════════════════════════════════════
// EXAM CONDITIONS MODE — Full screen (#6)
// ═══════════════════════════════════════════════════════════
var _examConditions = false;

function toggleExamConditions() {
  _examConditions = !_examConditions;
  var btn = document.getElementById('exam-conditions-btn');
  if (_examConditions) {
    document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
    document.body.style.setProperty('--bg', '#ffffff');
    document.body.style.setProperty('--sur', '#ffffff');
    document.body.style.setProperty('--sur2', '#f8f9fa');
    var nav = document.getElementById('nav');
    if (nav) nav.style.display = 'none';
    if (btn) { btn.textContent = '🔲 Exit Exam Mode'; btn.style.background = '#ef4444'; }
    showELToast('🎯 Exam Conditions Mode — Distraction free');
  } else {
    document.exitFullscreen && document.exitFullscreen();
    document.body.style.removeProperty('--bg');
    document.body.style.removeProperty('--sur');
    document.body.style.removeProperty('--sur2');
    var nav2 = document.getElementById('nav');
    if (nav2) nav2.style.display = '';
    if (btn) { btn.textContent = '🎯 Exam Conditions'; btn.style.background = ''; }
  }
}

document.addEventListener('fullscreenchange', function() {
  if (!document.fullscreenElement && _examConditions) {
    _examConditions = false;
    document.body.style.removeProperty('--bg');
    document.body.style.removeProperty('--sur');
    document.body.style.removeProperty('--sur2');
    var nav = document.getElementById('nav');
    if (nav) nav.style.display = '';
    var btn = document.getElementById('exam-conditions-btn');
    if (btn) { btn.textContent = '🎯 Exam Conditions'; btn.style.background = ''; }
  }
});

// ═══════════════════════════════════════════════════════════
// SMART COACH MESSAGES — Curriculum-tied (#3)
// ═══════════════════════════════════════════════════════════
async function fetchMotiv(score, total) {
  var box = document.getElementById('motiv-box');
  var txt = document.getElementById('motiv-txt');
  if (!box || !txt) return;
  box.style.display = 'flex';

  // Build mastery context
  var mastery = JSON.parse(localStorage.getItem('gq_mastery') || '{}');
  var topicMastery = mastery[state.topic];
  var masteryPct = topicMastery && topicMastery.attempted > 0
    ? Math.round((topicMastery.correct / topicMastery.attempted) * 100) : 0;
  var pct = Math.round((score / total) * 100);

  // Suggest next topic
  var mathsTopics = ['Number & Arithmetic','Algebra','Geometry & Measures','Statistics & Probability','Combinatorics & Logic'];
  var lowestTopic = null, lowestPct = 101;
  mathsTopics.forEach(function(t) {
    var m = mastery[t];
    var p = m && m.attempted > 0 ? Math.round((m.correct / m.attempted) * 100) : 0;
    if (p < lowestPct) { lowestPct = p; lowestTopic = t; }
  });

  txt.innerHTML = '<div class="spin" style="width:18px;height:18px;border-width:2px;display:inline-block"></div>';

  var contextMsg = masteryPct > 0
    ? 'The student has a cumulative mastery of ' + masteryPct + '% on this topic across all sessions. '
    : '';
  var nextTopicMsg = lowestTopic && lowestTopic !== state.topic
    ? 'Their weakest area is ' + lowestTopic + ' at ' + lowestPct + '% mastery. '
    : '';

  var prompt = 'Student scored ' + score + '/' + total + ' (' + pct + '%) on "' + state.topic + '" at ' + state.tier + ' level (' + state.age + ' year old). '
    + contextMsg + nextTopicMsg
    + 'Write ONE specific coaching sentence (max 25 words) that references their topic and curriculum level. '
    + (pct >= 85 ? 'Celebrate and suggest the next challenge topic if available. ' : pct >= 60 ? 'Encourage them and identify what to review. ' : 'Be kind, specific about what to study next. ')
    + 'Use an emoji. Mention the topic by name.';

  var m = await callAI(prompt, 'You are a precise, encouraging UK curriculum tutor. Reference specific topics and curriculum levels (KS2/KS3/GCSE/A-Level). Keep it under 25 words.');
  txt.textContent = m || (pct >= 75
    ? 'Strong work on ' + state.topic + '! Your ' + state.tier + '-level understanding is developing well.'
    : 'Keep practising ' + state.topic + ' — focus on the questions you got wrong to build mastery.');
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js').catch(function(err) {
      console.log('SW registration failed:', err);
    });
  });
}


/* ────────────────────────────────────────────────── */


// ════════════════════════════════════════════════════════
// FEATURE #10: ACCESSIBILITY SYSTEM
// ════════════════════════════════════════════════════════
var _a11yState = { contrast: false, dyslexia: false, large: false };

function toggleA11y() {
  var panel = document.getElementById('a11y-panel');
  if (panel) panel.classList.toggle('on');
}

function toggleA11yMode(mode) {
  _a11yState[mode] = !_a11yState[mode];
  applyA11y();
  saveA11y();
}

function applyA11y() {
  var html = document.documentElement;
  html.removeAttribute('data-access');
  if (_a11yState.contrast) html.setAttribute('data-access', 'high-contrast');
  else if (_a11yState.dyslexia) html.setAttribute('data-access', 'dyslexia');
  else if (_a11yState.large) html.setAttribute('data-access', 'large-text');

  // Update toggle button states
  ['contrast','dyslexia','large'].forEach(function(k) {
    var btn = document.getElementById('a11y-' + k);
    if (btn) { btn.classList.toggle('on', _a11yState[k]); btn.setAttribute('aria-pressed', _a11yState[k]); }
  });
}

function saveA11y() { try { localStorage.setItem('pq_a11y', JSON.stringify(_a11yState)); } catch(e){} }

(function loadA11y() {
  try {
    var s = JSON.parse(localStorage.getItem('pq_a11y') || '{}');
    if (s.contrast) _a11yState.contrast = true;
    if (s.dyslexia) _a11yState.dyslexia = true;
    if (s.large)    _a11yState.large    = true;
    applyA11y();
  } catch(e) {}
})();

// Close panel on outside click
document.addEventListener('click', function(e) {
  var panel = document.getElementById('a11y-panel');
  var btn   = document.getElementById('a11y-btn');
  if (panel && !panel.contains(e.target) && btn && !btn.contains(e.target)) {
    panel.classList.remove('on');
  }
});


/* ────────────────────────────────────────────────── */


// ════════════════════════════════════════════════════════
// FEATURE #5: CURATED QUESTS
// ════════════════════════════════════════════════════════
var QUESTS = [
  {
    id: 'fractions_5', title: '5-Day Fraction Mastery', icon: '🍕', color: '#7e22ce',
    days: 5, desc: 'Master fractions, ratios & percentages',
    topics: [
      { day:1, label:'Fraction Basics',     quiz:'Number: Fractions',          desc:'Adding, subtracting, simplifying' },
      { day:2, label:'Ratio & Proportion',  quiz:'Number: Ratio & Proportion',  desc:'Ratios, direct & inverse proportion' },
      { day:3, label:'Percentages',         quiz:'Number: Percentages',          desc:'Converting, percentage change' },
      { day:4, label:'Powers & Roots',      quiz:'Number: Powers & Roots',       desc:'Index laws, square and cube roots' },
      { day:5, label:'Number Challenge',    quiz:'Number & Arithmetic',          desc:'Mixed number challenge — all topics' },
    ]
  },
  {
    id: 'algebra_7', title: '7-Day Algebra Quest', icon: '✏️', color: '#1d4ed8',
    days: 7, desc: 'From expressions to quadratics',
    topics: [
      { day:1, label:'Expressions',         quiz:'Algebra: Expressions',          desc:'Simplifying and expanding brackets' },
      { day:2, label:'Linear Equations',    quiz:'Algebra: Linear Equations',     desc:'Solving for x, rearranging formulae' },
      { day:3, label:'Simultaneous Eqs',    quiz:'Algebra: Simultaneous Equations',desc:'Two equations, two unknowns' },
      { day:4, label:'Quadratics',          quiz:'Algebra: Quadratics',           desc:'Factorising and the quadratic formula' },
      { day:5, label:'Inequalities',        quiz:'Algebra: Inequalities',         desc:'Solving and representing inequalities' },
      { day:6, label:'Graphs',              quiz:'Algebra: Graphs',               desc:'Straight lines, gradients, curve sketching' },
      { day:7, label:'Algebra Mastery',     quiz:'Algebra',                       desc:'Full algebra challenge — all topics' },
    ]
  },
  {
    id: 'driving_5', title: '5-Day Theory Test Prep', icon: '🚗', color: '#15803d',
    days: 5, desc: 'Get DVSA exam-ready in 5 days',
    topics: [
      { day:1, label:'Road Signs',          quiz:'Road Signs',        desc:'All sign shapes and meanings', isDriving:true },
      { day:2, label:'Hazard Awareness',    quiz:'Hazard Awareness',  desc:'Spotting dangers early', isDriving:true },
      { day:3, label:'Safety Margins',      quiz:'Safety Margins',    desc:'Stopping distances and following gaps', isDriving:true },
      { day:4, label:'Motorway Rules',      quiz:'Motorway Rules',    desc:'Lanes, signals, variable speed limits', isDriving:true },
      { day:5, label:'Full Mock Test',      quiz:'mock',              desc:'50 questions — exam conditions', isDriving:true, isMock:true },
    ]
  }
];

function getQP(id) { return JSON.parse(localStorage.getItem('pq_q_' + id) || '{"day":0,"lastDate":null}'); }
function setQP(id, d) { localStorage.setItem('pq_q_' + id, JSON.stringify(d)); }

function renderQuests() {
  var grid = document.getElementById('quests-grid');
  if (!grid) return;
  var today = new Date().toISOString().split('T')[0];

  grid.innerHTML = QUESTS.map(function(q) {
    var prog = getQP(q.id);
    var done = prog.day || 0;
    var pct  = Math.round((done / q.days) * 100);
    var isComplete = done >= q.days;
    var doneToday  = prog.lastDate === today;

    var btnLabel = isComplete ? '🏆 Complete'
      : doneToday ? '✅ Done today'
      : done === 0 ? 'Begin Quest →'
      : 'Continue →';

    var barColor = isComplete ? 'var(--secondary)' : 'var(--gold)';

    return '<div style="display:flex;align-items:center;gap:16px;padding:14px 0;cursor:pointer" onclick="startQuestDay(\'' + q.id + '\')">'
      + '<span style="font-size:1.4rem;flex-shrink:0">' + q.icon + '</span>'
      + '<div style="flex:1;min-width:0">'
      + '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">'
      + '<span style="font-family:\'Manrope\',sans-serif;font-weight:700;font-size:.9rem;color:var(--tx)">' + q.title + '</span>'
      + '<span style="font-family:\'Plus Jakarta Sans\',sans-serif;font-size:.72rem;color:var(--mu);flex-shrink:0;margin-left:8px">' + pct + '%</span>'
      + '</div>'
      + '<div style="height:6px;background:var(--sur-high);border-radius:3px;overflow:hidden">'
      + '<div style="height:100%;width:' + pct + '%;background:' + barColor + ';border-radius:3px;transition:width .6s var(--ease)"></div>'
      + '</div>'
      + '</div>'
      + '<button style="flex-shrink:0;padding:8px 16px;border-radius:100px;border:none;cursor:pointer;font-family:\'Manrope\',sans-serif;font-size:.75rem;font-weight:700;background:linear-gradient(135deg,var(--primary),var(--primary-c));color:#fff;white-space:nowrap;transition:opacity .15s" onclick="event.stopPropagation();startQuestDay(\'' + q.id + '\')">'
      + btnLabel
      + '</button>'
      + '</div>';
  }).join('');
}

function startQuestDay(questId) {
  var quest = QUESTS.find(function(q){ return q.id === questId; });
  if (!quest) return;
  var prog  = getQP(questId);
  var today = new Date().toISOString().split('T')[0];

  if (prog.day >= quest.days) { showELToast('🏆 Quest complete! Try another quest.'); return; }
  if (prog.lastDate === today) { showELToast('✅ Today\'s quest done! Come back tomorrow.'); return; }

  var topic = quest.topics[prog.day];
  if (!topic) return;

  window._activeQuestId  = questId;
  window._activeQuestDay = prog.day;
  setQP(questId, { day: prog.day, lastDate: today });

  if (topic.isMock) {
    showPage('driving'); setTimeout(startDrivingMockTest, 200);
  } else if (topic.isDriving) {
    showPage('driving'); setTimeout(function(){ startDrivingCategoryQuiz(topic.quiz); }, 100);
  } else {
    startQuiz(topic.quiz, topic.desc, 10);
  }
}

// Hook showResults to advance quest progress
var _origSR_quest = showResults;
showResults = function() {
  _origSR_quest();
  if (window._activeQuestId !== undefined) {
    var questId = window._activeQuestId;
    var dayIdx  = window._activeQuestDay;
    var quest   = QUESTS.find(function(q){ return q.id === questId; });
    var score   = Object.values(state.answers).filter(function(a){ return a && a.correct; }).length;
    var total   = Object.keys(state.answers).length || 1;
    if (score / total >= 0.4) {
      var prog = getQP(questId);
      prog.day = dayIdx + 1;
      setQP(questId, prog);
      var xpBonus = (quest && prog.day >= quest.days) ? 100 : 25;
      var msg     = (quest && prog.day >= quest.days)
        ? '🏆 Quest complete! +' + xpBonus + ' XP!'
        : '⚔️ Quest Day ' + prog.day + '/' + (quest ? quest.days : '?') + ' done! +' + xpBonus + ' XP';
      setTimeout(function(){ showELToast(msg); }, 1400);
      var d = getXPData(); d.xp += xpBonus; saveXPData(d);
    }
    window._activeQuestId  = undefined;
    window._activeQuestDay = undefined;
    setTimeout(renderQuests, 500);
  }
};

// Render quests on home page load
var _origSPHook = window._showPageGamificationHook;
window._showPageGamificationHook = function(name) {
  if (_origSPHook) _origSPHook(name);
  if (name === 'home') setTimeout(renderQuests, 80);
};
setTimeout(renderQuests, 300);


/* ────────────────────────────────────────────────── */


// ════════════════════════════════════════════════════════
// FEATURE #3: HINT ECONOMY (5 XP per hint)
// ════════════════════════════════════════════════════════
var HINT_COST = 5;

// Static curriculum-aligned hints by topic keyword
var HINT_BANK = {
  'fraction':   ['To add fractions, find a common denominator first.','Multiply tops × tops and bottoms × bottoms.','To divide fractions, flip the second one and multiply.'],
  'ratio':      ['Simplify by dividing both sides by the HCF.','For A:B = C:D, cross-multiply to check equivalence.','Direct proportion: if one doubles, the other doubles.'],
  'percentage': ['X% of a number = multiply by X ÷ 100','Percentage change = (change ÷ original) × 100','To increase by X%: multiply by (1 + X/100)'],
  'power':      ['x² × x³ = x⁵ — add indices when multiplying same base.','(x²)³ = x⁶ — multiply indices when raising a power to a power.','Any number to the power 0 = 1'],
  'sequence':   ['Arithmetic: add the same amount each time. Geometric: multiply by the same amount.','Find the common difference to identify arithmetic sequences.','nth term = first term + (n-1) × common difference'],
  'algebra':    ['Collect like terms — only combine terms with the same letter.','Whatever you do to one side of an equation, do to the other.','FOIL: First, Outer, Inner, Last when expanding two brackets.'],
  'quadratic':  ['Try to factorise first: find two numbers that multiply to c and add to b.','If factorising fails, use x = (-b ± √(b²-4ac)) / 2a','Complete the square: (x + b/2)² - (b/2)² + c'],
  'simultaneous':['Elimination: make coefficients match, then add or subtract equations.','Substitution: rearrange one equation for x or y, substitute into the other.','Check your answer by substituting back into both original equations.'],
  'inequalities':['Solve like an equation — but flip the inequality sign if you multiply or divide by a negative number.','On a number line: open circle = strict inequality, closed circle = or equal to.','Test a value in your answer region to check it satisfies the inequality.'],
  'angle':      ['Angles in a triangle = 180°. In a quadrilateral = 360°.','Corresponding angles are equal (F shape). Alternate angles are equal (Z shape).','Angles on a straight line = 180°. Vertically opposite angles are equal.'],
  'area':       ['Rectangle: length × width. Triangle: ½ × base × height.','Parallelogram: base × perpendicular height.','Trapezium: ½ × (a + b) × height'],
  'circle':     ['C = πd or 2πr. Area = πr²','Arc length = (θ/360) × 2πr. Sector area = (θ/360) × πr²','Tangent meets radius at 90°. Angle in semicircle = 90°.'],
  'pythagoras': ['a² + b² = c² where c is the hypotenuse (longest side).','Identify the hypotenuse first — it is always opposite the right angle.','Rearrange: if finding a shorter side, c² - b² = a²'],
  'trig':       ['SOH-CAH-TOA: Sin=Opp/Hyp, Cos=Adj/Hyp, Tan=Opp/Adj','Label the sides first: Hypotenuse (opposite right angle), Opposite, Adjacent.','To find an angle: use inverse trig — sin⁻¹, cos⁻¹, tan⁻¹'],
  'probability':['All probabilities sum to 1. P(not A) = 1 − P(A).','For independent events: P(A AND B) = P(A) × P(B).','Tree diagrams: multiply along branches, add between branches.'],
  'road sign':  ['Red circles = prohibition (MUST NOT). Blue circles = mandatory (MUST).','Warning signs are triangles. Information signs are rectangles.','An upside-down triangle = Give Way.'],
  'stopping':   ['30mph: 23m total (9m thinking + 14m braking).','Double stopping distance in wet conditions. Up to 10× on ice.','Two-second rule: the gap needed in dry conditions on fast roads.'],
  'motorway':   ['Stay left unless overtaking. Return to left lane after passing.','Red X above a lane = lane closed. MUST NOT use it.','Hard shoulder: emergency only (unless smart motorway lane signal shown).'],
  'default':    ['Read carefully — look for words like NOT, EXCEPT, MUST.','Eliminate the two most obviously wrong answers first.','Think about what you know for certain, then work from there.']
};

function getStaticHint(q) {
  var text  = (q.question_text || '').toLowerCase();
  var topic = (state.topic || '').toLowerCase();
  var combined = text + ' ' + topic;
  for (var key in HINT_BANK) {
    if (combined.includes(key)) {
      var hints = HINT_BANK[key];
      return hints[Math.floor(Math.random() * hints.length)];
    }
  }
  var def = HINT_BANK['default'];
  return def[Math.floor(Math.random() * def.length)];
}

// Override the existing fetchHint
async function fetchHint() {
  var d = getXPData();
  var btn  = document.getElementById('btn-hint');
  var zone = document.getElementById('ai-zone');
  if (!btn || !zone) return;

  if (d.xp < HINT_COST) {
    showELToast('Need ' + HINT_COST + ' XP for a hint — you have ' + d.xp);
    return;
  }

  // Deduct XP
  d.xp -= HINT_COST;
  saveXPData(d);

  var q = state.questions[state.idx];
  var hint = getStaticHint(q);

  zone.innerHTML = '<div class="ai-panel" style="border-left:3px solid #f59e0b">'
    + '<div class="ai-label" style="color:#f59e0b">💡 Hint <span style="font-weight:400;opacity:.7">(−' + HINT_COST + ' XP)</span></div>'
    + '<div style="font-size:.88rem;line-height:1.65">' + escHtml(hint) + '</div>'
    + '<div style="font-size:.7rem;color:var(--mu);margin-top:6px">Full step-by-step solutions available in Pro ✨</div>'
    + '</div>';

  btn.style.display = 'none';
  showELToast('💡 −' + HINT_COST + ' XP');
}


/* ────────────────────────────────────────────────── */


// ════════════════════════════════════════════════════════
// FEATURE #9: AUTO STREAK FREEZE AWARDS
// ════════════════════════════════════════════════════════
(function autoAwardFreezes() {
  try {
    var sessions = JSON.parse(localStorage.getItem('gq_sessions') || '[]');
    var streak   = calcStreak(sessions);
    var milestones = Math.floor(streak / 7); // 1 freeze per 7-day block
    var awarded    = parseInt(localStorage.getItem('pq_freeze_awarded') || '0');
    if (milestones > awarded && getStreakFreezes() < 3) {
      var toGive = Math.min(milestones - awarded, 3 - getStreakFreezes());
      if (toGive > 0) {
        setStreakFreezes(getStreakFreezes() + toGive);
        localStorage.setItem('pq_freeze_awarded', milestones.toString());
        setTimeout(function(){
          showELToast('🧊 ' + toGive + ' Streak Freeze' + (toGive > 1 ? 's' : '') + ' earned — ' + streak + '-day streak!');
        }, 2200);
      }
    }
  } catch(e) {}
})();


/* ────────────────────────────────────────────────── */


// ════════════════════════════════════════════════════════
// FEATURE #1: DIAGNOSTIC "FIND MY LEVEL"
// ════════════════════════════════════════════════════════
var _diagActive = false;
var _diagIdx    = 0;
var _diagLevel  = 3; // 1-5 scale, start at 3 (mid)
var _diagScores = [];

// 10 adaptive questions at 5 difficulty levels
var DIAG_QUESTIONS = {
  1: [
    { q:'What is 6 × 7?', opts:['36','42','48','54'], ans:'42', topic:'Number' },
    { q:'What is 25% of 80?', opts:['15','20','25','30'], ans:'20', topic:'Number' },
  ],
  2: [
    { q:'Simplify: 3x + 5x − 2x', opts:['4x','6x','7x','8x'], ans:'6x', topic:'Algebra' },
    { q:'What is the area of a triangle with base 8cm and height 5cm?', opts:['13cm²','20cm²','40cm²','80cm²'], ans:'20cm²', topic:'Geometry' },
    { q:'A bag has 4 red and 6 blue balls. What is P(red)?', opts:['0.4','0.5','0.6','0.67'], ans:'0.4', topic:'Probability' },
  ],
  3: [
    { q:'Solve: 3x + 7 = 22', opts:['x = 3','x = 4','x = 5','x = 6'], ans:'x = 5', topic:'Algebra' },
    { q:'A right-angled triangle has legs 3cm and 4cm. What is the hypotenuse?', opts:['5cm','6cm','7cm','8cm'], ans:'5cm', topic:'Geometry' },
    { q:'Find the nth term of the sequence: 5, 8, 11, 14...', opts:['3n + 2','3n − 1','2n + 3','n + 5'], ans:'3n + 2', topic:'Algebra' },
  ],
  4: [
    { q:'Solve: x² − 5x + 6 = 0', opts:['x = 1, 6','x = 2, 3','x = −2, −3','x = 1, 5'], ans:'x = 2, 3', topic:'Algebra' },
    { q:'What is the exact value of sin(30°)?', opts:['1/2','√2/2','√3/2','1'], ans:'1/2', topic:'Trigonometry' },
    { q:'Expand and simplify: (x + 3)(x − 2)', opts:['x² + x − 6','x² − x − 6','x² + x + 6','x² − 5x − 6'], ans:'x² + x − 6', topic:'Algebra' },
  ],
  5: [
    { q:'How many integers from 1 to 100 are divisible by 3 or 5?', opts:['40','45','47','50'], ans:'47', topic:'Combinatorics' },
    { q:'If p and q are prime and p + q = 17, what is pq?', opts:['42','52','60','70'], ans:'52', topic:'Number Theory' },
    { q:'A circle has equation x² + y² = 25. What is its radius?', opts:['5','10','25','√25'], ans:'5', topic:'Geometry' },
  ]
};

var _diagPlan = [];

function buildDiagPlan() {
  // Start level 3, adapt: right → up, wrong → down
  _diagPlan = [];
  var level = 3;
  for (var i = 0; i < 10; i++) {
    var pool = DIAG_QUESTIONS[level] || DIAG_QUESTIONS[3];
    var q = pool[Math.floor(Math.random() * pool.length)];
    _diagPlan.push({ level: level, q: q });
    // Will adapt dynamically based on answers
  }
}

function openDiag() {
  document.getElementById('diag-overlay').classList.add('on');
  _diagActive = false;
  _diagIdx    = 0;
  _diagLevel  = 3;
  _diagScores = [];
  document.getElementById('diag-body').innerHTML = '<div style="text-align:center;padding:20px 0">'
    + '<div style="font-size:2rem;margin-bottom:10px">🧠</div>'
    + '<div style="font-family:\'Fraunces\',serif;font-weight:700;font-size:1.1rem;color:var(--navy);margin-bottom:8px">Ready to find your level?</div>'
    + '<div style="font-size:.83rem;color:var(--mu);margin-bottom:20px;line-height:1.6">10 quick adaptive questions. We adjust difficulty based on each answer. Takes about 3 minutes.</div>'
    + '<button class="btn btn-navy" onclick="startDiagnostic()">Start Diagnostic →</button></div>';
  document.getElementById('diag-progress').style.width = '0%';
  document.getElementById('diag-counter').textContent = 'Question 0 of 10';
}

function closeDiag() {
  document.getElementById('diag-overlay').classList.remove('on');
  _diagActive = false;
}

function startDiagnostic() {
  _diagActive = true;
  _diagIdx    = 0;
  _diagLevel  = 3;
  _diagScores = [];
  renderDiagQ();
}

function renderDiagQ() {
  if (_diagIdx >= 10) { finishDiag(); return; }
  var pool  = DIAG_QUESTIONS[_diagLevel] || DIAG_QUESTIONS[3];
  var q     = pool[Math.floor(Math.random() * pool.length)];
  var pct   = ((_diagIdx) / 10) * 100;

  document.getElementById('diag-progress').style.width = pct + '%';
  document.getElementById('diag-counter').textContent = 'Question ' + (_diagIdx + 1) + ' of 10 — Level ' + _diagLevel + '/5';

  var letters = ['A','B','C','D'];
  document.getElementById('diag-body').innerHTML =
    '<div style="padding:4px 0 14px">'
    + '<div style="font-size:.7rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--mu);margin-bottom:10px">' + (q.topic||'') + '</div>'
    + '<div style="font-family:\'Fraunces\',serif;font-weight:600;font-size:1rem;line-height:1.5;color:var(--tx);margin-bottom:16px">' + escHtml(q.q) + '</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:9px">'
    + q.opts.map(function(opt, i) {
        return '<button onclick="answerDiag(' + JSON.stringify(opt) + ',' + JSON.stringify(q.ans) + ')" '
          + 'style="padding:11px 14px;border-radius:10px;border:2px solid var(--bdr2);background:var(--sur);'
          + 'font-size:.85rem;cursor:pointer;text-align:left;transition:all .15s;font-family:\'DM Sans\',sans-serif"'
          + ' onmouseover="this.style.borderColor=\'var(--navy)\'" onmouseout="this.style.borderColor=\'var(--bdr2)\'">'
          + '<span style="font-weight:700;margin-right:6px">' + letters[i] + '</span>' + escHtml(opt)
          + '</button>';
      }).join('')
    + '</div></div>';
}

function answerDiag(chosen, correct) {
  var isRight = chosen.trim() === correct.trim();
  _diagScores.push({ level: _diagLevel, correct: isRight });
  // Adaptive: right = increase level (max 5), wrong = decrease (min 1)
  if (isRight)  _diagLevel = Math.min(5, _diagLevel + 1);
  else          _diagLevel = Math.max(1, _diagLevel - 1);
  _diagIdx++;
  setTimeout(renderDiagQ, 200);
}

function finishDiag() {
  var total   = _diagScores.length;
  var correct = _diagScores.filter(function(s){ return s.correct; }).length;
  var avgLevel = _diagScores.reduce(function(a,s){ return a + s.level; }, 0) / total;
  var pct = Math.round((correct / total) * 100);

  // Map avg level to tier
  var tier = avgLevel >= 4.5 ? 'Champion' : avgLevel >= 3.5 ? 'Olympian' : avgLevel >= 2.5 ? 'Challenger' : 'Explorer';
  var tierIcon = { Explorer:'🌱', Challenger:'⚡', Olympian:'🔥', Champion:'💎' };
  var tierDesc = {
    Explorer:   'KS2 level — great for building strong number foundations',
    Challenger: 'Junior Maths Challenge level — you\'re handling multi-step problems',
    Olympian:   'Intermediate level — you can tackle quadratics and trigonometry',
    Champion:   'Senior / BMO level — you are working at olympiad standard'
  };

  document.getElementById('diag-progress').style.width = '100%';
  document.getElementById('diag-counter').textContent = 'Complete!';
  document.getElementById('diag-body').innerHTML =
    '<div style="text-align:center;padding:16px 8px">'
    + '<div style="font-size:2.5rem;margin-bottom:8px">' + (tierIcon[tier]||'⭐') + '</div>'
    + '<div style="font-family:\'Fraunces\',serif;font-weight:800;font-size:1.3rem;color:var(--navy);margin-bottom:6px">You\'re a ' + tier + '!</div>'
    + '<div style="font-size:.82rem;color:var(--mu);margin-bottom:16px;line-height:1.6">' + tierDesc[tier] + '</div>'
    + '<div style="background:var(--sur-low);border-radius:12px;padding:12px 16px;margin-bottom:18px;border:1.5px solid var(--bdr2)">'
    + '<div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--mu);margin-bottom:4px">Your Result</div>'
    + '<div style="font-family:\'Fraunces\',serif;font-size:1.4rem;font-weight:800;color:var(--navy)">' + pct + '% · ' + correct + '/10</div>'
    + '<div style="font-size:.72rem;color:var(--mu);margin-top:2px">Avg difficulty: Level ' + avgLevel.toFixed(1) + ' / 5</div>'
    + '</div>'
    + '<button class="btn btn-navy btn-full" onclick="applyDiagResult(\'' + tier + '\')" style="margin-bottom:8px">Set my level to ' + tier + ' →</button>'
    + '<button class="btn btn-ghost btn-full btn-sm" onclick="closeDiag()">Maybe later</button>'
    + '</div>';
}

function applyDiagResult(tier) {
  // Apply to tier strip
  state.tier = tier;
  var ageMap = { Explorer:9, Challenger:12, Olympian:15, Champion:17 };
  state.age  = ageMap[tier] || 12;
  document.querySelectorAll('#tier-strip .tier-btn').forEach(function(b) {
    b.classList.toggle('on', b.dataset.tier === tier);
  });
  updateNavTierPill();
  localStorage.setItem('gq_diag_done', '1');
  closeDiag();
  showELToast('✅ Level set to ' + tier + '! Questions will now match your ability.');
}

// Show diagnostic prompt to first-time users
(function checkDiagFirst() {
  var done = localStorage.getItem('gq_diag_done');
  var user = localStorage.getItem('gq_user');
  if (!done && user) {
    setTimeout(function(){
      // Add "Find My Level" button next to tier strip
      var strip = document.getElementById('tier-strip');
      if (strip) {
        var diagBtn = document.createElement('div');
        diagBtn.style.cssText = 'grid-column:1/-1;text-align:center;padding:4px 0';
        diagBtn.innerHTML = '<button onclick="openDiag()" style="background:none;border:none;cursor:pointer;'
          + 'font-size:.78rem;color:var(--navy);font-weight:600;text-decoration:underline;font-family:\'DM Sans\',sans-serif">'
          + '🎯 Not sure which level? Take the 3-min diagnostic →</button>';
        strip.parentNode.insertBefore(diagBtn, strip.nextSibling);
      }
    }, 800);
  }
})();


/* ────────────────────────────────────────────────── */


(function(){
  
  /* ── Trust strip ──────────────────────────────────────────────────────── */
  function injectTrustStrip(){
    var nav = document.getElementById('nav');
    if (!nav || document.getElementById('trust-strip')) return;
    var items = ['✓ DVSA Official Content','✓ UK Home Office','✓ UKMT Aligned',
                 '✓ CITB / CSCS','✓ AZ-900 Microsoft','✓ SIA Licensed',
                 '✓ ISTQB Syllabus','✓ 100% Free & Ad-Free'];
    var inner = items.map(function(t){ return '<span>'+t.replace('✓','<em>✓</em>')+'</span>'; }).join('');
    var div = document.createElement('div');
    div.id = 'trust-strip';
    div.className = 'trust-scroll-strip';
    div.innerHTML = '<div class="trust-scroll-inner">'+inner+inner+'</div>';
    nav.insertAdjacentElement('afterend', div);
  }

  /* ── Study Heatmap ────────────────────────────────────────────────────── */
  function renderStudyHeatmap(){
    var mount = document.getElementById('study-heatmap-mount');
    if (!mount) return;
    var sessions = JSON.parse(localStorage.getItem('gq_sessions') || '[]');
    var counts = {};
    sessions.forEach(function(s){
      var d = (s.date||'').slice(0,10);
      if (d) counts[d] = (counts[d]||0) + (s.total||1);
    });
    var today = new Date();
    var weeks = 16;
    var cols = [];
    for (var w = weeks-1; w >= 0; w--) {
      var col = [];
      for (var d = 6; d >= 0; d--) {
        var dt = new Date(today);
        dt.setDate(today.getDate() - w*7 - d);
        var key = dt.toISOString().slice(0,10);
        var n = counts[key] || 0;
        var lvl = n === 0 ? 0 : n < 10 ? 1 : n < 30 ? 2 : n < 60 ? 3 : 4;
        col.push({key:key, lvl:lvl, n:n});
      }
      cols.push(col);
    }
    var colsHtml = cols.map(function(col){
      return '<div class="hm-col">'+col.map(function(c){
        var cls = c.lvl > 0 ? ' hm-'+c.lvl : '';
        return '<div class="hm-cell'+cls+'" title="'+c.key+(c.n?' — '+c.n+' Qs':'')+'"></div>';
      }).join('')+'</div>';
    }).join('');
    mount.innerHTML = '<div class="heatmap-wrap"><div class="heatmap-title">📅 Study Activity — Last 16 Weeks</div><div class="heatmap-grid">'+colsHtml+'</div></div>';
  }

  /* ── Category Radar ───────────────────────────────────────────────────── */
  function renderCategoryRadar(){
    var mount = document.getElementById('category-radar-mount');
    if (!mount) return;
    var mastery = JSON.parse(localStorage.getItem('gq_mastery') || '{}');
    var entries = Object.keys(mastery).map(function(k){
      var m = mastery[k];
      return { topic: k, pct: m.attempted ? Math.round((m.correct/m.attempted)*100) : 0, attempted: m.attempted||0 };
    }).filter(function(e){ return e.attempted >= 3; })
      .sort(function(a,b){ return a.pct - b.pct; })
      .slice(0,8);
    if (!entries.length) { mount.innerHTML = ''; return; }
    var rows = entries.map(function(e){
      var col = e.pct >= 80 ? '#22c55e' : e.pct >= 60 ? '#f59e0b' : '#ef4444';
      var weak = e.pct < 70;
      var label = e.topic.replace(/^(.*?):\s*/,'').slice(0,22);
      return '<div class="cat-bar-row">'
        +'<div class="cat-bar-label" title="'+e.topic+'">'+label+'</div>'
        +'<div class="cat-bar-track"><div class="cat-bar-fill" style="width:'+e.pct+'%;background:'+col+'"></div></div>'
        +'<div class="cat-bar-pct" style="color:'+col+'">'+e.pct+'%</div>'
        +(weak ? '<button class="cat-practise-btn" onclick="startQuiz(''+e.topic.replace(/'/g,"\'")+"','"+e.topic.replace(/'/g,"\'")+"',10)'>Practise →</button>" : '')
        +'</div>';
    }).join('');
    mount.innerHTML = '<div class="cat-radar-wrap"><div class="cat-radar-title">📊 Your Weakest Areas</div>'+rows+'</div>';
  }

  /* ── Patch showResults to render radar ────────────────────────────────── */
  var _origShowResults = window.showResults;
  if (typeof _origShowResults === 'function') {
    window.showResults = function(){
      _origShowResults.apply(this, arguments);
      setTimeout(renderCategoryRadar, 100);
    };
  }

  /* ── Patch renderHeroProfile to render heatmap ────────────────────────── */
  var _origRHP = window.renderHeroProfile;
  if (typeof _origRHP === 'function') {
    window.renderHeroProfile = function(){
      _origRHP.apply(this, arguments);
      setTimeout(renderStudyHeatmap, 80);
    };
  }

  /* ── Also render heatmap on home page show ────────────────────────────── */
  var _origHook = window._showPageGamificationHook;
  window._showPageGamificationHook = function(name){
    if (_origHook) _origHook(name);
    if (name === 'home') setTimeout(renderStudyHeatmap, 150);
  };

  /* ── Init on load ─────────────────────────────────────────────────────── */
  function init(){
    injectTrustStrip();
    renderStudyHeatmap();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 0);
  }

  window.renderStudyHeatmap = renderStudyHeatmap;
  window.renderCategoryRadar = renderCategoryRadar;
})();
