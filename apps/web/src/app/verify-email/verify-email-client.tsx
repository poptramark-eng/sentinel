"use client";

import Link from "next/link";
import { useState } from "react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";

export function VerifyEmailClient({ token }: { token: string }) {
  const [status, setStatus] = useState<"ready" | "loading" | "success" | "error">("ready");
  const [message, setMessage] = useState("");

  async function verify() {
    setStatus("loading");
    setMessage("");
    try {
      const response = await fetch(`${API_BASE}/auth/verify-email`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!response.ok) {
        setStatus("error");
        setMessage(response.status === 429
          ? "Too many verification attempts. Please wait before trying again."
          : response.status === 503
            ? "Email verification protection is temporarily unavailable. Please try again shortly."
            : "This verification link is invalid, expired or has already been used.");
        return;
      }
      setStatus("success");
      setMessage("Your email address is verified. Your account is now active.");
    } catch {
      setStatus("error");
      setMessage("We could not reach the verification service. Check your connection and try again.");
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#f4f7fc] px-5 py-12">
      <section className="w-full max-w-lg rounded-3xl border border-[#e2e8f0] bg-white p-7 shadow-[0_24px_70px_-45px_rgba(31,65,125,0.3)] sm:p-10">
        <Link href="/" className="flex w-fit items-center gap-3" aria-label="Sentinel home">
          <span className="grid size-10 place-items-center rounded-xl bg-[#2457c5] text-sm font-bold text-white">S</span>
          <span className="text-sm font-semibold tracking-tight text-[#172b4d]">Sentinel</span>
        </Link>
        <p className="mt-9 text-xs font-semibold uppercase tracking-[0.16em] text-[#2457c5]">Email verification</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[#172b4d]">Confirm your email.</h1>
        {!token ? (
          <p className="mt-4 text-sm leading-6 text-[#64748b]">This link does not contain a verification token. Return to account creation to request a new link.</p>
        ) : status === "ready" ? (
          <>
            <p className="mt-4 text-sm leading-6 text-[#64748b]">Confirm that you control this email address. Opening the page alone does not consume the link; it is used only when you press the button below.</p>
            <button onClick={verify} className="mt-8 w-full rounded-xl bg-[#2457c5] px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-[#1e49a6]">Verify email address</button>
          </>
        ) : (
          <div className="mt-6" aria-live="polite">
            {status === "success" ? <div className="grid size-11 place-items-center rounded-full bg-[#e5f5ed] text-lg text-[#27825f]">✓</div> : null}
            <p className={`text-sm leading-6 ${status === "success" ? "text-[#27825f]" : "text-[#64748b]"}`}>{status === "loading" ? "Verifying your email…" : message}</p>
            {status === "success" ? <Link href="/login" className="mt-6 inline-flex w-full justify-center rounded-xl bg-[#2457c5] px-5 py-3.5 text-sm font-semibold text-white hover:bg-[#1e49a6]">Continue to sign in</Link> : null}
            {status === "error" ? <button onClick={verify} className="mt-6 w-full rounded-xl border border-[#cbd8eb] px-5 py-3 text-sm font-semibold text-[#2457c5] hover:bg-[#f7faff]">Try again</button> : null}
          </div>
        )}
        <p className="mt-8 text-center text-xs leading-5 text-[#94a3b8]">Need another link? <Link href="/register" className="font-semibold text-[#2457c5] hover:underline">Return to account setup</Link></p>
      </section>
    </main>
  );
}
