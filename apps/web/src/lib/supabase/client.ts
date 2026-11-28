import { createBrowserClient } from "@supabase/ssr";

declare const __NEXT_PUBLIC_SUPABASE_URL__: string;
declare const __NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY__: string;

export function createClient() {
  const url = __NEXT_PUBLIC_SUPABASE_URL__;
  const key = __NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY__;
  if (!url || !key) throw new Error("Supabase environment variables are not configured.");
  return createBrowserClient(url, key);
}
