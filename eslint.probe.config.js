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
			complexity: ["warn", { max: 15 }],
			"@typescript-eslint/no-unused-vars": "off",
			"@typescript-eslint/no-explicit-any": "off",
			"no-console": "off",
		},
	},
	{
		ignores: ["main.js", "node_modules/**", "coverage/**", "dist/**", "e2e/archive/**", "*.config.*", "docs/**"],
	},
);
