import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";

export default tseslint.config(
	eslint.configs.recommended,
	...tseslint.configs.recommended,
	prettierConfig,
	{
		files: ["src/**/*.ts"],
		rules: {
			// Complexity guard — flag functions that are too complex
			complexity: ["warn", { max: 30 }],

			// TypeScript-specific
			"@typescript-eslint/no-unused-vars": [
				"warn",
				{ argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
			],
			"@typescript-eslint/no-explicit-any": "warn",
			"@typescript-eslint/no-empty-function": "off",

			// Allow non-null assertions in this codebase (heavy Obsidian API usage)
			"@typescript-eslint/no-non-null-assertion": "off",

			// Relax for existing patterns
			"no-console": "warn",
			"prefer-const": "error",
			"no-useless-assignment": "warn",
		},
	},
	{
		files: ["tests/**/*.ts", "e2e/**/*.ts"],
		rules: {
			// Tests can be more relaxed
			"@typescript-eslint/no-explicit-any": "off",
			"no-console": "off",
		},
	},
	{
		ignores: [
			"main.js",
			"node_modules/**",
			"coverage/**",
			"dist/**",
			"e2e/archive/**",
			"*.config.*",
			"docs/**",
		],
	},
);
