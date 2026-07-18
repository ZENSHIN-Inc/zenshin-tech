/**
 * RSS フィード（/rss.xml）— ブログ記事とスライドを日付降順でマージして配信する
 */
import rss from "@astrojs/rss";
import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { filterPublished } from "@/lib/drafts";
import { ROUTES } from "@/consts/routes";

export const GET: APIRoute = async (context) => {
  const posts = filterPublished(await getCollection("blog"));
  const slides = await getCollection("slides");

  const items = [
    ...posts.map((p) => ({
      title: p.data.title,
      description: p.data.description,
      pubDate: p.data.date,
      link: ROUTES.blogPost(p.data.slug),
      categories: p.data.tags,
    })),
    ...slides.map((s) => ({
      title: `[スライド] ${s.data.title}`,
      description: s.data.description,
      pubDate: s.data.date,
      link: s.data.urls.page,
    })),
  ].sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

  return rss({
    title: "ZENSHIN Tech",
    description: "AI活用やプロダクト開発の技術知見をブログやスライド資料で発信する、株式会社ZENSHINの技術メディア",
    site: context.site ?? "https://tech.zenshin-inc.co.jp",
    items,
    customData: "<language>ja</language>",
  });
};
