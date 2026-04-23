import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    sessionKVBindingName: 'SESSIONS_KV',
    prerenderEnvironment: 'node',
    imageService: 'compile',
  }),
  integrations: [],
  // CSP is emitted from src/middleware.ts (single source of truth).
  // See shared/types/security.ts for why Astro's security.csp was removed.
});