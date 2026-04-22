import { defineMiddleware, sequence } from 'astro:middleware';
import { applySecurityHeaders } from '../shared/types/security';

const securityMiddleware = defineMiddleware(async (_context, next) => {
  return applySecurityHeaders(await next());
});

export const onRequest = sequence(securityMiddleware);
