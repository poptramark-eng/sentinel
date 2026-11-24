"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";

interface RegistrationResponse {
  status?: string;
  message?: string;
  verificationPreviewUrl?: string;
}

function responseMessage(response: Response): string {
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("Retry-After"));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter >= 60
        ? `about ${Math.ceil(retryAfter / 60)} minute(s)`
        : `${retryAfter} second(s)`
      : "a little while";
    return `Too many requests. Please wait ${wait} before trying again.`;
  }
  return "We could not complete this request. Please review your details and try again.";
}

export default function RegisterPage() {
  const [givenName, setGivenName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function requestVerification(path: string) {
    const response = await fetch(`${API_BASE}/auth/${path}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        path === "register"
          ? { givenName, familyName, email, password }
          : { email },
      ),
    });

    if (!response.ok) throw new Error(responseMessage(response));
    const payload = (await response.json()) as RegistrationResponse;
    setMessage(payload.message ?? "If this address can be registered, a verification link will be sent.");
    setPreviewUrl(payload.verificationPreviewUrl ?? "");
    setSubmitted(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setPreviewUrl("");

    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await requestVerification("register");
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : "We could not create your account.";
      setError(detail);
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setError("");
    setLoading(true);
    try {
      await requestVerification("resend-verification");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We could not resend the verification email.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[1fr_0.9fr]">
      <section className="flex flex-col px-6 py-7 sm:px-10 lg:px-16">
        <Link href="/" className="flex w-fit items-center gap-3" aria-label="Sentinel home">
          <span className="grid size-10 place-items-center rounded-xl bg-[#2457c5] text-sm font-bold text-white">S</span>
          <span className="text-sm font-semibold tracking-tight text-[#172b4d]">Sentinel · Examination Management</span>
        </Link>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2457c5]">School onboarding</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[#172b4d] sm:text-4xl">Create your account.</h1>
          <p className="mt-3 text-sm leading-6 text-[#64748b]">Start with a verified personal account. You can then submit a school registration request for Council review.</p>

          {submitted ? (
            <div className="mt-9 rounded-2xl border border-[#dbe7f7] bg-[#f7faff] p-6" aria-live="polite">
              <div className="grid size-11 place-items-center rounded-full bg-[#e5f5ed] text-lg text-[#27825f]">✓</div>
              <h2 className="mt-4 text-lg font-semibold text-[#172b4d]">Check your inbox</h2>
              <p className="mt-2 text-sm leading-6 text-[#64748b]">{message}</p>
              {error ? <p role="alert" className="mt-3 rounded-xl border border-[#f3d0d0] bg-[#fff7f7] px-4 py-3 text-sm text-[#a33b3b]">{error}</p> : null}
              {previewUrl ? (
                <div className="mt-5 rounded-xl border border-dashed border-[#b8cbea] bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">Local development preview</p>
                  <a href={previewUrl} className="mt-2 inline-block break-all text-sm font-semibold text-[#2457c5] underline">Open verification link</a>
                </div>
              ) : null}
              <button
                type="button"
                onClick={handleResend}
                disabled={loading}
                className="mt-5 w-full rounded-xl border border-[#cbd8eb] bg-white px-4 py-3 text-sm font-semibold text-[#2457c5] transition hover:bg-[#f7faff] disabled:opacity-60"
              >
                {loading ? "Sending…" : "Resend verification email"}
              </button>
              <p className="mt-4 text-center text-sm text-[#64748b]">Already verified? <Link href="/login" className="font-semibold text-[#2457c5] hover:underline">Sign in</Link></p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="givenName" className="mb-2 block text-sm font-medium text-[#263b5b]">First name</label>
                  <input id="givenName" required maxLength={80} autoComplete="given-name" value={givenName} onChange={(event) => setGivenName(event.target.value)} className="w-full rounded-xl border border-[#dbe3ee] px-4 py-3 text-sm text-[#172b4d] outline-none transition focus:border-[#6d94e8] focus:ring-4 focus:ring-[#eaf1ff]" />
                </div>
                <div>
                  <label htmlFor="familyName" className="mb-2 block text-sm font-medium text-[#263b5b]">Last name</label>
                  <input id="familyName" required maxLength={80} autoComplete="family-name" value={familyName} onChange={(event) => setFamilyName(event.target.value)} className="w-full rounded-xl border border-[#dbe3ee] px-4 py-3 text-sm text-[#172b4d] outline-none transition focus:border-[#6d94e8] focus:ring-4 focus:ring-[#eaf1ff]" />
                </div>
              </div>
              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-medium text-[#263b5b]">Email address</label>
                <input id="email" type="email" required maxLength={254} autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-xl border border-[#dbe3ee] px-4 py-3 text-sm text-[#172b4d] outline-none transition focus:border-[#6d94e8] focus:ring-4 focus:ring-[#eaf1ff]" placeholder="you@institution.org" />
              </div>
              <div>
                <label htmlFor="password" className="mb-2 block text-sm font-medium text-[#263b5b]">Password</label>
                <input id="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl border border-[#dbe3ee] px-4 py-3 text-sm text-[#172b4d] outline-none transition focus:border-[#6d94e8] focus:ring-4 focus:ring-[#eaf1ff]" placeholder="At least 12 characters" />
              </div>
              <div>
                <label htmlFor="confirmPassword" className="mb-2 block text-sm font-medium text-[#263b5b]">Confirm password</label>
                <input id="confirmPassword" type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="w-full rounded-xl border border-[#dbe3ee] px-4 py-3 text-sm text-[#172b4d] outline-none transition focus:border-[#6d94e8] focus:ring-4 focus:ring-[#eaf1ff]" />
              </div>
              {error ? <p role="alert" className="rounded-xl border border-[#f3d0d0] bg-[#fff7f7] px-4 py-3 text-sm text-[#a33b3b]">{error}</p> : null}
              <button type="submit" disabled={loading} className="flex w-full items-center justify-center rounded-xl bg-[#2457c5] px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1e49a6] disabled:cursor-not-allowed disabled:opacity-60">
                {loading ? "Creating account…" : "Create account"}
              </button>
            </form>
          )}

          <p className="mt-6 text-xs leading-5 text-[#94a3b8]">Creating an account does not create a school membership or grant administrative access. School registration remains pending until the Platform Administrator approves it.</p>
        </div>

        <div className="flex items-center justify-between text-xs text-[#94a3b8]">
          <span>© {new Date().getFullYear()} Sentinel</span>
          <Link href="/login" className="font-medium text-[#64748b] hover:text-[#2457c5]">Back to sign in</Link>
        </div>
      </section>

      <aside className="relative hidden overflow-hidden bg-[#f2f6fc] px-12 py-16 lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-20 size-[34rem] rounded-full bg-[#dce9ff] blur-3xl" />
        <div className="absolute -bottom-40 -left-20 size-[30rem] rounded-full bg-[#e2f2ed] blur-3xl" />
        <div className="relative max-w-lg">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#d8e6ff] bg-white/80 px-3 py-1.5 text-xs font-semibold text-[#2457c5]">Verified identity first</div>
          <h2 className="mt-8 text-4xl font-semibold leading-[1.12] tracking-[-0.04em] text-[#172b4d]">A clear start, with authority earned through review.</h2>
          <p className="mt-5 max-w-md text-base leading-8 text-[#64748b]">Your account proves control of an email address. It does not approve a school, create a role or bypass Council governance.</p>
        </div>
        <div className="relative rounded-3xl border border-white bg-white/90 p-6 shadow-[0_24px_70px_-45px_rgba(31,65,125,0.4)]">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#64748b]">Onboarding sequence</p>
          <ol className="mt-5 space-y-4 text-sm text-[#52657f]">
            <li className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-lg bg-[#edf4ff] font-bold text-[#2457c5]">1</span> Verify your email</li>
            <li className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-lg bg-[#edf4ff] font-bold text-[#2457c5]">2</span> Submit school details</li>
            <li className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-lg bg-[#edf4ff] font-bold text-[#2457c5]">3</span> Await independent review</li>
          </ol>
        </div>
      </aside>
    </main>
  );
}
