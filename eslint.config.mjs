import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // The habits section is separate, and data flows one way: habits may read nutrition, never the reverse.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/**/habits/**", "src/app/api/cron/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/**/habits", "@/**/habits/**", "**/habits/**"],
              message: "Nutrition code can't depend on the habits section; data only flows from nutrition to habits.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/**/habits/**/*.{ts,tsx}"],
    ignores: ["src/server/habits/nutrition-signals.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/server/repo", "../repo", "@/server/actions/*", "!@/server/actions/profile", "!@/server/actions/push", "@/lib/data", "@/lib/hooks"],
              message: "Habits read nutrition data only through src/server/habits/nutrition-signals.ts.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
