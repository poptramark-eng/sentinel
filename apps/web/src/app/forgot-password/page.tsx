"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { API_BASE } from "../../lib/api";
import { BrandLockup } from "../../components/brand-lockup";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/auth/password-reset/request`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (response.status === 429) {
        setError("Too many reset requests. Please wait before trying again.");
        return;
      }
      if (response.status === 503) {
        setError("Password reset protection is temporarily unavailable. Please try again shortly.");
        return;
      }
      if (!response.ok) {
        setError("We could not process the request. Please try again.");
        return;
      }
      setMessage("If an active verified account exists for this email address, a password reset link will be sent. Check your inbox.");
    } catch {
      setError("The API could not be reached. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-white px-6 py-7 sm:px-10 lg:px-16">
      <BrandLockup />
      <section className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand)]">Account recovery</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--ink-strong)]">Reset your password.</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">Enter the verified email address associated with your Sentinel account. We will send a one-time reset link if an eligible account exists.</p>
        <form onSubmit={submit} className="mt-8 space-y-5">
          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-medium text-[var(--ink)]">Email address</label>
            <input id="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm text-[var(--ink-strong)] outline-none focus:border-[var(--brand)] focus:ring-4 focus:ring-[var(--brand-soft)]" placeholder="you@institution.org" />
          </div>
          {error ? <p role="alert" className="rounded-xl border border-[#fecaca] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">{error}</p> : null}
          {message ? <p role="status" className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-soft)] px-4 py-3 text-sm text-[var(--brand)]">{message}</p> : null}
          <button type="submit" disabled={loading} className="flex w-full items-center justify-center rounded-xl bg-[var(--brand)] px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--brand-strong)] disabled:cursor-not-allowed disabled:opacity-60">{loading ? "Sending request…" : "Send reset link"}</button>
        </form>
        <p className="mt-7 text-sm text-[var(--muted)]"><Link href="/login" className="font-semibold text-[var(--brand)] hover:underline">Back to sign in</Link></p>
      </section>
    </main>
  );
}
