import { defineMiddleware, sequence } from 'astro:middleware';

const proxyApi = defineMiddleware(async (context, next) => {
  const { request } = context;
  const url = new URL(request.url);

  // Proxy /api/* to api.xaostech.io, stripping /api prefix (api worker doesn't expect it)
  if (url.pathname.startsWith('/api/')) {
    const newUrl = new URL(request.url);
    newUrl.hostname = 'api.xaostech.io';
    newUrl.pathname = url.pathname.substring(4) || '/'; // Strip /api
    return fetch(new Request(newUrl, request));
  }

  return next();
});

export const onRequest = sequence(proxyApi);
