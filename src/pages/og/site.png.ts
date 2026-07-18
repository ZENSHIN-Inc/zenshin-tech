/**
 * サイト全体のデフォルト OGP 画像（トップ・一覧ページなど個別 OGP を持たないページ用）。
 * 出力先: dist/og/site.png
 */
import type { APIRoute } from "astro";
import { renderOgImage } from "@/lib/og-image";

export const GET: APIRoute = async () => {
  const png = await renderOgImage({
    label: "株式会社ZENSHIN",
    title: "ZENSHIN 技術ブログ",
  });

  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png" },
  });
};
