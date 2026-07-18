/**
 * Content Collections の定義（Content Layer API）
 *
 * blog: 技術ブログ記事（zenshin-hp から移設）
 * authors: 記事・スライドの著者（zenshin-hp の members のサブセット）
 * slides: Marp デッキのメタデータ。scripts/build-slides.ts が prebuild 時に
 *         src/data/slides.json へ書き出したものを file ローダーで読む
 */
import { defineCollection, reference } from "astro:content";
import { z } from "astro/zod";
import { file, glob } from "astro/loaders";

const blog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
  schema: z.object({
    // OGP は 2 行想定で最大 40 文字まで。1 行目と 2 行目を分けたい場合は
    // frontmatter で `"1 行目\n2 行目"` のようにダブルクォートで改行を明示する。
    // 超過するとビルド時に Zod バリデーションで失敗する
    title: z.string().max(40),
    date: z.coerce.date(),
    // 複数タグ対応。最低 1 個必須（サイドナビ・タグページ生成の前提）、最大 6 個
    tags: z.array(z.string()).min(1).max(6),
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
    // タグはブログと共通の概念（サイドバー・/tags/ ページで合算集計する）
    tags: z.array(z.string()).default([]),
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

export const collections = { blog, authors, slides };
