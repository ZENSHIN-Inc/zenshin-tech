/**
 * ブログ閲覧数カウンター API（Cloudflare Pages Functions）
 *
 *   GET  /api/views/:slug  → 現在の閲覧数を返す（インクリメントしない）
 *   POST /api/views/:slug  → 閲覧数を +1 して返す（記事を開いたとき）
 *
 * zenshin-hp から技術ブログ移設（zenshin-hp#251）に伴い移植。
 * 保存先は Workers KV（binding `BLOG_VIEWS`、wrangler.toml）。namespace は
 * zenshin-infra の Terraform 管理（terraform/cloudflare/zenshin-tech.tf）。
 *
 * 型は `wrangler types` 生成の worker-configuration.d.ts に乗る:
 *   - `Env` は wrangler.toml の [[kv_namespaces]] から自動生成（BLOG_VIEWS: KVNamespace）
 *   - `PagesFunction<Env>` でハンドラの context（env / params / request）が型付く
 * 手書きの interface は持たない。
 *
 * KV にはアトミックなインクリメントが無く read→+1→put の競合で取りこぼし得るが、
 * 技術ブログの規模では許容（素朴実装 + 計測の方針）。厳密なカウントが
 * 必要になったら Durable Objects への差し替えを検討する。
 */

const jsonHeaders = {
  "Content-Type": "application/json",
  // 数字は常に最新を返す。エッジ/ブラウザにキャッシュさせない
  "Cache-Control": "no-store",
};

// KV キーへ任意文字列が書かれるのを防ぐ。ブログ slug は
// 例: first-blog-post（英小文字・数字・ハイフンのみ）
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,80}$/;

function keyFor(slug: string): string {
  return `views:${slug}`;
}

function parseCount(raw: string | null): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function paramSlug(slug: string | string[]): string {
  return Array.isArray(slug) ? (slug[0] ?? "") : slug;
}

// 閲覧数の水増し（他サイトからの cross-origin POST）対策。
// Origin は scheme+host+port のみ（path 無し）なので完全一致で判定する
// （startsWith だと tech.zenshin-inc.co.jp.evil.com 等を誤許可するため使わない）。
function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true; // same-origin fetch は Origin を付けないことがある
  // ローカル開発（astro dev: 4321 / wrangler pages dev: 8788 等、ポート不問）
  if (
    origin.startsWith("http://localhost:") ||
    origin.startsWith("http://127.0.0.1:")
  ) {
    return true;
  }
  const allowed = [
    "https://tech.zenshin-inc.co.jp",
    "https://zenshin-tech.pages.dev",
  ];
  return allowed.includes(origin) || origin.endsWith(".zenshin-tech.pages.dev");
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const slug = paramSlug(context.params.slug);
  if (!SLUG_PATTERN.test(slug)) {
    return jsonResponse({ error: "不正な slug です" }, 400);
  }
  try {
    const count = parseCount(await context.env.BLOG_VIEWS.get(keyFor(slug)));
    return jsonResponse({ slug, count });
  } catch {
    return jsonResponse({ error: "閲覧数の取得に失敗しました" }, 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  if (!isAllowedOrigin(context.request.headers.get("origin"))) {
    return jsonResponse({ error: "不正なリクエストです" }, 403);
  }

  const slug = paramSlug(context.params.slug);
  if (!SLUG_PATTERN.test(slug)) {
    return jsonResponse({ error: "不正な slug です" }, 400);
  }

  try {
    const key = keyFor(slug);
    const count = parseCount(await context.env.BLOG_VIEWS.get(key)) + 1;
    await context.env.BLOG_VIEWS.put(key, String(count));
    return jsonResponse({ slug, count });
  } catch {
    return jsonResponse({ error: "閲覧数の更新に失敗しました" }, 500);
  }
};
