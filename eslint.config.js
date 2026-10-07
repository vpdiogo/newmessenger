import js from "@eslint/js";
import vue from "eslint-plugin-vue";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/", "node_modules/", "**/dist/"],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  ...vue.configs["flat/essential"],
  {
    files: ["**/*.vue"],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
  },
  {
    files: ["apps/web/**/*.{ts,vue}"],
    languageOptions: { globals: globals.browser },
  },
);
