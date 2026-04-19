/* ═══════════════════════════════════════════════════════════
   PASSQUEST PREMIUM UI + SUPABASE AUTH — JavaScript patch
   Add this as: <script src="/pq-premium.js"></script>
   just before the closing </body> tag in index.html
   ═══════════════════════════════════════════════════════════ */

/* ── 1. Scrolling trust banner injection ─────────────────── */
(function injectTrustBanner() {
  const items = [
    { icon:'🚗', text:'Syllabus-aligned with DVSA' },
    { icon:'🏛️', text:'UK Home Office Life in the UK' },
    { icon:'📐', text:'UKMT Maths Competitions' },
    { icon:'🏗️', text:'CITB / CSCS HSE Test' },
    { icon:'💻', text:'AQA & OCR GCSE CS' },
    { icon:'⚙️', text:'AXELOS PRINCE2 & ITIL' },
    { icon:'🧪', text:'ISTQB CTFL v4.0' },
    { icon:'☁️', text:'AWS Cloud Practitioner' },
    { icon:'🇬🇧', text:'Official Handbook Materials' },
    { icon:'✅', text:'Updated for 2026 Exams' },
    // duplicate for seamless loop
    { icon:'🚗', text:'Syllabus-aligned with DVSA' },
    { icon:'🏛️', text:'UK Home Office Life in the UK' },
    { icon:'📐', text:'UKMT Maths Competitions' },
    { icon:'🏗️', text:'CITB / CSCS HSE Test' },
    { icon:'💻', text:'AQA & OCR GCSE CS' },
    { icon:'⚙️', text:'AXELOS PRINCE2 & ITIL' },
    { icon:'🧪', text:'ISTQB CTFL v4.0' },
    { icon:'☁️', text:'AWS Cloud Practitioner' },
    { icon:'🇬🇧', text:'Official Handbook Materials' },
    { icon:'✅', text:'Updated for 2026 Exams' },
  ];

  const strip = document.createElement('div');
  strip.className = 'trust-scroll-strip';
  strip.id = 'trust-scroll-strip';
  strip.innerHTML = `<div class="trust-scroll-inner">${
    items.map(i => `<span class="trust-scroll-item"><span>${i.icon}</span>${i.text}<span class="trust-scroll-dot"></span></span>`).join('')
  }</div>`;

  // Insert just after the nav
  const nav = document.getElementById('nav');
  if (nav && nav.nextSibling) {
    nav.parentNode.insertBefore(strip, nav.nextSibling);
  }
})();


/* ── 2. Nav glassmorphism on scroll ──────────────────────── */
(function navScrollGlass() {
  const nav = document.getElementById('nav');
  if (!nav) return;
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 20);
  }, { passive: true });
})();


/* ── 3. Hero visual anchor injection (first visit) ───────── */
function injectHeroVisual() {
  const heroWrap = document.getElementById('hero-visual-anchor');
  if (!heroWrap) return;

  const xpData = JSON.parse(localStorage.getItem('gq_xp_data') || '{"xp":0,"quizzes":0,"totalCorrect":0}');
  const sessions = JSON.parse(localStorage.getItem('gq_sessions') || '[]');
  const streak = typeof calcStreak === 'function' ? calcStreak(sessions) : 0;
  const avgScore = sessions.length
    ? Math.round(sessions.reduce((a,s) => a + s.score, 0) / sessions.length)
    : 0;

  heroWrap.innerHTML = `
    <div class="hero-visual-wrap">
      <div class="hero-visual-stats">
        <div class="hero-vis-stat">
          <div class="hvs-label">🔥 Day Streak</div>
          <div class="hvs-val">${streak}</div>
          <div class="hvs-sub">days in a row</div>
        </div>
        <div class="hero-vis-stat">
          <div class="hvs-label">⭐ Total XP</div>
          <div class="hvs-val">${xpData.xp.toLocaleString()}</div>
          <div class="hvs-sub">${xpData.quizzes} quizzes done</div>
        </div>
        <div class="hero-vis-stat">
          <div class="hvs-label">🎯 Avg Score</div>
          <div class="hvs-val">${avgScore ? avgScore + '%' : '--'}</div>
          <div class="hvs-sub">${xpData.totalCorrect} correct answers</div>
        </div>
      </div>
      <div class="hero-vis-illustration">
        ${heroIllustrationSVG()}
      </div>
    </div>`;
}

function heroIllustrationSVG() {
  return `<svg width="220" height="160" viewBox="0 0 220 160" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <!-- Mountain path -->
    <path d="M20 140 L60 60 L90 90 L120 40 L160 80 L200 30" stroke="#1E3A8A" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.18"/>
    <!-- Area fill -->
    <path d="M20 140 L60 60 L90 90 L120 40 L160 80 L200 30 L200 140Z" fill="url(#heroGrad)" opacity="0.12"/>
    <!-- Progress bar mockups -->
    <rect x="14" y="108" width="80" height="6" rx="3" fill="#e2e8f0"/>
    <rect x="14" y="108" width="62" height="6" rx="3" fill="#1E3A8A" opacity="0.7"/>
    <rect x="14" y="120" width="80" height="6" rx="3" fill="#e2e8f0"/>
    <rect x="14" y="120" width="48" height="6" rx="3" fill="#F59E0B" opacity="0.8"/>
    <rect x="14" y="132" width="80" height="6" rx="3" fill="#e2e8f0"/>
    <rect x="14" y="132" width="71" height="6" rx="3" fill="#22c55e" opacity="0.8"/>
    <!-- Badge dots -->
    <circle cx="162" cy="120" r="14" fill="#F59E0B" opacity="0.15"/>
    <circle cx="162" cy="120" r="10" fill="#F59E0B" opacity="0.25"/>
    <text x="162" y="125" text-anchor="middle" font-size="12">🏆</text>
    <circle cx="190" cy="112" r="10" fill="#1E3A8A" opacity="0.15"/>
    <circle cx="190" cy="112" r="7" fill="#1E3A8A" opacity="0.25"/>
    <text x="190" y="117" text-anchor="middle" font-size="10">⭐</text>
    <!-- Summit flag -->
    <line x1="200" y1="30" x2="200" y2="14" stroke="#1E3A8A" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/>
    <rect x="200" y="12" width="14" height="9" rx="2" fill="#F59E0B" opacity="0.7"/>
    <path d="M202 16 L203.5 17.5 L206 15" stroke="white" stroke-width="1.2" stroke-linecap="round" opacity="0.9"/>
    <defs>
      <linearGradient id="heroGrad" x1="20" y1="140" x2="200" y2="30" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#1E3A8A"/>
        <stop offset="100%" stop-color="#F59E0B"/>
      </linearGradient>
    </defs>
  </svg>`;
}


/* ── 4. Personalised returning-user hero ─────────────────── */
function injectReturningHero() {
  const mount = document.getElementById('hero-returning-mount');
  if (!mount) return;

  const user = JSON.parse(localStorage.getItem('gq_user') || 'null');
  if (!user || user.isGuest) { mount.style.display = 'none'; return; }

  const sessions = JSON.parse(localStorage.getItem('gq_sessions') || '[]');
  const streak   = typeof calcStreak === 'function' ? calcStreak(sessions) : 0;
  const examDate = localStorage.getItem('pq_exam_date');
  const xpData   = JSON.parse(localStorage.getItem('gq_xp_data') || '{"xp":0,"level":1}');
  const errorLog = JSON.parse(localStorage.getItem('userErrorLog') || '[]');

  let daysUntil = null;
  if (examDate) {
    const diff = Math.round((new Date(examDate) - new Date()) / 86400000);
    if (diff >= 0 && diff <= 90) daysUntil = diff;
  }

  const initial = user.name.charAt(0).toUpperCase();
  const hour    = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const pills = [
    streak > 0  ? `🔥 ${streak} day streak`      : null,
    daysUntil !== null ? `📅 ${daysUntil} days to exam` : null,
    xpData.xp   ? `⭐ ${xpData.xp.toLocaleString()} XP` : null,
    errorLog.length ? `🎯 ${errorLog.length} to review` : null,
  ].filter(Boolean).slice(0, 3);

  mount.style.display = 'block';
  mount.innerHTML = `
    <div class="hero-returning-banner">
      <div class="hrb-inner">
        <div class="hrb-avatar">${initial}</div>
        <div class="hrb-text">
          <div class="hrb-greeting">${greeting}, ${user.name}! 👋</div>
          <div class="hrb-sub">Ready to continue your learning quest?</div>
          <div class="hrb-pills">${pills.map(p => `<span class="hrb-pill">${p}</span>`).join('')}</div>
        </div>
        ${errorLog.length > 0
          ? `<button class="hrb-cta" onclick="startErrorLogReview()">Review ${errorLog.length} Weak Spot${errorLog.length !== 1 ? 's' : ''} →</button>`
          : `<button class="hrb-cta" onclick="showPage('driving');setTimeout(startDrivingMockTest,200)">▶ Continue Quest</button>`
        }
      </div>
    </div>`;
}


/* ── 5. Upgraded testimonial cards injection ─────────────── */
function upgradeTestimonials() {
  const grid = document.getElementById('reviews-grid');
  if (!grid) return;

  const reviews = [
    { initials:'SJ', grad:'av-gr-1', name:'Sarah J.', label:'Driving Theory Pass · London',    stars:5, quote:'The mock tests look exactly like the real thing. The targeted practice feature saved me hours. Passed with 48/50!' },
    { initials:'AM', grad:'av-gr-2', name:'Ahmed M.', label:'Citizenship Test Pass · Birmingham', stars:5, quote:'The streak counter kept me motivated to do 20 questions a day, and I passed on my first try.' },
    { initials:'PT', grad:'av-gr-3', name:'Priya T.',  label:'A-Level Prep · Manchester',       stars:5, quote:'Finally, a free site that actually tracks your progress without forcing you to pay a subscription.' },
    { initials:'DK', grad:'av-gr-4', name:'Devraj K.', label:'GCSE Maths · Leeds',             stars:5, quote:'Free, no ads, and better than apps I\'ve paid for. The error log feature is a game-changer.' },
  ];

  const starSVG = (n) => Array.from({length:n}, () =>
    `<svg class="t-star-svg" viewBox="0 0 20 20"><path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"/></svg>`
  ).join('');

  grid.innerHTML = reviews.map(r => `
    <div class="t-card-v2">
      <div class="t-stars-v2">${starSVG(r.stars)}</div>
      <p class="t-quote" style="font-size:.85rem;color:var(--tx);line-height:1.55;flex:1;font-style:italic">"${r.quote}"</p>
      <div class="t-author" style="display:flex;align-items:center;gap:10px;margin-top:4px">
        <div class="t-avatar-grad ${r.grad}">${r.initials}</div>
        <div>
          <div class="t-name" style="font-size:.82rem;font-weight:600;color:var(--navy)">${r.name}</div>
          <div class="t-label" style="font-size:.72rem;color:var(--mu)">${r.label}</div>
        </div>
      </div>
    </div>`).join('');
}


/* ── 6. Supabase OAuth integration ───────────────────────── */
// ─────────────────────────────────────────────────────────────
// REPLACE THESE WITH YOUR REAL CREDENTIALS:
const SUPABASE_URL       = 'https://mwdqxwaxngjnoegfbawe.supabase.co';
const SUPABASE_ANON_KEY  = 'f211ca6e-7f41-493b-bd5b-90b360a26154';
// ─────────────────────────────────────────────────────────────

let _supabase = null;

function initSupabase() {
  if (!window.supabase) return; // SDK not loaded yet
  if (SUPABASE_URL.includes('REPLACE')) return; // not configured
  try {
    _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    checkSupabaseSession();
  } catch(e) {
    console.warn('[PassQuest] Supabase init failed:', e.message);
  }
}

async function checkSupabaseSession() {
  if (!_supabase) return;
  const { data: { session } } = await _supabase.auth.getSession();
  if (session?.user) {
    const name = session.user.user_metadata?.full_name
              || session.user.user_metadata?.name
              || session.user.email?.split('@')[0]
              || 'User';
    _currentUser = { name, isGuest: false, id: session.user.id, email: session.user.email };
    localStorage.setItem('gq_user', JSON.stringify(_currentUser));
    if (typeof updateUserPill === 'function') updateUserPill();
  }

  // Listen for auth state changes
  _supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user) {
      const name = session.user.user_metadata?.full_name
                || session.user.user_metadata?.name
                || session.user.email?.split('@')[0]
                || 'User';
      _currentUser = { name, isGuest: false, id: session.user.id, email: session.user.email };
      localStorage.setItem('gq_user', JSON.stringify(_currentUser));
      if (typeof updateUserPill === 'function') updateUserPill();
      if (typeof closeLoginModal === 'function') closeLoginModal();
    } else {
      // signed out
      _currentUser = { name: 'Guest', isGuest: true };
      localStorage.setItem('gq_user', JSON.stringify(_currentUser));
      if (typeof updateUserPill === 'function') updateUserPill();
    }
  });
}

// Sign in with GitHub OAuth
async function signInWithGitHub() {
  if (!_supabase) {
    console.warn('[PassQuest] Supabase not initialised. Add credentials to pq-premium.js');
    return;
  }
  const { error } = await _supabase.auth.signInWithOAuth({
    provider: 'github',
    options: { redirectTo: window.location.origin }
  });
  if (error) console.error('[PassQuest] GitHub OAuth error:', error.message);
}

// Sign in with Google OAuth
async function signInWithGoogle() {
  if (!_supabase) return;
  const { error } = await _supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin }
  });
  if (error) console.error('[PassQuest] Google OAuth error:', error.message);
}

// Sign out
async function signOut() {
  if (!_supabase) return;
  await _supabase.auth.signOut();
}

// Upgraded login modal — replaces the name/guest modal content with OAuth buttons
// when Supabase is configured
function upgradeLoginModal() {
  if (SUPABASE_URL.includes('REPLACE')) return; // not configured, keep existing UI

  const modal = document.getElementById('login-modal');
  if (!modal) return;

  const box = modal.querySelector('.modal-box');
  if (!box) return;

  box.innerHTML = `
    <div style="padding:32px;text-align:center">
      <div style="font-size:2.5rem;margin-bottom:12px">⛰️</div>
      <h2 style="font-family:'Fraunces',serif;font-size:1.35rem;color:var(--navy);margin-bottom:8px">Sign in to PassQuest</h2>
      <p style="font-size:.84rem;color:var(--mu);margin-bottom:24px;line-height:1.6">
        Save your progress, streaks and badges across devices.<br>100% free — no credit card needed.
      </p>

      <button onclick="signInWithGitHub()"
        style="width:100%;display:flex;align-items:center;justify-content:center;gap:10px;
               padding:12px 20px;border-radius:11px;border:1.5px solid var(--bdr2);
               background:var(--sur);color:var(--tx);font-size:.92rem;font-weight:700;
               cursor:pointer;margin-bottom:10px;transition:all .15s"
        onmouseover="this.style.borderColor='var(--navy)';this.style.background='var(--sur2)'"
        onmouseout="this.style.borderColor='var(--bdr2)';this.style.background='var(--sur)'">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.23 1.84 1.23 1.07 1.84 2.81 1.31 3.49 1 .11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.17 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 013.01-.4c1.02.005 2.05.14 3.01.4 2.28-1.55 3.29-1.23 3.29-1.23.66 1.65.24 2.87.12 3.17.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.62-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58C20.57 21.8 24 17.3 24 12c0-6.63-5.37-12-12-12z"/>
        </svg>
        Continue with GitHub
      </button>

      <button onclick="signInWithGoogle()"
        style="width:100%;display:flex;align-items:center;justify-content:center;gap:10px;
               padding:12px 20px;border-radius:11px;border:1.5px solid var(--bdr2);
               background:var(--sur);color:var(--tx);font-size:.92rem;font-weight:700;
               cursor:pointer;margin-bottom:20px;transition:all .15s"
        onmouseover="this.style.borderColor='#ef4444';this.style.background='var(--sur2)'"
        onmouseout="this.style.borderColor='var(--bdr2)';this.style.background='var(--sur)'">
        <svg width="20" height="20" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Continue with Google
      </button>

      <div style="position:relative;margin-bottom:18px">
        <div style="height:1px;background:var(--bdr2)"></div>
        <span style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
                     background:var(--sur);padding:0 10px;font-size:.72rem;color:var(--mu)">or</span>
      </div>

      <div style="display:flex;flex-direction:column;gap:8px">
        <input id="login-name-input" type="text" placeholder="Continue as guest (enter your name)"
          maxlength="30"
          style="width:100%;padding:10px 14px;border-radius:9px;border:1.5px solid var(--bdr2);
                 background:var(--sur2);color:var(--tx);font-size:.88rem;outline:none;
                 font-family:'DM Sans',sans-serif;box-sizing:border-box"
          onkeydown="if(event.key==='Enter')loginSubmit()">
        <button class="btn btn-ghost btn-full" onclick="loginSubmit()" style="font-size:.85rem">
          Continue as Guest →
        </button>
      </div>

      <p style="font-size:.72rem;color:var(--mu);margin-top:16px;line-height:1.5">
        By signing in you agree to our <a href="#" style="color:var(--navy)">Terms</a>.
        PassQuest is free and ad-free.
      </p>
    </div>`;
}


/* ── 7. Inject HTML mount points into home page ──────────── */
// These are injected dynamically so no index.html structural changes needed
function injectMountPoints() {
  // Hero returning user banner — inject before .hero-pre-headline
  const homePage = document.getElementById('home-page');
  if (!homePage) return;

  const wrap = homePage.querySelector('.wrap');
  if (!wrap) return;

  // Find the .hero-pre-headline element to insert before it
  const preHeadline = wrap.querySelector('.hero-pre-headline');
  if (preHeadline && !document.getElementById('hero-returning-mount')) {
    const mount = document.createElement('div');
    mount.id = 'hero-returning-mount';
    wrap.insertBefore(mount, preHeadline);
  }

  // Hero visual anchor — inject after .hero-trust-micro
  const trustMicro = wrap.querySelector('.hero-trust-micro');
  if (trustMicro && !document.getElementById('hero-visual-anchor')) {
    const anchor = document.createElement('div');
    anchor.id = 'hero-visual-anchor';
    trustMicro.parentNode.insertBefore(anchor, trustMicro.nextSibling);
  }
}


/* ── 8. Boot sequence ────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function() {
  // Inject Supabase SDK dynamically
  if (!SUPABASE_URL.includes('REPLACE')) {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    script.onload = initSupabase;
    document.head.appendChild(script);
  }

  injectMountPoints();
  upgradeTestimonials();
  upgradeLoginModal();

  // Delay hero injections slightly so main JS (renderHeroProfile etc) has run
  setTimeout(() => {
    injectHeroVisual();
    injectReturningHero();
  }, 300);
});

// Re-run returning hero when home page is shown
const _origShowPage = window.showPage;
if (typeof _origShowPage === 'function') {
  window.showPage = function(name) {
    _origShowPage(name);
    if (name === 'home') {
      setTimeout(() => {
        injectHeroVisual();
        injectReturningHero();
      }, 100);
    }
  };
}
