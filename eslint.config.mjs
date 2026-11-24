import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    settings: {
      react: { version: "19.2.4" },
    },
    rules: {
      // The application uses the App Router; there is no legacy pages directory.
      "@next/next/no-html-link-for-pages": "off",
    },
  },
  globalIgnores(["**/.next/**", "**/dist/**", "**/node_modules/**", "**/coverage/**", "apps/web/src/themes/cbe/*.d.ts", "apps/web/src/themes/cbe/*.doc.mjs", "apps/web/themes/cbe/*.d.ts"]),
]);
