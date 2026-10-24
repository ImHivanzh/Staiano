import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  globalIgnores([
    ".next*/**",
    ".cache/**",
    "dist-exe/**",
    "license-server/public/webauthn.js",
    "node_modules/**",
    "public/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
  ]),
]);
