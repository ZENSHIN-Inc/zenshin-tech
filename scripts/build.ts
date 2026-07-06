/**
 * ビルドスクリプト（bun scripts/build.ts で実行）
 *
 * 1. slides/*.md を marp-cli で HTML / PDF / サムネイル PNG に変換して dist/slides/ へ出力
 * 2. assets/（ブランド素材）と gallery/ 配下の画像を dist/ へコピー
 * 3. デッキ一覧（dist/index.html）とギャラリー一覧（dist/gallery/index.html）を生成
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SLIDES_DIR = path.join(ROOT, "slides");
const GALLERY_DIR = path.join(ROOT, "gallery");
const ASSETS_DIR = path.join(ROOT, "assets");
const DIST = path.join(ROOT, "dist");

const SITE_TITLE = "ZENSHIN Contents";
const SITE_DESCRIPTION = "ZENSHIN のスライド・CG などを公開するコンテンツハブ";
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);

interface Deck {
  base: string;
  title: string;
  description: string;
  date: string;
}

interface GalleryGroup {
  group: string;
  files: string[];
}

// ---------------------------------------------------------------------------
// 1. クリーン & Marp ビルド
// ---------------------------------------------------------------------------

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(path.join(DIST, "slides"), { recursive: true });
fs.writeFileSync(path.join(DIST, ".nojekyll"), "");

// ブランド素材（ロゴ・favicon など）。スライドからは ../assets/... で参照する
if (fs.existsSync(ASSETS_DIR)) {
  fs.cpSync(ASSETS_DIR, path.join(DIST, "assets"), { recursive: true });
}

const slideFiles = fs.existsSync(SLIDES_DIR)
  ? fs
      .readdirSync(SLIDES_DIR)
      .filter((f) => f.endsWith(".md"))
      .sort()
      .reverse()
  : [];

if (slideFiles.length > 0) {
  // bunx は marp-cli の shebang（node）を尊重するため、実行ランタイムは Node.js
  const marp = "bunx marp --input-dir slides -o dist/slides --theme-set themes --allow-local-files --no-config-file";
  console.log("Building HTML...");
  execSync(marp, { cwd: ROOT, stdio: "inherit" });
  console.log("Building PDF...");
  execSync(`${marp} --pdf`, { cwd: ROOT, stdio: "inherit" });
  console.log("Building thumbnails...");
  execSync(`${marp} --image png --image-scale 1`, { cwd: ROOT, stdio: "inherit" });
}

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
  };
});

// ---------------------------------------------------------------------------
// 3. ギャラリーのコピーと画像収集
// ---------------------------------------------------------------------------

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
fs.mkdirSync(path.join(DIST, "gallery"), { recursive: true });
for (const { group, files } of galleryGroups) {
  fs.mkdirSync(path.join(DIST, "gallery", group), { recursive: true });
  for (const file of files) {
    fs.copyFileSync(path.join(GALLERY_DIR, group, file), path.join(DIST, "gallery", group, file));
  }
}

// ---------------------------------------------------------------------------
// 4. HTML 生成
// ---------------------------------------------------------------------------

function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

const sharedCss = `
  :root {
    --ink: #0c1220; --gold: #c4a97d; --gold-deep: #8c6f42; --blue: #0969da;
    --muted: #475569; --bg: #f8fafc; --card: #ffffff; --border: #e2e8f0;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', 'Noto Sans JP', 'Yu Gothic', 'Meiryo', sans-serif;
    background: var(--bg); color: #1e293b; line-height: 1.7;
  }
  header { background: linear-gradient(135deg, #060a14, var(--ink) 55%, #1a2333); color: #fff; padding: 40px 24px; }
  header .inner, main { max-width: 960px; margin: 0 auto; }
  header .logo { height: 30px; display: block; }
  header p { color: #d7dde6; font-size: 0.9rem; margin-top: 12px; }
  nav { margin-top: 12px; }
  nav a { color: var(--gold); text-decoration: none; font-size: 0.85rem; margin-right: 16px; }
  nav a:hover { text-decoration: underline; }
  main { padding: 32px 24px 64px; }
  h2.section { font-size: 1.15rem; color: var(--ink); border-left: 4px solid var(--gold); padding-left: 10px; margin: 28px 0 16px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
  .card img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; display: block; background: #dde5eb; }
  .card .body { padding: 14px 16px 16px; }
  .card .date { color: var(--muted); font-size: 0.75rem; }
  .card h3 { font-size: 1rem; color: var(--ink); margin: 2px 0 6px; }
  .card p { font-size: 0.82rem; color: var(--muted); }
  .links { margin-top: 10px; display: flex; gap: 8px; }
  .links a {
    font-size: 0.8rem; text-decoration: none; padding: 5px 14px; border-radius: 6px;
    background: var(--blue); color: #fff;
  }
  .links a.secondary { background: #eef2f5; color: var(--ink); }
  .links a:hover { opacity: 0.85; }
  .empty { color: var(--muted); font-size: 0.9rem; padding: 24px 0; }
  .photo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
  .photo-grid a { display: block; border-radius: 8px; overflow: hidden; border: 1px solid var(--border); background: #fff; }
  .photo-grid img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; display: block; }
  footer.site { text-align: center; color: var(--muted); font-size: 0.75rem; padding: 24px; }
`;

interface PageOptions {
  title: string;
  nav: string;
  body: string;
  /** ページからサイトルートへの相対パス（トップは ''、gallery/ 配下は '../'） */
  rel: string;
}

function pageHtml({ title, nav, body, rel }: PageOptions): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(SITE_DESCRIPTION)}">
<link rel="icon" href="${rel}assets/brand/favicon.ico">
<style>${sharedCss}</style>
</head>
<body>
<header>
  <div class="inner">
    <h1><img class="logo" src="${rel}assets/brand/ZENSHIN-logo-white.webp" alt="${escapeHtml(SITE_TITLE)}"></h1>
    <p>${escapeHtml(SITE_DESCRIPTION)}</p>
    <nav>${nav}</nav>
  </div>
</header>
<main>
${body}
</main>
<footer class="site">&copy; ZENSHIN Inc.</footer>
</body>
</html>
`;
}

// トップページ（スライド一覧 + ギャラリーへの導線）
const deckCards = decks
  .map(
    (d) => `  <article class="card">
    <a href="slides/${d.base}.html"><img src="slides/${d.base}.png" alt="${escapeHtml(d.title)} の表紙" loading="lazy"></a>
    <div class="body">
      <div class="date">${d.date}</div>
      <h3>${escapeHtml(d.title)}</h3>
      ${d.description ? `<p>${escapeHtml(d.description)}</p>` : ""}
      <div class="links">
        <a href="slides/${d.base}.html">スライドを見る</a>
        <a class="secondary" href="slides/${d.base}.pdf">PDF</a>
      </div>
    </div>
  </article>`,
  )
  .join("\n");

const indexBody = `
<h2 class="section">スライド</h2>
${decks.length > 0 ? `<div class="grid">\n${deckCards}\n</div>` : '<p class="empty">スライドはまだありません。</p>'}
`;

fs.writeFileSync(
  path.join(DIST, "index.html"),
  pageHtml({
    title: SITE_TITLE,
    nav: '<a href="./">スライド</a><a href="gallery/">ギャラリー</a>',
    body: indexBody,
    rel: "",
  }),
);

// ギャラリー一覧ページ
const gallerySections = galleryGroups
  .map(
    ({ group, files }) => `<h2 class="section">${escapeHtml(group)}</h2>
<div class="photo-grid">
${files.map((f) => `  <a href="${group}/${f}" target="_blank"><img src="${group}/${f}" alt="${escapeHtml(f)}" loading="lazy"></a>`).join("\n")}
</div>`,
  )
  .join("\n");

fs.writeFileSync(
  path.join(DIST, "gallery", "index.html"),
  pageHtml({
    title: `ギャラリー | ${SITE_TITLE}`,
    nav: '<a href="../">スライド</a><a href="./">ギャラリー</a>',
    body: galleryGroups.length > 0 ? gallerySections : '<p class="empty">画像はまだありません。</p>',
    rel: "../",
  }),
);

console.log(`Done: ${decks.length} deck(s), ${galleryGroups.length} gallery group(s) -> dist/`);
