/**
 * htmls コレクションの取得ヘルパー
 *
 * HTML ページが 1 本もない期間は、getCollection("htmls") が Astro の
 * 「The collection "htmls" does not exist or is empty」警告をページごとに出す。
 * prebuild が常に書き出す src/data/htmls.json を直接見て、空のときは
 * getCollection を呼ばずに済ませる（利用側はすべてこのヘルパー経由にする）。
 */
import { getCollection, type CollectionEntry } from "astro:content";
import htmlsData from "../data/htmls.json";

export async function getHtmls(): Promise<CollectionEntry<"htmls">[]> {
  if (!Array.isArray(htmlsData) || htmlsData.length === 0) return [];
  return getCollection("htmls");
}
