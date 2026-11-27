import Link from "next/link";
import { BrandLockup } from "../components/brand-lockup";

const capabilities = [
  { number: "01", title: "Assessment governance", description: "Set up your academic year, classes and learning areas before the school term begins." },
  { number: "02", title: "School operations", description: "Keep learner records, class placement and teacher responsibilities connected." },
  { number: "03", title: "Controlled mark collection", description: "Give teachers a focused way to enter marks, correct mistakes and track completion." },
  { number: "04", title: "Trusted reporting", description: "Understand learner progress with reliable class and school-level reports." },
];
const lifecycle = [
  ["01", "Assessment setup", "Configure"],
  ["02", "Learner participation", "Prepare"],
  ["03", "Marks collection", "Capture"],
  ["04", "Review and moderation", "Verify"],
  ["05", "Approved results", "Release"],
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <header className="border-b border-[var(--line)] bg-white">
        <div className="mx-auto flex w-full max-w-[var(--content-max)] items-center justify-between px-5 py-4 sm:px-8">
          <BrandLockup />
          <nav aria-label="Main navigation" className="flex items-center gap-2 sm:gap-4">
            <a href="#platform" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-[var(--muted)] hover:bg-[var(--surface-subtle)] sm:inline-flex">Platform</a>
            <Link href="/setup" className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-[var(--muted)] hover:text-[var(--brand-strong)] sm:inline-flex">Set up school</Link>
            <Link href="/login" className="inline-flex min-h-10 items-center justify-center rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-strong)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--brand-soft)]">Sign in</Link>
          </nav>
        </div>
      </header>
      <section className="border-b border-[var(--line)] bg-white">
        <div className="mx-auto grid w-full max-w-[var(--content-max)] gap-12 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-[var(--brand-border)] bg-[var(--brand-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--brand-strong)]"><span className="size-1.5 rounded-full bg-[var(--accent)]" />Assessment operations platform</p>
            <h1 className="mt-7 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-0.045em] text-[var(--ink-strong)] sm:text-5xl lg:text-[3.75rem]">Coordinate assessment.<span className="block text-[var(--brand)]">Trust the outcomes.</span></h1>
            <p className="mt-6 max-w-xl text-base leading-8 text-[var(--muted)]">cbe gives one school a clear workspace for learner records, class operations, internal assessments and academic reporting.</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/login" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--brand)] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--brand-strong)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--brand-soft)]">Enter your workspace <span aria-hidden="true" className="ml-2">→</span></Link>
              <a href="#platform" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--line)] bg-white px-5 py-3 text-sm font-semibold text-[var(--ink)] transition hover:bg-[var(--surface-subtle)]">Explore the platform</a>
            </div>
            <p className="mt-5 text-xs text-[var(--subtle)]">Role-aware access · Governed workflows · Traceable decisions</p>
          </div>
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-subtle)] p-4 sm:p-6">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] pb-5"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Assessment lifecycle</p><h2 className="mt-2 text-lg font-semibold tracking-tight text-[var(--ink-strong)]">From setup to publication</h2></div><span className="rounded-md border border-[var(--line)] bg-white px-2.5 py-1.5 text-[10px] font-semibold text-[var(--muted)]">Platform flow</span></div>
            <ol className="mt-5 space-y-2">{lifecycle.map(([number, title, action], index) => <li key={number} className="flex items-center gap-4 rounded-xl border border-[var(--line)] bg-white p-4"><span className={index === 4 ? "grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--brand)] text-xs font-bold text-white" : "grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--brand-soft)] text-xs font-bold text-[var(--brand-strong)]"}>{number}</span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-[var(--ink-strong)]">{title}</span><span className="mt-0.5 block text-xs text-[var(--muted)]">{action}</span></span><span aria-hidden="true" className="text-sm text-[var(--subtle)]">{index === 4 ? "✓" : "→"}</span></li>)}</ol>
            <p className="mt-4 rounded-lg border border-[var(--brand-border)] bg-[var(--brand-soft)] px-4 py-3 text-xs leading-5 text-[var(--brand-strong)]">Submission, review, approval and publication remain distinct steps. A submitted assessment is not automatically a published result.</p>
          </div>
        </div>
      </section>
      <section id="platform" className="mx-auto w-full max-w-[var(--content-max)] px-5 py-16 sm:px-8 sm:py-20">
        <div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--brand-strong)]">One connected platform</p><h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-[var(--ink-strong)] sm:text-4xl">Built around the work councils and schools need to do.</h2><p className="mt-4 text-sm leading-7 text-[var(--muted)]">Each workspace is organised around the responsibilities of its users, with clear feedback and consistent interaction patterns across devices.</p></div>
        <div className="mt-9 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{capabilities.map((item) => <article key={item.number} className="rounded-xl border border-[var(--line)] bg-white p-5 shadow-[var(--shadow-card)]"><p className="text-xs font-bold tabular-nums text-[var(--brand)]">{item.number}</p><h3 className="mt-5 text-base font-semibold text-[var(--ink-strong)]">{item.title}</h3><p className="mt-2 text-sm leading-6 text-[var(--muted)]">{item.description}</p></article>)}</div>
      </section>
      <footer className="border-t border-[var(--line)] bg-white"><div className="mx-auto flex w-full max-w-[var(--content-max)] flex-col gap-3 px-5 py-7 text-xs text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between sm:px-8"><span>© {new Date().getFullYear()} cbe. A product by Softflix.</span><span>Assessment operations · School operations · Trusted results</span></div></footer>
    </main>
  );
}
