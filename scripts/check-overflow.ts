// スライドのはみ出し自動検知
//
// dist/slides/*.html を headless Chrome で開き、各ページ（Marp の inline SVG 内の section）の
// scrollWidth / scrollHeight と clientWidth / clientHeight を比較して領域外へのあふれを検知し、
// タイトルや表セルの行数に加え、16:9で左へ偏りやすい二階層リストの指定漏れも確認する。
// Marp のスライドは固定領域（zenshin テーマは 1280x720）なので、あふれた本文は静かに見切れる——
// PDF の全ページ目視に頼らず、まずこのチェックで NG ページだけに目視を絞るための道具。
//
// 使い方: bun run build のあとに `bun run check`（bun run ci にも組み込み済み）
// 注意: フッターとの微妙な重なり・画像とのバランス・意味として不自然な改行は、
//       該当ページを PDF / PNG で目視確認する。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SLIDES_DIR = path.join(ROOT, "dist", "slides");
// レンダリング誤差の許容値。これを超えてあふれたページのみ NG とする
const TOLERANCE_PX = 2;

interface LayoutIssue {
  page: number;
  kind:
    | "overflow"
    | "title-wrap"
    | "table-cell-lines"
    | "table-cell-orphan"
    | "table-intro-layout"
    | "nested-list-layout";
  detail: string;
}

const htmlFiles = fs.existsSync(SLIDES_DIR)
  ? fs.readdirSync(SLIDES_DIR).filter((f) => f.endsWith(".html")).sort()
  : [];

if (htmlFiles.length === 0) {
  console.error("dist/slides/ に HTML がありません。先に `bun run build` を実行してください。");
  process.exit(1);
}

// ローカルは macOS の Chrome、CI（ubuntu-latest）はプリインストールの Google Chrome を使う。
// 見つからない環境では PUPPETEER_EXECUTABLE_PATH で明示する
const executablePath = process.env["PUPPETEER_EXECUTABLE_PATH"];
const browser = await puppeteer.launch(
  executablePath ? { executablePath } : { channel: "chrome" },
);

let hasOverflow = false;

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  for (const file of htmlFiles) {
    const url = pathToFileURL(path.join(SLIDES_DIR, file)).href;
    // Web フォント読み込み後のメトリクスで測りたいので networkidle まで待つ
    // （オフライン等でタイムアウトしても、フォールバックフォントの寸法で計測は続行できる）
    await page.goto(url, { waitUntil: "networkidle0", timeout: 15000 }).catch(() => {});
    await page.evaluate("document.fonts ? document.fonts.ready : null").catch(() => {});

    // tsconfig は DOM lib を含めない（Bun スクリプト用）ため、ブラウザ側コードは文字列で渡す
    const issues = (await page.evaluate(`
      (() => {
        const svgs = Array.from(document.querySelectorAll("svg[data-marpit-svg]"));
        const result = [];

        // 要素内の文字を実際の描画位置で行ごとにまとめる。
        // element.getClientRects() は表セル全体を1矩形で返すため、文字単位のRangeを使う。
        const visualLines = (element) => {
          const lines = [];
          const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            const node = walker.currentNode;
            for (let offset = 0; offset < node.data.length; offset += 1) {
              const char = node.data[offset];
              if (/\\s/.test(char)) continue;
              const range = document.createRange();
              range.setStart(node, offset);
              range.setEnd(node, offset + 1);
              const rect = range.getClientRects()[0];
              if (!rect || rect.width === 0 || rect.height === 0) continue;
              let line = lines.find((candidate) => Math.abs(candidate.top - rect.top) < 1.5);
              if (!line) {
                line = { top: rect.top, text: "" };
                lines.push(line);
              }
              line.text += char;
            }
          }
          return lines.sort((a, b) => a.top - b.top);
        };

        svgs.forEach((svg, i) => {
          for (const sec of svg.querySelectorAll("foreignObject > section")) {
            // 全面背景レイヤー（bg 画像のコンテナ）は本文ではないので除外
            const bg = sec.getAttribute("data-marpit-advanced-background");
            if (bg === "background" || bg === "pseudo") continue;

            const overflowX = sec.scrollWidth - sec.clientWidth;
            const overflowY = sec.scrollHeight - sec.clientHeight;
            if (overflowX > ${TOLERANCE_PX} || overflowY > ${TOLERANCE_PX}) {
              result.push({
                page: i + 1,
                kind: "overflow",
                detail: "横" + Math.max(0, overflowX) + "px / 縦" + Math.max(0, overflowY) + "px",
              });
            }

            const title = sec.querySelector("h1");
            if (title) {
              const lines = visualLines(title);
              if (lines.length > 1) {
                result.push({ page: i + 1, kind: "title-wrap", detail: lines.length + "行" });
              }
            }

            for (const cell of sec.querySelectorAll("th, td")) {
              const lines = visualLines(cell);
              const label = cell.textContent.trim().replace(/\\s+/g, " ").slice(0, 32);
              if (lines.length > 2) {
                result.push({
                  page: i + 1,
                  kind: "table-cell-lines",
                  detail: lines.length + "行: " + label,
                });
              } else if (lines.length > 1 && Array.from(lines.at(-1).text).length === 1) {
                result.push({
                  page: i + 1,
                  kind: "table-cell-orphan",
                  detail: "末尾「" + lines.at(-1).text + "」: " + label,
                });
              }
            }

            // 表の直前に通常段落や結論文を置くと、読む順序が「説明→表→結論」に分散する。
            // 表はタイトル直下へ置き、必要な結論は表の後ろへ回す。
            for (const table of sec.querySelectorAll("table")) {
              const previous = table.previousElementSibling;
              if (
                previous &&
                (previous.matches("p:not(.note)") || previous.matches("blockquote"))
              ) {
                result.push({
                  page: i + 1,
                  kind: "table-intro-layout",
                  detail: "表の直前に説明文があります",
                });
              }
            }

            // 3〜5項目の「見出し + 説明」型二階層リストを通常幅のまま置くと、
            // 16:9では文字が左半分へ固まり右側だけが空きやすい。
            // 画像の空白率は誤検知が多いため、構造を安定した代理指標として検知する。
            for (const list of Array.from(sec.children).filter(
              (child) => child.matches("ul, ol"),
            )) {
              const items = Array.from(list.children).filter((child) => child.matches("li"));
              const describedItems = items.filter((item) =>
                Array.from(item.children).some((child) => child.matches("ul, ol")),
              );
              if (
                items.length >= 3 &&
                items.length <= 5 &&
                describedItems.length === items.length &&
                !sec.classList.contains("detail-list")
              ) {
                result.push({
                  page: i + 1,
                  kind: "nested-list-layout",
                  detail: items.length + "項目の二階層リストに detail-list がありません",
                });
              }
            }
          }
        });
        return result;
      })()
    `)) as LayoutIssue[];

    if (issues.length > 0) {
      hasOverflow = true;
      for (const issue of issues) {
        console.error(`NG  ${file}  page ${issue.page} [${issue.kind}]: ${issue.detail}`);
      }
    } else {
      console.log(`OK  ${file}（${await page.evaluate('document.querySelectorAll("svg[data-marpit-svg]").length')} ページ）`);
    }
  }
} finally {
  await browser.close();
}

if (hasOverflow) {
  console.error("\nレイアウト上の問題があります。該当ページの改行・文章量・要素幅を見直してください。");
  process.exit(1);
}
