import { defineMiddleware, sequence } from 'astro:middleware';
import { getSecurityHeaders } from '../shared/types/security';

const securityMiddleware = defineMiddleware(async (_context, next) => {
  const res = await next();
  const sec = getSecurityHeaders();
  for (const k of Object.keys(sec)) {
    res.headers.set(k, sec[k]);
  }
  return res;
});

export const onRequest = sequence(securityMiddleware);
