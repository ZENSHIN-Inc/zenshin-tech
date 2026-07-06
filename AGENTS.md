# zenshin-contents

## プロジェクト概要

ZENSHIN のスライド・CG などを公開するコンテンツハブ（Marp + GitHub Pages）。
main に push すると GitHub Actions が自動でビルド・デプロイする（**push = 社外公開**）。

- 公開 URL: https://contents.zenshin-inc.co.jp/
- 詳細な構成・運用は `README.md` を参照

## ディレクトリ構成

- `slides/` — Marp スライド原稿（`<YYYY-MM-DD>-<slug>.md`）。HTML / PDF / サムネイルに変換される
- `gallery/` — CG・生成画像などの公開素材（`<YYYYMM>-<slug>/` で分ける。規約は `gallery/README.md`）
- `assets/` — ロゴなどのブランド素材（スライドからは `../assets/...` で参照）
- `themes/zenshin.css` — Marp 用ブランドテーマ
- `scripts/build.ts` — ビルドスクリプト（一覧ページ生成含む）
- `.agents/skills/` — Codex スキル定義（Claude Code 用は `.claude/skills/`）

## ビルド・確認

- `bun run build` — dist/ へフルビルド（HTML / PDF / サムネイル / 一覧ページ）
- `bun run ci` — typecheck + build
- スライドの見た目確認は、ビルド後の `dist/slides/<デッキ>.pdf` を開いてページ単位で目視する

## リポジトリ運用方針

- 原則として `main` ブランチで作業する
- **commit / push はユーザーの明示指示があるまでしない**。push すると即公開されるため、push 前に「公開されます」と一言添える
- GitHub の issue / PR 操作は `gh` CLI で行う

## スキル活用方針

依頼内容に合致するスキルがある場合は、手作業で済ませず必ずそのスキルを起点にする。

| スキル | 用途 |
|---|---|
| `gallery-image-gen` | gpt-image-2（組み込み image_gen・サブスクルート）で画像を生成し `gallery/` に置いて公開する。画像生成の共通エンジン |
| `slide-infographic` | Marp スライドの各ページに手書き風インフォグラフィック挿絵を差し込む（画像生成は gallery-image-gen に従う） |
| `marp-slide` | Marp 構文・画像レイアウト・ベストプラクティスの参照ナレッジ（softaworks/agent-toolkit から MIT で取り込み）。**公開デッキのテーマは zenshin 固定**（同梱 7 テーマは公開デッキに使わない） |

- 画像生成で OpenAI Images API を直接叩かない（API 従量課金ルート禁止。ChatGPT サブスク内で完結させる）
