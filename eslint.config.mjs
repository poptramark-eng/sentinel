import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    settings: {
      react: { version: "19.3.1" },
    },
    rules: {
      // The application uses the App Router; there is no legacy pages directory.
      "@next/next/no-html-link-for-pages": "off",
    },
  },
  globalIgnores(["**/.next/**", "**/.cloudflare/**", "**/.vinext/**", "**/dist/**", "**/node_modules/**", "**/coverage/**"]),
]);
