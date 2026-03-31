import { defineMiddleware, sequence } from 'astro:middleware';
import { applySecurityHeaders } from '../shared/types/security';

const securityMiddleware = defineMiddleware(async (_context, next) => {
  const res = await next();
  return applySecurityHeaders(res);
});

export const onRequest = sequence(securityMiddleware);
