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
      if (signInError) throw signInError;

      const { data: membership, error: membershipError } = await supabase
        .from("school_memberships")
        .select("school_id")
        .eq("status", "active")
        .maybeSingle();

      if (membershipError) throw membershipError;
      router.replace(membership ? "/workspace" : "/setup");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We could not sign you in. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[1fr_0.9fr]">
      <section className="flex flex-col px-6 py-7 sm:px-10 lg:px-16">
        <BrandLockup />
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-16">
          <p className="cbe-eyebrow">School workspace</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--ink-strong)] sm:text-4xl">Welcome back.</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">Sign in to manage learners, classes and assessment progress.</p>
          <form onSubmit={handleSubmit} className="mt-9 space-y-5">
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-medium">Email address</label>
              <input id="email" type="email" autoComplete="username" required maxLength={254}
                value={email} onChange={(event) => setEmail(event.target.value)} className="cbe-field" placeholder="you@school.ac.ke" />
            </div>
            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-medium">Password</label>
              <input id="password" type="password" autoComplete="current-password" required minLength={8} maxLength={128}
                value={password} onChange={(event) => setPassword(event.target.value)} className="cbe-field" placeholder="Your password" />
            </div>
            {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
            <button type="submit" disabled={loading} className="cbe-button cbe-button-primary w-full">
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
          <p className="mt-7 text-sm text-[var(--muted)]">Setting up a school for the first time? <Link href="/setup" className="font-semibold text-[var(--brand)] hover:underline">Start here</Link>.</p>
        </div>
        <div className="flex items-center justify-between text-xs text-[var(--subtle)]"><span>© {new Date().getFullYear()} cbe · Softflix</span><Link href="/" className="font-medium">Back to home</Link></div>
      </section>
      <aside className="relative hidden overflow-hidden bg-[var(--canvas)] px-12 py-16 lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-20 size-[34rem] rounded-full bg-[var(--brand-soft)] blur-3xl" />
        <div className="absolute -bottom-40 -left-20 size-[30rem] rounded-full bg-[var(--accent-soft)] blur-3xl" />
        <div className="relative max-w-lg">
          <span className="inline-flex items-center rounded-full border border-[var(--brand-border)] bg-white/80 px-3 py-1.5 text-xs font-semibold text-[var(--brand)]">Built around the school day</span>
          <h2 className="mt-8 text-4xl font-semibold leading-[1.12] tracking-[-0.04em] text-[var(--ink-strong)]">Less time reconciling marks. More time supporting learners.</h2>
          <p className="mt-5 max-w-md text-base leading-8 text-[var(--muted)]">A focused workspace for school administrators and teachers to keep learner records, assessments and progress connected.</p>
        </div>
        <div className="relative rounded-3xl border border-white bg-white/90 p-6 shadow-[0_24px_70px_-45px_rgba(31,65,125,0.4)]">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">A simpler workflow</p>
          <div className="mt-5 grid grid-cols-4 gap-2">{["Set up", "Capture", "Review", "Improve"].map((step, i) => <div key={step} className="text-center"><div className={i === 3 ? "mx-auto grid size-9 place-items-center rounded-xl bg-[var(--brand)] text-xs font-bold text-white" : "mx-auto grid size-9 place-items-center rounded-xl bg-[var(--brand-soft)] text-xs font-bold text-[var(--brand)]"}>{i + 1}</div><p className="mt-2 text-[11px] font-medium text-[var(--muted)]">{step}</p></div>)}</div>
        </div>
      </aside>
    </main>
  );
}
