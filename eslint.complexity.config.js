import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    rules: {
      complexity: ["warn", { max: 20 }],
    },
  },
  {
    ignores: ["main.js", "node_modules/**", "coverage/**", "dist/**", "e2e/archive/**", "*.config.*", "docs/**"],
  },
);
