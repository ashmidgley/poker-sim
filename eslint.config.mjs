import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Pure directories (PLAN.md section 3) may not depend on UI, framework,
// data or server code, and may not use ambient randomness or time.
const pureImportBans = {
  paths: [
    { name: "react", message: "Pure modules must not import React." },
    { name: "react-dom", message: "Pure modules must not import React." },
  ],
  patterns: [
    { group: ["next", "next/*"], message: "Pure modules must not import Next.js." },
    {
      group: [
        "@/components/*", "@/app/*", "@/game/*", "@/data/*", "@/db/*", "@/server/*", "@/workers/*",
        "**/components/*", "**/app/*", "**/game/*", "**/data/*", "**/db/*", "**/server/*", "**/workers/*",
      ],
      message: "Pure modules must not import UI, data, db, server or worker code.",
    },
  ],
};

const pureGlobalsBans = [
  "error",
  {
    selector: "MemberExpression[object.name='Math'][property.name='random']",
    message: "Use the seeded RNG from engine/rng.ts.",
  },
  {
    selector: "MemberExpression[object.name='Date'][property.name='now']",
    message: "Pass timestamps in; pure modules must not read the clock.",
  },
  {
    selector: "NewExpression[callee.name='Date']",
    message: "Pass timestamps in; pure modules must not read the clock.",
  },
  {
    selector: "MemberExpression[object.name='crypto']",
    message: "Pass ids in; pure modules must not generate them.",
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: [
      "src/engine/**/*.ts",
      "src/bots/**/*.ts",
      "src/analysis/**/*.ts",
      "src/bankroll/**/*.ts",
      "src/data/summarize.ts",
    ],
    rules: {
      "no-restricted-imports": ["error", pureImportBans],
      "no-restricted-syntax": pureGlobalsBans,
    },
  },
  {
    // The engine is the innermost layer: it may import only itself.
    files: ["src/engine/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          ...pureImportBans,
          patterns: [
            ...pureImportBans.patterns,
            {
              group: ["@/bots/*", "@/analysis/*", "@/bankroll/*", "**/bots/*", "**/analysis/*", "**/bankroll/*"],
              message: "The engine must not import anything outside src/engine.",
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
