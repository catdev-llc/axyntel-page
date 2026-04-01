import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://catdev-llc.github.io",
  base: "/axyntel-page",
  output: "static",
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  compressHTML: true,
  i18n: {
    defaultLocale: "en",
    locales: ["en", "de"],
    routing: "manual",
  },
});
