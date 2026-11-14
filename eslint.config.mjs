import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

/**
 * ESLint for every workspace, run once from the root (`npm run lint`, which CI
 * runs with `--max-warnings=0`, so a warning fails it too).
 *
 * The baseline matches Antiphony's: `@eslint/js` and `typescript-eslint`
 * recommended, and `_`-prefixed names may go unused. On top of it, rules that
 * hold CLAUDE.md's load-bearing principles where a reviewer could miss them:
 *
 *  - Record URIs are spelled only in `packages/domain/src/space-uri.ts`: no
 *    hand-written `startsWith("at://")` (docs/spaces-beta-readiness.md).
 *  - Use-cases reach the outside world only through ports: no vendor SDK,
 *    framework or adapter imports in `services/orchestrator/src/use-cases`.
 *    Pure atproto libraries (`TID`, `cidForLex`) are fine there.
 *  - The apps follow the rules of hooks.
 */
export default tseslint.config(
  {
    ignores: ["**/node_modules/", "**/dist/", "**/dev-dist/", "**/.wrangler/", "packages/srd/src/generated/"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name='startsWith'][arguments.0.value=/^at:/]",
          message:
            "Check record URIs with isRecordUri / parseSpaceRecordUri from @bardcast/domain (space-uri.ts): the space URI format may change.",
        },
      ],
    },
  },
  {
    // The one file allowed to know how a record URI is spelled.
    files: ["packages/domain/src/space-uri.ts"],
    rules: { "no-restricted-syntax": "off" },
  },
  {
    files: ["apps/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      // The classic two. The React Compiler rules in the plugin's
      // `recommended` preset (set-state-in-effect, refs, …) aren't on yet:
      // the apps don't pass them, and fixing them changes rendering.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
  {
    files: ["services/orchestrator/src/use-cases/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@anthropic-ai/*",
                "@atproto/oauth-client*",
                "@bbthorson/atproto-cf-auth*",
                "@neondatabase/*",
                "pg",
                "hono",
                "hono/*",
                "**/adapters/*",
              ],
              message: "Use-cases speak to the outside world through ports (src/ports). Put vendor code in an adapter.",
            },
          ],
        },
      ],
    },
  },
  {
    // Tests stub fetch and SDK clients with loose shapes.
    files: ["**/*.test.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
);
