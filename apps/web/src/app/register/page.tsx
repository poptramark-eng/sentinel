import Link from "next/link";
import { BrandLockup } from "../../components/brand-lockup";

export default function AccountAccessPage() {
  return (
    <main className="min-h-screen bg-[var(--canvas)] px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-2xl">
        <BrandLockup href="/" />
        <section className="mt-12 rounded-2xl border border-[var(--line)] bg-white p-6 shadow-[var(--shadow-card)] sm:p-9">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--brand)]">Account access</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--ink-strong)]">Accounts are issued by your school.</h1>
          <p className="mt-4 text-sm leading-7 text-[var(--muted)]">Public self-registration is disabled so an unverified visitor cannot create an account or claim a school role.</p>
          <div className="mt-7 rounded-xl border border-[var(--line)] bg-[var(--surface-subtle)] p-5">
            <h2 className="font-semibold text-[var(--ink-strong)]">If you are a teacher</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Ask your School Administrator to create your account. They will give you a one-time setup link. After accepting it, the administrator can assign your classes and learning areas.</p>
          </div>
          <div className="mt-4 rounded-xl border border-[var(--line)] p-5">
            <h2 className="font-semibold text-[var(--ink-strong)]">If you are setting up this school for the first time</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-[var(--muted)]">
              <li>The initial School Administrator account must first be created by the system owner in the <a href="https://supabase.com/dashboard/project/jnbosxwvruczovnownlg/auth/users" className="font-semibold text-[var(--brand)] underline" target="_blank" rel="noreferrer">Supabase Auth Users dashboard</a>.</li>
              <li>Use that account to <Link href="/login" className="font-semibold text-[var(--brand)] underline">sign in</Link>.</li>
              <li>Complete the one-time school setup when prompted.</li>
            </ol>
            <p className="mt-3 text-xs leading-5 text-[var(--subtle)]">Do not create other accounts before the initial School Administrator. The first account is the only one permitted to complete initial setup.</p>
          </div>
          <div className="mt-7 flex flex-wrap items-center gap-3"><Link href="/login" className="rounded-lg bg-[var(--brand)] px-5 py-3 text-sm font-semibold text-white">Back to sign in</Link><Link href="/" className="text-sm font-medium text-[var(--muted)]">Home</Link></div>
        </section>
      </div>
    </main>
  );
}
