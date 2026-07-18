# zenshin-tech — ZENSHIN Tech

株式会社ZENSHINの技術メディア **ZENSHIN Tech**（技術ブログ + スライド）。
Astro 7 製の静的サイトで、Marp スライドのビルドパイプラインを内蔵しています。

- **公開 URL**: https://tech.zenshin-inc.co.jp/
  - DNS（CNAME）は zenshin-infra の Terraform で管理
- main に push すると GitHub Actions がビルドして Cloudflare Pages へデプロイします（完全 CLI 運用・**push = 即公開**）
- 技術ブログは zenshin-hp（www.zenshin-inc.co.jp）から 2026-07 に移設。旧 `/blog/*` URL は HP 側で 301 リダイレクト

## ディレクトリ構成

```
src/
  content/blog/     ブログ記事（YYYY-MM-DD-<slug>.md、frontmatter は content.config.ts の Zod スキーマ）
  content/authors/  著者（zenshin-hp の members のサブセット）
  pages/            トップ（混在一覧 + 検索。絞り込みは /?q&type&tag&month のクエリパラメータ）/blog/<slug> /og /index.json /rss.xml
  components/       Header / Footer / ArticleCard など（zenshin-hp から移植）
  layouts/          BaseLayout（SEO・OGP・JSON-LD）/ PageLayout
  lib/og-image.ts   OGP 画像レンダラー（satori + sharp。ブログ・スライド共用）
  plugins/          satteri リンクカード（zenshin-hp から移植）
  data/             build-slides.ts の生成物（slides.json、git 管理外）
slides/     Marp 原稿（1 ファイル = 1 デッキ、YYYY-MM-DD-<slug>.md）
gallery/    スライド挿絵など生成画像の素材置き場（<YYYYMM>-<slug>/ で分ける。一覧ページはない）
assets/     ブランド素材とスライド用引用図版（public/assets へコピーされる）
themes/     Marp カスタムテーマ（zenshin.css）
scripts/    build-slides.ts（Marp prebuild）/ check-overflow.ts / sync-agent-docs.ts
public/     静的ファイル。slides/ assets/ gallery/ は build-slides.ts の生成物（git 管理外）、
            link-cards/ はリンクカードの画像キャッシュ（コミットする）
dist/       ビルド成果物（git 管理外、CI が生成）
```

## セットアップ

[mise](https://mise.jdx.dev/) でツール（Node.js / Bun）を管理しています。

```bash
mise install
bun install
```

## ビルド・確認

```bash
bun run dev        # スライド prebuild + astro dev（ドラフト記事も表示される）
bun run build      # 本番同等ビルド（スライド prebuild + astro build → dist/）
bun run ci         # スキル同期チェック + build + typecheck + はみ出し検知（CI と同等）
bun run check      # スライドのはみ出し自動検知のみ
bun run dev:marp   # Marp のライブプレビューだけ欲しいとき
```

## ブログ記事の追加手順

1. `src/content/blog/YYYY-MM-DD-<slug>.md` を作成

   ```markdown
   ---
   title: 記事タイトル（OGP で改行しない全角換算 28 文字まで。20 文字以内推奨）
   date: 2026-07-17
   tags: [Web, Astro, OGP, Satori, TypeScript]   # 5〜6 個必須
   description: 一覧・OGP に出る説明文
   slug: my-article          # URL は /blog/<slug>/
   author: 05-takahashi      # src/content/authors/ の ID
   ---
   ```

2. 本文中に URL だけの段落（`[https://…](https://…)`）を書くと、ビルド時に OGP を取得してリンクカードに変換される
3. `published: false` でドラフト（`astro dev` でのみ表示、ビルドから除外）
4. main に push すると公開。OGP 画像（著者アイコン入り 1200x630）は自動生成される

## スライドの追加手順

1. `slides/YYYY-MM-DD-<slug>.md` を作成（front matter で `theme: zenshin` を指定）

   ```markdown
   ---
   marp: true
   theme: zenshin
   paginate: true
   title: スライドのタイトル（OGP で改行しない全角換算 28 文字まで。20 文字以内推奨）
   tags: [AI, 生成AI, Codex, ChatGPT, 技術選定]   # ブログと共通のタグ（5〜6 個必須）
   description: 一覧ページに表示される説明文
   footer: © ZENSHIN Inc.
   ---
   ```

2. main に push すると、数分で公開 URL に反映される
   - HTML: `/slides/<ファイル名>.html`
   - PDF: `/slides/<ファイル名>.pdf`（Docswell などへのアップロード・配布用）
   - OGP 画像: `/slides/<ファイル名>-og.png`（ブログと同じ意匠で自動生成）
   - トップページ・`/slides/` の一覧にも自動で載る

## gallery/ への画像追加

`gallery/<YYYYMM>-<slug>/` にフォルダを切って画像を置くと `/gallery/<フォルダ>/<ファイル>` で配信されます
（スライドからの相対参照用。**公開一覧ページはありません**）。
命名規則・サイズの目安は [gallery/README.md](gallery/README.md) を参照。

## フィード（/index.json・/rss.xml）

- `/index.json` — デッキ（`decks`）とブログ記事（`posts`）のメタデータフィード。
  zenshin-hp が Content Layer のローダーからビルド時に fetch する。
  **decks のスキーマ（v1）を変える場合は zenshin-hp 側のローダーと合わせて `version` を上げる**
- `/rss.xml` — ブログ + スライドの RSS

## zenshin-hp との関係

- 本サイト = 技術メディア（ZENSHIN Tech）、zenshin-hp = コーポレートサイト
- ブランド意匠（カラートークン・OGP デザイン・コンポーネント）は zenshin-hp 由来。
  HP 側のデザイン変更時は `src/styles/global.css` / `src/lib/og-image.ts` を追従させる
- リンクカードのキャッシュ更新: `bun run link-cards:refresh`

## スライド共有サービスへの展開（Docswell / Speaker Deck）

- 主軸は本サイト。全デッキをここで公開する
- **対外発信したい代表作のみ**、ビルド済み PDF（`dist/slides/*.pdf`）を手動アップロードする
  - 第一候補: [Docswell](https://www.docswell.com/)（日本語 SEO が強い）
  - 補助: [Speaker Deck](https://speakerdeck.com/)（エンジニア向け）
