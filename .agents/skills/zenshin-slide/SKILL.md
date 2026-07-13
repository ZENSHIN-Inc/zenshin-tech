---
name: zenshin-slide
description: >
  ZENSHIN の公開スライドデッキ（slides/ 配下の Marp md）を新規作成・編集するスキル。
  zenshin ブランドテーマ（4:3・960x720）の書き方ルール・1 ページの文章量バジェット・
  ビルドとはみ出し検証のワークフローまでを含む。
  **Use this skill whenever the user mentions** スライド・デッキ・プレゼン資料・発表資料を作りたい /
  既存デッキの修正・ページ追加・構成変更をしたい / Marp スライドを触りたい、と言ったとき。
  スライドへの挿絵・インフォグラフィックの挿入は**ユーザーが明示的に依頼したときのみ**
  （その場合は姉妹スキル slide-infographic を使う）。
---

# zenshin-slide Skill（ZENSHIN の公開スライドを作る）

> Codex 用の派生スキルです。正本は `docs/agent-instructions/skills/zenshin-slide/SKILL.md.liquid`。`bun run sync:agent-docs` で生成するため、直接編集しないでください。

> **Core Principle**: 公開デッキは **zenshin ブランドテーマ一択・4:3（960x720）固定**。
> テーマ側の部品（callout・center・columns など）だけで組み、デッキ内に自前 CSS を書かない。
> **挿絵はデフォルトで入れない**（ユーザーの明示指示があるときのみ）。
> push = 即公開なので、commit / push はユーザーの明示指示があるまでしない。

## デッキの作り方

- ファイル: `slides/<YYYY-MM-DD>-<slug>.md`（slug は内容がわかる英語ケバブケース）
- frontmatter テンプレ:

  ```markdown
  ---
  marp: true
  theme: zenshin
  lang: ja
  paginate: true
  title: <タイトル — サブタイトル>
  description: <一覧ページに出る 1〜2 文の説明>
  footer: © ZENSHIN Inc.
  ---
  ```

  `lang: ja` は必須（テーマの `word-break: auto-phrase` による**文節単位の折り返し**が効く条件。複合語の泣き別れを自動で防ぐ）

- サイズはテーマ既定の **4:3（960x720）**。frontmatter に `size:` を書かない（16:9 が必要な特殊ケースのみ `size: 16:9`）
- 推奨ページ構成:
  - 小型（本文 10 枚規模）: lead 表紙（`<!-- _paginate: false -->`）→「結論から」（center）→ 本文 → まとめ（center）→ lead 謝辞
  - 大型（本文 12 枚以上・3〜4 章）: lead 表紙 →「結論から」（center）→ **［章扉（divider）→ その章の本文］を章の数だけ** → まとめ（center）→ lead 謝辞
- **章の現在地は必ず header ディレクティブの章ラベルで示す**: 各章の先頭ページに `<!-- header: N. 章タイトル -->` を書くと以降のページ左上に小さく表示され続ける。まとめのページで `<!-- header: "" -->` を書いてクリアする
- **章扉ページはデッキの規模で使い分ける**:
  - 本文 10 枚規模の小さいデッキでは**作らない**（テンポを分断するだけ。章ラベルで足りる）
  - 本文が **約 12 枚以上・3〜4 章**あるデッキでは、各章の頭に `<!-- _class: divider -->` の**章扉（目次兼用・濃紺背景）**を入れてよい。書き方: 全章の番号付きリストを置き、**現在地の章だけ太字**にする（白字＋ゴールド下線で浮き上がる）。扉ページでは `<!-- header: "" -->` でヘッダーをクリアし、直後の本文ページで `<!-- header: N. 章タイトル -->` を再設定する
  - 独立した目次ページは作らない（章扉が目次を兼ねる。lead の中扉も使わない）
- 表紙・謝辞のロゴ: `![w:240](../assets/brand/ZENSHIN-logo-white.webp)`（lead の濃紺背景用に白ロゴ）
- **表紙にはロゴの下に作成日と作成者を入れる**（2 行: `YYYY年M月D日` / `株式会社ZENSHIN CTO 高橋俊`）
- **謝辞ページに問い合わせ導線を入れる**: 相談を歓迎する一文 + `**お問い合わせ**: [www.zenshin-inc.co.jp/contact](https://www.zenshin-inc.co.jp/contact)`（lead 上のリンクはテーマがゴールドで表示）

## zenshin テーマの部品と書き方ルール

テーマは `themes/zenshin.css`。**部品の一覧・使い方・最新の版数はテーマ CSS 冒頭のコメントが単一情報源**（この SKILL に版数を書かない — すぐ陳腐化するため）。要点:

- **結論・メッセージ主体のページは `<!-- _class: center -->` で中央揃え**にする（「結論から」「まとめ」「推奨プラン」など）。箇条書き中心のページは左揃えのまま。center ページ内でも箇条書き・コールアウトは自動で左揃えが保たれる
- **見出しに下線・短いバーなどの装飾を付けない**（生成 AI スライドの定番装飾に見えるため、テーマからも廃止済み）
- **タイトル（h1）は全ページ中央揃え**（テーマが自動適用）で、**必ず 1 行に収める**（目安: 全角約 20 文字。超えるなら言い換えで短縮する）
- **口語・内輪ノリの表現を使わない**（公開資料として社外の誰が読んでも大丈夫なトーンに）。例: バトル→競争、ミソ→重要なのは、刺さる→有効、腹をくくって→受け入れる、どっしり→腰を据えて。「コスパ・タイパ」など定着した語は可
- **強調は 2 段階で使い分ける**:
  - `**太字**` = 太字のみ（下線なし）。1 ページに数カ所まで
  - `***太字***` = 太字＋ゴールド下線（マーカー風。ブランドの署名的表現）。「ここだけ読めばいい」という**そのページの核心 1 フレーズ専用**で、1 ページ 1 カ所まで（表の中・lead・divider では使わない）
- **コールアウトを意味に応じて色分けして使う**:
  - `>`（blockquote）= POINT（ゴールド・要点）
  - `<div class="callout good">` = GOOD（緑・良い点）／`.warn` = CAUTION（黄・注意）／`.danger` = WARNING（赤・危険）／`.info` = INFO（青・補足）
  - div 内に Markdown を書くときは開始タグ・終了タグの前後に空行を挟む。ラベル文字列は `data-label="..."` で上書き可
- 2〜3 カラムは `<div class="columns">`（3 列は `columns three`）、カードは `<div class="card">`、KPI タイルは `<div class="stats">` + `<div class="stat">`
- **「A → B」「用語 — 説明」を 1 行に詰めた箇条書きにしない**: 対応関係の列挙は**表**に、用語＋説明の列挙は**表**か **2 階層の箇条書き**（親 = 用語、子 = 説明）に分解する。1 行詰め込みは折り返しで読みにくくなる
- 表の直後の余白はテーマが確保する（手動の空行調整は不要）

## 文章量バジェット（4:3・はみ出しの予防）

本文領域は約 **832x592px、1 行あたり全角約 37 文字**（本文 22px）。後から削るのではなく、書く時点で次に収める:

- **文字を小さくした分の余白は「空き」のまま残す**: v2.3 で本文を 25px → 22px に縮小した狙いは要素間の余白（呼吸）を作ること。空いたからといって箇条書きや文章を増やさない

- 1 ページ = **見出し + （表 or 箇条書き）+ コールアウト 1 個まで**。導入文は原則書かない（書くなら 1 行）
- 上限目安: **「箇条書き 4〜5 個 + コールアウト 1 個（3 行以内）」または「表 4〜5 行 + 締めの文 2 行」**
- **表のセルは折り返さない長さにする**（1 セル 1 行。折り返すと 1 文字だけの孤立行ができやすい）
- **blockquote / callout 内でハード改行しない**（1 つの `>` や div に文章を流し込む。幅が変わると改行位置も変わる）
- **強調記号（`**` / `***`）を約物（「」『』（）。、・）の直後で閉じない**: 例 `**エンジニア向けの「黒い画面」**` は閉じ `**` が `」` の直後に来るため Markdown が強調と認識せず、地の文に `**` がそのまま出る（markdown-it の右フランキング規則）。約物を強調の外に出すか、語順を変えて記号が通常文字に隣接するようにする（PNG 目視で `**` が生で残っていないか確認）
- 同じ主旨を導入文とコールアウトで**二重に言わない**
- タイトル（h1）の 2 行折り返しは禁止（全角約 20 文字を超えたら言い換えで短縮する）
- キーメッセージの複合語（「最善手」など）が行またぎで分断されたら、手動改行や言い回しで自然な位置に折る

## 検証ワークフロー

1. **機械検知**: `bun run ci`（typecheck + build + はみ出し検知）。はみ出しは `scripts/check-overflow.ts` が NG ページ番号と超過 px を出す
2. **単体デッキの高速ループ**: 全デッキビルドを待たずに確認したいときは

   ```bash
   bunx marp slides/<デッキ>.md --images png --image-scale 1 -o <scratch>/deck.png --theme-set themes --allow-local-files --html
   ```

   でページ単位の PNG（deck.001.png…）を出し、該当ページだけ見る
3. **目視は絞る**: 全ページ目視は不要。画像・挿絵を入れたページと、折り返しが際どいページだけ PNG / `dist/slides/<デッキ>.pdf` で確認する
4. あふれたら上記バジェットに沿って圧縮する（**意味・情報は削らない**。改行位置・冗長な語尾・二重表現の整理から）
5. **commit / push の前に、ビルド済み PDF をユーザー本人に目視確認してもらう**（機械検知と Claude の目視だけで完結させない）
   - `dist/slides/<デッキ>.pdf` の**フルパスをチャットに提示する**（ユーザーは VS Code などで自分で開くため、`open` コマンドで勝手に開かない）
   - ユーザーの OK が出てから commit / push の指示を待つ

## 挿絵・画像のポリシー

- **挿絵（手書き風インフォグラフィック）はユーザーが明示的に依頼したときだけ**入れる。こちらから「挿絵を入れましょうか」と積極提案しない。依頼されたら姉妹スキル `slide-infographic` に従う（画像生成の作法は `gallery-image-gen`）
- ロゴ・スクリーンショットなど挿絵以外の画像を指示されたときの Marp 記法は `references/image-patterns.md` を参照
- **スクショ・チャートなどの引用図版は `assets/slides/<デッキ slug>/` に置く**。`gallery/` には置かない（gallery はギャラリー一覧ページに自動掲載される ZENSHIN 制作画像専用。生成する挿絵は従来どおり gallery/）

## Mermaidの図

- フローチャート、Yes / Noの判断フロー、シーケンス図を求められた場合はMermaidを使ってよい。これは生成画像の挿絵とは別扱い
- **公開スライドではMermaidを実行時に読み込まない**。`.mmd`を正本としてSVGを事前生成し、Marpには通常の画像として埋め込む。CDNの`<script>`、`<div class="mermaid">`、カスタムengineは使わない
- `.mmd`、`mermaid-config.json`、生成済み`.svg`は`assets/slides/<デッキ slug>/`へ置く
- Mermaid CLIは版を固定する。標準コマンド:

  ```bash
  bunx @mermaid-js/mermaid-cli@11.16.0 \
    -i assets/slides/<デッキ slug>/<図>.mmd \
    -o assets/slides/<デッキ slug>/<図>.svg \
    -c assets/slides/<デッキ slug>/mermaid-config.json \
    -b transparent
  ```

- 4:3のYes / Noフローは原則`flowchart LR`、質問5個程度まで、1ノード2行以内にする。到達点は質問ノードと色・形を分ける
- SVG生成後、対象ページをPNGとPDFで目視し、文字、矢印、分岐ラベル、余白を確認する
- 詳細と判断根拠は`docs/mermaid-in-marp.md`を参照する

## references/（Marp 汎用リファレンス）

Marp の構文・仕組みで迷ったら読む。出所: https://github.com/softaworks/agent-toolkit の `skills/marp-slide`（MIT License, commit 3027f20。LICENSE 同梱）:

- `references/marp-syntax.md` — Marp/Marpit 基本構文（ディレクティブ・frontmatter・ページ区切り）
- `references/image-patterns.md` — 画像記法（`![bg]`・分割背景・フィルタ・サイズ指定）
- `references/theme-css-guide.md` — テーマ CSS の設計（`themes/zenshin.css` を保守するとき）
- `references/advanced-features.md` — 数式・絵文字・Marp CLI・VS Code 連携
- `references/official-themes.md` — marp-core 公式テーマ（zenshin テーマは default を `@import` して拡張している）

## やらないこと / 注意

- 公開デッキに zenshin 以外のテーマ・自前 CSS・`<style>` ブロックを使わない
- 挿絵をユーザーの指示なしに入れない・生成しない
- commit / push はユーザーの明示指示があるまでしない（push = 即公開。push 前に「公開されます」と一言添える）
