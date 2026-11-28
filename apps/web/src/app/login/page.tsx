"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BrandLockup } from "../../components/brand-lockup";
import { createClient } from "../../lib/supabase/client";

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
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) {
        setError("We could not sign you in. Check your credentials and try again.");
        return;
      }
      router.replace("/workspace");
      router.refresh();
    } catch {
      setError("Authentication is not configured yet. Please try again later.");
    } finally {
      setLoading(false);
    }
  }

  return <main className="grid min-h-screen bg-white lg:grid-cols-[1fr_0.9fr]">
    <section className="flex flex-col px-6 py-7 sm:px-10 lg:px-16">
      <BrandLockup />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand)]">School assessment workspace</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--ink-strong)] sm:text-4xl">Welcome back.</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">Sign in to manage assessments, learner marks and school results.</p>
        <form onSubmit={handleSubmit} className="mt-9 space-y-5">
          <label className="block"><span className="mb-2 block text-sm font-medium text-[var(--ink)]">Email address</span><input type="email" autoComplete="username" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} className="w-full rounded-xl border border-[var(--line)] px-4 py-3 text-sm outline-none focus:border-[var(--brand)] focus:ring-4 focus:ring-[var(--brand-soft)]" placeholder="you@school.org" /></label>
          <label className="block"><span className="mb-2 block text-sm font-medium text-[var(--ink)]">Password</span><input type="password" autoComplete="current-password" required minLength={8} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} className="w-full rounded-xl border border-[var(--line)] px-4 py-3 text-sm outline-none focus:border-[var(--brand)] focus:ring-4 focus:ring-[var(--brand-soft)]" placeholder="Your password" /></label>
          {error ? <p role="alert" className="rounded-xl border border-[#fecaca] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">{error}</p> : null}
          <button type="submit" disabled={loading} className="flex w-full items-center justify-center rounded-xl bg-[var(--brand)] px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--brand-strong)] disabled:opacity-60">{loading ? "Signing in…" : "Sign in"}</button>
        </form>
        <p className="mt-6 text-xs leading-5 text-[var(--subtle)]">Accounts are issued by the School Administrator. <Link href="/register" className="font-semibold text-[var(--brand)] hover:underline">Need an account?</Link> Email and SMS notifications are not part of this release.</p>
      </div>
      <div className="flex items-center justify-between text-xs text-[var(--subtle)]"><span>© {new Date().getFullYear()} cbe · Softflix</span><Link href="/" className="font-medium text-[var(--muted)] hover:text-[var(--brand)]">Back to home</Link></div>
    </section>
    <aside className="relative hidden overflow-hidden bg-[var(--canvas)] px-12 py-16 lg:flex lg:flex-col lg:justify-between">
      <div className="absolute -right-24 -top-20 size-[34rem] rounded-full bg-[var(--brand-soft)] blur-3xl" /><div className="absolute -bottom-40 -left-20 size-[30rem] rounded-full bg-[var(--accent-soft)] blur-3xl" />
      <div className="relative max-w-lg"><span className="inline-flex rounded-full border border-[var(--brand-border)] bg-white/80 px-3 py-1.5 text-xs font-semibold text-[var(--brand)]">Assessment-first by design</span><h2 className="mt-8 text-4xl font-semibold leading-[1.12] tracking-[-0.04em] text-[var(--ink-strong)]">Clear records. Confident decisions.</h2><p className="mt-5 max-w-md text-base leading-8 text-[var(--muted)]">Keep assessment setup, mark entry, corrections and school reporting connected in one focused workspace.</p></div>
      <div className="relative rounded-3xl border border-white bg-white/90 p-6 shadow-[0_24px_70px_-45px_rgba(31,65,125,0.4)]"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Assessment lifecycle</p><div className="mt-5 grid grid-cols-4 gap-2">{["Set up","Enter","Review","Publish"].map((step,i)=><div key={step} className="text-center"><div className={`mx-auto grid size-9 place-items-center rounded-xl text-xs font-bold ${i===3?"bg-[var(--brand)] text-white":"bg-[var(--brand-soft)] text-[var(--brand)]"}`}>{i+1}</div><p className="mt-2 text-[11px] font-medium text-[var(--muted)]">{step}</p></div>)}</div></div>
    </aside>
  </main>;
}
