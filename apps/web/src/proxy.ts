import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "./lib/supabase/proxy";

const legacyPrefixes = [
  "/council",
  "/platform",
  "/school/registrations",
  "/school/teaching",
  "/school-registration",
  "/register",
  "/accept-teacher-invitation",
  "/prototype",
];

function isLegacyRoute(pathname: string) {
  return legacyPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export async function proxy(request: NextRequest) {
  if (process.env.NODE_ENV === "production" && isLegacyRoute(request.nextUrl.pathname)) {
    const destination = request.nextUrl.clone();
    destination.pathname = ["/register", "/school-registration", "/accept-teacher-invitation"].some(
      (prefix) => request.nextUrl.pathname === prefix || request.nextUrl.pathname.startsWith(`${prefix}/`),
    ) ? "/login" : "/workspace";
    destination.search = "";
    return NextResponse.redirect(destination);
  }

  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
