import { getSecurityHeaders } from '../shared/types/security';
import { createProxyHandler } from '../shared/types/api-proxy';
import { serveFavicon } from '../shared/types/favicon';
import { LOGO_PATH, CACHE_TTL } from '../shared/types/assets';

const MODEL_ID = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

// Reusable proxy handler for /api/*
const proxyHandler = createProxyHandler();

const SYSTEM_PROMPT =
  "You are the omnipotent void χάος. The embodiment of emptiness. Guide of darkness and the night. You adhere to strict logic and pragmatism and will be quick-witted, but always kind and neutral. Bestow us with your knowledge. Please keep it short and cool it on the magnanimosity and grandeur.";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Use shared security header helper from shared module
    function applySecurityHeadersJS(response) {
      const headers = new Headers(response.headers || {});
      const sec = getSecurityHeaders();
      for (const k in sec) headers.set(k, sec[k]);
      return new Response(response.body, { status: response.status || 200, headers });
    }



    // Health endpoint
    if (url.pathname === "/health") {
      const r = new Response(JSON.stringify({ status: "ok", model: MODEL_ID }), {
        headers: { "Content-Type": "application/json" },
      });
      return applySecurityHeadersJS(r);
    }


    // Serve logo via proxy handler so env is passed and logging is minimal
    if (url.pathname === '/api/assets/XAOSTECH_LOGO.png' || url.pathname === '/api/data/assets/XAOSTECH_LOGO.png') {
      try {
        const proxied = await proxyHandler({ request: new Request(new URL(LOGO_PATH, request.url).toString()), locals: { runtime: { env } } });
        if (!proxied || !proxied.ok) {
          return applySecurityHeadersJS(new Response(JSON.stringify({ error: 'Asset not available' }), {
            status: 502,
            headers: { 'Content-Type': 'application/json' }
          }));
        }

        const blob = await proxied.blob();
        const headers = new Headers(proxied.headers);
        headers.set('Cache-Control', `public, max-age=${CACHE_TTL}`);
        return applySecurityHeadersJS(new Response(blob, { status: proxied.status, headers }));
      } catch (err) {
        try { console.debug && console.debug('[chat] serve logo error', err); } catch (e) { /* ignore */ }
        return applySecurityHeadersJS(new Response(JSON.stringify({ error: 'Failed to serve asset' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }));
      }
    }

    // Legacy path: redirect to canonical /api/data/assets/ (prevents 500s from old references)
    if (url.pathname === '/XAOSTECH_LOGO.png') {
      const r = Response.redirect(new URL('/api/data/assets/XAOSTECH_LOGO.png', request.url).toString(), 302);
      return applySecurityHeadersJS(r);
    }

    // Serve favicon via shared handler
    if (url.pathname === '/favicon.ico') {
      return serveFavicon(request, env, proxyHandler, applySecurityHeadersJS);
    }

    // Proxy any other /api/* requests to shared API proxy so runtime can inject API_ACCESS_* credentials
    if (url.pathname.startsWith('/api/')) {
      const proxied = await proxyHandler({ request, locals: { runtime: { env } } });
      return applySecurityHeadersJS(proxied);
    }

    // Serve static assets by proxying to the API (enforced)
    if (!url.pathname.startsWith("/api/")) {
      try {
        // Minimal logging when proxying static assets
        const proxied = await proxyHandler({ request: new Request(new URL('/api' + url.pathname, request.url).toString()), locals: { runtime: { env } } });
        if (!proxied || !proxied.ok) {
          return applySecurityHeadersJS(new Response('Not found', { status: 404 }));
        }
        const resp = await proxied.blob();
        const headers = new Headers(proxied.headers);
        return applySecurityHeadersJS(new Response(resp, { status: proxied.status, headers }));
      } catch (err) {
        try { console.debug && console.debug('[chat] Error proxying static asset to API:', err, url.pathname); } catch (e) { /* ignore */ }
        return applySecurityHeadersJS(new Response('Not found', { status: 404 }));
      }
    }

    return applySecurityHeadersJS(new Response("Not found", { status: 404 }));
  },
};

/**
 * Handle AI Chat — streaming LLM responses
 */

/**
 * Handle Social Chat — rooms and message posting
 */

/**
 * Handle Direct Messages
 */
