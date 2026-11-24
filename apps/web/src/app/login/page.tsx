"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { storeCsrfToken } from "../../lib/api";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";

interface CurrentUser {
  platformOperator?: { status: string; role: string } | null;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          setError("The email or password is incorrect.");
        } else if (response.status === 429) {
          const retryAfter = Number(response.headers.get("Retry-After"));
          const wait = Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter >= 60
              ? `about ${Math.ceil(retryAfter / 60)} minute(s)`
              : `${retryAfter} second(s)`
            : "a few minutes";
          setError(`Too many sign-in attempts. Please wait ${wait} before trying again.`);
        } else if (response.status === 503) {
          setError("Sign-in protection is temporarily unavailable. Please try again shortly.");
        } else {
          setError("We could not sign you in. Please try again.");
        }
        return;
      }

      const loginPayload = (await response.json()) as { csrfToken?: string };
      if (loginPayload.csrfToken) storeCsrfToken(loginPayload.csrfToken);

      const currentResponse = await fetch(`${API_BASE}/auth/me`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!currentResponse.ok) {
        setError("Your account could not be loaded. Please sign in again.");
        return;
      }

      const currentUser = (await currentResponse.json()) as CurrentUser;
      const isPlatformOperator =
        currentUser.platformOperator?.status === "ACTIVE" &&
        currentUser.platformOperator.role === "PLATFORM_ADMINISTRATOR";

      router.replace(
        isPlatformOperator ? "/platform/school-registrations" : "/workspace",
      );
    } catch {
      setError("The API could not be reached. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[1fr_0.9fr]">
      <section className="flex flex-col px-6 py-7 sm:px-10 lg:px-16">
        <a href="/" className="flex w-fit items-center gap-3" aria-label="CBE Platform home">
          <span className="grid size-10 place-items-center rounded-xl bg-[#2457c5] text-sm font-bold text-white">CBE</span>
          <span className="text-sm font-semibold tracking-tight text-[#172b4d]">Examination Management</span>
        </a>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2457c5]">Secure workspace</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[#172b4d] sm:text-4xl">Welcome back.</h1>
          <p className="mt-3 text-sm leading-6 text-[#64748b]">Sign in with your registered account to continue to your examination workspace.</p>

          <form onSubmit={handleSubmit} className="mt-9 space-y-5">
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-medium text-[#263b5b]">Email address</label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                required
                maxLength={254}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-xl border border-[#dbe3ee] bg-white px-4 py-3 text-sm text-[#172b4d] outline-none transition placeholder:text-[#9aa8ba] focus:border-[#6d94e8] focus:ring-4 focus:ring-[#eaf1ff]"
                placeholder="you@institution.org"
              />
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor="password" className="block text-sm font-medium text-[#263b5b]">Password</label>
                <span className="text-xs text-[#94a3b8]">12 characters minimum</span>
              </div>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                minLength={12}
                maxLength={128}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-xl border border-[#dbe3ee] bg-white px-4 py-3 text-sm text-[#172b4d] outline-none transition placeholder:text-[#9aa8ba] focus:border-[#6d94e8] focus:ring-4 focus:ring-[#eaf1ff]"
                placeholder="Enter your password"
              />
            </div>

            {error ? (
              <p role="alert" className="rounded-xl border border-[#f3d0d0] bg-[#fff7f7] px-4 py-3 text-sm text-[#a33b3b]">{error}</p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center rounded-xl bg-[#2457c5] px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1e49a6] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-7 text-xs leading-5 text-[#94a3b8]">New school? <Link href="/register" className="font-semibold text-[#2457c5] hover:underline">Create an account to begin school registration.</Link></p>
        </div>

        <div className="flex items-center justify-between text-xs text-[#94a3b8]">
          <span>© {new Date().getFullYear()} CBE Platform</span>
          <a href="/" className="font-medium text-[#64748b] hover:text-[#2457c5]">Back to home</a>
        </div>
      </section>

      <aside className="relative hidden overflow-hidden bg-[#f2f6fc] px-12 py-16 lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-20 size-[34rem] rounded-full bg-[#dce9ff] blur-3xl" />
        <div className="absolute -bottom-40 -left-20 size-[30rem] rounded-full bg-[#e2f2ed] blur-3xl" />
        <div className="relative max-w-lg">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#d8e6ff] bg-white/80 px-3 py-1.5 text-xs font-semibold text-[#2457c5]">A clear process. Accountable outcomes.</div>
          <h2 className="mt-8 text-4xl font-semibold leading-[1.12] tracking-[-0.04em] text-[#172b4d]">One trusted place for every stage of assessment.</h2>
          <p className="mt-5 max-w-md text-base leading-8 text-[#64748b]">Role-aware workspaces keep school operations focused while approvals, authority and result release remain traceable.</p>
        </div>
        <div className="relative rounded-3xl border border-white bg-white/90 p-6 shadow-[0_24px_70px_-45px_rgba(31,65,125,0.4)]">
          <div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#64748b]">Governed workflow</span><span className="rounded-lg bg-[#eaf8f2] px-2.5 py-1.5 text-[11px] font-semibold text-[#27825f]">Traceable</span></div>
          <div className="mt-5 grid grid-cols-4 gap-2">
            {["Submit", "Review", "Approve", "Release"].map((step, index) => <div key={step} className="text-center"><div className={`mx-auto grid size-9 place-items-center rounded-xl text-xs font-bold ${index === 3 ? "bg-[#2457c5] text-white" : "bg-[#edf4ff] text-[#2457c5]"}`}>{index + 1}</div><p className="mt-2 text-[11px] font-medium text-[#64748b]">{step}</p></div>)}
          </div>
        </div>
      </aside>
    </main>
  );
}
