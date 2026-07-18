/**
 * ブログ記事ごとの OGP 画像を静的ビルド時に生成する。
 *
 * 出力先: dist/og/blog/<slug>.png
 * レンダリングロジックは src/lib/og-image.ts に集約している
 * （zenshin-hp の技術ブログ OGP と同意匠。スライド OGP も同じモジュールを使う）。
 */
import type { APIRoute, GetStaticPaths } from "astro";
import type { CollectionEntry } from "astro:content";
import { getCollection, getEntry } from "astro:content";
import { resolve } from "node:path";
import { renderOgImage } from "@/lib/og-image";
import { filterPublished } from "@/lib/drafts";

type Props = { post: CollectionEntry<"blog"> };

export const getStaticPaths: GetStaticPaths = async () => {
  const posts = filterPublished(await getCollection("blog"));
  return posts.map((post) => ({
    params: { slug: post.data.slug },
    props: { post } satisfies Props,
  }));
};

export const GET: APIRoute<Props> = async ({ props }) => {
  const author = await resolveAuthor(props.post.data.author.id);
  const d = props.post.data.date;
  const date = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;

  const png = await renderOgImage({
    label: "技術ブログ | 株式会社ZENSHIN",
    title: props.post.data.title,
    author,
    date,
  });

  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png" },
  });
};

async function resolveAuthor(authorId: string) {
  const author = await getEntry("authors", authorId);
  if (!author) {
    throw new Error(`Author not found: ${authorId}`);
  }
  // ブログ著者用画像は blogImage を優先し、無ければ通常の image にフォールバック
  const imageName = author.data.blogImage ?? author.data.image;
  if (!imageName) {
    throw new Error(`Author "${authorId}" has no image`);
  }
  return {
    name: author.data.name,
    role: author.data.role,
    imagePath: resolve(`src/assets/images/authors/${imageName}`),
  };
}
