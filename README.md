# zenshin-contents

ZENSHIN のスライド・CG などを公開するコンテンツハブ（Marp + GitHub Pages）

- **公開 URL**: https://contents.zenshin-inc.co.jp/
  - DNS（CNAME）は zenshin-infra の Terraform で管理
- main に push すると GitHub Actions が自動でビルドして公開します（完全 CLI 運用）

## ディレクトリ構成

```
slides/    Marp 原稿（1 ファイル = 1 デッキ、YYYY-MM-DD-<slug>.md）
gallery/   CG・生成画像などの公開素材（<YYYYMM>-<slug>/ で分ける）
assets/    ブランド素材（ロゴ・favicon。zenshin-hp 由来）
themes/    Marp カスタムテーマ（zenshin.css）
scripts/   ビルドスクリプト（TypeScript / Bun 実行）
dist/      ビルド成果物（git 管理外、CI が生成）
```

## セットアップ

[mise](https://mise.jdx.dev/) でツール（Node.js / Bun）を管理しています。

```bash
mise install
bun install
```

## スライドの追加手順

1. `slides/YYYY-MM-DD-<slug>.md` を作成（front matter で `theme: zenshin` を指定）

   ```markdown
   ---
   marp: true
   theme: zenshin
   paginate: true
   title: スライドのタイトル
   description: 一覧ページに表示される説明文
   footer: © ZENSHIN Inc.
   ---
   ```

2. main に push すると、数分で公開 URL に反映される
   - HTML: `/slides/<ファイル名>.html`
   - PDF: `/slides/<ファイル名>.pdf`（Docswell などへのアップロード・配布用）
   - トップページの一覧にも自動で載る

## ローカルプレビュー

```bash
# ライブプレビュー（http://localhost:8080 で slides/ を一覧表示）
bun run dev

# 本番同等ビルド（dist/ に HTML + PDF + 一覧ページを生成）
bun run build
open dist/index.html

# 型チェック + ビルド（CI と同等）
bun run ci
```

VS Code の場合は [Marp for VS Code](https://marketplace.visualstudio.com/items?itemName=marp-team.marp-vscode) 拡張でもプレビューできます（`themes/zenshin.css` を `markdown.marp.themes` に登録）。

## gallery/ への画像追加

`gallery/<YYYYMM>-<slug>/` にフォルダを切って画像を置き、push するだけで公開されます。
命名規則・サイズの目安は [gallery/README.md](gallery/README.md) を参照。

## スライド共有サービスへの展開（Docswell / Speaker Deck）

- 主軸は本リポジトリの GitHub Pages。全デッキをここで公開する
- **対外発信したい代表作のみ**、ビルド済み PDF を手動アップロードする
  - 第一候補: [Docswell](https://www.docswell.com/)（日本語 SEO が強く、非エンジニア層にも届く）
  - 補助: [Speaker Deck](https://speakerdeck.com/)（エンジニア向け。無料枠は 1 日 10 件・累計 100 件）
  - SlideShare は広告過多のため使わない
- どちらもアップロード API / CLI がないため Web 画面から手動で行う（頻度が上がったらブラウザ自動操作による半自動化を検討）
- アップロードする PDF は `bun run build` で生成される `dist/slides/*.pdf` を使う
