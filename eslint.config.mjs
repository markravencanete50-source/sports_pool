import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Node CommonJS build/report scripts. These legitimately use require() and
    // run outside the bundler, so the TS/ESM rules do not apply to them.
    "scripts/**/*.cjs",
  ]),
  {
    rules: {
      /*
       * The inherited `any` backlog (~150 annotations) and the pagination
       * reset-in-effect findings were remediated in the 2026-08-10 lint-debt
       * cleanup: shared domain models and the ESPN feed mapping are typed, and
       * filter resets moved into event handlers / debounce callbacks. Both
       * rules are back at their error severity so new regressions block CI.
       * The few remaining intentional cases (genuine server-sync effects) carry
       * per-line disables with justifications.
       */
      "@typescript-eslint/no-explicit-any": "error",
      "react-hooks/set-state-in-effect": "error",
    },
  },
]);

export default eslintConfig;
