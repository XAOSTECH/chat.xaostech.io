const MODEL_ID = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const SYSTEM_PROMPT =
  "You are the omnipotent void χάος. The embodiment of emptiness. Guide of darkness and the light. You adhere to strict logic and pragmatism and will be quick-witted, but always kind and neutral. Bestow us with your knowledge. Please keep it short and cool it on the magnanimosity and grandeur.";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Diagnostic binding info endpoint
    if (url.pathname === '/debug/bindings') {
      return new Response(JSON.stringify({
        IMG: !!env.IMG,
        ASSETS: !!env.ASSETS,
        MESSAGES_KV: !!env.MESSAGES_KV,
        AI: !!env.AI,
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    // Health endpoint
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok", model: MODEL_ID }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Log binding availability for debugging (no secrets)
    try {
      console.debug('[chat] bindings availability', {
        IMG: !!env.IMG,
        ASSETS: !!env.ASSETS,
        MESSAGES_KV: !!env.MESSAGES_KV,
        AI: !!env.AI,
      });
    } catch (e) {
      /* ignore logging errors */
    }

    // API routes
    if (url.pathname === "/api/chat") {
      if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
      }
      return handleAIChat(request, env);
    }

    if (url.pathname.startsWith("/api/rooms/")) {
      return handleSocialRooms(request, env, url);
    }

    if (url.pathname.startsWith("/api/dm/")) {
      return handleDM(request, env, url);
    }

    // Serve logo from R2 if requested; fall back to proxying to API if R2 binding missing
    if (url.pathname === '/api/assets/XAOSTECH_LOGO.png') {
      try {
        if (env.IMG && typeof env.IMG.get === 'function') {
          const object = await env.IMG.get('XAOSTECH_LOGO.png');
          if (object) {
            const headers = new Headers();
            try {
              if (typeof object.writeHttpMetadata === 'function') {
                object.writeHttpMetadata(headers);
              }
            } catch (e) {
              // ignore metadata write errors
            }
            headers.set('Cache-Control', 'public, max-age=604800');
            return new Response(object.body, { headers });
          }
        }

        // If R2 binding missing or object not found, proxy to API's asset endpoint
        console.debug('[chat] R2 IMG binding missing or object not found; proxying to API asset route');
        const proxied = await fetch('https://api.xaostech.io/data/assets/XAOSTECH_LOGO.png', {
          method: 'GET',
          headers: { 'User-Agent': 'XAOSTECH chat worker' }
        });

        if (!proxied.ok) {
          console.error('[chat] proxied asset fetch failed', proxied.status);
          return new Response(JSON.stringify({ error: 'Asset not available' }), {
            status: 502,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        const blob = await proxied.blob();
        const headers = new Headers(proxied.headers);
        headers.set('Cache-Control', 'public, max-age=604800');
        return new Response(blob, { status: proxied.status, headers });
      } catch (err) {
        console.error('Failed to serve XAOSTECH_LOGO.png:', err);
        return new Response(JSON.stringify({ error: 'Failed to serve asset' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Legacy path: redirect to canonical /api/assets/ (prevents 500s from old references)
    if (url.pathname === '/XAOSTECH_LOGO.png') {
      return Response.redirect(new URL('/api/assets/XAOSTECH_LOGO.png', request.url).toString(), 302);
    }

    // Route proxy: map /portfolio, /account, /data etc to their subdomains
    const routeMap = {
      '/portfolio': 'https://portfolio.xaostech.io',
      '/account': 'https://account.xaostech.io',
      '/data': 'https://data.xaostech.io',
      '/lingua': 'https://lingua.xaostech.io',
      '/payments': 'https://payments.xaostech.io',
    };

    for (const prefix in routeMap) {
      if (url.pathname === prefix || url.pathname.startsWith(prefix + '/')) {
        // Proxy the request
        const target = routeMap[prefix];
        const rest = url.pathname.substring(prefix.length) || '/';
        const proxiedUrl = new URL(rest + url.search, target);

        const headers = new Headers();
        for (const [k, v] of request.headers) {
          const lk = k.toLowerCase();
          if (['host', 'connection', 'content-length', 'transfer-encoding', 'upgrade', 'keep-alive'].includes(lk)) continue;
          headers.set(k, v);
        }

        try {
          const resp = await fetch(proxiedUrl.toString(), { method: request.method, headers, body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.text() : undefined });
          return new Response(resp.body, { status: resp.status, headers: new Headers(resp.headers) });
        } catch (e) {
          console.error('[route-proxy] fetch error', e);
          return new Response(JSON.stringify({ error: 'Proxy failed' }), { status: 502, headers: { 'Content-Type': 'application/json' } });
        }
      }
    }

    // Serve static assets for non-API requests
    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },
};

/**
 * Handle AI Chat — streaming LLM responses
 */
async function handleAIChat(request, env) {
  try {
    const { messages = [] } = (await request.json()) || {};

    // Insert system prompt if missing
    if (messages.length > 0 && messages[0].role !== "system") {
      messages.unshift({ role: "system", content: SYSTEM_PROMPT });
    }

    const response = await env.AI.run(
      MODEL_ID,
      {
        messages,
        max_tokens: 1024,
      },
      {
        returnRawResponse: true,
      }
    );

    return response;
  } catch (err) {
    console.error("Error processing chat request:", err);
    return new Response(
      JSON.stringify({ error: "Failed to process request" }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      }
    );
  }
}

/**
 * Handle Social Chat — rooms and message posting
 */
async function handleSocialRooms(request, env, url) {
  const pathParts = url.pathname.split("/");
  const roomId = pathParts[3];

  if (!roomId) {
    // List rooms
    if (request.method === "GET") {
      try {
        if (!env.MESSAGES_KV) {
          console.debug('[chat] MESSAGES_KV binding missing; returning empty room list');
          return new Response("[]", { headers: { "Content-Type": "application/json" } });
        }
        const roomsList = await env.MESSAGES_KV.get("rooms:index");
        return new Response(roomsList || "[]", {
          headers: { "Content-Type": "application/json" },
        });
      } catch (err) {
        console.error("Error listing rooms:", err);
        // Return empty list instead of 500 to keep UI functional
        return new Response("[]", {
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    return new Response("Method not allowed", { status: 405 });
  }

  if (url.pathname.endsWith("/post")) {
    // POST /api/rooms/:roomId/post — add message to room
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    try {
      const { userId, username, content } = (await request.json()) || {};

      if (!userId || !content) {
        return new Response(
          JSON.stringify({ error: "userId and content required" }),
          {
            status: 400,
            headers: { "content-type": "application/json" },
          }
        );
      }

      const messageId = crypto.randomUUID();
      const timestamp = new Date().toISOString();
      const message = { messageId, userId, username, content, timestamp };

      // Append to room messages
      const roomKey = `room:${roomId}:messages`;
      const existing = await env.MESSAGES_KV.get(roomKey);
      const messages = existing ? JSON.parse(existing) : [];
      messages.push(message);

      await env.MESSAGES_KV.put(roomKey, JSON.stringify(messages));

      return new Response(JSON.stringify({ messageId, success: true }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("Error posting to room:", err);
      return new Response(
        JSON.stringify({ error: "Failed to post message" }),
        {
          status: 500,
          headers: { "content-type": "application/json" },
        }
      );
    }
  }

  // GET /api/rooms/:roomId — fetch room messages
  if (request.method === "GET") {
    try {
      const roomKey = `room:${roomId}:messages`;
        if (!env.MESSAGES_KV) {
          console.debug('[chat] MESSAGES_KV binding missing; returning empty message list');
          return new Response("[]", { headers: { "Content-Type": "application/json" } });
        }
      });
    } catch (err) {
      console.error("Error fetching room:", err);
      // Fail-safe: return empty list instead of 500 to avoid breaking UI when KV is temporarily unavailable
      return new Response("[]", {
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  return new Response("Not found", { status: 404 });
}

/**
 * Handle Direct Messages
 */
async function handleDM(request, env, url) {
  const pathParts = url.pathname.split("/");
  const recipientId = pathParts[3];

  if (!recipientId) {
    return new Response("Recipient ID required", { status: 400 });
  }

  if (request.method === "POST") {
    try {
      const { senderId, senderName, content } = (await request.json()) || {};

      if (!senderId || !content) {
        return new Response(
          JSON.stringify({ error: "senderId and content required" }),
          {
            status: 400,
            headers: { "content-type": "application/json" },
          }
        );
      }

      const messageId = crypto.randomUUID();
      const timestamp = new Date().toISOString();
      const message = { messageId, senderId, senderName, content, timestamp };

      // Store in a conversation channel (sorted pair of IDs)
      const conversationId = [senderId, recipientId].sort().join(":");
      const dmKey = `dm:${conversationId}`;
      const existing = await env.MESSAGES_KV.get(dmKey);
      const messages = existing ? JSON.parse(existing) : [];
      messages.push(message);

      await env.MESSAGES_KV.put(dmKey, JSON.stringify(messages));

      return new Response(JSON.stringify({ messageId, success: true }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("Error sending DM:", err);
      return new Response(
        JSON.stringify({ error: "Failed to send DM" }),
        {
          status: 500,
          headers: { "content-type": "application/json" },
        }
      );
    }
  }

  if (request.method === "GET") {
    try {
      const senderId = url.searchParams.get("senderId");
      if (!senderId) {
        return new Response("senderId query param required", { status: 400 });
      }

      const conversationId = [senderId, recipientId].sort().join(":");
      const dmKey = `dm:${conversationId}`;
      const messages = await env.MESSAGES_KV.get(dmKey);
      return new Response(messages || "[]", {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("Error fetching DM:", err);
      return new Response(
        JSON.stringify({ error: "Failed to fetch DM" }),
        {
          status: 500,
          headers: { "content-type": "application/json" },
        }
      );
    }
  }

  return new Response("Method not allowed", { status: 405 });
}
