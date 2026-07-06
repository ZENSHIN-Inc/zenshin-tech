// スライドのはみ出し自動検知
//
// dist/slides/*.html を headless Chrome で開き、各ページ（Marp の inline SVG 内の section）の
// scrollHeight と clientHeight を比較して「領域外にあふれたページ」を機械判定する。
// Marp のスライドは固定領域（1280x720）なので、あふれた本文は静かに見切れる——
// PDF の全ページ目視に頼らず、まずこのチェックで NG ページだけに目視を絞るための道具。
//
// 使い方: bun run build のあとに `bun run check`（bun run ci にも組み込み済み）
// 注意: 検知できるのは「領域外へのあふれ」のみ。フッターとの微妙な重なり・画像との
//       バランスは、画像を入れたページに絞って PDF / PNG の目視で確認する。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SLIDES_DIR = path.join(ROOT, "dist", "slides");
// レンダリング誤差の許容値。これを超えてあふれたページのみ NG とする
const TOLERANCE_PX = 2;

interface Overflow {
  page: number;
  overflowPx: number;
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
    const overflows = (await page.evaluate(`
      (() => {
        const svgs = Array.from(document.querySelectorAll("svg[data-marpit-svg]"));
        const result = [];
        svgs.forEach((svg, i) => {
          let worst = 0;
          for (const sec of svg.querySelectorAll("foreignObject > section")) {
            // 全面背景レイヤー（bg 画像のコンテナ）は本文ではないので除外
            const bg = sec.getAttribute("data-marpit-advanced-background");
            if (bg === "background" || bg === "pseudo") continue;
            worst = Math.max(worst, sec.scrollHeight - sec.clientHeight);
          }
          if (worst > ${TOLERANCE_PX}) result.push({ page: i + 1, overflowPx: worst });
        });
        return result;
      })()
    `)) as Overflow[];

    if (overflows.length > 0) {
      hasOverflow = true;
      for (const o of overflows) {
        console.error(`NG  ${file}  page ${o.page}: ${o.overflowPx}px あふれ`);
      }
    } else {
      console.log(`OK  ${file}（${await page.evaluate('document.querySelectorAll("svg[data-marpit-svg]").length')} ページ）`);
    }
  }
} finally {
  await browser.close();
}

if (hasOverflow) {
  console.error("\nはみ出しページがあります。該当ページの本文を圧縮してください（slide-infographic スキルの「はみ出し調整」参照）。");
  process.exit(1);
}
