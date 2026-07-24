/**
 * コンテンツメタデータのフィード（/index.json）
 *
 * zenshin-hp が Astro Content Layer のローダー（slides-loader）からビルド時に fetch する。
 * decks のスキーマ（v1）は zenshin-hp 側のローダーと合意済みのため、
 * 変更する場合は両リポジトリで version を上げて合わせる（README 参照）。
 * posts はブログ移設に伴う追加フィールド、htmls は HTML ページ追加に伴う
 * 追加フィールド（いずれも additive なので v1 のまま）。
 */
import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { filterPublished } from "@/lib/drafts";
import { ROUTES } from "@/consts/routes";
import { getHtmls } from "@/lib/htmls";

export const GET: APIRoute = async ({ site }) => {
  const origin = site?.toString().replace(/\/$/, "") ?? "";
  const abs = (path: string) => `${origin}${path}`;

  const slides = (await getCollection("slides")).sort(
    (a, b) => b.data.date.getTime() - a.data.date.getTime()
  );
  const posts = filterPublished(await getCollection("blog")).sort(
    (a, b) => b.data.date.getTime() - a.data.date.getTime()
  );
  const htmls = (await getHtmls()).sort(
    (a, b) => b.data.date.getTime() - a.data.date.getTime()
  );

  const toDateString = (date: Date) => date.toISOString().slice(0, 10);

  const feed = {
    version: 1,
    site: origin,
    generatedAt: new Date().toISOString(),
    decks: slides.map((s) => ({
      slug: s.id,
      title: s.data.title,
      description: s.data.description,
      date: toDateString(s.data.date),
      tags: s.data.tags,
      author: s.data.author.id,
      urls: {
        page: abs(s.data.urls.page),
        pdf: abs(s.data.urls.pdf),
        thumbnail: abs(s.data.urls.thumbnail),
        ogImage: abs(s.data.urls.ogImage),
      },
    })),
    posts: posts.map((p) => ({
      slug: p.data.slug,
      title: p.data.title,
      description: p.data.description,
      date: toDateString(p.data.date),
      tags: p.data.tags,
      author: p.data.author.id,
      urls: {
        page: abs(ROUTES.blogPost(p.data.slug)),
        ogImage: abs(ROUTES.ogImageBlog(p.data.slug)),
      },
    })),
    htmls: htmls.map((h) => ({
      slug: h.id,
      title: h.data.title,
      description: h.data.description,
      date: toDateString(h.data.date),
      tags: h.data.tags,
      author: h.data.author.id,
      urls: {
        page: abs(h.data.urls.page),
        html: abs(h.data.urls.html),
        thumbnail: abs(h.data.urls.thumbnail),
        ogImage: abs(h.data.urls.ogImage),
      },
    })),
  };

  return new Response(`${JSON.stringify(feed, null, 2)}\n`, {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
};
