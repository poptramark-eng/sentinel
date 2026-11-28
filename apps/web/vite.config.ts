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
    // Next-style public variables must be embedded at build time for browser code.
    // Both values are public Supabase client configuration, never server secrets.
    define: {
      "process.env.NEXT_PUBLIC_SUPABASE_URL": JSON.stringify(supabaseUrl),
      "process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
        supabasePublishableKey,
      ),
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
