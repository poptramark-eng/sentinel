import Link from "next/link";
import { BrandLockup } from "../components/brand-lockup";

const capabilities = [
  { number: "01", title: "Assessment setup", description: "Prepare academic periods, classes, learning areas and assessment windows in one place." },
  { number: "02", title: "Focused mark entry", description: "Give teachers a clear, class-aware workspace for entering and correcting learner marks." },
  { number: "03", title: "Review and approval", description: "Track completeness, return work for correction and keep approval separate from mark entry." },
  { number: "04", title: "Results and insight", description: "Publish trusted results and understand learner, class and school performance." },
];

const lifecycle = [
  ["01", "Set up the assessment", "Configure"],
  ["02", "Capture learner marks", "Enter"],
  ["03", "Review and validate", "Verify"],
  ["04", "Approve and publish", "Release"],
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <header className="border-b border-[var(--line)] bg-white">
        <div className="mx-auto flex w-full max-w-[var(--content-max)] items-center justify-between px-5 py-4 sm:px-8">
          <BrandLockup />
          <Link href="/login" className="inline-flex min-h-10 items-center justify-center rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-strong)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--brand-soft)]">Sign in</Link>
        </div>
      </header>

      <section className="border-b border-[var(--line)] bg-white">
        <div className="mx-auto grid w-full max-w-[var(--content-max)] gap-12 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-[var(--brand-border)] bg-[var(--brand-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--brand-strong)]"><span className="size-1.5 rounded-full bg-[var(--accent)]" />CBE assessment management</p>
            <h1 className="mt-7 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-0.045em] text-[var(--ink-strong)] sm:text-5xl lg:text-[3.75rem]">Every assessment.<span className="block text-[var(--brand)]">One trusted record.</span></h1>
            <p className="mt-6 max-w-xl text-base leading-8 text-[var(--muted)]">A focused workspace for preparing assessments, capturing learner marks, reviewing performance and publishing reliable results. Built around the work teachers and school leaders need to complete.</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/login" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--brand)] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--brand-strong)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--brand-soft)]">Open your workspace <span aria-hidden="true" className="ml-2">→</span></Link>
              <a href="#workflow" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--line)] bg-white px-5 py-3 text-sm font-semibold text-[var(--ink)] transition hover:bg-[var(--surface-subtle)]">Explore the workflow</a>
            </div>
            <p className="mt-5 text-xs text-[var(--subtle)]">Assessment-first · Role-aware access · Auditable mark changes</p>
          </div>

          <div id="workflow" className="rounded-2xl border border-[var(--line)] bg-[var(--surface-subtle)] p-4 sm:p-6">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] pb-5">
              <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Assessment lifecycle</p><h2 className="mt-2 text-lg font-semibold tracking-tight text-[var(--ink-strong)]">From setup to results</h2></div>
              <span className="rounded-md border border-[var(--line)] bg-white px-2.5 py-1.5 text-[10px] font-semibold text-[var(--muted)]">School workflow</span>
            </div>
            <ol className="mt-5 space-y-2">
              {lifecycle.map(([number, title, action], index) => <li key={number} className="flex items-center gap-4 rounded-xl border border-[var(--line)] bg-white p-4">
                <span className={index === 3 ? "grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--brand)] text-xs font-bold text-white" : "grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--brand-soft)] text-xs font-bold text-[var(--brand-strong)]"}>{number}</span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-[var(--ink-strong)]">{title}</span><span className="mt-0.5 block text-xs text-[var(--muted)]">{action}</span></span>
                <span aria-hidden="true" className="text-sm text-[var(--subtle)]">{index === 3 ? "✓" : "→"}</span>
              </li>)}
            </ol>
            <p className="mt-4 rounded-lg border border-[var(--brand-border)] bg-[var(--brand-soft)] px-4 py-3 text-xs leading-5 text-[var(--brand-strong)]">Mark entry, review, approval and publication are separate steps. Results are not released just because marks have been entered.</p>
          </div>
        </div>
      </section>

      <section id="platform" className="mx-auto w-full max-w-[var(--content-max)] px-5 py-16 sm:px-8 sm:py-20">
        <div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--brand-strong)]">Designed for assessment work</p><h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-[var(--ink-strong)] sm:text-4xl">Less administrative friction. More confidence in results.</h2><p className="mt-4 text-sm leading-7 text-[var(--muted)]">Keep the essential school records connected to assessment without the weight of an all-purpose school ERP.</p></div>
        <div className="mt-9 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{capabilities.map((item) => <article key={item.number} className="rounded-xl border border-[var(--line)] bg-white p-5 shadow-[var(--shadow-card)]"><p className="text-xs font-bold tabular-nums text-[var(--brand)]">{item.number}</p><h3 className="mt-5 text-base font-semibold text-[var(--ink-strong)]">{item.title}</h3><p className="mt-2 text-sm leading-6 text-[var(--muted)]">{item.description}</p></article>)}</div>
      </section>

      <footer className="border-t border-[var(--line)] bg-white"><div className="mx-auto flex w-full max-w-[var(--content-max)] flex-wrap items-center justify-between gap-3 px-5 py-6 text-xs text-[var(--muted)] sm:px-8"><span>cbe by Softflix</span><span>Assessment records. Carefully managed.</span></div></footer>
    </main>
  );
}
