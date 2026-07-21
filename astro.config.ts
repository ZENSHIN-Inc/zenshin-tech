/**
 * Astro 設定ファイル（zenshin-hp の構成をベースに ZENSHIN 技術ブログ用へ調整）
 *
 * - サイト: https://tech.zenshin-inc.co.jp/（Cloudflare Pages・完全静的）
 * - Markdown は satteri + リンクカードプラグイン（zenshin-hp から移植）
 * - スライド（Marp）は scripts/build-slides.ts が public/slides/ へ prebuild する
 */
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import icon from "astro-icon";
import { satteri } from "@astrojs/markdown-satteri";
import tailwindcss from "@tailwindcss/vite";
import satteriLinkCard from "./src/plugins/satteri-link-card";

export default defineConfig({
  site: "https://tech.zenshin-inc.co.jp",

  // URL 正規化（末尾スラッシュ付きに統一 — zenshin-hp と合わせ、www からの
  // /blog/<slug>/ リダイレクトをパス構造そのままで受けられるようにする）
  trailingSlash: "always",

  build: {
    // 全 CSS を HTML にインライン化（zenshin-hp と同じ方針。render-blocking CSS を排除）
    inlineStylesheets: "always",
  },

  vite: {
    plugins: [tailwindcss()],
  },

  markdown: {
    processor: satteri({
      hastPlugins: [satteriLinkCard()],
    }),
    // zenshin-hp と同じテーマ（コントラスト対応の経緯は global.css 参照）
    shikiConfig: { theme: "github-light-default" },
  },

  integrations: [
    sitemap({
      serialize: (item) => ({ ...item, lastmod: new Date().toISOString() }),
    }),
    icon(),
  ],
});
