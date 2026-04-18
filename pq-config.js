// ═══════════════════════════════════════════════════════════
// pq-config.js — PassQuest persistent config
//
// COMMIT THIS FILE ONCE to your GitHub repo root.
// It will NEVER need to change when you replace index.html.
// Credentials here override any hardcoded values in index.html.
// ═══════════════════════════════════════════════════════════

window.PQ_CONFIG = {
  // Supabase — your real anon key (safe to be public)
  SUPABASE_URL:  'https://mwdqxwaxngjnoegfbawe.supabase.co',
  SUPABASE_ANON: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im13ZHF4d2F4bmdqbm9lZ2ZiYXdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMDkxNDAsImV4cCI6MjA5MDc4NTE0MH0.OMpxVSAB8-WE9mNk5FWU6R55YteNtzwtx8Zc4iZ5gjg',
};

// How this works:
// 1. This file loads BEFORE the auth engine in index.html
// 2. The auth engine reads window.PQ_CONFIG first, falls back to hardcoded values
// 3. When you replace index.html (e.g. with a new Claude-generated version),
//    this file stays untouched in your repo — credentials always persist
//
// To update credentials in future: only edit THIS file, not index.html
