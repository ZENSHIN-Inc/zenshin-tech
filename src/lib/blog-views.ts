/**
 * ブログ閲覧数カウンターのクライアント側ロジック（zenshin-hp から移植）。
 *
 * .astro の <script> からはこのモジュールの関数を呼ぶだけにして、ロジックは
 * すべて型付き .ts に集約する（tsconfig の include 対象なので astro check で
 * 型検査される）。サーバ側は functions/api/views/[slug].ts。
 */
import { ROUTES } from "@/consts/routes";

/** GET/POST /api/views/:slug のレスポンス（functions/api/views/[slug].ts と同形） */
interface ViewCountResponse {
  slug: string;
  count: number;
}

function isViewCountResponse(value: unknown): value is ViewCountResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).count === "number"
  );
}

async function fetchViewCount(
  slug: string,
  method: "GET" | "POST"
): Promise<number | null> {
  try {
    const res = await fetch(ROUTES.apiBlogViews(slug), { method });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    return isViewCountResponse(data) ? data.count : null;
  } catch {
    // API 不在（astro dev / preview 等）・ネットワーク失敗時はカウンターを出さない
    return null;
  }
}

function showCount(
  el: HTMLElement,
  valueSelector: string,
  count: number
): void {
  const valueEl = el.querySelector(valueSelector);
  if (valueEl) valueEl.textContent = count.toLocaleString("ja-JP");
  el.hidden = false;
}

/**
 * 一覧カードの閲覧数を読み取り専用で埋める（ArticleCard の <script> から呼ぶ）。
 * Astro はコンポーネント <script> をページ単位で 1 回だけバンドルするため、
 * カード枚数によらずこの処理は 1 回走り、全カードをまとめて更新する。
 */
export function hydrateListViewCounts(): void {
  document
    .querySelectorAll<HTMLElement>("[data-view-count][data-view-slug]")
    .forEach(async (el) => {
      const slug = el.dataset.viewSlug;
      if (!slug) return;
      const count = await fetchViewCount(slug, "GET");
      if (count !== null) showCount(el, "[data-view-count-value]", count);
    });
}

/**
 * 記事詳細の閲覧数。初回（このタブ・このセッションで未閲覧）は POST で +1、
 * 2 回目以降は GET で読むだけ（リロードによる水増しを抑止）。
 */
export function trackArticleView(): void {
  const el = document.querySelector<HTMLElement>(
    "[data-article-views][data-view-slug]"
  );
  const slug = el?.dataset.viewSlug;
  if (!el || !slug) return;

  const sessionKey = `blog-viewed:${slug}`;
  const counted = sessionStorage.getItem(sessionKey) === "1";

  fetchViewCount(slug, counted ? "GET" : "POST").then((count) => {
    if (count === null) return;
    if (!counted) sessionStorage.setItem(sessionKey, "1");
    showCount(el, "[data-article-views-value]", count);
  });
}
