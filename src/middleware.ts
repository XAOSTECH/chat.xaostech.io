import { defineMiddleware, sequence } from 'astro:middleware';

// No-op middleware: let requests (including /api/*) be handled by the worker's fetch handler
const passthrough = defineMiddleware(async (_context, next) => {
  return next();
});

export const onRequest = sequence(passthrough);
