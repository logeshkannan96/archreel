import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", ".claude/**"] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ["vitest.config.ts"] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    },
  },
  {
    // Rendering must be deterministic: every frame is a pure function of (scene, frame).
    files: ["packages/remotion/src/**"],
    rules: {
      "no-restricted-globals": ["error", { name: "Date", message: "Use frame-derived time." }],
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Use random(seed) from remotion." },
        { object: "performance", property: "now", message: "Use frame-derived time." },
      ],
    },
  },
  { files: ["**/*.js"], ...tseslint.configs.disableTypeChecked },
  prettier,
);
