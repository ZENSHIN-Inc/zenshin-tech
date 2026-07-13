# MarpでMermaidを安定して使う

## 結論

公開スライドでは、Mermaidをブラウザ上で実行せず、`.mmd`からSVGを事前生成して画像として埋め込む。

- MarpにはMermaidの組み込みサポートがない
- JavaScriptを実行時に読み込む方式は、非同期描画やフォント計測の影響でHTML・PDF・PNGの見え方が揃わないことがある
- SVGを事前生成すれば、公開時にCDNやJavaScriptへ依存せず、Marpの全出力で同じ図を使える
- `.mmd`と生成済み`.svg`を両方コミットし、図の正本と公開成果物を残す

## 配置

デッキ固有の図は、引用図版と同じく`assets/slides/<デッキslug>/`へ置く。

```text
assets/slides/<デッキslug>/
├── diagram.mmd
├── mermaid-config.json
└── diagram.svg
```

`gallery/`はZENSHIN制作画像の公開ギャラリー用なので、スライド内の図は置かない。

## SVGを生成する

Mermaid CLIの版を固定して実行する。

```bash
bunx @mermaid-js/mermaid-cli@11.16.0 \
  -i assets/slides/<デッキslug>/diagram.mmd \
  -o assets/slides/<デッキslug>/diagram.svg \
  -c assets/slides/<デッキslug>/mermaid-config.json \
  -b transparent
```

Marpには通常の画像として埋め込む。

```markdown
![w:860](../assets/slides/<デッキslug>/diagram.svg)
```

## 4:3スライド向けの設計

- Yes / Noフローは原則`flowchart LR`にして、見出し下へ横長に収める
- 質問は5個程度までとし、1ノードを2行以内にする
- 分岐ラベルは`はい`／`いいえ`で統一する
- 製品名などの到達点は質問ノードと色・形を分ける
- 図だけで判断基準が伝わるようにし、本文で同じ一覧を繰り返さない
- SVGを更新したら、必ずMarpのPDFまたはPNGを再生成して該当ページを目視する

## 採用しない方式

公開デッキでは、次の方式を使わない。

- CDNからMermaidを読み込む`<script>`と`<div class="mermaid">`の実行時描画
- スライド内の独自`<style>`による図の調整
- カスタムmarkdown-it engineに依存するMermaid変換

いずれも検証や個人利用では動作し得るが、Marp CLI、VS Codeプレビュー、HTML、PDF、PNGの再現性を一つに揃えにくい。

## 検証手順

1. `.mmd`を修正してSVGを再生成する
2. 対象デッキをPNG化し、図の文字、矢印、分岐、余白を目視する
3. `bun run ci`でスキル同期、ビルド、はみ出し検知を通す
4. `dist/slides/<デッキ>.pdf`の該当ページを確認する

## 参考

- [Marp team discussion: Mermaid diagrams](https://github.com/orgs/marp-team/discussions/207)
- [Marp CLI: Use custom engine](https://github.com/marp-team/marp-cli#use-custom-engine)
- [Mermaid CLI](https://github.com/mermaid-js/mermaid-cli)
- [Zenn: MarpスライドにMermaidを埋め込む](https://zenn.dev/fuyu/articles/6070911587e18e)
- [Zenn scrap: MarpとMermaidの検証](https://zenn.dev/fuyu/scraps/d69fa864fed9b1)
- [Qiita: MarpでMermaidを使う](https://qiita.com/urakawa_jinsei/items/cdb80610727bdd1c225b)
