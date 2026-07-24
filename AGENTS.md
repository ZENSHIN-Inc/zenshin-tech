# zenshin-tech — ZENSHIN 技術ブログ

## プロジェクト概要

株式会社ZENSHINの技術ブログ **ZENSHIN 技術ブログ**（ブログ記事 + Marp スライド + HTML ページ）。
Astro 7 + Tailwind 4 の静的サイト（Cloudflare Pages）で、main に push すると GitHub Actions が自動でビルド・デプロイする（**push = 社外公開**）。

- 公開 URL: https://tech.zenshin-inc.co.jp/
- 技術ブログは zenshin-hp から 2026-07 に移設（旧 www の `/blog/*` は HP 側で 301）
- 詳細な構成・運用は `README.md` を参照

## ディレクトリ構成

- `src/content/blog/` — ブログ記事（`YYYY-MM-DD-<slug>.md`）。frontmatter は `src/content.config.ts` の Zod スキーマ（title は OGP で改行しない幅 = 全角換算 28 文字/行まで・tags 5〜6 個必須・author 必須）。`published: false` でドラフト（dev のみ表示）
- `src/content/authors/` — 著者情報（アバター画像は `src/assets/images/authors/`）
- `src/pages/` — トップ（混在一覧 + 検索。種別・タグ・月別の絞り込みは専用 URL を切らず `/?q&type&tag&month` のクエリパラメータで表現。type は article | slide | html。/blog/ /slides/ の一覧 URL は廃止し public/_redirects でトップへ 301）・記事個別 `/blog/<slug>/`・スライドビューワー `/slides/<デッキ>/`（SpeakerDeck 風。Marp 生成 HTML `/slides/<デッキ>.html` を iframe 埋め込みし、ページ送りバー・閲覧数・最終ページ後のエンドカードを持つ。正規 URL はビューワー側）・HTML ページビューワー `/htmls/<slug>/`（素の HTML `/htmls/<slug>.html` を全高 iframe で埋め込み、高さ自動調整・閲覧数・関連コンテンツを持つ。正規 URL はビューワー側）・OGP 画像エンドポイント・`/index.json`（zenshin-hp 向けフィード）・`/rss.xml`
- `src/lib/og-image.ts` — OGP 画像レンダラー（satori + sharp、1200x630）。ブログ・スライド共用。意匠は zenshin-hp の `src/lib/og-image.ts` 由来
- `src/plugins/satteri-link-card.ts` — 記事中の URL 単独段落をリンクカード化（zenshin-hp から移植）。画像キャッシュは `public/link-cards/`（コミットする）
- `slides/` — Marp スライド原稿（`<YYYY-MM-DD>-<slug>.md`）。HTML / PDF / サムネイル / OGP 画像に変換される
- `htmls/` — 公開 HTML ページ原稿（`<YYYY-MM-DD>-<slug>.html`、self-contained な単一 HTML。規約は `htmls/README.md`）。先頭の HTML コメントメタ（title / description / tags 5〜6 個 / author）が必須で、OGP 画像・サムネイル PNG に変換される
- `gallery/` — スライド・HTML ページの挿絵など生成画像の素材置き場（`<YYYYMM>-<slug>/` で分ける。規約は `gallery/README.md`）。`/gallery/<フォルダ>/<ファイル>` で配信されるが**公開一覧ページはない**（2026-07 に廃止）
- `assets/` — ロゴなどのブランド素材と、スライド用の引用図版（スクショ・チャートは `assets/slides/<デッキ slug>/` に置く）。スライドからは `../assets/...` で参照。**第三者の図版を `gallery/` に置かない**（gallery は ZENSHIN 制作画像専用）
- `themes/zenshin.css` — Marp 用ブランドテーマ
- `scripts/build-slides.ts` — スライド・HTML ページの prebuild（public/slides・public/htmls・public/assets・public/gallery・src/data を生成。すべて git 管理外）
- `docs/agent-instructions/skills/` — Claude Code / Codex 共通スキルの**正本**（`SKILL.md.liquid` + `common/` 素材）
- `.agents/skills/`（Codex 用）・`.claude/skills/`（Claude Code 用） — `bun run sync:agent-docs` による**生成物。直接編集しない**

## ビルド・確認

- `bun run dev` — スライド prebuild + astro dev（ドラフト記事も表示）
- `bun run build` — dist/ へフルビルド（スライド prebuild + astro build）
- `bun run check` — スライドの**はみ出し自動検知**（headless Chrome で全ページの領域外あふれを機械判定。NG ページ番号と超過 px を出す）
- `bun run typecheck` — astro check（TS6 で実行。TS7 は astro check 未対応のため併存）
- `bun run ci` — スキル同期チェック + build + typecheck + check
- `bun run sync:agent-docs` — スキル正本（`docs/agent-instructions/skills/`）から `.claude/skills/` と `.agents/skills/` を再生成
- 見た目の目視確認は、自動チェックを通したうえで**挿絵・画像を入れたページに絞って** `dist/slides/<デッキ>.pdf` の該当ページを開く（全ページ目視は不要）

## リポジトリ運用方針

- 原則として `main` ブランチで作業する
- **commit / push はユーザーの明示指示があるまでしない**。push すると即公開されるため、push 前に「公開されます」と一言添える
- GitHub の issue / PR 操作は `gh` CLI で行う

## zenshin-hp との関係

- 本リポジトリ = 技術ブログ、zenshin-hp = コーポレートサイト。ブログ・スライドは必ずこちらに置く
- `/index.json` は zenshin-hp がビルド時に fetch するフィード。**decks スキーマ（v1）を変えるときは HP 側ローダーと合わせて version を上げる**
- ブランド意匠（`src/styles/global.css` のトークン・OGP デザイン・共通コンポーネント）は zenshin-hp 由来。HP 側の変更に追従させる

## スキル活用方針

依頼内容に合致するスキルがある場合は、手作業で済ませず必ずそのスキルを起点にする。

スキルの正本は `docs/agent-instructions/skills/`。修正は正本（`SKILL.md.liquid` / `common/`）に対して行い、`bun run sync:agent-docs` で `.claude/skills/` / `.agents/skills/` を再生成する。Claude Code / Codex で記述を変えたい箇所は Liquid の `{% if target == "claude" %}` / `{% if target == "codex" %}` 分岐を使う。生成先を直接編集しない。

| スキル | 用途 |
|---|---|
| `zenshin-slide` | 公開スライドデッキ（slides/）の新規作成・編集。**zenshin テーマ・16:9（1280x720）固定**の書き方ルール・文章量バジェット・はみ出し検証のワークフロー。Marp 汎用リファレンス（softaworks/agent-toolkit から MIT で取り込み）も同梱 |
| `zenshin-html` | 公開 HTML ページ（htmls/）の新規作成・編集。内容理解にもとづく Web ページ設計・クリーム系デザインシステム・gallery 画像の差し込み・メタコメントとビルド検証のワークフロー。**HTML 資料の書き方ルールの正本** |
| `gallery-image-gen` | gpt-image-2（組み込み image_gen・サブスクルート）で画像を生成し `gallery/` に置いて公開する。**画像生成の共通エンジン（呼び出し規約の正本）** |
| `slide-infographic` | Marp スライドのページに手書き風インフォグラフィック挿絵を差し込む（画像生成は gallery-image-gen に従う）。**ユーザーが明示的に挿絵を依頼したときのみ使う** |

- **スライドの挿絵はユーザーの明示指示があるときのみ**入れる（デッキ作成時にデフォルトで入れない・積極提案もしない）

- 画像生成で OpenAI Images API を直接叩かない（API 従量課金ルート禁止。ChatGPT サブスク内で完結させる）
