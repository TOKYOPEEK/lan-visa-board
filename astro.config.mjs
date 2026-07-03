import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// SITE_URL задаётся в окружении деплоя (Cloudflare Pages / Vercel)
export default defineConfig({
  site: process.env.SITE_URL ?? 'https://lan-tablo.pages.dev',
  integrations: [sitemap()],
});
