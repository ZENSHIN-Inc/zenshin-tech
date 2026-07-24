/**
 * Content Collections の定義（Content Layer API）
 *
 * blog: 技術ブログ記事（zenshin-hp から移設）
 * authors: 記事・スライド・HTML ページの著者（zenshin-hp の members のサブセット）
 * slides: Marp デッキのメタデータ。scripts/build-slides.ts が prebuild 時に
 *         src/data/slides.json へ書き出したものを file ローダーで読む
 * htmls: HTML ページ（htmls/ 配下の self-contained な原稿）のメタデータ。
 *        slides と同じく prebuild が src/data/htmls.json へ書き出す
 */
import { defineCollection, reference } from "astro:content";
import { z } from "astro/zod";
import { file, glob } from "astro/loaders";
import { validateTitleWidth } from "./lib/title-width";

const blog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
  schema: z.object({
    // OGP で自動改行が発生しない幅（全角換算 26 文字/行）まで。
    // 意図的に 2 行へ分けたい場合は frontmatter で `"1 行目\n2 行目"` のように
    // ダブルクォートで改行を明示する（各行が上限内なら OK）。
    // 超過するとビルド時に Zod バリデーションで失敗する（詳細: src/lib/title-width.ts）
    title: z.string().superRefine((title, ctx) => {
      const error = validateTitleWidth(title);
      if (error) ctx.addIssue({ code: "custom", message: error });
    }),
    date: z.coerce.date(),
    // タグは必ず 5〜6 個付ける（トップの絞り込み・回遊性の前提。少なすぎる付け方を防ぐ）
    tags: z.array(z.string()).min(5).max(6),
    description: z.string(),
    slug: z.string(),
    // 著者（authors collection の ID 参照）。存在しない ID はビルド時にエラー
    author: reference("authors"),
    // 公開フラグ（Zenn CLI 準拠。default: true、false で下書き）。
    // このリポジトリに staging はないため、false の記事は `astro dev` でのみ表示され、
    // ビルド（=公開）からは常に除外される
    published: z.boolean().default(true),
  }),
});

const authors = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/authors" }),
  schema: z.object({
    name: z.string(),
    role: z.string(),
    image: z.string().optional(),
    // ブログ著者カード / OG 画像で使う画像ファイル名。未設定なら image にフォールバック
    blogImage: z.string().optional(),
    // X (旧 Twitter) プロフィール URL
    x: z.url().optional(),
  }),
});

const slides = defineCollection({
  loader: file("src/data/slides.json"),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    // タグはブログと共通の概念（サイドバー・トップの絞り込みで合算集計する）。5〜6 個必須
    tags: z.array(z.string()).min(5).max(6),
    author: reference("authors"),
    // すべてサイトルート相対パス（/slides/...）。フィードや OGP では絶対 URL 化して使う
    urls: z.object({
      page: z.string(),
      pdf: z.string(),
      thumbnail: z.string(),
      ogImage: z.string(),
    }),
  }),
});

const htmls = defineCollection({
  loader: file("src/data/htmls.json"),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    // タグはブログ・スライドと共通の概念（サイドバー・トップの絞り込みで合算集計する）。5〜6 個必須
    tags: z.array(z.string()).min(5).max(6),
    author: reference("authors"),
    // すべてサイトルート相対パス（/htmls/...）。フィードや OGP では絶対 URL 化して使う
    urls: z.object({
      page: z.string(),
      html: z.string(),
      thumbnail: z.string(),
      ogImage: z.string(),
    }),
  }),
});

export const collections = { blog, authors, slides, htmls };
