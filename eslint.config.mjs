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

      /*
       * Accessibility gate (audit FE-8). eslint-config-next ships
       * eslint-plugin-jsx-a11y but leaves most rules off or at warn; promoting
       * the high-signal ones to error makes CI the thing that keeps the
       * keyboard/screen-reader baseline from decaying. This is the automated
       * floor — it does not replace a manual assistive-technology pass, but it
       * catches the regressions that erode one.
       */
      "jsx-a11y/alt-text": "error",
      "jsx-a11y/anchor-has-content": "error",
      "jsx-a11y/anchor-is-valid": "error",
      "jsx-a11y/aria-props": "error",
      "jsx-a11y/aria-proptypes": "error",
      "jsx-a11y/aria-role": "error",
      "jsx-a11y/aria-unsupported-elements": "error",
      "jsx-a11y/click-events-have-key-events": "error",
      "jsx-a11y/heading-has-content": "error",
      "jsx-a11y/img-redundant-alt": "error",
      "jsx-a11y/interactive-supports-focus": "error",
      "jsx-a11y/label-has-associated-control": "error",
      "jsx-a11y/mouse-events-have-key-events": "error",
      "jsx-a11y/no-autofocus": "error",
      "jsx-a11y/no-noninteractive-element-interactions": "error",
      "jsx-a11y/no-noninteractive-tabindex": "error",
      "jsx-a11y/no-redundant-roles": "error",
      "jsx-a11y/no-static-element-interactions": "error",
      "jsx-a11y/role-has-required-aria-props": "error",
      "jsx-a11y/role-supports-aria-props": "error",
      "jsx-a11y/tabindex-no-positive": "error",
    },
  },
]);

export default eslintConfig;
