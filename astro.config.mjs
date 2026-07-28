// @ts-check
import { defineConfig } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";

import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  // Canonical origin — makes `Astro.site` resolve absolute canonical URLs.
  site: "https://pixelfreedom.xyz",

  // The host redirects /privacy -> /privacy/, so canonicals must carry the slash.
  trailingSlash: "always",

  integrations: [react(), sitemap()],
  adapter: cloudflare(),
});