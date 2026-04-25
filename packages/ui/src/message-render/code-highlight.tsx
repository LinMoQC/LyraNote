import { Fragment } from "react";
import type { ReactNode } from "react";
import { common, createLowlight } from "lowlight";

const lowlight = createLowlight(common);

lowlight.registerAlias({
  bash: ["console", "shell", "sh", "zsh"],
  javascript: ["jsx", "js", "mjs", "node"],
  markdown: ["md"],
  typescript: ["cts", "mts", "ts", "tsx"],
  yaml: ["yml"],
});

const registeredLanguages = new Set(lowlight.listLanguages());
const autoDetectSubset = [
  "bash",
  "css",
  "diff",
  "go",
  "java",
  "javascript",
  "json",
  "kotlin",
  "markdown",
  "python",
  "ruby",
  "rust",
  "sql",
  "swift",
  "typescript",
  "xml",
  "yaml",
].filter((language) => registeredLanguages.has(language));

const languageAliases: Record<string, string> = {
  cjs: "javascript",
  html: "xml",
  htm: "xml",
  ini: "plaintext",
  js: "javascript",
  jsx: "javascript",
  json5: "json",
  jsonc: "json",
  plaintext: "plaintext",
  shellscript: "bash",
  ts: "typescript",
  tsx: "typescript",
  text: "plaintext",
  txt: "plaintext",
};

const languageLabels: Record<string, string> = {
  bash: "Bash",
  css: "CSS",
  diff: "Diff",
  go: "Go",
  html: "HTML",
  htm: "HTML",
  java: "Java",
  js: "JavaScript",
  javascript: "JavaScript",
  json: "JSON",
  kotlin: "Kotlin",
  md: "Markdown",
  markdown: "Markdown",
  plaintext: "Plain text",
  python: "Python",
  ruby: "Ruby",
  rust: "Rust",
  sh: "Bash",
  shell: "Bash",
  sql: "SQL",
  swift: "Swift",
  text: "Plain text",
  ts: "TypeScript",
  tsx: "TSX",
  typescript: "TypeScript",
  txt: "Plain text",
  xml: "XML",
  yaml: "YAML",
  yml: "YAML",
  zsh: "Bash",
};

const tokenClassMap: Record<string, string> = {
  attr: "text-[#73daca]",
  attribute: "text-[#73daca]",
  addition: "text-[#9ece6a]",
  built_in: "text-[#7dcfff]",
  bullet: "text-[#ff9e64]",
  char: "text-[#9ece6a]",
  class_: "font-semibold",
  code: "text-[#7dcfff]",
  comment: "text-[#565f89] italic",
  deletion: "text-[#f7768e]",
  doctag: "text-[#bb9af7]",
  emphasis: "italic",
  formula: "text-[#7dcfff]",
  function_: "font-semibold",
  keyword: "text-[#bb9af7]",
  link: "text-[#73daca] underline decoration-[#73daca]/40 underline-offset-2",
  literal: "text-[#ff9e64]",
  meta: "text-[#7dcfff]",
  name: "text-[#f7768e]",
  number: "text-[#ff9e64]",
  operator: "text-[#89ddff]",
  params: "text-[#c0caf5]",
  property: "text-[#7dcfff]",
  punctuation: "text-[#89ddff]",
  quote: "text-[#565f89] italic",
  regexp: "text-[#b4f9f8]",
  section: "text-[#7aa2f7] font-semibold",
  "selector-attr": "text-[#73daca]",
  "selector-class": "text-[#7dcfff]",
  "selector-id": "text-[#ff9e64]",
  "selector-pseudo": "text-[#bb9af7]",
  "selector-tag": "text-[#f7768e]",
  string: "text-[#9ece6a]",
  strong: "font-semibold",
  subst: "text-[#c0caf5]",
  symbol: "text-[#ff9e64]",
  tag: "text-[#f7768e]",
  "template-tag": "text-[#bb9af7]",
  "template-variable": "text-[#e0af68]",
  title: "text-[#7aa2f7]",
  "title.class_": "text-[#7aa2f7] font-semibold",
  "title.function_": "text-[#7aa2f7] font-semibold",
  type: "text-[#2ac3de]",
  variable: "text-[#e0af68]",
};

export interface HighlightedCode {
  displayLanguage?: string;
  isHighlighted: boolean;
  rendered: ReactNode[];
}

interface HighlightNode {
  type: string;
  value?: string;
  tagName?: string;
  properties?: {
    className?: string[] | string;
  };
  children?: HighlightNode[];
}

interface HighlightTree {
  children: HighlightNode[];
  data?: {
    language?: string;
    relevance?: number;
  };
}

export function highlightCode(
  code: string,
  language?: string,
): HighlightedCode {
  const rawLanguage = extractLanguage(language);
  const normalizedLanguage = normalizeLanguage(rawLanguage);
  const displayLanguage = formatLanguageLabel(
    rawLanguage ?? normalizedLanguage,
  );

  const tree = createHighlightTree(code, normalizedLanguage);
  const detectedLanguage = tree?.data?.language;
  const relevance = tree?.data?.relevance ?? 0;
  const isHighlighted = Boolean(
    tree &&
    tree.children.length > 0 &&
    (normalizedLanguage || (detectedLanguage && relevance >= 2)),
  );

  return {
    displayLanguage: displayLanguage ?? formatLanguageLabel(detectedLanguage),
    isHighlighted,
    rendered: isHighlighted
      ? renderNodes(tree?.children ?? [], "code")
      : [code],
  };
}

function createHighlightTree(
  code: string,
  language?: string,
): HighlightTree | null {
  if (!code.trim()) return null;

  try {
    if (
      language &&
      language !== "plaintext" &&
      registeredLanguages.has(language)
    ) {
      return lowlight.highlight(language, code) as HighlightTree;
    }

    if (language === "plaintext") {
      return null;
    }

    if (!autoDetectSubset.length) {
      return lowlight.highlightAuto(code) as HighlightTree;
    }

    return lowlight.highlightAuto(code, {
      subset: autoDetectSubset,
    }) as HighlightTree;
  } catch {
    return null;
  }
}

function renderNodes(nodes: HighlightNode[], keyPrefix: string): ReactNode[] {
  return nodes.map((node, index) => renderNode(node, `${keyPrefix}-${index}`));
}

function renderNode(node: HighlightNode, key: string): ReactNode {
  if (node.type === "text") {
    return <Fragment key={key}>{node.value ?? ""}</Fragment>;
  }

  const children = renderNodes(node.children ?? [], key);

  if (node.type === "element" && node.tagName === "span") {
    const tokenClassName = resolveTokenClassName(node.properties?.className);
    const token = resolveTokenName(node.properties?.className);

    return (
      <span key={key} data-code-token={token} className={tokenClassName}>
        {children}
      </span>
    );
  }

  return <Fragment key={key}>{children}</Fragment>;
}

function resolveTokenClassName(
  className?: string[] | string,
): string | undefined {
  const classes = normalizeClassNames(className);
  const resolved = classes.flatMap((name) => {
    const token = name.replace(/^hljs-/, "");
    return tokenClassMap[token] ? [tokenClassMap[token]] : [];
  });

  return resolved.length > 0
    ? Array.from(new Set(resolved)).join(" ")
    : undefined;
}

function resolveTokenName(className?: string[] | string): string | undefined {
  return normalizeClassNames(className)
    .map((name) => name.replace(/^hljs-/, ""))
    .find(Boolean);
}

function normalizeClassNames(className?: string[] | string): string[] {
  if (Array.isArray(className)) return className;
  if (typeof className === "string")
    return className.split(/\s+/).filter(Boolean);
  return [];
}

function extractLanguage(language?: string): string | undefined {
  const normalized = language
    ?.replace(/^language-/, "")
    .trim()
    .toLowerCase();
  return normalized || undefined;
}

function normalizeLanguage(language?: string): string | undefined {
  if (!language) return undefined;
  if (registeredLanguages.has(language)) return language;

  const aliased = languageAliases[language];
  if (aliased === "plaintext") return aliased;
  if (aliased && registeredLanguages.has(aliased)) return aliased;

  return undefined;
}

function formatLanguageLabel(language?: string): string | undefined {
  if (!language) return undefined;
  return languageLabels[language] ?? language;
}
