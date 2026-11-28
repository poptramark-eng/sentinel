import { defineConfig, loadEnv } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), "");
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? fileEnv.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    fileEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    "";

  return {
    // Explicit globals guarantee public Supabase configuration is embedded in every
    // Vite environment (browser, SSR and RSC) instead of reading process.env at runtime.
    define: {
      __NEXT_PUBLIC_SUPABASE_URL__: JSON.stringify(supabaseUrl),
      __NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY__: JSON.stringify(supabasePublishableKey),
    },
    plugins: [
      vinext(),
      cloudflare({
        viteEnvironment: {
          name: "rsc",
          childEnvironments: ["ssr"],
        },
      }),
    ],
  };
});
