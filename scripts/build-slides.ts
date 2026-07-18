/**
 * スライドの prebuild スクリプト（bun scripts/build-slides.ts で実行。`bun run build` の前段）
 *
 * 1. slides/*.md を marp-cli（Node API）で HTML / PDF / サムネイル PNG に変換して public/slides/ へ出力
 *    - HTML はデッキごとに変換し、frontmatter の title / description から OGP メタを注入する
 *    - OGP 画像（1200x630、zenshin-hp の技術ブログと同意匠）もデッキごとに生成する
 * 2. assets/（ブランド素材）と gallery/ 配下の画像を public/ へコピー
 *    - gallery/ はスライド挿絵などの画像素材置き場。/gallery/<フォルダ>/<ファイル> で配信は
 *      されるが、公開一覧ページは持たない（2026-07 にギャラリーページを廃止）
 * 3. デッキのメタ情報を src/data/slides.json へ出力
 *    - content.config.ts の slides コレクション（file ローダー）が読む
 *
 * 一覧ページ・フィード（/index.json）・RSS は Astro 側（src/pages/）が生成する。
 * public/slides・public/assets・public/gallery・src/data は生成物（gitignore 済み）。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { marpCli } from "@marp-team/marp-cli";
import { renderOgImage } from "../src/lib/og-image";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SLIDES_DIR = path.join(ROOT, "slides");
const GALLERY_DIR = path.join(ROOT, "gallery");
const ASSETS_DIR = path.join(ROOT, "assets");
const PUBLIC = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "src", "data");

const SITE_ORIGIN = "https://tech.zenshin-inc.co.jp";
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);

// デッキの著者（現状は全デッキ共通）。src/content/authors/ のコレクション ID
const AUTHOR_ID = "05-takahashi";

// marp-cli は process.cwd() 基準でパスを解決する
process.chdir(ROOT);

/** marp-cli を Node API で実行する。非 0 終了はエラーにする。
 * PDF・サムネイル変換はローカル負荷次第で Chrome の CDP タイムアウト
 * （Target.closeTarget timed out 等）で稀に落ちるため、1 回だけリトライする */
async function marp(args: string[]): Promise<void> {
  const attempts = 2;
  for (let i = 1; i <= attempts; i++) {
    try {
      const exitCode = await marpCli(args);
      if (exitCode !== 0) throw new Error(`marp-cli exited with code ${exitCode}: marp ${args.join(" ")}`);
      return;
    } catch (error) {
      if (i === attempts) throw error;
      console.warn(`marp-cli が失敗したためリトライします: marp ${args.join(" ")}`);
    }
  }
}

// テーマのレイアウト部品（.columns / .card / .stats）を Markdown 内の HTML で使えるよう --html を有効にする
const MARP_COMMON_ARGS = ["--theme-set", "themes", "--allow-local-files", "--no-config-file", "--html"];

interface Deck {
  base: string;
  title: string;
  description: string;
  date: string;
  tags: string[];
}

/** `tags: [A, B]` のようなインライン配列表記をパースする（それ以外は空配列） */
function parseTags(value: string | undefined): string[] {
  if (!value || !value.startsWith("[") || !value.endsWith("]")) return [];
  return value
    .slice(1, -1)
    .split(",")
    .map((t) => t.trim().replace(/^['"]|['"]$/g, ""))
    .filter((t) => t.length > 0);
}

// ---------------------------------------------------------------------------
// 1. クリーン
// ---------------------------------------------------------------------------

for (const dir of ["slides", "assets", "gallery"]) {
  fs.rmSync(path.join(PUBLIC, dir), { recursive: true, force: true });
}
fs.rmSync(DATA_DIR, { recursive: true, force: true });
fs.mkdirSync(path.join(PUBLIC, "slides"), { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

// ブランド素材（ロゴ・favicon など）。スライドからは ../assets/... で参照する
if (fs.existsSync(ASSETS_DIR)) {
  fs.cpSync(ASSETS_DIR, path.join(PUBLIC, "assets"), { recursive: true });
}

const slideFiles = fs.existsSync(SLIDES_DIR)
  ? fs
      .readdirSync(SLIDES_DIR)
      .filter((f) => f.endsWith(".md"))
      .sort()
      .reverse()
  : [];

// ---------------------------------------------------------------------------
// 2. スライドのメタ情報を収集
// ---------------------------------------------------------------------------

/** 先頭の YAML front matter を素朴にパースする（title / description のみ使用） */
function parseFrontMatter(markdown: string): Record<string, string> {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const result: Record<string, string> = {};
  if (!match || match[1] === undefined) return result;
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^(\w[\w-]*):\s*(.+)$/);
    if (kv && kv[1] !== undefined && kv[2] !== undefined) {
      result[kv[1]] = kv[2].replace(/^['"]|['"]$/g, "").trim();
    }
  }
  return result;
}

const decks: Deck[] = slideFiles.map((file) => {
  const base = file.replace(/\.md$/, "");
  const markdown = fs.readFileSync(path.join(SLIDES_DIR, file), "utf8");
  const fm = parseFrontMatter(markdown);
  const heading = markdown.replace(/^---[\s\S]*?---/, "").match(/^#\s+(.+)$/m);
  const dateMatch = base.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return {
    base,
    title: fm["title"] ?? heading?.[1] ?? base,
    description: fm["description"] ?? "",
    date: dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : "",
    tags: parseTags(fm["tags"]),
  };
});

// ---------------------------------------------------------------------------
// 3. Marp ビルド + OGP 画像生成
// ---------------------------------------------------------------------------

if (decks.length > 0) {
  // OGP 画像（1200x630）をデッキごとに生成する。ブランド意匠は zenshin-hp の技術ブログ OGP と統一
  console.log("Building OG images...");
  const author = {
    name: "高橋 俊",
    role: "CTO / 技術責任者",
    imagePath: path.join(ROOT, "src", "assets", "images", "authors", "takahashi-old.jpg"),
  };
  for (const deck of decks) {
    const png = await renderOgImage({
      label: "スライド | 株式会社ZENSHIN",
      title: deck.title,
      author,
      date: deck.date ? deck.date.replaceAll("-", ".") : undefined,
    });
    fs.writeFileSync(path.join(PUBLIC, "slides", `${deck.base}-og.png`), png);
  }

  // HTML はデッキごとに変換し、OGP メタ（og:title / og:description / og:image / og:url）を注入する
  console.log("Building HTML...");
  for (const deck of decks) {
    await marp([
      path.join("slides", `${deck.base}.md`),
      "-o",
      path.join("public", "slides", `${deck.base}.html`),
      ...MARP_COMMON_ARGS,
      "--title",
      deck.title,
      ...(deck.description ? ["--description", deck.description] : []),
      "--url",
      `${SITE_ORIGIN}/slides/${deck.base}.html`,
      "--og-image",
      `${SITE_ORIGIN}/slides/${deck.base}-og.png`,
    ]);
  }

  // PDF・サムネイルは OGP が不要なので一括変換（marp-cli が並列処理する）
  console.log("Building PDF...");
  await marp(["--input-dir", "slides", "-o", "public/slides", ...MARP_COMMON_ARGS, "--pdf"]);
  console.log("Building thumbnails...");
  await marp(["--input-dir", "slides", "-o", "public/slides", ...MARP_COMMON_ARGS, "--image", "png", "--image-scale", "1"]);
}

// ---------------------------------------------------------------------------
// 4. ギャラリーのコピーと画像収集
// ---------------------------------------------------------------------------

interface GalleryGroup {
  group: string;
  files: string[];
}

/** gallery/<YYYYMM>-<slug>/ 配下の画像を { group, files } の配列で返す */
function collectGallery(): GalleryGroup[] {
  if (!fs.existsSync(GALLERY_DIR)) return [];
  const groups: GalleryGroup[] = [];
  const entries = fs
    .readdirSync(GALLERY_DIR, { withFileTypes: true })
    .sort((a, b) => b.name.localeCompare(a.name));
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const files = fs
      .readdirSync(path.join(GALLERY_DIR, entry.name))
      .filter((f) => IMAGE_EXTENSIONS.has(path.extname(f).toLowerCase()))
      .sort();
    if (files.length > 0) groups.push({ group: entry.name, files });
  }
  return groups;
}

const galleryGroups = collectGallery();
fs.mkdirSync(path.join(PUBLIC, "gallery"), { recursive: true });
for (const { group, files } of galleryGroups) {
  fs.mkdirSync(path.join(PUBLIC, "gallery", group), { recursive: true });
  for (const file of files) {
    fs.copyFileSync(path.join(GALLERY_DIR, group, file), path.join(PUBLIC, "gallery", group, file));
  }
}

// ---------------------------------------------------------------------------
// 5. メタ情報を src/data/ へ出力（Astro 側のデータソース）
// ---------------------------------------------------------------------------

const slidesData = decks.map((d) => ({
  id: d.base,
  title: d.title,
  description: d.description,
  date: d.date,
  tags: d.tags,
  author: AUTHOR_ID,
  urls: {
    page: `/slides/${d.base}.html`,
    pdf: `/slides/${d.base}.pdf`,
    thumbnail: `/slides/${d.base}.png`,
    ogImage: `/slides/${d.base}-og.png`,
  },
}));
fs.writeFileSync(path.join(DATA_DIR, "slides.json"), `${JSON.stringify(slidesData, null, 2)}\n`);

console.log(`Done: ${decks.length} deck(s), ${galleryGroups.length} gallery group(s) -> public/ + src/data/`);

// marp-cli の Node API が Chrome まわりのハンドルを残すことがあり、全処理後も
// プロセスが終了せず CI が timeout-minutes まで待ち続ける（ローカル・Actions 双方で観測）。
// 成果物は出力済みなので明示的に終了する
process.exit(0);
