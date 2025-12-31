export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (url.pathname === '/message' && request.method === 'POST') {
      const { userId, message } = await request.json();

      if (!userId || !message) {
        return new Response(JSON.stringify({ error: 'userId and message required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      try {
        const messageId = crypto.randomUUID();
        const timestamp = Date.now();
        const record = JSON.stringify({ messageId, userId, message, timestamp });

        await env.MESSAGES_KV.put(`msg:${messageId}`, record);

        return new Response(JSON.stringify({ messageId, success: true }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: 'Failed to save message' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    if (url.pathname.startsWith('/messages/') && request.method === 'GET') {
      const userId = url.pathname.split('/')[2];

      try {
        const key = `msg:${userId}`;
        const message = await env.MESSAGES_KV.get(key);
        return new Response(message || '[]', {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: 'Failed to fetch messages' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response('Not found', { status: 404 });
  }
};
