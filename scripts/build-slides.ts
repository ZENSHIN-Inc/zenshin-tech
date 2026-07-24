/**
 * スライド・HTML ページの prebuild スクリプト（bun scripts/build-slides.ts で実行。`bun run build` の前段）
 *
 * 1. slides/*.md を marp-cli（Node API）で HTML / PDF / サムネイル PNG に変換して public/slides/ へ出力
 *    - HTML はデッキごとに変換し、frontmatter の title / description から OGP メタを注入する
 *    - HTML にはビューワー連携スクリプトを注入する（src/pages/slides/[slug].astro の
 *      SpeakerDeck 風ビューワーページが iframe で埋め込む前提。ページ状態の postMessage 通知・
 *      最終ページ後のエンドカード通知・埋め込み時の OSD 非表示・直接アクセス時の閲覧数カウント）
 *    - OGP 画像（1200x630、zenshin-hp の技術ブログと同意匠）もデッキごとに生成する
 * 2. htmls/*.html（self-contained な HTML ページ原稿）を public/htmls/ へ出力
 *    - 先頭の HTML コメントメタ（title / description / tags / author）を読み、
 *      OGP メタ・canonical・ビューワー連携スクリプト（iframe 高さ通知 + 閲覧数カウント）を注入する
 *    - OGP 画像（1200x630）とサムネイル PNG（1280x720 の先頭ビュー、スライドと同アスペクト）も生成する
 * 3. assets/（ブランド素材）と gallery/ 配下の画像を public/ へコピー
 *    - gallery/ はスライド・HTML ページの挿絵などの画像素材置き場。/gallery/<フォルダ>/<ファイル> で
 *      配信はされるが、公開一覧ページは持たない（2026-07 にギャラリーページを廃止）
 * 4. メタ情報を src/data/slides.json・src/data/htmls.json へ出力
 *    - content.config.ts の slides / htmls コレクション（file ローダー）が読む
 *
 * 一覧ページ・フィード（/index.json）・RSS は Astro 側（src/pages/）が生成する。
 * public/slides・public/htmls・public/assets・public/gallery・src/data は生成物（gitignore 済み）。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { marpCli } from "@marp-team/marp-cli";
import puppeteer from "puppeteer-core";
import { renderOgImage } from "../src/lib/og-image";
import { validateTitleWidth } from "../src/lib/title-width";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SLIDES_DIR = path.join(ROOT, "slides");
const HTMLS_DIR = path.join(ROOT, "htmls");
const GALLERY_DIR = path.join(ROOT, "gallery");
const ASSETS_DIR = path.join(ROOT, "assets");
const PUBLIC = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "src", "data");

const SITE_ORIGIN = "https://tech.zenshin-inc.co.jp";
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);

// デッキの著者の既定値。デッキごとに frontmatter の `author:` で
// src/content/authors/ のコレクション ID を指定して上書きできる
const DEFAULT_AUTHOR_ID = "05-takahashi";

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
  /** src/content/authors/ のコレクション ID */
  author: string;
}

interface Author {
  name: string;
  role: string;
  imagePath: string;
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

for (const dir of ["slides", "htmls", "assets", "gallery"]) {
  fs.rmSync(path.join(PUBLIC, dir), { recursive: true, force: true });
}
fs.rmSync(DATA_DIR, { recursive: true, force: true });
fs.mkdirSync(path.join(PUBLIC, "slides"), { recursive: true });
fs.mkdirSync(path.join(PUBLIC, "htmls"), { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

// ブランド素材（ロゴ・favicon など）。スライドからは ../assets/... で参照する
if (fs.existsSync(ASSETS_DIR)) {
  fs.cpSync(ASSETS_DIR, path.join(PUBLIC, "assets"), { recursive: true });
}

const slideFiles = fs.existsSync(SLIDES_DIR)
  ? fs
      .readdirSync(SLIDES_DIR)
      .filter((f) => f.endsWith(".md") && !f.startsWith("."))
      .sort()
      .reverse()
  : [];

// ---------------------------------------------------------------------------
// 2. スライドのメタ情報を収集
// ---------------------------------------------------------------------------

/** `key: value` 行の並びをパースする（YAML frontmatter / HTML コメントメタ共用） */
function parseMetaLines(block: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of block.split(/\r?\n/)) {
    const kv = line.match(/^(\w[\w-]*):\s*(.+)$/);
    if (kv && kv[1] !== undefined && kv[2] !== undefined) {
      result[kv[1]] = kv[2].replace(/^['"]|['"]$/g, "").trim();
    }
  }
  return result;
}

/** 先頭の YAML front matter を素朴にパースする（title / description のみ使用） */
function parseFrontMatter(markdown: string): Record<string, string> {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return match && match[1] !== undefined ? parseMetaLines(match[1]) : {};
}

/** HTML ページ原稿の先頭コメントメタ（<!-- title: ... -->）をパースする */
function parseHtmlMeta(html: string): Record<string, string> {
  const match = html.match(/^(?:<!doctype[^>]*>\s*)?<!--\r?\n([\s\S]*?)\r?\n-->/i);
  return match && match[1] !== undefined ? parseMetaLines(match[1]) : {};
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
    author: fm["author"] ?? DEFAULT_AUTHOR_ID,
  };
});

/** src/content/authors/<id>.md の frontmatter から OGP 用の著者情報を読む */
function loadAuthor(id: string): Author {
  const authorPath = path.join(ROOT, "src", "content", "authors", `${id}.md`);
  if (!fs.existsSync(authorPath)) {
    throw new Error(`著者 ID "${id}" が src/content/authors/ に見つかりません`);
  }
  const fm = parseFrontMatter(fs.readFileSync(authorPath, "utf8"));
  const image = fm["blogImage"] ?? fm["image"];
  if (!fm["name"] || !fm["role"] || !image) {
    throw new Error(`src/content/authors/${id}.md に name / role / image が必要です`);
  }
  return {
    name: fm["name"],
    role: fm["role"],
    imagePath: path.join(ROOT, "src", "assets", "images", "authors", image),
  };
}

// ---------------------------------------------------------------------------
// 3. ビューワー連携スクリプト（HTML 版へ注入）
// ---------------------------------------------------------------------------

/**
 * Marp HTML へ注入するビューワー連携 + 閲覧数カウンターのスクリプト。
 * Marp の HTML はバンドラを通らないためインラインで持つ。
 *
 * - 直接アクセス時（非埋め込み）: セッション初回のみ POST /api/views/:deck で +1
 *   （src/lib/blog-views.ts の記事側と同じ水増し抑止。キー接頭辞も合わせる）
 * - ビューワー（/slides/<deck>/ の iframe）埋め込み時:
 *   - デッキ内蔵の OSD（ページ送り UI）を隠し、操作はビューワー側のバーに任せる
 *   - ページ状態（page / total）を postMessage で親へ通知（bespoke の active クラスを監視）
 *   - 最終ページで「次へ」の入力がもう一度来たら finished を通知（エンドカード表示用）
 *   - ホイール操作はページ送りにせず、親ページの通常スクロールへ転送
 *   - 親からの prev / next / goto メッセージでページを動かす
 *   - 閲覧数はビューワー側（trackArticleView）が計測するため、ここでは POST しない
 */
function viewerBridgeScript(base: string): string {
  return `<script>/* ZENSHIN ビューワー連携 + 閲覧数カウンター（scripts/build-slides.ts が注入） */
(function () {
  var BASE = ${JSON.stringify(base)};
  var ORIGIN = location.origin;
  var embedded = window.self !== window.top;

  if (!embedded) {
    if (!/^https?:$/.test(location.protocol)) return;
    try {
      var key = "blog-viewed:" + BASE;
      if (sessionStorage.getItem(key) === "1") return;
      fetch("/api/views/" + BASE, { method: "POST" }).then(function (res) {
        if (res.ok) sessionStorage.setItem(key, "1");
      }).catch(function () {});
    } catch (e) {}
    return;
  }

  var style = document.createElement("style");
  style.textContent = ".bespoke-marp-osc{display:none!important}";
  document.head.appendChild(style);

  var slides = [];
  function activeIndex() {
    for (var i = 0; i < slides.length; i++) {
      if (slides[i].classList.contains("bespoke-marp-active")) return i;
    }
    return 0;
  }
  var lastSent = 0;
  function send() {
    var page = activeIndex() + 1;
    if (page === lastSent) return;
    lastSent = page;
    parent.postMessage({ type: "zenshin-deck-state", page: page, total: slides.length }, ORIGIN);
  }
  function isAtEnd() {
    return slides.length > 0 && activeIndex() === slides.length - 1;
  }
  function finish() {
    parent.postMessage({ type: "zenshin-deck-finished" }, ORIGIN);
  }

  // Marp 標準のホイールページ送りを止め、スライド上でも親ページを通常どおり
  // 縦スクロールできるようにする。Ctrl + ホイールのブラウザズームは奪わない。
  document.addEventListener("wheel", function (e) {
    if (e.ctrlKey) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    parent.postMessage({
      type: "zenshin-deck-wheel",
      deltaY: e.deltaY,
      deltaMode: e.deltaMode
    }, ORIGIN);
  }, { capture: true, passive: false });

  // 最終ページで「次へ」の入力がもう一度来たらエンドカードを出す（SpeakerDeck 風）。
  // capture で見るだけで止めない（bespoke 側では最終ページの次送りは no-op）。
  // ただし Escape / f は bespoke の機能（オーバービュー・OS 全画面）を奪って
  // ビューワー側の操作（シアターモード解除・切替）に割り当て直す
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      // オーバービュー表示中だけは bespoke に任せて閉じさせる
      if (document.body.getAttribute("data-bespoke-view") === "overview") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      parent.postMessage({ type: "zenshin-deck-escape" }, ORIGIN);
      return;
    }
    if ((e.key === "f" || e.key === "F") && !e.metaKey && !e.ctrlKey && !e.altKey) {
      // OS の全画面（画面を奪う）ではなくブラウザ内シアターモードの切替にする
      e.preventDefault();
      e.stopImmediatePropagation();
      parent.postMessage({ type: "zenshin-deck-theater-toggle" }, ORIGIN);
      return;
    }
    if (!isAtEnd()) return;
    if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "PageDown" || (e.key === " " && !e.shiftKey)) {
      finish();
    }
  }, true);
  var touchX = null;
  document.addEventListener("touchstart", function (e) {
    touchX = e.changedTouches[0].screenX;
  }, { passive: true });
  document.addEventListener("touchend", function (e) {
    if (touchX === null) return;
    var dx = e.changedTouches[0].screenX - touchX;
    touchX = null;
    if (dx < -40 && isAtEnd()) finish();
  }, { passive: true });

  // ビューワーからの操作（bespoke のキーボード操作を合成して流用する。
  // goto は location.hash だと現在ページとの組み合わせで反応しないことがあるため、
  // 差分ぶんの前後キー送出で確実に移動させる）
  function dispatchKey(key) {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: key, bubbles: true }));
  }
  window.addEventListener("message", function (e) {
    if (e.origin !== ORIGIN || !e.data || typeof e.data !== "object") return;
    if (e.data.type === "zenshin-deck-nav") {
      dispatchKey(e.data.dir === "prev" ? "ArrowLeft" : "ArrowRight");
    } else if (e.data.type === "zenshin-deck-goto" && typeof e.data.page === "number") {
      var target = Math.max(1, Math.min(slides.length, Math.round(e.data.page)));
      var diff = target - (activeIndex() + 1);
      var key = diff > 0 ? "ArrowRight" : "ArrowLeft";
      for (var i = 0; i < Math.abs(diff); i++) dispatchKey(key);
    }
  });

  function start() {
    slides = Array.prototype.slice.call(document.querySelectorAll("svg[data-marpit-svg]"));
    lastSent = 0;
    send();
    var observer = new MutationObserver(send);
    for (var i = 0; i < slides.length; i++) {
      observer.observe(slides[i], { attributes: true, attributeFilter: ["class"] });
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
</script>`;
}

// ---------------------------------------------------------------------------
// 4. Marp ビルド + OGP 画像生成
// ---------------------------------------------------------------------------

// タイトルの幅検証（OGP で自動改行が発生しない長さかをブログと同じ基準でチェック）と
// タグ数の検証（ブログと同じく 5〜6 個必須）
for (const deck of decks) {
  const error = validateTitleWidth(deck.title);
  if (error) {
    console.error(`slides/${deck.base}.md: ${error}`);
    process.exit(1);
  }
  if (deck.tags.length < 5 || deck.tags.length > 6) {
    console.error(`slides/${deck.base}.md: tags は 5〜6 個必須です（現在 ${deck.tags.length} 個）`);
    process.exit(1);
  }
  // 表紙の著者表記と frontmatter の author がずれていないかを検証する
  const author = loadAuthor(deck.author);
  const markdown = fs.readFileSync(path.join(SLIDES_DIR, `${deck.base}.md`), "utf8");
  if (!markdown.includes(`cover-author">${author.name}`)) {
    console.error(
      `slides/${deck.base}.md: 表紙の cover-author が著者 "${deck.author}"（${author.name}）と一致しません。` +
        `frontmatter の author と <div class="cover-author"> をそろえてください`,
    );
    process.exit(1);
  }
}

if (decks.length > 0) {
  // OGP 画像（1200x630）をデッキごとに生成する。ブランド意匠は zenshin-hp の技術ブログ OGP と統一
  console.log("Building OG images...");
  for (const deck of decks) {
    const png = await renderOgImage({
      label: "スライド資料 | 株式会社ZENSHIN",
      title: deck.title,
      author: loadAuthor(deck.author),
      date: deck.date ? deck.date.replaceAll("-", ".") : undefined,
    });
    fs.writeFileSync(path.join(PUBLIC, "slides", `${deck.base}-og.png`), png);
  }

  // PDF・サムネイルは元の md から一括変換（marp-cli が並列処理する）。
  // HTML より先に変換することで、HTML 専用の一時 md（関連コンテンツページ付き）が混ざらない
  console.log("Building PDF...");
  await marp(["--input-dir", "slides", "-o", "public/slides", ...MARP_COMMON_ARGS, "--pdf"]);
  console.log("Building thumbnails...");
  await marp(["--input-dir", "slides", "-o", "public/slides", ...MARP_COMMON_ARGS, "--image", "png", "--image-scale", "1"]);

  // HTML はデッキごとに変換し、OGP メタ（og:title / og:description / og:image / og:url）を注入する。
  // 共有・検索の正規 URL はビューワーページ（/slides/<デッキ>/）に寄せ、
  // 変換後の HTML へ canonical とビューワー連携スクリプトを注入する
  console.log("Building HTML...");
  for (const deck of decks) {
    const outPath = path.join("public", "slides", `${deck.base}.html`);
    const viewerUrl = `${SITE_ORIGIN}/slides/${deck.base}/`;
    await marp([
      path.join("slides", `${deck.base}.md`),
      "-o",
      outPath,
      ...MARP_COMMON_ARGS,
      "--title",
      deck.title,
      ...(deck.description ? ["--description", deck.description] : []),
      "--url",
      viewerUrl,
      "--og-image",
      `${SITE_ORIGIN}/slides/${deck.base}-og.png`,
    ]);

    const html = fs.readFileSync(outPath, "utf8");
    if (!html.includes("</head>") || !html.includes("</body>")) {
      throw new Error(`${outPath}: </head> / </body> が見つからずビューワー連携を注入できません`);
    }
    fs.writeFileSync(
      outPath,
      html
        .replace("</head>", `<link rel="canonical" href="${viewerUrl}"></head>`)
        .replace("</body>", `${viewerBridgeScript(deck.base)}</body>`),
    );
  }
}

// ---------------------------------------------------------------------------
// 5. HTML ページ（htmls/*.html）のビルド
// ---------------------------------------------------------------------------

interface HtmlPage {
  base: string;
  title: string;
  description: string;
  date: string;
  tags: string[];
  /** src/content/authors/ のコレクション ID */
  author: string;
}

/** OGP メタ等の属性値用エスケープ */
function escapeAttr(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * HTML ページへ注入するビューワー連携 + 閲覧数カウンターのスクリプト。
 * 原稿は self-contained な単一 HTML でバンドラを通らないためインラインで持つ。
 *
 * - 直接アクセス時（非埋め込み）: セッション初回のみ POST /api/views/:base で +1
 *   （スライド・記事と同じ水増し抑止。キー接頭辞も合わせる）
 * - ビューワー（/htmls/<base>/ の iframe）埋め込み時:
 *   - 本文の高さを postMessage で親へ通知し、親が iframe の高さを合わせる
 *     （iframe 内スクロールを作らず、ページ全体を親のスクロールで読ませる）
 *   - 外部リンクは iframe 内で開かず新しいタブで開く
 *   - ページ内アンカーは親側のスクロールへ変換する（iframe は全高なので自身では動けない）
 *   - 閲覧数はビューワー側（trackArticleView）が計測するため、ここでは POST しない
 */
function htmlBridgeScript(base: string): string {
  return `<script>/* ZENSHIN ビューワー連携 + 閲覧数カウンター（scripts/build-slides.ts が注入） */
(function () {
  var BASE = ${JSON.stringify(base)};
  var ORIGIN = location.origin;
  var embedded = window.self !== window.top;

  if (!embedded) {
    if (!/^https?:$/.test(location.protocol)) return;
    try {
      var key = "blog-viewed:" + BASE;
      if (sessionStorage.getItem(key) === "1") return;
      fetch("/api/views/" + BASE, { method: "POST" }).then(function (res) {
        if (res.ok) sessionStorage.setItem(key, "1");
      }).catch(function () {});
    } catch (e) {}
    return;
  }

  var lastHeight = 0;
  function send() {
    // scrollHeight は iframe のビューポート高でクランプされ、親が iframe を
    // 大きくすると追随して戻らなくなる（ラチェット）。レイアウト上の実コンテンツ高
    // （html 要素のボックス高）を使い、縮む方向にも追随させる
    var height = Math.ceil(document.documentElement.getBoundingClientRect().height);
    if (Math.abs(height - lastHeight) < 2) return;
    lastHeight = height;
    parent.postMessage({ type: "zenshin-html-height", height: height }, ORIGIN);
  }
  if (typeof ResizeObserver === "function") {
    var observer = new ResizeObserver(send);
    observer.observe(document.documentElement);
    if (document.body) observer.observe(document.body);
  }
  window.addEventListener("load", send);
  send();

  document.addEventListener("click", function (e) {
    var target = e.target instanceof Element ? e.target.closest("a[href]") : null;
    if (!target) return;
    var url = new URL(target.getAttribute("href"), location.href);
    if (url.origin !== ORIGIN) {
      // 外部リンクは iframe の中で遷移させない
      target.target = "_blank";
      target.rel = "noopener noreferrer";
      return;
    }
    if (url.pathname === location.pathname && url.hash) {
      // ページ内アンカー — iframe は全高で自分ではスクロールできないため親に頼む
      var dest = document.getElementById(decodeURIComponent(url.hash.slice(1)));
      if (dest) {
        e.preventDefault();
        parent.postMessage({
          type: "zenshin-html-scroll",
          top: dest.getBoundingClientRect().top + window.scrollY
        }, ORIGIN);
      }
    }
  }, true);
})();
</script>`;
}

const htmlFiles = fs.existsSync(HTMLS_DIR)
  ? fs
      .readdirSync(HTMLS_DIR)
      .filter((f) => f.endsWith(".html") && !f.startsWith("."))
      .sort()
      .reverse()
  : [];

const htmlPages: HtmlPage[] = htmlFiles.map((file) => {
  const base = file.replace(/\.html$/, "");
  const html = fs.readFileSync(path.join(HTMLS_DIR, file), "utf8");
  const meta = parseHtmlMeta(html);
  const dateMatch = base.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return {
    base,
    title: meta["title"] ?? "",
    description: meta["description"] ?? "",
    date: dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : "",
    tags: parseTags(meta["tags"]),
    author: meta["author"] ?? DEFAULT_AUTHOR_ID,
  };
});

// メタ検証（スライドと同じ基準: title 幅・タグ 5〜6 個・著者の実在。加えて日付プレフィックス必須）
for (const page of htmlPages) {
  const fail = (message: string): never => {
    console.error(`htmls/${page.base}.html: ${message}`);
    return process.exit(1);
  };
  if (!page.date) fail("ファイル名は YYYY-MM-DD-<slug>.html 形式にしてください");
  if (!page.title) fail("先頭の HTML コメントメタに title が必要です（<!--\\ntitle: ...\\n-->）");
  if (!page.description) fail("先頭の HTML コメントメタに description が必要です");
  const error = validateTitleWidth(page.title);
  if (error) fail(error);
  if (page.tags.length < 5 || page.tags.length > 6) {
    fail(`tags は 5〜6 個必須です（現在 ${page.tags.length} 個）`);
  }
  loadAuthor(page.author); // 実在しない著者 ID はここで throw する
}

if (htmlPages.length > 0) {
  console.log("Building HTML page OG images...");
  for (const page of htmlPages) {
    const png = await renderOgImage({
      label: "HTML資料 | 株式会社ZENSHIN",
      title: page.title,
      author: loadAuthor(page.author),
      date: page.date.replaceAll("-", "."),
    });
    fs.writeFileSync(path.join(PUBLIC, "htmls", `${page.base}-og.png`), png);
  }

  // OGP メタ（正規 URL はビューワーページ）+ ビューワー連携スクリプトを注入して public へ出力
  console.log("Building HTML pages...");
  for (const page of htmlPages) {
    const sourcePath = path.join(HTMLS_DIR, `${page.base}.html`);
    const outPath = path.join(PUBLIC, "htmls", `${page.base}.html`);
    const viewerUrl = `${SITE_ORIGIN}/htmls/${page.base}/`;
    const html = fs.readFileSync(sourcePath, "utf8");
    if (!html.includes("</head>") || !html.includes("</body>")) {
      throw new Error(`htmls/${page.base}.html: </head> / </body> が見つからずビューワー連携を注入できません`);
    }
    if (!/<title[\s>]/i.test(html)) {
      throw new Error(`htmls/${page.base}.html: <title> がありません（原稿の <head> に入れてください）`);
    }
    const headExtra = [
      `<link rel="canonical" href="${viewerUrl}">`,
      `<meta property="og:type" content="article">`,
      `<meta property="og:title" content="${escapeAttr(page.title)}">`,
      ...(page.description
        ? [`<meta property="og:description" content="${escapeAttr(page.description)}">`]
        : []),
      `<meta property="og:url" content="${viewerUrl}">`,
      `<meta property="og:image" content="${SITE_ORIGIN}/htmls/${page.base}-og.png">`,
      `<meta name="twitter:card" content="summary_large_image">`,
    ].join("");
    fs.writeFileSync(
      outPath,
      html
        .replace("</head>", `${headExtra}</head>`)
        .replace("</body>", `${htmlBridgeScript(page.base)}</body>`),
    );
  }

  // サムネイル（1280x720 の先頭ビュー。スライドのサムネと同アスペクト）。
  // ルート相対参照（/gallery/... 等）を解決するため、public/ を一時 HTTP サーバで配信して撮る
  console.log("Building HTML page thumbnails...");
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const pathname = decodeURIComponent(new URL(request.url).pathname);
      const filePath = path.join(PUBLIC, path.normalize(pathname).replace(/^([/\\])+/, ""));
      if (!filePath.startsWith(PUBLIC)) return new Response("Forbidden", { status: 403 });
      const bunFile = Bun.file(filePath);
      return (await bunFile.exists()) ? new Response(bunFile) : new Response("Not Found", { status: 404 });
    },
  });
  const executablePath = process.env["PUPPETEER_EXECUTABLE_PATH"];
  const browser = await puppeteer.launch(
    executablePath ? { executablePath } : { channel: "chrome" },
  );
  try {
    const browserPage = await browser.newPage();
    await browserPage.setViewport({ width: 1280, height: 720 });
    for (const page of htmlPages) {
      const url = `http://localhost:${server.port}/htmls/${page.base}.html`;
      await browserPage.goto(url, { waitUntil: "networkidle0", timeout: 15000 }).catch(() => {});
      await browserPage.evaluate("document.fonts ? document.fonts.ready : null").catch(() => {});
      await browserPage.screenshot({ path: path.join(PUBLIC, "htmls", `${page.base}.png`) });
    }
  } finally {
    await browser.close();
    server.stop(true);
  }
}

// ---------------------------------------------------------------------------
// 6. ギャラリーのコピーと画像収集
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
// 7. メタ情報を src/data/ へ出力（Astro 側のデータソース）
// ---------------------------------------------------------------------------

const slidesData = decks.map((d) => ({
  id: d.base,
  title: d.title,
  description: d.description,
  date: d.date,
  tags: d.tags,
  author: d.author,
  urls: {
    // page はビューワーページ（SpeakerDeck 風の額縁 + エンドカード）。
    // Marp が生成する素の HTML は /slides/<id>.html で、ビューワーが iframe で埋め込む
    page: `/slides/${d.base}/`,
    pdf: `/slides/${d.base}.pdf`,
    thumbnail: `/slides/${d.base}.png`,
    ogImage: `/slides/${d.base}-og.png`,
  },
}));
fs.writeFileSync(path.join(DATA_DIR, "slides.json"), `${JSON.stringify(slidesData, null, 2)}\n`);

const htmlsData = htmlPages.map((p) => ({
  id: p.base,
  title: p.title,
  description: p.description,
  date: p.date,
  tags: p.tags,
  author: p.author,
  urls: {
    // page はビューワーページ（サイトの額縁 + 関連コンテンツ）。
    // 原稿由来の素の HTML は /htmls/<id>.html で、ビューワーが iframe で埋め込む
    page: `/htmls/${p.base}/`,
    html: `/htmls/${p.base}.html`,
    thumbnail: `/htmls/${p.base}.png`,
    ogImage: `/htmls/${p.base}-og.png`,
  },
}));
fs.writeFileSync(path.join(DATA_DIR, "htmls.json"), `${JSON.stringify(htmlsData, null, 2)}\n`);

console.log(
  `Done: ${decks.length} deck(s), ${htmlPages.length} html page(s), ${galleryGroups.length} gallery group(s) -> public/ + src/data/`,
);

// marp-cli の Node API が Chrome まわりのハンドルを残すことがあり、全処理後も
// プロセスが終了せず CI が timeout-minutes まで待ち続ける（ローカル・Actions 双方で観測）。
// 成果物は出力済みなので明示的に終了する
process.exit(0);
