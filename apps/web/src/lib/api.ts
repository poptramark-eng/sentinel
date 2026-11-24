const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";

interface CsrfResponse {
  csrfToken?: string;
}

let refreshInFlight: Promise<boolean> | null = null;

export function storeCsrfToken(token: string): void {
  if (typeof window !== "undefined" && token) {
    window.sessionStorage.setItem("cbe_csrf_token", token);
  }
}

async function getCsrfToken(): Promise<string | null> {
  const stored = window.sessionStorage.getItem("cbe_csrf_token");
  if (stored) return stored;

  const response = await fetch(`${API_BASE}/auth/csrf`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as CsrfResponse;
  if (!payload.csrfToken) return null;
  storeCsrfToken(payload.csrfToken);
  return payload.csrfToken;
}

async function refreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const csrf = await getCsrfToken();
    if (!csrf) return false;

    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "x-csrf-token": csrf },
      cache: "no-store",
    });
    if (!response.ok) return false;

    const payload = (await response.json()) as CsrfResponse;
    if (payload.csrfToken) storeCsrfToken(payload.csrfToken);
    return true;
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

export async function apiRequest(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const isMutation = !["GET", "HEAD", "OPTIONS"].includes(method);
  const isAuthEndpoint = ["/auth/login", "/auth/refresh", "/auth/csrf"].includes(path);

  const headers = new Headers(init.headers);
  if (isMutation && path !== "/auth/login" && path !== "/auth/refresh") {
    const csrf = await getCsrfToken();
    if (csrf) headers.set("x-csrf-token", csrf);
  }

  const request = () =>
    fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
      credentials: "include",
      cache: "no-store",
    });

  let response = await request();
  if (response.status !== 401 || isAuthEndpoint) return response;

  const refreshed = await refreshSession();
  if (!refreshed) return response;

  if (isMutation && path !== "/auth/login" && path !== "/auth/refresh") {
    const csrf = await getCsrfToken();
    if (csrf) headers.set("x-csrf-token", csrf);
  }

  response = await request();
  return response;
}

export function clearStoredCsrfToken(): void {
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem("cbe_csrf_token");
  }
}
