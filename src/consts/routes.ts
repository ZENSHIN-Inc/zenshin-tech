/**
 * サイト内ルート定義（zenshin-hp の routes.ts と同じ思想）
 *
 * 全ての内部リンクはここから参照する。パスを変更するときは
 * このファイル 1 箇所だけを編集すれば、全参照箇所が連動して更新される。
 */
export const ROUTES = {
  home: "/",
  rss: "/rss.xml",

  // 外部（コーポレートサイト）
  // ヘッダー・フッターを zenshin-hp と同一ナビ構成にしているため、
  // パスの実体は zenshin-hp の src/consts/routes.ts と対応する
  // https://github.com/ZENSHIN-Inc/zenshin-hp/blob/main/src/consts/routes.ts
  corporate: "https://www.zenshin-inc.co.jp/",
  corporateServices: "https://www.zenshin-inc.co.jp/services/",
  corporateAiConsultation:
    "https://www.zenshin-inc.co.jp/services/ai-consultation/",
  corporateBusinessTransformationConsulting:
    "https://www.zenshin-inc.co.jp/services/business-transformation-consulting/",
  corporateWorks: "https://www.zenshin-inc.co.jp/works/",
  corporateCompany: "https://www.zenshin-inc.co.jp/company/",
  corporateNews: "https://www.zenshin-inc.co.jp/news/",
  corporateRecruit: "https://www.zenshin-inc.co.jp/recruit/",
  corporateContact: "https://www.zenshin-inc.co.jp/contact/?type=tech-blog",
  corporatePrivacy: "https://www.zenshin-inc.co.jp/privacy/",
  operatorX: "https://x.com/suguru_takaha4",

  // 動的ルート
  blogPost: (slug: string) => `/blog/${slug}/` as const,
  // スライドのビューワーページ（SpeakerDeck 風）と、iframe で埋め込む Marp 生成 HTML
  slideView: (id: string) => `/slides/${id}/` as const,
  slideEmbed: (id: string) => `/slides/${id}.html` as const,
  // HTML ページのビューワーページと、iframe で埋め込む素の HTML（htmls/ 配下の原稿由来）
  htmlView: (id: string) => `/htmls/${id}/` as const,
  htmlEmbed: (id: string) => `/htmls/${id}.html` as const,
  // タグ・月別の絞り込みは専用 URL を切らず、トップのクエリパラメータで表現する
  tag: (tag: string) => `/?tag=${encodeURIComponent(tag)}` as const,
  archive: (yearMonth: string) => `/?month=${yearMonth}` as const,

  // OGP 画像 (1200x630 PNG)
  ogImageBlog: (slug: string) => `/og/blog/${slug}.png` as const,
  ogImageSite: "/og/site.png",

  // Pages Functions API エンドポイント（ページではないため sitemap 非対象）。
  // slug はブログ記事の slug またはスライドのデッキ slug（YYYY-MM-DD-<slug>）
  apiViews: (slug: string) =>
    `/api/views/${encodeURIComponent(slug)}` as const,
} as const;
