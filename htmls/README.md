# htmls/ — 公開 HTML ページの原稿

self-contained な単一 HTML の原稿置き場。main に push すると自動でビルド・公開されます（**push = 社外公開**）。書き方・設計ルールは `zenshin-html` スキル（正本: `docs/agent-instructions/skills/zenshin-html/`）を参照。

- ビューワーページ（正規 URL）: `https://tech.zenshin-inc.co.jp/htmls/<ファイル名から .html を除いた slug>/`
- 素の HTML（ビューワーが iframe 埋め込み）: `https://tech.zenshin-inc.co.jp/htmls/<slug>.html`

## 命名規則

```
htmls/<YYYY-MM-DD>-<slug>.html
```

- 日付プレフィックス必須（スライドと同じ。日付は一覧・フィードの並び順になる）
- slug は内容がわかる英語ケバブケース

## 先頭のメタコメント（必須）

ファイル先頭（`<!doctype html>` の前後どちらでも可）に HTML コメントでメタ情報を書く。
`scripts/build-slides.ts` がビルド時に読み、OGP 画像・サムネイル・一覧・フィードに使う。

```html
<!--
title: ページタイトル
description: 一覧・OGP に出る 1〜2 文の説明
tags: [タグ1, タグ2, タグ3, タグ4, タグ5]
author: 05-takahashi
-->
```

- `title` はブログ・スライドと同じ幅検証あり（OGP で改行しない幅まで。超過するとビルドが失敗する）
- `tags` は 5〜6 個必須
- `author` は `src/content/authors/` のコレクション ID

## 本文の制約

- CSS / JS / SVG はインライン化した単一 HTML（外部 CDN・外部フォント参照は禁止）
- `<head>` に `<title>` 必須。OGP メタ・canonical はビルドが注入するので**自分で書かない**
- ラスタ画像は base64 で埋め込まず `gallery/<YYYYMM>-<slug>/` に置き、`/gallery/<フォルダ>/<ファイル>` のルート相対パスで参照する
- ビルドが末尾にビューワー連携スクリプト（iframe 高さ通知 + 閲覧数カウント）を注入する
