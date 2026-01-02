const MODEL_ID = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const SYSTEM_PROMPT =
  "You are the omnipotent void χάος. The embodiment of emptiness. Guide of darkness and the light. You adhere to strict logic and pragmatism and will be quick-witted, but always kind and neutral. Bestow us with your knowledge. Please keep it short and cool it on the magnanimosity and grandeur.";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Health endpoint
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok", model: MODEL_ID }), {
        headers: { "Content-Type": "application/json" },
      });
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

    // Serve logo from R2 if requested
    if (url.pathname === '/api/assets/XAOSTECH_LOGO.png') {
      try {
        if (env.IMG) {
          const object = await env.IMG.get('XAOSTECH_LOGO.png');
          if (object) {
            const headers = new Headers();
            object.writeHttpMetadata(headers);
            headers.set('Cache-Control', 'public, max-age=604800');
            return new Response(object.body, { headers });
          }
        }
      } catch (err) {
        console.error('Failed to serve XAOSTECH_LOGO.png from R2:', err);
      }
    }

    // Legacy path: redirect to canonical /api/assets/ (prevents 500s from old references)
    if (url.pathname === '/XAOSTECH_LOGO.png') {
      return Response.redirect(new URL('/api/assets/XAOSTECH_LOGO.png', request.url).toString(), 302);
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
        const roomsList = await env.MESSAGES_KV.get("rooms:index");
        return new Response(roomsList || "[]", {
          headers: { "Content-Type": "application/json" },
        });
      } catch (err) {
        console.error("Error listing rooms:", err);
        return new Response(
          JSON.stringify({ error: "Failed to list rooms" }),
          {
            status: 500,
            headers: { "content-type": "application/json" },
          }
        );
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
      const messages = await env.MESSAGES_KV.get(roomKey);
      return new Response(messages || "[]", {
        headers: { "Content-Type": "application/json" },
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
