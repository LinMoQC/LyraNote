import tsParser from "@typescript-eslint/parser"
import tsPlugin from "@typescript-eslint/eslint-plugin"
import reactHooks from "eslint-plugin-react-hooks"

const noAiSdkRule = [
  "error",
  {
    patterns: [
      {
        group: ["openai", "@anthropic-ai/*", "litellm"],
        message: "禁止在前端导入 AI SDK。AI 调用只在后端 providers/ 层进行。",
      },
    ],
    paths: [
      {
        name: "axios",
        message: "禁止直接导入 axios。请使用 service 层和共享 api-client。",
      },
    ],
  },
]

export default [
  {
    ignores: ["dist/**", "node_modules/**", "src-tauri/**"],
  },
  {
    files: ["src/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "react-hooks": reactHooks,
    },
    rules: {
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-restricted-imports": noAiSdkRule,
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    files: ["src/features/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["openai", "@anthropic-ai/*", "litellm"],
              message: "禁止在前端导入 AI SDK。",
            },
          ],
          paths: [
            {
              name: "axios",
              message: "禁止在 features/ 或 components/ 中直接导入 axios。请调用 src/services/ 层的函数。",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/lib/http.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
]
