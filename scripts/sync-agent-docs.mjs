#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_ROOT = "docs/agent-instructions/skills";
const CHECK = process.argv.includes("--check");
const FORCE = process.argv.includes("--force");
const TARGETS = {
  claude: ".claude/skills",
  codex: ".agents/skills",
};

const normalize = (value) => value.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";

function render(template, target, skill) {
  const other = target === "codex" ? "claude" : "codex";
  let result = template;
  const own = new RegExp(`\\{% if target == "${target}" %\\}([\\s\\S]*?)\\{% endif %\\}`, "g");
  const foreign = new RegExp(`\\{% if target == "${other}" %\\}([\\s\\S]*?)\\{% endif %\\}`, "g");
  result = result.replace(own, "$1").replace(foreign, "");
  if (/\{%|%\}/.test(result)) throw new Error(`未処理のテンプレート構文があります: target=${target}`);
  result = normalize(result);
  const heading = result.match(/^# .+$/m);
  if (!heading) throw new Error(`SKILL.md に H1 がありません: target=${target}`);
  const label = target === "codex" ? "Codex" : "Claude Code";
  const banner = `> ${label} 用の派生スキルです。正本は \`${SOURCE_ROOT}/${skill}/SKILL.md.liquid\`。\`bun run sync:agent-docs\` で生成するため、直接編集しないでください。`;
  return result.replace(heading[0], `${heading[0]}\n\n${banner}`);
}

function filesUnder(directory) {
  if (!existsSync(directory)) return [];
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...filesUnder(absolute));
    if (entry.isFile()) found.push(absolute);
  }
  return found;
}

function gitDirtyPaths() {
  const output = execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: ROOT, encoding: "utf8" });
  return new Set(output.split("\n").filter((line) => line.length >= 4).map((line) => line.slice(3).split(" -> ").at(-1)));
}

const plans = [];
const expected = new Set();
const sourceBase = path.join(ROOT, SOURCE_ROOT);
for (const skill of readdirSync(sourceBase, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()) {
  const skillSource = path.join(sourceBase, skill);
  const templatePath = path.join(skillSource, "SKILL.md.liquid");
  if (!existsSync(templatePath)) continue;
  const template = readFileSync(templatePath, "utf8");
  for (const [target, targetRoot] of Object.entries(TARGETS)) {
    const destinationRoot = path.join(ROOT, targetRoot, skill);
    const skillPath = path.join(destinationRoot, "SKILL.md");
    plans.push({ path: skillPath, content: render(template, target, skill) });
    expected.add(path.relative(ROOT, skillPath));
    for (const layer of ["common", target]) {
      const layerRoot = path.join(skillSource, layer);
      for (const source of filesUnder(layerRoot)) {
        const relative = path.relative(layerRoot, source);
        const destination = path.join(destinationRoot, relative);
        plans.push({ path: destination, content: readFileSync(source) });
        expected.add(path.relative(ROOT, destination));
      }
    }
  }
}

const generatedRoots = Object.values(TARGETS).map((value) => path.join(ROOT, value));
const stale = generatedRoots.flatMap(filesUnder).filter((file) => !expected.has(path.relative(ROOT, file)));
const changed = plans.filter(({ path: file, content }) => !existsSync(file) || !readFileSync(file).equals(Buffer.from(content)));

if (CHECK) {
  if (changed.length === 0 && stale.length === 0) {
    console.log("✅ Claude Code / Codex skills は正本と同期済み");
    process.exit(0);
  }
  console.error("❌ 生成済み skills が正本からドリフトしています:");
  for (const item of changed) console.error(`  changed: ${path.relative(ROOT, item.path)}`);
  for (const file of stale) console.error(`  stale: ${path.relative(ROOT, file)}`);
  process.exit(1);
}

if (!FORCE) {
  const dirty = gitDirtyPaths();
  const overwrites = [...changed.map((item) => item.path), ...stale]
    .map((file) => path.relative(ROOT, file))
    .filter((file) => dirty.has(file));
  if (overwrites.length > 0) {
    console.error("❌ 生成先に未コミット変更があるため停止しました。正本へ移すか、破棄してよい場合だけ --force を使ってください:");
    for (const file of overwrites) console.error(`  dirty: ${file}`);
    process.exit(1);
  }
}

for (const item of plans) {
  mkdirSync(path.dirname(item.path), { recursive: true });
  writeFileSync(item.path, item.content);
}
for (const file of stale) rmSync(file);
for (const root of generatedRoots) {
  for (const skill of readdirSync(root, { withFileTypes: true })) {
    if (!skill.isDirectory()) continue;
    const directory = path.join(root, skill.name);
    if (filesUnder(directory).length === 0) rmSync(directory, { recursive: true });
  }
}
console.log(`♻️ skills を再生成しました (${plans.length} files, ${stale.length} stale removed)`);
