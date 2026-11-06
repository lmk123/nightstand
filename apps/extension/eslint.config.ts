import globals from "globals";
import { version as reactVersion } from "react";
import js from "@eslint/js";
import { ESLint } from "eslint";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import json from "@eslint/json";
import markdown from "@eslint/markdown";
import css from "@eslint/css";
import { defineConfig } from "eslint/config";

// @eslint/json's rules are typed against its own JSONSourceCode, which is not
// structurally assignable to ESLint's core Plugin type. Casting keeps the
// documented `plugins: { json }` usage while satisfying the type checker.
const jsonPlugin = json as unknown as ESLint.Plugin;

export default defineConfig([
  { ignores: ["dist/**"] },
  {
    files: ["**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      pluginReact.configs.flat.recommended,
      pluginReact.configs.flat["jsx-runtime"],
      reactHooks.configs.flat["recommended-latest"],
    ],
    languageOptions: { globals: globals.browser },
    // Must be an explicit version, not "detect": eslint-plugin-react's detection
    // path calls `context.getFilename()`, removed in ESLint 10, and throws.
    // Reading it off the installed React keeps it in sync with package.json.
    settings: { react: { version: reactVersion } },
  },
  {
    // Config files and tools/ scripts run in Node, so expose Node globals.
    files: ["**/*.config.{js,mjs,cjs,ts,mts,cts}", "tools/**/*.{js,mjs}"],
    languageOptions: { globals: globals.node },
  },
  { files: ["**/*.json"], plugins: { json: jsonPlugin }, language: "json/json" },
  { files: ["**/*.jsonc"], plugins: { json: jsonPlugin }, language: "json/jsonc" },
  { files: ["**/*.json5"], plugins: { json: jsonPlugin }, language: "json/json5" },
  { files: ["**/*.md"], plugins: { markdown }, language: "markdown/gfm" },
  {
    files: ["**/*.css"],
    plugins: { css },
    language: "css/css",
    languageOptions: { tolerant: true },
  },
]);
