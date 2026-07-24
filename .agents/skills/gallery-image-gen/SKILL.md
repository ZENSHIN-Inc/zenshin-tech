---
name: gallery-image-gen
description: >
  gpt-image-2（Codex の組み込み image_gen・ChatGPT サブスクルート）で画像を生成し、
  このリポジトリの `gallery/<YYYYMM>-<slug>/` に置いて公開するスキル。
  スライド挿絵・HTML ページ挿絵・CG・アイキャッチなど用途を問わない「画像生成の共通エンジン」で、
  スライドへの差し込みは姉妹スキル slide-infographic が、HTML ページへの差し込みは
  姉妹スキル zenshin-html がこのスキルを呼び出す。呼び出し規約・ハマりどころの正本はこのファイル。
  **Use this skill whenever the user mentions** 画像を作って / CG を作って / ギャラリーに画像を追加したい /
  gpt-image で生成したい / アイキャッチ・挿絵・イラストがほしい、と言ったとき。
---

# gallery-image-gen Skill（gpt-image-2 で画像を生成して gallery に置く）

> Codex 用の派生スキルです。正本は `docs/agent-instructions/skills/gallery-image-gen/SKILL.md.liquid`。`bun run sync:agent-docs` で生成するため、直接編集しないでください。

> **Core Principle**: 画像生成は **Codex の組み込み `image_gen`（gpt-image-2）** で行い、**ChatGPT サブスク内で完結させる（OpenAI API の従量課金ルートに入らない）**。生成した画像は `gallery/<YYYYMM>-<slug>/` に置き、main に push されると `https://tech.zenshin-inc.co.jp/gallery/<フォルダ>/<ファイル>` で配信される（公開一覧ページはない。スライド等からの参照用）。

## 置き場所と公開 URL（gallery/README.md の規約に従う）

- 置き場所: `gallery/<YYYYMM>-<slug>/<ファイル名>.png`（`gallery/` 直下に直接置かない。1 案件・1 テーマにつき 1 フォルダ）
- フォルダ名は「年月 + 内容がわかる英語ケバブケーススラッグ」（例: `202607-ai-seminar/`）
- 公開 URL（main に push 後）: `https://tech.zenshin-inc.co.jp/gallery/<フォルダ名>/<ファイル名>`（公開一覧ページはない。スライド・HTML ページ等からの参照用）
- サイズ目安: 1 ファイル 5MB 以下・長辺 2400px 以下（gpt-image-2 の 1536x1024 / 1024x1536 なら通常問題ない）
- **push = 社外公開**。commit / push はユーザーの明示指示があるまでしない（リポジトリ運用方針）。push 前に「公開されます」を一言添える

## 基本ワークフロー

1. **用途とスタイルの確認**: 何のための画像か・枚数・トーン（手書き風イラスト / 写実 / フラットなど）をユーザーと合意する。スライド用インフォグラフィックの定型スタイルは slide-infographic スキル側にある
2. **プロンプトを組む**: 画像内に文字を入れる場合は、**曖昧な指示ではなく逐語の正確な文字列を渡す**（gpt-image の創作・誤字を防ぐ。文字は多めでも逐語で渡せば崩れない）
3. **1 枚試作 → 合意 → 残りを一括生成**（複数枚の場合。いきなり全部作らない）

4. **レビュー（必須）**: 生成画像を 1 枚ずつ開いて、文字化け・誤字・内容違いがないか確認。崩れていたらその 1 枚だけ再生成

5. **gallery へ配置**: `gallery/<YYYYMM>-<slug>/` へコピー。ファイル名は内容がわかる英語スラッグ（連番が要る用途は `<NN>-<slug>.png`）
6. commit / push はユーザーの指示があってから

## 画像生成（Codex 経由・API 課金を発生させない）

Codex の組み込み `image_gen`（gpt-image-2）を使う。**ChatGPT サブスク内で完結させ、API 従量課金ルートに入らないこと**。1 枚だけの生成は自セッションの組み込みツールを直接呼んでよい（API キーの設定・OpenAI Images API を直接叩くスクリプトの作成は不要 = 作らない）。複数枚の一括生成は下記の `codex exec` プロトコル（並列一括生成）を使う。

**前提確認**:
- `~/.codex/auth.json` の `OPENAI_API_KEY` が `null`（サブスク＝ChatGPT OAuth ルート）。値が入っていたら従量課金の恐れ → ユーザーに確認。
- `tokens.id_token` に `chatgpt_plan_type`（plus 等）があり、サブスク有効期間内。
- `codex` CLI が使える（`which codex`）。

**呼び出し**:
```bash
codex exec --dangerously-bypass-approvals-and-sandbox --cd "<書き出し可能ディレクトリ>" "<プロンプト>" < /dev/null
```
- **`< /dev/null` を必ず付ける**。`codex exec` は stdin が開いたままだと「Reading additional input from stdin...」で入力を待ち続け、バックグラウンド実行・シェルスクリプト内では**無限に停止する**（フォアグラウンドのツール実行では偶然 EOF になり動くため気づきにくい）。

- **OpenAI 側が不安定だと `ERROR: Reconnecting... N/5` のままログ更新が止まり、codex exec が何十分もハングする**（放置では回復しないことが多い）。打ち切り基準: 「`ERROR: Reconnecting` がログに出てから90秒以上ログ更新がない」または「1試行が8分超」。検知したら kill して**同じプロンプトで再実行**すれば大抵通る（生成済みの他の画像はそのまま使えるので、失敗した1枚だけやり直す）。並列一括生成スクリプトにはこの監視＋自動リトライが組み込み済み。**単発実行（試作1枚目）もバックグラウンドで起動し、ログを定期的に確認して上記基準で打ち切り・再実行する**（フォアグラウンドで黙って待たない）。

- `--full-auto` はサンドボックスのネットワークブロックで `fetch failed` になるため `--dangerously-bypass-approvals-and-sandbox` を使う。
- 指示文に「**組み込みの image_gen ツールを直接使って、APIキーやスクリプトは不要。OpenAI Images APIを直接叩かない**」を必ず入れる（入れないと Codex が API 直叩きスクリプトを自動生成して課金ルートに逸れる）。
- 生成物は **`--cd` ではなく `~/.codex/generated_images/<session>/ig_*.png`** に出ることが多い。**1枚だけ生成するとき**は、生成直後に `ls -t ~/.codex/generated_images/*/*.png | head -1` で最新を拾い、目的のファイル名へ `cp` してよい（この「最新ファイル差分」方式は並列だと混線するため、複数枚では使わない → 下記「複数枚の並列一括生成」）。
- **`--cd` はリポジトリ実体に向けず、作業用スクラッチディレクトリ（/tmp のジョブディレクトリ等）を指定する**。codex はサンドボックス解除下で `--cd` 配下へ独自判断で画像を保存することがあり、リポジトリの gallery ディレクトリを `--cd` にすると**確定済みの画像ファイルを上書きする事故**が起きる。最終確認はスクラッチの候補ファイルではなく **gallery 配下の最終ファイルを `Read` で開いて行う**。
- **保存・リネームはこちらのスクリプト側でやる。プロンプトに「./xx.png で保存して」と書かない** — Codex は指示しなくても気を利かせて独自の英語ファイル名で作業ディレクトリに保存することがあり、保存指示と二重になって重複ファイルが残る（残ったら消す）。プロンプト末尾に「生成した画像の絶対パスを最終メッセージで出力して」と頼むのは保存指示ではないので問題ない（並列一括生成のマッピングはこれを使う）。

**gpt-image-2 の制約**:
- 透過背景非対応（必要なら `gpt-image-1.5 + background transparent`）。
- 辺は 16 の倍数、最大 3840px。横 1536 × 縦 1024（横長）・横 1024 × 縦 1536（縦長）が扱いやすい。

## 複数枚の並列一括生成

1枚あたり1〜3分かかるため、合意後の一括生成を逐次ループで回すと「枚数 × 数分」の待ちになる。**一括生成は並列で行う**。ジョブ↔画像の対応は「ジョブ専用ディレクトリ + `--output-last-message`」で決定的に取れるので、並列でも混線しない。

1. ジョブルート（例 `/tmp/imggen-<slug>/`）配下に 1 枚ごとの `job-<NN>/` を作り、各 `job-<NN>/prompt.txt` にプロンプト全文を書き出す。ファイル渡しにすると長い日本語プロンプトの引用符エスケープ事故も防げる

2. 本スキル同梱の `scripts/parallel-imggen.sh` をバックグラウンドで実行する:

   ```bash
   zsh <スキルのbaseディレクトリ>/scripts/parallel-imggen.sh /tmp/imggen-<slug>
   ```
   スクリプトは各ジョブを `--cd job-<NN>` + `-o job-<NN>/last.txt`（最終メッセージの書き出し）付きで並列起動し、最終メッセージから PNG パスを取り出して `job-<NN>/out.png` に確定させる。各ジョブには停滞検知ウォッチドッグ付き: `ERROR: Reconnecting` 後にログ更新が `STALL_SECS`（default 90秒）止まる／1試行が `ATTEMPT_TIMEOUT`（default 480秒）を超える／終了したのに画像がない（`AuthorizationRequired` 等の即死）場合は打ち切り、`MAX_ATTEMPTS`（default 3回）まで同条件で自動リトライする
3. 完了後、各 `job-<NN>/out.png` を `gallery/<YYYYMM>-<slug>/<NN>-<slug>.png` へコピーする
4. `out.png` がないジョブだけ `log.txt` を見て個別に再実行する（全部やり直さない）
5. 同時実行数は `MAX_PARALLEL`（default 4）。ログにレート制限系のエラーが出ていなければ上げてよく、出たら下げて失敗分だけ再実行する

並列化しても「1枚試作 → 合意 → 残りを一括」の順序と、生成後のレビュー（1枚ずつ `Read` で誤字確認）は省略しない。

## やらないこと / 注意

- OpenAI Images API を直接叩かない（API キー・従量課金ルート禁止）。
- HTML/CSS/Playwright/SVG で「画像化した図表」を作って画像生成の代替にしない（ユーザーが明示した場合を除く）。
- 文字入り画像で、金額・固有名詞・日付など意味が変わる誤字を見逃さない。必ず `Read` で目視してから配置する。
- `gallery/` 直下に直接画像を置かない。動画・PSD などの作業ファイルを gallery に置かない（公開する完成画像のみ）。
- commit / push はユーザーの明示指示があるまでしない。
