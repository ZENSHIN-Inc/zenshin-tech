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
- `bun run check` — スライドの**はみ出し自動検知**（headless Chrome で全ページの領域外あふれを機械判定。NG ページ番号と超過 px を出す）
- `bun run ci` — typecheck + build + check
- 見た目の目視確認は、自動チェックを通したうえで**挿絵・画像を入れたページに絞って** `dist/slides/<デッキ>.pdf` の該当ページを開く（全ページ目視は不要）

## リポジトリ運用方針

- 原則として `main` ブランチで作業する
- **commit / push はユーザーの明示指示があるまでしない**。push すると即公開されるため、push 前に「公開されます」と一言添える
- GitHub の issue / PR 操作は `gh` CLI で行う

## スキル活用方針

依頼内容に合致するスキルがある場合は、手作業で済ませず必ずそのスキルを起点にする。

| スキル | 用途 |
|---|---|
| `zenshin-slide` | 公開スライドデッキ（slides/）の新規作成・編集。**zenshin テーマ・4:3（960x720）固定**の書き方ルール・文章量バジェット・はみ出し検証のワークフロー。Marp 汎用リファレンス（softaworks/agent-toolkit から MIT で取り込み）も同梱 |
| `gallery-image-gen` | gpt-image-2（組み込み image_gen・サブスクルート）で画像を生成し `gallery/` に置いて公開する。画像生成の共通エンジン |
| `slide-infographic` | Marp スライドのページに手書き風インフォグラフィック挿絵を差し込む（画像生成は gallery-image-gen に従う）。**ユーザーが明示的に挿絵を依頼したときのみ使う** |

- **スライドの挿絵はユーザーの明示指示があるときのみ**入れる（デッキ作成時にデフォルトで入れない・積極提案もしない）

- 画像生成で OpenAI Images API を直接叩かない（API 従量課金ルート禁止。ChatGPT サブスク内で完結させる）
