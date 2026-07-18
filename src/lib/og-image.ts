/**
 * デッキごとの OGP 画像 (1200x630 PNG) を生成する共通モジュール
 *
 * zenshin-hp の src/lib/og-image.ts から移植（ブランド意匠を HP の技術ブログと統一）。
 * Satori で SVG を組み立て、sharp で PNG に変換する。
 *
 * 共通要素: 外周のゴールドグラデーション枠、ネイビー背景、
 * ゴールド色の左上ラベル、左下の著者アイコン + 氏名 + 役職（Zenn 風）、右下の ZENSHIN ロゴ
 */
import fs from "node:fs";
import path from "node:path";
import satori from "satori";
import sharp from "sharp";

// Astro のプリレンダーはこのモジュールを dist/ 配下へ再配置するため、
// import.meta.url 基準ではなく cwd（= リポジトリルートで実行される前提）で解決する。
// scripts/build-slides.ts も冒頭で process.chdir(ROOT) しているので同じ前提が成り立つ
const ROOT = process.cwd();

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

// zenshin-hp の @theme トークンと対応するカラー（dark バリアント）
const COLOR = {
  background: "#0c1220",
  foreground: "#f8fafc",
  muted: "#cbd5e1",
  gold: "#c4a97d",
} as const;

// 外周ゴールド枠の太さと角丸（zenshin-hp と同値。カードサムネ拡大時の見切れ対策で控えめ）
const BORDER_WIDTH = 24;
const INNER_RADIUS = 24;
const OUTER_RADIUS = INNER_RADIUS + BORDER_WIDTH;

export interface OgAuthor {
  name: string;
  /** 肩書き（例: "CTO / 技術責任者"）。氏名の直下に補助情報として表示 */
  role: string;
  /** 顔写真のファイルパス（JPEG/PNG/WebP いずれでも可） */
  imagePath: string;
}

export interface OgOptions {
  /** 左上に表示するブランドラベル（例: "スライド | 株式会社ZENSHIN"） */
  label: string;
  /** 中央に表示するタイトル */
  title: string;
  /** 左下に表示する著者情報（サイト全体 OGP など不要な場合は省略） */
  author?: OgAuthor;
  /** 右上に表示する制作日（例: "2026.04.17"）。省略時は非表示 */
  date?: string;
}

interface OgContext {
  fonts: Parameters<typeof satori>[1]["fonts"];
  logoDataUri: string;
}

// フォントとロゴは初回だけ読み込み、全デッキで使い回す
let contextPromise: Promise<OgContext> | undefined;

async function loadContext(): Promise<OgContext> {
  const notoDir = path.join(ROOT, "node_modules/@fontsource/noto-sans-jp/files");
  const read = (file: string) => fs.readFileSync(path.join(notoDir, file));
  const fonts: OgContext["fonts"] = [
    { name: "Noto Sans JP", data: read("noto-sans-jp-japanese-400-normal.woff"), weight: 400, style: "normal" },
    { name: "Noto Sans JP", data: read("noto-sans-jp-japanese-700-normal.woff"), weight: 700, style: "normal" },
    { name: "Noto Sans JP", data: read("noto-sans-jp-latin-400-normal.woff"), weight: 400, style: "normal" },
    { name: "Noto Sans JP", data: read("noto-sans-jp-latin-700-normal.woff"), weight: 700, style: "normal" },
  ];
  // Satori は WebP を埋め込めないため PNG に変換して data URI 化する
  const logoBuffer = await sharp(path.join(ROOT, "assets/brand/ZENSHIN-logo-white.webp")).png().toBuffer();
  return { fonts, logoDataUri: `data:image/png;base64,${logoBuffer.toString("base64")}` };
}

/** 画像ファイルを正方形 (cover fit) にリサイズして PNG の data URI に変換する */
async function toPngDataUri(absolutePath: string, size: number): Promise<string> {
  const buffer = await sharp(absolutePath).resize(size, size, { fit: "cover" }).png().toBuffer();
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

export async function renderOgImage({ label, title, author, date }: OgOptions): Promise<Buffer> {
  contextPromise ??= loadContext();
  const { fonts, logoDataUri } = await contextPromise;
  // OGP 表示サイズは 88px。Retina 2x + sharp の SVG パース上限の余裕をみて 200px でクロップ
  const authorImageDataUri = author ? await toPngDataUri(author.imagePath, 200) : null;

  // 下段左の著者ブロック（author 未指定なら右ロゴと高さを揃える空枠）
  const authorNode = author
    ? {
        type: "div",
        props: {
          style: { display: "flex", alignItems: "center", gap: "20px" },
          children: [
            {
              type: "img",
              props: {
                src: authorImageDataUri,
                width: 88,
                height: 88,
                style: {
                  width: "88px",
                  height: "88px",
                  borderRadius: "9999px",
                  objectFit: "cover",
                  border: `3px solid ${COLOR.gold}`,
                },
              },
            },
            {
              type: "div",
              props: {
                style: { display: "flex", flexDirection: "column", gap: "6px" },
                children: [
                  {
                    type: "div",
                    props: {
                      style: {
                        color: COLOR.foreground,
                        fontSize: "30px",
                        fontWeight: 700,
                        letterSpacing: "0.02em",
                        lineHeight: 1.1,
                      },
                      children: author.name,
                    },
                  },
                  {
                    type: "div",
                    props: {
                      style: {
                        color: COLOR.muted,
                        fontSize: "22px",
                        fontWeight: 400,
                        letterSpacing: "0.02em",
                        lineHeight: 1.1,
                      },
                      children: author.role,
                    },
                  },
                ],
              },
            },
          ],
        },
      }
    : { type: "div", props: { style: { flex: 1 } } };

  const svg = await satori(
    {
      type: "div",
      props: {
        style: {
          width: `${OG_WIDTH}px`,
          height: `${OG_HEIGHT}px`,
          display: "flex",
          // 外周枠はゴールド濃淡のグラデーション（zenshin-hp の技術ブログ OGP と同一）
          backgroundImage: "linear-gradient(135deg, #e4d4a8 0%, #c4a97d 45%, #8c6f42 100%)",
          borderRadius: `${OUTER_RADIUS}px`,
          fontFamily: "Noto Sans JP",
        },
        children: [
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                flexDirection: "column",
                flex: 1,
                margin: `${BORDER_WIDTH}px`,
                backgroundColor: COLOR.background,
                borderRadius: `${INNER_RADIUS}px`,
                padding: "56px 64px 60px 64px",
              },
              children: [
                // 上段: 左にラベル、右に制作日（date 未指定なら非表示）
                {
                  type: "div",
                  props: {
                    style: { display: "flex", alignItems: "center", justifyContent: "space-between" },
                    children: [
                      {
                        type: "div",
                        props: {
                          style: { color: COLOR.gold, fontSize: "38px", fontWeight: 700, letterSpacing: "0.08em" },
                          children: label,
                        },
                      },
                      ...(date
                        ? [
                            {
                              type: "div",
                              props: {
                                style: {
                                  color: COLOR.muted,
                                  fontSize: "30px",
                                  fontWeight: 400,
                                  letterSpacing: "0.06em",
                                  fontVariantNumeric: "tabular-nums",
                                },
                                children: date,
                              },
                            },
                          ]
                        : []),
                    ],
                  },
                },
                // 中段: タイトル（下段ブロックが視覚的に重いため marginBottom で少し上寄せる）
                {
                  type: "div",
                  props: {
                    style: { display: "flex", flex: 1, alignItems: "center", justifyContent: "center" },
                    children: {
                      type: "div",
                      props: {
                        style: {
                          width: "100%",
                          marginBottom: "40px",
                          color: COLOR.foreground,
                          fontSize: "52px",
                          fontWeight: 700,
                          textAlign: "center",
                          lineHeight: 1.3,
                          whiteSpace: "pre-wrap",
                        },
                        children: title,
                      },
                    },
                  },
                },
                // 下段: 左に著者、右に ZENSHIN ロゴ
                {
                  type: "div",
                  props: {
                    style: { display: "flex", alignItems: "center", justifyContent: "space-between" },
                    children: [
                      authorNode,
                      {
                        type: "img",
                        props: { src: logoDataUri, width: 240, style: { display: "flex" } },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    { width: OG_WIDTH, height: OG_HEIGHT, fonts },
  );

  return await sharp(Buffer.from(svg)).png().toBuffer();
}
