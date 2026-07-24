---
name: zenshin-html
description: >
  公開 HTML ページ（htmls/ 配下の self-contained な単一 HTML）を新規作成・編集するスキル。
  Markdown / メモ / 議事録などの内容理解にもとづいて「Web ページとして設計された」HTML を作り、
  ZENSHIN 技術ブログ（tech.zenshin-inc.co.jp）で blog・スライドと並ぶコンテンツとして公開する。
  構成・視線・余白・図解・強調の再設計ルール、クリーム系デザインシステム、
  gallery 画像の差し込み、メタコメント・ビルド・検証のワークフローまでを含む。
  **Use this skill whenever the user mentions** HTML ページ・HTML 資料を公開したい / htmls に置きたい /
  MarkdownをビジュアライズHTMLにして公開したい / 1枚HTML / explainer ページを作りたい /
  視覚的な Web 資料にしたい / 画像入りの解説ページを作りたい、と言ったとき。
---

# zenshin-html Skill（公開 HTML ページを作って技術ブログで配信する）

> Codex 用の派生スキルです。正本は `docs/agent-instructions/skills/zenshin-html/SKILL.md.liquid`。`bun run sync:agent-docs` で生成するため、直接編集しないでください。

> **Core Principle**: MD を HTML 化するのではなく、**内容を理解した上で Web ページを設計する**。
> 原稿は `htmls/<YYYY-MM-DD>-<slug>.html` の self-contained な単一 HTML。main に push すると
> ビルドが OGP 画像・サムネイル・ビューワーページを自動生成して公開する（**push = 社外公開**）。
> commit / push はユーザーの明示指示があるまでしない。

---

## 大原則

**MD の見出し順や表をそのまま移し替えない。読者がブラウザで読むことを前提に組み直す。**

- 「H2 が 14 個あるから section が 14 個並ぶ」は失敗。章番号や見出し順は入力情報であって出力構造ではない
- 表が 4 つ続いていたら、それは「比較・カード・図解・要点・スコアボード」の混在を意味している。HTML では別物に分解する
- 同じ入力から、ターゲットや用途次第で別物の HTML が出てよい
- 「このURLを共有されたら開きたくなる」を基準にする
- **公開コンテンツである**ことを忘れない。顧客名・案件名・社内限定情報・未公開の金額を本文に書かない

## 使わない場面

- ブログ記事として文章で読ませたいもの → `src/content/blog/` の Markdown 記事にする
- ページ送りで発表するもの → `zenshin-slide`（Marp デッキ）
- AI に常時読み込ませる指示ファイル・PR で行単位 diff を追いたい文書（HTML にする意味がない）

---

## ファイル規約と公開の仕組み

- 原稿: `htmls/<YYYY-MM-DD>-<slug>.html`（日付プレフィックス必須・slug は英語ケバブケース）
- 先頭にメタコメント（必須。ビルドが読んで OGP 画像・一覧・フィードに使う）:

  ```html
  <!--
  title: ページタイトル
  description: 一覧・OGP に出る 1〜2 文の説明
  tags: [タグ1, タグ2, タグ3, タグ4, タグ5]
  author: 05-takahashi
  -->
  ```

  - `title` はブログ・スライドと同じ幅検証あり（OGP で自動改行しない幅まで。超過するとビルドが失敗し、エラーに上限が出る）
  - `tags` は 5〜6 個必須（トップの絞り込み・回遊性の前提。既存コンテンツのタグと揃える）
  - `author` は `src/content/authors/` のコレクション ID
- `<head>` に `<title>` 必須。**OGP メタ・canonical は書かない**（ビルドが正規 URL =ビューワーページで注入する。自分で書くと二重になる）
- ビルド（`scripts/build-slides.ts`）が自動でやること: OGP 画像（1200x630）とサムネイル PNG（1280x720 の先頭ビュー）の生成、閲覧数カウント・iframe 連携スクリプトの注入、`src/data/htmls.json` への登録
- 公開 URL: 正規はビューワーページ `/htmls/<slug>/`（サイトの額縁 + 関連コンテンツ付き）。素の HTML は `/htmls/<slug>.html`
- `html { height: 100% }` のような**ルート要素を viewport に固定する CSS を書かない**（ビューワーの iframe 高さ自動調整が実コンテンツ高を測れなくなる）

## self-contained の条件

- HTML 本体は 1 ファイル。CSS / JS / 構造図 SVG はインライン化
- 外部 CDN・外部フォント・外部スクリプトを参照しない（`cdn.jsdelivr.net` `fonts.googleapis.com` 等の読み込み禁止。フォントは日本語 system font stack）
- **ラスタ画像（PNG/JPEG）を base64 data URI で埋め込まない**（リポジトリと配信 HTML が肥大化し diff も追えなくなる）。画像は `gallery/<YYYYMM>-<slug>/` に置き、**ルート相対パス** `/gallery/<フォルダ>/<ファイル>` で参照する（ビューワー iframe・素の HTML どちらの URL でも解決される。`../gallery/...` の相対参照は使わない）
- viewport meta あり、`lang="ja"`、画像には内容を説明する `alt`、見出し階層 h1→h2→h3 を保つ
- `prefers-color-scheme: dark` で破綻しない

---

## 設計の進め方

### 1. 何を伝えるページかを掴む

最初に原稿を読み、以下を内部的に言語化する。ここで決めた方向性が、トーン・密度・画像枚数・章構成のすべてを決める。

- 読者は誰で、どんな状況でこの URL を開くか
- 開いた人が最初に持ち帰るべき結論と、次に持ち帰るべき根拠・前提
- 読者が止まりやすい・誤読しやすい箇所
- 削れる情報、束ねられる情報、強調すべき情報

### 2. ページの骨格を設計する

MD の H2 を順番に並べるのをやめ、ページとして自然な骨格を組む。よくある型:

- **ヒーロー**: タイトル + リード文 + 結論を表す数語 + キービジュアル
- **問題提起 / なぜ今**: 1〜3 点を視覚化
- **全体像**: 図解 1 枚でページの地図を見せる
- **主張ブロック**: 3〜5 本に絞った主張をカード or 横長ブロックで
- **詳細**: 必要なものだけ。表・KPI・ロードマップなど
- **アクション / 次の一歩**: 読み終えた人が何をするかを示す

章の統合・分割・並び替えは自由。同じ論点が複数章に散っていたら統合し、重複する前置きは削る。「○章: △△」のような番号付き見出しは Web ページでは落とす。

### 3. 視覚化を選ぶ

「画像 vs HTML/CSS vs SVG」の判断は、情報の性質で決める。

- **gpt-image-2 画像が向く**: 資料全体の地図、価値連鎖、Before/After、ロードマップ、関係図。短いラベルで構造を一目で見せたいもの
- **スクリーンショットが向く**: ツールの操作手順・画面の使い方など既存 UI の説明（生成画像より実画面が伝わる。機微情報の写り込みに注意し、説明対象に絞って切り取る）
- **HTML/CSS が向く**: 状態遷移、判断ゲート、リスク分類、文言修正が入る図、正確性が必要なもの、レスポンシブに折り返したいもの
- **インライン SVG が向く**: アイコン、矢印、小さなグラフ、2〜3 ノードの単純図
- **表が向く**: 数値を正確に比較するとき、コピーされる前提のとき

ガイドライン:
- 視覚要素ゼロは原則避ける。最低でも 1 枚はキービジュアル相当を置く
- 長文ほど図解を厚くする。読者は本文を全部読まない前提で組む
- 1 メッセージしか持たない雰囲気画像（人物・ノート PC・抽象光）は避け、情報密度のある図解にする
- 厳密なポジショニングが必要な図（フロー・線引き）を画像生成に任せない
- 構成図・アーキテクチャ図など編集可能性が要る精密図は姉妹スキル `drawio-diagram` も検討する

### 4. ページ全体のトーン（クリーム系デザインシステム）

手書きホワイトボード風の画像を使うときは、**HTML の背景・カード・見出しもクリーム系のノート風で統一する**。画像だけ手書き紙、本文だけダーク背景、のような分裂感を避ける。

パレット（コピペで使える既定の設計システム）:

```css
--paper:    #f6f1e3;  /* ページ背景 */
--paper-2:  #fbf6ea;  /* セクション背景 */
--card:     #fffdf6;  /* カード背景 */
--ink:      #2b2620;  /* 本文 */
--ink-soft: #4a4338;  /* 補足文 */
--muted:    #8a8174;  /* キャプション */
--line:     #e6dec9;  /* 罫線 */

/* アクセント */
--teal:  #1f7a6e;  --teal-soft:  #e0efe9;
--coral: #d96b4a;  --coral-soft: #fce7df;
--amber: #c98a1a;  --amber-soft: #fbeecc;
--rose:  #c5485f;  --rose-soft:  #fbe2e6;
```

見出しは「番号 + 縦バー + タイトル」の 3 カラム構造:

```html
<h2 class="ch-head">
  <span class="ch-num">03</span>
  <span class="ch-bar"></span>
  <span class="ch-title">タイトル<em>強調語</em></span>
</h2>
```

```css
.ch-head { display: grid; grid-template-columns: auto 4px 1fr; gap: 16px; }
.ch-num { font-family: ui-monospace,monospace; font-size: 1.7rem; font-weight: 900; color: var(--ink-soft); }
.ch-bar { background: var(--coral); border-radius: 4px; }
.ch-title { font-size: 2rem; font-weight: 900; color: var(--ink); }
.ch-title em {
  font-style: normal;
  background: linear-gradient(transparent 62%, rgba(217,107,74,.32) 62%, rgba(217,107,74,.32) 92%, transparent 92%);
  padding: 0 .1em;
}
```

強調はマーカー風の下線ハイライト。色アクセントはコーラル・ティール・アンバーを使い分け、装飾としての赤・黄は使わない。コールアウトは意味で variant を分ける:

```css
.callout{border-left:5px solid var(--accent);background:var(--accent-bg);padding:16px 18px;border-radius:10px;font-weight:700}
.callout-info{border-color:#2563eb;background:#eff6ff;color:#1e3a8a}     /* 前提・判断軸・補足 */
.callout-success{border-color:#0f8f86;background:#e7f4f2;color:#164e4a}  /* 推奨・採用 */
.callout-warning{border-color:#d97706;background:#fff7ed;color:#7c2d12}  /* 要確認・保留 */
.callout-danger{border-color:#dc2626;background:#fef2f2;color:#7f1d1d}   /* 重大な失敗条件 */
```

別トーン（クール / コーポレート / モノクロ等）をユーザーが明示した場合はそれに従う。

### 5. 挿絵：手書きホワイトボード風インフォグラフィック

gpt-image-2 で画像を作るときの**デフォルトのスタイル**は、温かみのある手書きホワイトボード風インフォグラフィック。**配置の default は「各章に 1 枚ずつ」**（冒頭の全体像と末尾の次の一歩は必須、各章の見出し直後に章扉図）。章が極端に短い・ユーザーが「画像は最小限で」と指定した場合は省略してよい。迷ったら作る方を選ぶ（1 枚生成して合わなければ捨てる）。

スタイル仕様（プロンプトに必ず入れる）:

```text
Style: hand-drawn whiteboard infographic
Background: warm cream / beige paper texture
Lines: thin hand-drawn pen lines
Accents: soft watercolor washes (teal, coral, mustard yellow, soft purple)
Typography: hand-lettered titles, casual rough lettering, no system fonts look
Components: numbered circle badges (①②③), hand-drawn arrows, rough icons
Tone: casual, warm, approachable — not corporate slick
Avoid: photorealism, brand logos, slick gradients, tiny unreadable text
```

- 番号ノード 4〜8 個 + 補助吹き出し 3〜6 個が目安だが、**文字数そのものは絞らなくてよい**（読みやすさが上限）
- **画像内に文字を入れるときは本文から逐語の正確な文字列をプロンプトに渡して文字化けを防ぐ**
- 契約・法務・見積などカジュアル感が場違いな文脈、HTML/CSS で十分な単純図には使わない
- 精密な比較表・コードが主役の章は、章扉も画像にせず HTML/CSS に落とす

**生成の実務（呼び出し方・並列一括生成・レビュー）は姉妹スキル `gallery-image-gen` に従う**（gpt-image-2 を Codex 経由・ChatGPT サブスクルートで呼ぶ共通エンジン。API 従量課金ルート禁止）。生成した画像は `gallery/<YYYYMM>-<slug>/<NN>-<topic>.png` に置き、HTML からは `/gallery/<フォルダ>/<ファイル>` で参照する。

画像の配置は章の見出し + リードの直下。**本文と画像の `max-width` を分けず同じコンテナ幅に統一する**（横長 16:9 なら 960〜1080px あたり）:

```css
.container { max-width: 980px; margin: 0 auto; padding: 0 28px; }
/* これだけ。container-wide / container-narrow に分けない */
```

### 6. 本文は段落が基本、カードは最小限

**最重要原則**: 本文の基本は流れる段落（`<p>`）。カード化（白い箱 + 影 + 角丸 + grid 配置）は、比較・並列が本質的に必要なときだけ使う。**情報がある = カードに分ける、ではない。**

カード化していい場面: それ自体がカード的な単位（実際のコメント等）、判定マトリクス、4〜6 枚のアイコン付きナビゲーション、比較が主目的の Before/After。

カード化してはいけない場面: 「3 つの理由」「3 本柱」「やる/やらない」のような**論点の列挙**（段落で書く）、リスク一覧・KPI 一覧（本文 + 太字 + コールアウトで十分）、ステップ説明（`<ol>` で十分）。

基本の型: 見出し → リード 1 行（muted）→ インフォグラフィック画像 → キャプション → 流れる `<p>` の本文 → 重要な一文だけコールアウト。カード grid を並べたくなったら「画像にした方が早いのでは」「段落で流せるのでは」を先に検討する。

MD の段落をそのまま流し込まない: 1 ブロック 1 メッセージ / 結論文はコールアウトや太字に格上げ / 同じことを言う 2 文は 1 文に / 「〜と考えております」等の装飾語は削る / 長い表は読み方を 1 行示してから置く。

### 7. Mermaid / テキストワイヤーの扱い

- 外部の Mermaid CDN は使わない。Mermaid ブロックは内容を読んで HTML/CSS カードまたはインライン SVG として再構成する（正確性が重要なら元コードを `<details>` に残してよい）
- テキストワイヤーは `<pre>` のまま残さず、可能なら HTML/CSS のワイヤーフレームカードに再構成する

### 8. 発展：読み物より「道具」が向く場面（任意）

読者が**触って判断する**ことが目的なら、読み物ではなく道具として設計してよい: 複数案のグリッド比較（各案にトレードオフのラベル）、diff + 行外注釈のコードレビュー解説、フロー図 + 要点コード + ハマりどころの explainer など。双方向 UI を作るときは「copy as JSON / markdown / prompt」のような**操作結果を貼り戻せる出口**を付ける。JS は最小限・外部ライブラリなし。

---

## やらないこと

- 外部 CDN / 外部フォント / 外部スクリプトの参照
- ラスタ画像の base64 data URI 埋め込み（画像は gallery へ）
- MD の見出し・表・段落を 1 対 1 で HTML タグに置換しただけの出力、章ごとに `<section>` を並べただけの構成
- 論点の列挙を白カード grid に変えるパターン、セクションごとに同じ「白カード×3」を量産するレイアウト
- 雰囲気画像で枚数を稼ぐ / 日本語ラベルが多い図を画像生成に任せる
- 警告色（赤・黄）の装飾使用
- OGP メタ・canonical の手書き（ビルドが注入する）
- 顧客名・案件固有情報・社内限定情報を本文に書く
- OpenAI Images API を直接叩く（画像生成は gallery-image-gen 経由・サブスクルートのみ）

---

## ビルドと検証

1. `bun run build` — メタ検証（title 幅・tags 5〜6・author 実在）+ OGP 画像・サムネイル生成 + ビューワー連携注入。エラーが出たらメッセージに従って原稿を直す
2. 静的検査:

   ```bash
   # 外部 CDN / 外部フォント / 外部スクリプト参照が残っていないか
   rg -n '<link[^>]+href="https?://|<script[^>]+src="https?://|fonts\.googleapis' htmls/<原稿>.html

   # base64 data URI 画像が残っていないか（残っていたら NG）
   rg -n 'data:image' htmls/<原稿>.html

   # <img> がすべて /gallery/ のルート相対パスになっているか
   rg -n '<img[^>]+src=' htmls/<原稿>.html
   ```

3. 表示確認: `bun run dev` で `/htmls/<slug>/`（ビューワー）を開く。ファーストビューで何のページか分かるか、画像が表示されるか、モバイル幅・ダークモードで破綻しないかを見る。サムネイル `public/htmls/<slug>.png` と OGP 画像 `public/htmls/<slug>-og.png` も開いて確認する
4. `bun run ci` が通ることを確認してから、commit / push はユーザーの指示を待つ（**push = 社外公開**。push 前に「公開されます」と一言添える）

## 完了報告

ユーザーには簡潔に: 原稿パスとビューワー URL / どんな読者・場面を想定して設計したか（1〜2 文）/ 採用した骨格 / 画像の使い方（生成・既存・なしの理由）/ 確認した検査 / 残課題。
