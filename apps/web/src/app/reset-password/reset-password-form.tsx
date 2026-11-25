"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { API_BASE } from "../../lib/api";
import { BrandLockup } from "../../components/brand-lockup";

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!token) {
      setError("This password reset link is missing its token. Request a new link.");
      return;
    }
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/auth/password-reset/complete`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (response.status === 400) {
        setError("This password reset link is invalid or has expired. Request a new link.");
        return;
      }
      if (response.status === 429) {
        setError("Too many reset attempts. Please wait before trying again.");
        return;
      }
      if (response.status === 503) {
        setError("Password reset protection is temporarily unavailable. Please try again shortly.");
        return;
      }
      if (!response.ok) {
        setError("Your password could not be reset. Please try again.");
        return;
      }
      setSuccess(true);
      setPassword("");
      setConfirmation("");
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
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--ink-strong)]">Choose a new password.</h1>
        {success ? <>
          <p role="status" className="mt-5 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-soft)] px-4 py-3 text-sm leading-6 text-[var(--brand)]">Your password has been changed. All existing sessions have been signed out. Sign in with your new password.</p>
          <Link href="/login" className="mt-6 flex w-full items-center justify-center rounded-xl bg-[var(--brand)] px-5 py-3.5 text-sm font-semibold text-white hover:bg-[var(--brand-strong)]">Continue to sign in</Link>
        </> : <>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">Choose a password with at least 12 characters. This one-time link expires after 30 minutes.</p>
          <form onSubmit={submit} className="mt-8 space-y-5">
            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-medium text-[var(--ink)]">New password</label>
              <input id="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm text-[var(--ink-strong)] outline-none focus:border-[var(--brand)] focus:ring-4 focus:ring-[var(--brand-soft)]" placeholder="At least 12 characters" />
            </div>
            <div>
              <label htmlFor="confirmation" className="mb-2 block text-sm font-medium text-[var(--ink)]">Confirm new password</label>
              <input id="confirmation" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm text-[var(--ink-strong)] outline-none focus:border-[var(--brand)] focus:ring-4 focus:ring-[var(--brand-soft)]" placeholder="Enter the same password again" />
            </div>
            {error ? <p role="alert" className="rounded-xl border border-[#fecaca] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">{error}</p> : null}
            <button type="submit" disabled={loading || !token} className="flex w-full items-center justify-center rounded-xl bg-[var(--brand)] px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--brand-strong)] disabled:cursor-not-allowed disabled:opacity-60">{loading ? "Updating password…" : "Update password"}</button>
          </form>
          <p className="mt-7 text-sm text-[var(--muted)]"><Link href="/forgot-password" className="font-semibold text-[var(--brand)] hover:underline">Request a new reset link</Link></p>
        </>}
      </section>
    </main>
  );
}
