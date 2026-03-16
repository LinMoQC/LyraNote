/**
 * Scan for hardcoded Chinese strings in .ts/.tsx source files.
 *
 * Usage:  npx tsx scripts/scan-hardcoded-i18n.ts
 *
 * Outputs a categorised report of every Chinese string literal found,
 * grouped by file, with suggested translation key names.
 */

import * as fs from "fs";
import * as path from "path";

const SRC_DIR = path.resolve(__dirname, "../src");
const EXTENSIONS = [".ts", ".tsx"];
const CJK_RE = /[\u4e00-\u9fff]/;

// Directories / files to skip
const SKIP = new Set(["node_modules", ".next", "messages", "__tests__"]);

interface Hit {
  file: string;
  line: number;
  col: number;
  raw: string;       // the full line (trimmed)
  extracted: string;  // the Chinese string literal
  category: "jsx-text" | "string-literal" | "template-literal" | "attribute" | "comment";
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (EXTENSIONS.includes(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Extract Chinese string fragments from a source line.
 * Returns an array of { extracted, col, category }.
 */
function extractChinese(line: string, lineNo: number): Omit<Hit, "file" | "line" | "raw">[] {
  const results: Omit<Hit, "file" | "line" | "raw">[] = [];
  const trimmed = line.trimStart();

  // Skip pure imports, type-only lines
  if (/^import\s/.test(trimmed)) return results;
  if (/^\/\//.test(trimmed)) return results; // single-line comment (not hardcode)
  if (/^\*/.test(trimmed)) return results;   // block comment continuation

  // 1) JSX text: content between > and < that contains Chinese
  const jsxTextRe = />([^<]*[\u4e00-\u9fff][^<]*)</g;
  let m: RegExpExecArray | null;
  while ((m = jsxTextRe.exec(line)) !== null) {
    const text = m[1].trim();
    if (text && CJK_RE.test(text)) {
      results.push({ extracted: text, col: m.index + 1, category: "jsx-text" });
    }
  }

  // 2) String literals (single/double quoted) containing Chinese
  const strLitRe = /(?<!=\s*)["']([^"']*[\u4e00-\u9fff][^"']*)["']/g;
  while ((m = strLitRe.exec(line)) !== null) {
    const text = m[1].trim();
    if (!text) continue;
    // Skip if it's part of a className or import
    const before = line.slice(0, m.index);
    if (/className=/.test(before) && m.index - before.lastIndexOf("className=") < 20) continue;

    // Determine if it's a JSX attribute value
    const isAttr = /=\s*$/.test(before);
    results.push({
      extracted: text,
      col: m.index,
      category: isAttr ? "attribute" : "string-literal",
    });
  }

  // 3) Template literals containing Chinese
  const tmplRe = /`([^`]*[\u4e00-\u9fff][^`]*)`/g;
  while ((m = tmplRe.exec(line)) !== null) {
    results.push({ extracted: m[1].trim(), col: m.index, category: "template-literal" });
  }

  // Deduplicate (JSX text may overlap with string literal match)
  const seen = new Set<string>();
  return results.filter((r) => {
    const key = `${r.col}:${r.extracted}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function suggestKey(filePath: string, text: string): string {
  const rel = path.relative(SRC_DIR, filePath);
  // Derive a namespace from the file path
  const parts = rel.replace(/\.[^.]+$/, "").split(path.sep);
  // Use last meaningful segment as namespace
  let ns = parts[parts.length - 1]
    .replace(/[-_]/g, "")
    .replace(/([A-Z])/g, (_, c) => c.toLowerCase());

  // Shorten Chinese to a stub key
  const stub = text
    .replace(/[…、，。！？：""''（）\s]+/g, "_")
    .replace(/[^\u4e00-\u9fffa-zA-Z0-9_]/g, "")
    .slice(0, 20);

  return `${ns}.${stub}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const files = walk(SRC_DIR);
const allHits: Hit[] = [];

for (const file of files) {
  const content = fs.readFileSync(file, "utf-8");
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!CJK_RE.test(line)) continue;

    const hits = extractChinese(line, i + 1);
    for (const h of hits) {
      allHits.push({
        file,
        line: i + 1,
        col: h.col,
        raw: line.trimEnd(),
        extracted: h.extracted,
        category: h.category,
      });
    }
  }
}

// ── Report ────────────────────────────────────────────────────────────────────

const byFile = new Map<string, Hit[]>();
for (const h of allHits) {
  const rel = path.relative(path.resolve(__dirname, ".."), h.file);
  if (!byFile.has(rel)) byFile.set(rel, []);
  byFile.get(rel)!.push(h);
}

console.log(`\n${"═".repeat(70)}`);
console.log(`  硬编码中文扫描报告`);
console.log(`  共扫描 ${files.length} 个文件，发现 ${allHits.length} 处硬编码中文`);
console.log(`  涉及 ${byFile.size} 个文件`);
console.log(`${"═".repeat(70)}\n`);

// Stats by category
const catCount: Record<string, number> = {};
for (const h of allHits) {
  catCount[h.category] = (catCount[h.category] || 0) + 1;
}
console.log("  按类型统计:");
for (const [cat, count] of Object.entries(catCount).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${cat.padEnd(20)} ${count}`);
}
console.log();

// Per-file detail
for (const [rel, hits] of [...byFile.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n${"─".repeat(70)}`);
  console.log(`📄 ${rel}  (${hits.length} 处)`);
  console.log(`${"─".repeat(70)}`);
  for (const h of hits) {
    const key = suggestKey(h.file, h.extracted);
    console.log(`  L${String(h.line).padStart(4)}  [${h.category}]`);
    console.log(`         "${h.extracted}"`);
    console.log(`         → 建议 key: ${key}`);
  }
}

console.log(`\n${"═".repeat(70)}`);
console.log(`  扫描完毕。下一步：在 messages/zh.json 和 messages/en.json 中添加键，`);
console.log(`  然后在组件中用 useTranslations() 的 t() 函数替换硬编码文本。`);
console.log(`${"═".repeat(70)}\n`);
