// PassQuest Service Worker v1.0
const CACHE_NAME = 'passquest-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/theory-questions.json'
];

// ── Install: cache static assets ──────────────────────────
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      console.log('[PassQuest SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// ── Activate: clean up old caches ─────────────────────────
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames
          .filter(function(name) { return name !== CACHE_NAME; })
          .map(function(name) { return caches.delete(name); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// ── Fetch: Network-first for API, Cache-first for static ──
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // Always go network-first for API calls (Groq, Vercel functions)
  if (url.pathname.startsWith('/api/') || 
      url.hostname.includes('groq') ||
      url.hostname.includes('api.anthropic')) {
    event.respondWith(
      fetch(event.request).catch(function() {
        return new Response(
          JSON.stringify({ error: 'Offline — API unavailable' }),
          { headers: { 'Content-Type': 'application/json' }, status: 503 }
        );
      })
    );
    return;
  }

  // Cache-first for Google Fonts (long-lived)
  if (url.hostname.includes('fonts.googleapis.com') || 
      url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        if (cached) return cached;
        return fetch(event.request).then(function(response) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
          return response;
        });
      })
    );
    return;
  }

  // Network-first with cache fallback for everything else
  event.respondWith(
    fetch(event.request)
      .then(function(response) {
        // Cache successful GET responses
        if (event.request.method === 'GET' && response.status === 200) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(function() {
        return caches.match(event.request).then(function(cached) {
          if (cached) return cached;
          // Offline fallback for navigation requests
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});
