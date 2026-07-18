/**
 * ブログ記事とスライドを「コンテンツアイテム」に正規化する共通ロジック。
 * トップ・タグページ・月別アーカイブ・サイドバー集計が同じ形で扱う。
 *
 * カードのサムネはブログ・スライドとも OGP 画像（ゴールド枠 + 著者アイコン + 制作日）で統一する。
 */
import { getCollection } from "astro:content";
import { ROUTES } from "@/consts/routes";
import { filterPublished } from "@/lib/drafts";

export interface ContentItem {
  contentType: "article" | "slide";
  href: string;
  ogImageSrc: string;
  title: string;
  description: string;
  tags: string[];
  date: Date;
  external: boolean;
  pdfHref?: string;
  isDraft?: boolean;
  /** ブログ記事の slug（閲覧数カウンター用。スライドは持たない） */
  slug?: string;
}

/** blog + slides を日付降順のコンテンツアイテム配列にして返す */
export async function loadContentItems(): Promise<ContentItem[]> {
  const posts = filterPublished(await getCollection("blog"));
  const slides = await getCollection("slides");

  const articleItems: ContentItem[] = posts.map((post) => ({
    contentType: "article",
    href: ROUTES.blogPost(post.data.slug),
    ogImageSrc: ROUTES.ogImageBlog(post.data.slug),
    title: post.data.title,
    description: post.data.description,
    tags: post.data.tags,
    date: post.data.date,
    external: false,
    isDraft: !post.data.published,
    slug: post.data.slug,
  }));

  // スライドも同一タブで開く（ブラウザバックで一覧に戻れるようにする）
  const slideItems: ContentItem[] = slides.map((slide) => ({
    contentType: "slide",
    href: slide.data.urls.page,
    ogImageSrc: slide.data.urls.ogImage,
    title: slide.data.title,
    description: slide.data.description,
    tags: slide.data.tags,
    date: slide.data.date,
    external: false,
    pdfHref: slide.data.urls.pdf,
  }));

  return [...articleItems, ...slideItems].sort((a, b) => b.date.getTime() - a.date.getTime());
}

/** date から "YYYY-MM" 形式の年月キーを返す（月別アーカイブ用） */
export function toYearMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
