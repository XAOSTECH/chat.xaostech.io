import { defineMiddleware, sequence } from 'astro:middleware';
import { getSecurityHeaders } from '../shared/types/security';

const securityMiddleware = defineMiddleware(async (_context, next) => {
  const res = await next();
  // skipCsp: Astro emits its own CSP via security.csp in astro.config.mjs.
  const sec = getSecurityHeaders({ skipCsp: true });
  for (const k of Object.keys(sec)) {
    res.headers.set(k, sec[k]);
  }
  return res;
});

export const onRequest = sequence(securityMiddleware);
