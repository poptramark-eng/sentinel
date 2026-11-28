import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

declare const __NEXT_PUBLIC_SUPABASE_URL__: string;
declare const __NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY__: string;

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = __NEXT_PUBLIC_SUPABASE_URL__;
  const key = __NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY__;

  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });

  // Revalidate the session on every matched request before server-rendered pages use it.
  await supabase.auth.getClaims();
  return response;
}
