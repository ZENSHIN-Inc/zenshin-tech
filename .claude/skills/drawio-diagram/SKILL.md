---
name: drawio-diagram
description: >
  draw.io Desktop CLI を使い、編集可能な `.drawio` 正本とスライド埋め込み用 SVG を作成・編集するスキル。
  **Use this skill whenever the user mentions** draw.io / drawio / diagrams.net / `.drawio` /
  draw.io で構成図・アーキテクチャ図・スイムレーン・ネットワーク図・複雑な接続図を作りたい、
  または既存の draw.io 図をスライドへ埋め込みたい、と言ったとき。
  スライドへ載せる図（構成図・アーキテクチャ図に加え、フロー・分岐・シーケンス・時系列も）は
  明示依頼がなくても原則すべて本スキルで作る。Mermaid は原則使わない。
---

# drawio-diagram Skill（編集可能な図をスライドへ埋め込む）

> Claude Code 用の派生スキルです。正本は `docs/agent-instructions/skills/drawio-diagram/SKILL.md.liquid`。`bun run sync:agent-docs` で生成するため、直接編集しないでください。

> **Core Principle**: `.drawio` を編集可能な正本、`.svg` を Marp へ埋め込む生成物として同じディレクトリへ置く。
> 図はスライドの補助素材であり、図だけでページの主張と読む順序が分かる状態にする。
> commit / push はユーザーの明示指示があるまでしない。

## Mermaid との関係（原則draw.io）

- **スライドへ載せる図は原則すべてdraw.ioで作る**: 構成図・アーキテクチャ図・関係図など「境界・配置」の図に加え、標準的なフロー、Yes / No分岐、シーケンス、時系列など「流れ」の図も本スキルで作る。該当するなら明示依頼を待たず積極的に使う
- **Mermaidは原則使わない**（ユーザー確認済みの方針）: 使うのはユーザーが明示的にMermaidを指定した場合だけ。既存の`.mmd`図は編集の機会にdraw.ioへ置き換え、`.mmd`と`mermaid-config.json`を削除する。同じ情報をMermaidとdraw.ioの両方で管理しない
- draw.io図は生成画像の挿絵ではなく構造図として扱うため、明示的な挿絵依頼は不要。ただしスライド全体へ機械的に増やさない

## 保存場所

公開スライド用の図は次の2ファイルを必ず対で保存する。

```text
assets/slides/<デッキ slug>/<図名>.drawio
assets/slides/<デッキ slug>/<図名>.svg
```

- `.drawio`だけ、またはSVGだけを残さない。修正可能性とビルド再現性の両方を保つ
- `gallery/`へ置かない。draw.io図は個別デッキの制作素材であり、ギャラリー掲載対象ではない
- ファイル名は内容が分かる英語ケバブケースにする

## 作成ワークフロー

1. **図の目的を1文にする**: 読者に理解させる順序・境界・依存関係を決める。装飾目的なら作らない
2. **横長で設計する**: `references/slide-layout.md` を読み、16:9スライドの本文領域へ収まる構図・文字量にする
3. **正本を作る**:
   - 標準図をdraw.ioへ持ち込みたい場合は、一時的なMermaidからdraw.io Desktop CLIでXMLへ変換してよい
   - 精密配置や固有シェイプが必要なら`.drawio` XMLを直接作る。手書きする前に`references/xml-authoring.md`を読む
   - 既存`.drawio`の軽微な修正は、対象セルだけを編集してレイアウト全体を壊さない
4. **SVGを書き出す**: 同梱の`bash scripts/export-slide-svg.sh <input.drawio> <output.svg>`を使う
5. **図単体を目視する**: 同梱の`bash scripts/export-check-png.sh <input.drawio> <確認用.png>`で確認用PNGを一時ディレクトリへ出し、構図・文字・接続線をチェックする
6. **Marpへ埋め込む**: 通常は `![w:960](../assets/slides/<デッキ slug>/<図名>.svg)`。結論文と同居する場合は`w:900`以下から調整する
7. **ページ側で検証する**: `bun run ci`を通し、`dist/slides/<デッキ>.pdf`の該当ページを目視する（例: `pdftoppm -f <頁> -l <頁> -r 100 -png dist/slides/<デッキ>.pdf <出力先>`でPNG化して確認）

## draw.io Desktop CLI

macOSでは次の順で実行ファイルを探す。同梱スクリプトが同じ順序で解決する。

1. `drawio`（PATH）
2. `draw.io`（PATH）
3. `/Applications/draw.io.app/Contents/MacOS/draw.io`

スライド用SVGには編集データを埋め込む`-e`を付けない。編集可能な`.drawio`正本を別に保持する方が、SVGを小さく保ち、正本と生成物の役割も明確になる。

```bash
/Applications/draw.io.app/Contents/MacOS/draw.io \
  -x -f svg -b 10 \
  -o assets/slides/<デッキ slug>/<図名>.svg \
  assets/slides/<デッキ slug>/<図名>.drawio
```

- `--layout`はdraw.io Desktopの版によって未対応なので、版を確認せず使わない
- CLIがない場合も`.drawio` XMLまでは作れる。SVG出力が必要ならユーザーへDesktop導入を依頼し、未検証の生成物を確定扱いしない
- コマンドが落ちる環境では連続リトライせず、Desktop GUIで開ける`.drawio`を残して状況を伝える

## 見た目の自己チェック

SVG生成後、対象ページをPNGへ変換して開き、最大2回まで修正する。

- 図全体がページ内に収まり、端が切れていない
- 最小文字が投影時にも読める。ラベルを詰めず、必要なら図を分割する
- 接続線が無関係なノードやラベルを横切らない
- 矢印の向き、境界、親子関係が一意に読める
- 白背景・枠・影を重ねず、SVG自体をスライド背景へ直接置く
- 色だけで意味を伝えず、ラベル・形・線種でも区別する

図だけを単独表示して良く見えても、タイトル・header・footerを含むMarpページでは切れることがある。必ず最終ページ側で確認する。

## やらないこと

- MarketplaceやMCPを必須依存にしない。ローカルファイルとDesktop CLIだけで再現できる状態を保つ
- 実行時にdraw.ioや外部CDNを読み込むHTMLを公開スライドへ埋め込まない
- `.drawio`とSVGを別ディレクトリへ分散させない
- 図を直すためにデッキ内へ自前CSSを追加しない
- 生成後にdraw.io Desktopを勝手に開かない。ユーザーへ絶対パスを提示する

## 参考実装

設計判断はdraw.io公式の `jgraph/drawio-mcp`（Apache-2.0）と
`Agents365-ai/drawio-skill`（MIT）のCLI・自己チェック運用を参考にし、ZENSHINのMarp公開フロー向けに絞っている。
参照時点のコミットは`references/upstream.md`に記録する。
