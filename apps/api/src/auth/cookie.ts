import { timingSafeEqual } from "node:crypto";

export interface CookieRequest {
  headers: {
    cookie?: string;
    "x-csrf-token"?: string | string[];
    origin?: string;
    referer?: string;
  };
}

export interface CookieReply {
  header(name: string, value: string | string[]): unknown;
}

const ACCESS_COOKIE = "cbe_access";
const REFRESH_COOKIE = "cbe_refresh";
const CSRF_COOKIE = "cbe_csrf";

export function readCookie(
  request: CookieRequest,
  name: string,
): string | null {
  const header = request.headers.cookie;
  if (!header) return null;

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key === name) {
      try {
        return decodeURIComponent(part.slice(separator + 1).trim());
      } catch {
        return null;
      }
    }
  }

  return null;
}

function cookieOptions(httpOnly: boolean, path: string, maxAge: number) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `Path=${path}; Max-Age=${maxAge}; SameSite=Lax${secure}${httpOnly ? "; HttpOnly" : ""}`;
}

export function setAuthCookies(
  reply: CookieReply,
  accessToken: string,
  refreshToken: string,
  csrfToken: string,
): void {
  reply.header("Set-Cookie", [
    `${ACCESS_COOKIE}=${encodeURIComponent(accessToken)}; ${cookieOptions(true, "/api", 600)}`,
    `${REFRESH_COOKIE}=${encodeURIComponent(refreshToken)}; ${cookieOptions(true, "/api/auth", 60 * 60 * 24 * 30)}`,
    `${CSRF_COOKIE}=${encodeURIComponent(csrfToken)}; ${cookieOptions(false, "/api", 60 * 60 * 24 * 30)}`,
  ]);
}

export function setCsrfCookie(reply: CookieReply, csrfToken: string): void {
  reply.header(
    "Set-Cookie",
    `${CSRF_COOKIE}=${encodeURIComponent(csrfToken)}; ${cookieOptions(false, "/api", 60 * 60 * 24 * 30)}`,
  );
}

export function clearAuthCookies(reply: CookieReply): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  reply.header("Set-Cookie", [
    `${ACCESS_COOKIE}=; Path=/api; Max-Age=0; SameSite=Lax; HttpOnly${secure}`,
    `${REFRESH_COOKIE}=; Path=/api/auth; Max-Age=0; SameSite=Lax; HttpOnly${secure}`,
    `${CSRF_COOKIE}=; Path=/api; Max-Age=0; SameSite=Lax${secure}`,
  ]);
}

export function hasTrustedOrigin(request: CookieRequest): boolean {
  const allowedOrigins = (process.env.WEB_ORIGIN ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const origin = request.headers.origin;
  const referer = request.headers.referer;
  let requestOrigin: string | null = null;

  try {
    requestOrigin =
      typeof origin === "string"
        ? new URL(origin).origin
        : typeof referer === "string"
          ? new URL(referer).origin
          : null;
  } catch {
    return false;
  }

  return Boolean(requestOrigin && allowedOrigins.includes(requestOrigin));
}

export function hasValidCsrf(request: CookieRequest): boolean {
  const cookie = readCookie(request, CSRF_COOKIE);
  const header = request.headers["x-csrf-token"];
  if (
    !cookie ||
    typeof header !== "string" ||
    !hasTrustedOrigin(request)
  ) {
    return false;
  }

  const left = Buffer.from(cookie);
  const right = Buffer.from(header);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function getAccessCookie(request: CookieRequest): string | null {
  return readCookie(request, ACCESS_COOKIE);
}

export function getRefreshCookie(request: CookieRequest): string | null {
  return readCookie(request, REFRESH_COOKIE);
}
