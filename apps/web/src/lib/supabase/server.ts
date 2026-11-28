import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

declare const __NEXT_PUBLIC_SUPABASE_URL__: string;
declare const __NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY__: string;

export async function createClient() {
  const cookieStore = await cookies();
  const url = __NEXT_PUBLIC_SUPABASE_URL__;
  const key = __NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY__;
  if (!url || !key) throw new Error("Supabase environment variables are not configured.");

  return createServerClient(url, key, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot write cookies; src/proxy.ts refreshes sessions.
        }
      },
    },
  });
}
