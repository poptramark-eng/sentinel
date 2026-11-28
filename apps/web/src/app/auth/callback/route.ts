import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/workspace";
  return value;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next = safeNextPath(url.searchParams.get("next"));

  if (!tokenHash || type !== "invite") {
    return NextResponse.redirect(new URL("/login?error=invalid_invitation", url.origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "invite" });
  if (error) {
    return NextResponse.redirect(new URL("/login?error=invitation_expired", url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
