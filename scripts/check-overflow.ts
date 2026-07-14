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
    | "table-centering"
    | "table-followup-alignment"
    | "left-heavy-layout"
    | "detail-list-inline-description"
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

            // 表はテーマが中央 82% 幅へ置く想定。CSS table layout の縮みなどで
            // 中央からずれたページを、セクションの content box に対する左右余白の実測差で検知する。
            {
              const secStyle = getComputedStyle(sec);
              const secRect = sec.getBoundingClientRect();
              const contentLeft = secRect.left + parseFloat(secStyle.paddingLeft);
              const contentRight = secRect.right - parseFloat(secStyle.paddingRight);
              for (const table of sec.querySelectorAll(":scope > table")) {
                // 要素の箱ではなくセルの実描画範囲で測る。display:block 化した表は
                // 「箱は中央・中身は左寄り」になり、要素ボックスの計測ではすり抜けるため
                let tableLeft = Infinity;
                let tableRight = -Infinity;
                for (const cell of table.querySelectorAll("th, td")) {
                  const cellRect = cell.getBoundingClientRect();
                  if (cellRect.width === 0) continue;
                  tableLeft = Math.min(tableLeft, cellRect.left);
                  tableRight = Math.max(tableRight, cellRect.right);
                }
                if (!Number.isFinite(tableLeft)) continue;
                const leftGap = tableLeft - contentLeft;
                const rightGap = contentRight - tableRight;
                if (Math.abs(leftGap - rightGap) > 8) {
                  result.push({
                    page: i + 1,
                    kind: "table-centering",
                    detail:
                      "表の左右余白が非対称です（左" +
                      Math.round(leftGap) +
                      "px / 右" +
                      Math.round(rightGap) +
                      "px）",
                  });
                }
              }
            }

            // table-followup は表と直後の補足リストを同じ読み幅へそろえる指定。
            // CSS table layout では width が内容幅へ縮むことがあるため、実測した左端で確認する。
            if (sec.classList.contains("table-followup")) {
              const table = sec.querySelector(":scope > table");
              const followup = table?.nextElementSibling;
              if (table && followup?.matches("ul, ol")) {
                const tableRect = table.getBoundingClientRect();
                const followupRect = followup.getBoundingClientRect();
                const leftDiff = Math.abs(tableRect.left - followupRect.left);
                if (leftDiff > 8) {
                  result.push({
                    page: i + 1,
                    kind: "table-followup-alignment",
                    detail: "表と補足の左端差 " + Math.round(leftDiff) + "px",
                  });
                }
              }
            }

            // 左揃えの本文を手動改行などで自然な折り返しより大幅に手前で折ると、
            // 本文が左半分へ固まって右側が空き、中央揃えのタイトル・結論と軸がずれて
            // ページ全体がちぐはぐに見える。本文テキストの実測右端の使用率で検知する。
            {
              const style = getComputedStyle(sec);
              const rect = sec.getBoundingClientRect();
              const cLeft = rect.left + parseFloat(style.paddingLeft);
              const cWidth = rect.right - parseFloat(style.paddingRight) - cLeft;
              const skip = ["center", "detail-list", "divider", "lead"].some((c) =>
                sec.classList.contains(c),
              );
              const prose = Array.from(sec.children).filter((el) =>
                el.matches("ul, ol, p:not(.note)"),
              );
              if (!skip && cWidth > 0 && prose.length > 0) {
                let maxRight = 0;
                let textLen = 0;
                let anchorLen = 0;
                const track = (r) => {
                  if (r && r.width > 0) maxRight = Math.max(maxRight, r.right);
                };
                for (const block of prose) {
                  textLen += block.textContent.length;
                  for (const anchor of block.querySelectorAll("a")) {
                    anchorLen += anchor.textContent.length;
                  }
                  const textWalker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
                  while (textWalker.nextNode()) {
                    const range = document.createRange();
                    range.selectNodeContents(textWalker.currentNode);
                    for (const r of range.getClientRects()) track(r);
                  }
                }
                // 表・カード・コールアウト・画像が右側を埋めているページはバランスが取れている
                for (const el of sec.querySelectorAll(":scope > table, :scope > div, img")) {
                  track(el.getBoundingClientRect());
                }
                const usage = (maxRight - cLeft) / cWidth;
                // 出典などのリンク集ページ（本文の半分以上がリンク文字列）は行が短くて正常なので除外
                const isLinkList = textLen > 0 && anchorLen / textLen >= 0.5;
                if (maxRight > 0 && !isLinkList && usage < 0.85) {
                  result.push({
                    page: i + 1,
                    kind: "left-heavy-layout",
                    detail: "本文の右側が空いています（本文右端 " + Math.round(usage * 100) + "%）",
                  });
                }
              }
            }

            // detail-list は「親項目の行 → 説明の行」の2行構成が前提。
            // CSS の影響などで説明が親項目と同じ行へ並ぶと、説明の長い項目だけ
            // 折り返して行数が不揃いになるため、説明の開始位置を実測で確認する。
            if (sec.classList.contains("detail-list")) {
              for (const item of sec.querySelectorAll(":scope > ul > li")) {
                const heading = item.querySelector(":scope > strong");
                const description = item.querySelector(":scope > ul");
                if (!heading || !description) continue;
                const headingRect = heading.getBoundingClientRect();
                const descriptionRect = description.getBoundingClientRect();
                if (descriptionRect.top < headingRect.bottom - 2) {
                  result.push({
                    page: i + 1,
                    kind: "detail-list-inline-description",
                    detail:
                      "説明が親項目と同じ行に並んでいます: " +
                      heading.textContent.trim().slice(0, 24),
                  });
                }
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
