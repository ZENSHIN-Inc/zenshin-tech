#!/usr/bin/env bun
/**
 * デプロイ前後の /index.json を比較し、新規公開された記事・スライドを Slack に通知する。
 * 通知には、投稿文を入力済みの X Web Intent ボタンを付ける。
 *
 * 入力（env）:
 *   SLACK_BOT_TOKEN    … chat:write 権限を持つ Bot Token（通知対象がある場合は必須）
 *   PREVIOUS_FEED_PATH … デプロイ前に取得した index.json（必須）
 *   CURRENT_FEED_PATH  … 今回ビルドした index.json（既定: dist/index.json）
 *   DRY_RUN            … true の場合は Slack に送らず通知内容を標準出力する
 */

import { readFile } from "node:fs/promises";

const CHANNEL = "C0AR25HMU2V";

type ContentItem = {
  slug: string;
  title: string;
  description: string;
  urls: { page: string };
};

type ContentFeed = {
  decks: ContentItem[];
  posts: ContentItem[];
};

type NewContent = ContentItem & {
  type: "blog" | "slide";
};

type Block = Record<string, unknown>;

function requirePath(name: string, fallback?: string): string {
  const value = process.env[name]?.trim() || fallback;
  if (!value) throw new Error(`${name} 未設定`);
  return value;
}

async function readFeed(path: string): Promise<ContentFeed> {
  const value = JSON.parse(await readFile(path, "utf8")) as Partial<ContentFeed>;
  if (!Array.isArray(value.decks) || !Array.isArray(value.posts)) {
    throw new Error(`不正なコンテンツフィード: ${path}`);
  }
  return value as ContentFeed;
}

function findNewContent(previous: ContentFeed, current: ContentFeed): NewContent[] {
  const previousKeys = new Set([
    ...previous.posts.map((item) => `blog:${item.slug}`),
    ...previous.decks.map((item) => `slide:${item.slug}`),
  ]);

  return [
    ...current.posts.map((item) => ({ ...item, type: "blog" as const })),
    ...current.decks.map((item) => ({ ...item, type: "slide" as const })),
  ].filter((item) => !previousKeys.has(`${item.type}:${item.slug}`));
}

function createXPost(item: NewContent): string {
  const kind = item.type === "blog" ? "技術記事" : "スライド";
  return [
    `ZENSHIN技術ブログで新しい${kind}を公開しました。`,
    "",
    `「${item.title}」`,
    "",
    item.urls.page,
    "",
    "#ZENSHIN技術ブログ",
  ].join("\n");
}

function escapeMrkdwn(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function createMessage(item: NewContent) {
  const kind = item.type === "blog" ? "技術記事" : "スライド";
  const emoji = item.type === "blog" ? "📝" : "📊";
  const headline = `${emoji} 新しい${kind}を公開しました`;
  const xPost = createXPost(item);
  const intentUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(xPost)}`;
  const quotedPost = xPost
    .split("\n")
    .map((line) => `>${escapeMrkdwn(line)}`)
    .join("\n");

  const blocks: Block[] = [
    {
      type: "header",
      text: { type: "plain_text", text: headline, emoji: true },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*<${item.urls.page}|${escapeMrkdwn(item.title)}>*\n${escapeMrkdwn(item.description)}`,
      },
    },
    { type: "divider" },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*X投稿文案*\n${quotedPost}` },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: `${kind}を開く`, emoji: true },
          url: item.urls.page,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Xで投稿する", emoji: true },
          url: intentUrl,
          style: "primary",
        },
      ],
    },
  ];

  return { text: `${headline}: ${item.title}`, blocks, xPost };
}

async function postToSlack(token: string, item: NewContent): Promise<void> {
  const message = createMessage(item);
  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ channel: CHANNEL, text: message.text, blocks: message.blocks }),
  });
  const data = (await response.json()) as { ok: boolean; error?: string; ts?: string };
  if (!response.ok || !data.ok) {
    throw new Error(`Slack chat.postMessage 失敗: ${data.error ?? response.status}`);
  }
  console.log(`Slack 投稿成功 (type=${item.type}, slug=${item.slug}, ts=${data.ts})`);
}

const previousPath = requirePath("PREVIOUS_FEED_PATH");
const currentPath = requirePath("CURRENT_FEED_PATH", "dist/index.json");
const [previous, current] = await Promise.all([
  readFeed(previousPath),
  readFeed(currentPath),
]);
const newContent = findNewContent(previous, current);

if (newContent.length === 0) {
  console.log("新規公開コンテンツなし（Slack 通知をスキップ）");
  process.exit(0);
}

if (process.env.DRY_RUN === "true") {
  for (const item of newContent) {
    console.log(JSON.stringify(createMessage(item), null, 2));
  }
  process.exit(0);
}

const token = process.env.SLACK_BOT_TOKEN?.trim();
if (!token) throw new Error("SLACK_BOT_TOKEN 未設定");

for (const item of newContent) {
  await postToSlack(token, item);
}
