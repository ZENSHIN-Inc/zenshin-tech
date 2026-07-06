---
name: gallery-image-gen
description: >
  gpt-image-2（Codex 組み込みの image_gen・ChatGPT サブスクルート）で画像を生成し、
  このリポジトリの `gallery/<YYYYMM>-<slug>/` に置いて公開するスキル。
  スライド挿絵・CG・アイキャッチなど用途を問わない「画像生成の共通エンジン」で、
  スライドへの差し込みまで行う場合は姉妹スキル slide-infographic がこのスキルを呼び出す。
  **Use this skill whenever the user mentions** 画像を作って / CG を作って / ギャラリーに画像を追加したい /
  gpt-image で生成したい / アイキャッチ・挿絵・イラストがほしい、と言ったとき。
---

# gallery-image-gen Skill（gpt-image-2 で画像を生成して gallery に置く）

> **Core Principle**: 画像生成は **Codex 組み込みの `image_gen`（gpt-image-2）** で行い、**ChatGPT サブスク内で完結させる（OpenAI API の従量課金ルートに入らない）**。生成した画像は `gallery/<YYYYMM>-<slug>/` に置き、main に push されると https://contents.zenshin-inc.co.jp/gallery/ で公開される。

## 置き場所と公開 URL（gallery/README.md の規約に従う）

- 置き場所: `gallery/<YYYYMM>-<slug>/<ファイル名>.png`（`gallery/` 直下に直接置かない。1 案件・1 テーマにつき 1 フォルダ）
- フォルダ名は「年月 + 内容がわかる英語ケバブケーススラッグ」（例: `202607-ai-seminar/`）
- 公開 URL（main に push 後）:
  - 一覧: https://contents.zenshin-inc.co.jp/gallery/
  - 直リンク: `https://contents.zenshin-inc.co.jp/gallery/<フォルダ名>/<ファイル名>`
- サイズ目安: 1 ファイル 5MB 以下・長辺 2400px 以下（gpt-image-2 の 1536x1024 / 1024x1536 なら通常問題ない）
- **push = 社外公開**。commit / push はユーザーの明示指示があるまでしない（リポジトリ運用方針）。push 前に「公開されます」を一言添える

## 基本ワークフロー

1. **用途とスタイルの確認**: 何のための画像か・枚数・トーン（手書き風イラスト / 写実 / フラットなど）をユーザーと合意する。スライド用インフォグラフィックの定型スタイルは slide-infographic スキル側にある
2. **プロンプトを組む**: 画像内に文字を入れる場合は、**曖昧な指示ではなく逐語の正確な文字列を渡す**（gpt-image の創作・誤字を防ぐ。文字は多めでも逐語で渡せば崩れない）
3. **1 枚試作 → 合意 → 残りを一括生成**（複数枚の場合。いきなり全部作らない）
4. **レビュー（必須）**: 生成画像を 1 枚ずつ開いて、文字化け・誤字・内容違いがないか確認。崩れていたらその 1 枚だけ再生成
5. **gallery へ配置**: `gallery/<YYYYMM>-<slug>/` へコピー。ファイル名は内容がわかる英語スラッグ（連番が要る用途は `<NN>-<slug>.png`）
6. commit / push はユーザーの指示があってから

## 画像生成（組み込み image_gen・API 課金を発生させない）

Codex の組み込み `image_gen`（gpt-image-2）を直接使う。**ChatGPT サブスク内で完結させ、API 従量課金ルートに入らないこと**。

- APIキーの設定・OpenAI Images API を直接叩くスクリプトの作成は不要（作らない）。組み込みツールを直接呼ぶ
- 生成物は `~/.codex/generated_images/<session>/ig_*.png` に出ることが多い。**1 枚ごとに**生成直後に `ls -t ~/.codex/generated_images/*/*.png | head -1` で最新を拾い、`gallery/<YYYYMM>-<slug>/<ファイル名>.png` へ `cp` する
- 複数枚の一括生成は、「1 枚生成 → 最新ファイルを目的の名前で cp」を**逐次**繰り返す（まとめて生成してから拾うと、どの画像がどのプロンプトか対応が取れなくなる）
- 独自判断でリポジトリ内へ直接保存しない。保存・リネームは生成後に `cp` で確定させる（重複ファイルが残ったら消す）

**gpt-image-2 の制約**:
- 透過背景非対応（必要なら `gpt-image-1.5 + background transparent`）。
- 辺は 16 の倍数、最大 3840px。横 1536 × 縦 1024（横長）・横 1024 × 縦 1536（縦長）が扱いやすい。

## やらないこと / 注意

- OpenAI Images API を直接叩かない（API キー・従量課金ルート禁止）。
- HTML/CSS/Playwright/SVG で「画像化した図表」を作って画像生成の代替にしない（ユーザーが明示した場合を除く）。
- 文字入り画像で、金額・固有名詞・日付など意味が変わる誤字を見逃さない。必ず目視してから配置する。
- `gallery/` 直下に直接画像を置かない。動画・PSD などの作業ファイルを gallery に置かない（公開する完成画像のみ）。
- commit / push はユーザーの明示指示があるまでしない。
