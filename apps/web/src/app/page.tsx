import Link from "next/link";
import { BrandLockup } from "../components/brand";

const capabilities = [
  { number: "01", title: "Assessment operations", description: "Configure assessment periods, participating schools, grades and learning areas in one governed workflow." },
  { number: "02", title: "Candidate and class records", description: "Keep school, class and learner information organised around the right assessment context." },
  { number: "03", title: "Controlled mark submission", description: "Give educators a focused place to capture marks, validate entries and submit work for review." },
  { number: "04", title: "Results and reporting", description: "Review approved performance at school and Council level with clear, accountable reporting." },
];

const lifecycle = [
  ["01", "Assessment setup", "Configure", "tone-indigo"],
  ["02", "Candidate preparation", "Prepare", "tone-blue"],
  ["03", "Marks collection", "Capture", "tone-teal"],
  ["04", "Review and validation", "Verify", "tone-amber"],
  ["05", "Approval and release", "Publish", "tone-violet"],
];

export default function HomePage() {
  return (
    <main className="cbe-marketing min-h-screen overflow-hidden">
      <header className="cbe-marketing-header mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-5 lg:px-10">
        <BrandLockup showCompany />
        <nav aria-label="Main navigation" className="flex items-center gap-3">
          <Link href="/register" className="hidden rounded-xl px-3 py-2.5 text-sm font-semibold text-[#5e6b80] transition hover:bg-white sm:inline">Create account</Link>
          <Link href="/login" className="cbe-button cbe-button-secondary">Sign in</Link>
        </nav>
      </header>

      <section className="mx-auto grid w-full max-w-7xl gap-14 px-6 pb-20 pt-12 lg:grid-cols-[1.04fr_.96fr] lg:items-center lg:px-10 lg:pb-28 lg:pt-20">
        <div className="relative z-10">
          <div className="cbe-eyebrow"><span className="cbe-eyebrow-dot" /> A connected assessment workspace</div>
          <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-0.055em] text-[#17243a] sm:text-5xl lg:text-[4.15rem]">Bring every stage of assessment <span className="cbe-heading-accent">into focus.</span></h1>
          <p className="mt-7 max-w-xl text-base leading-8 text-[#5e6b80] sm:text-lg">CBE connects examination councils, schools and educators through a clear process for preparing assessments, collecting marks, reviewing submissions and managing results.</p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link href="/register" className="cbe-button cbe-button-primary">Get started <span aria-hidden="true">↗</span></Link>
            <Link href="/login" className="cbe-text-link">Sign in to your workspace <span aria-hidden="true">→</span></Link>
          </div>
          <div className="mt-12 grid max-w-lg grid-cols-3 gap-5 border-t border-[#e3e8f0] pt-7">
            <div><p className="text-2xl font-semibold tracking-tight text-[#17243a]">01–09</p><p className="mt-1 text-xs text-[#718096]">Grade coverage</p></div>
            <div><p className="text-2xl font-semibold tracking-tight text-[#17243a]">Multi</p><p className="mt-1 text-xs text-[#718096]">Council support</p></div>
            <div><p className="text-2xl font-semibold tracking-tight text-[#17243a]">Audited</p><p className="mt-1 text-xs text-[#718096]">Governed actions</p></div>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[570px]">
          <div className="cbe-hero-orb cbe-hero-orb-one" /><div className="cbe-hero-orb cbe-hero-orb-two" />
          <div className="cbe-lifecycle-card relative">
            <div className="flex items-start justify-between gap-4 border-b border-[#edf0f5] pb-5"><div><p className="text-[11px] font-semibold uppercase tracking-[.15em] text-[#8491a5]">How the work moves</p><h2 className="mt-2 text-xl font-semibold tracking-tight text-[#17243a]">Assessment lifecycle</h2></div><span className="rounded-full border border-[#e3e8f0] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#718096]">Overview</span></div>
            <div className="mt-5 space-y-2.5">{lifecycle.map(([step, label, action, tone]) => <div key={step} className="cbe-lifecycle-row"><span className="cbe-step-number">{step}</span><span className="min-w-0 flex-1 text-sm font-semibold text-[#26364f]">{label}</span><span className={`cbe-status ${tone}`}>{action}</span></div>)}</div>
            <div className="mt-5 rounded-2xl bg-[#f6f7fb] p-4"><div className="flex items-center gap-2"><span className="grid size-7 place-items-center rounded-lg bg-[#e8f6f1] text-sm text-[#006151]">✓</span><p className="text-xs font-semibold text-[#26364f]">Accountability at every step</p></div><p className="mt-2 pl-9 text-xs leading-5 text-[#718096]">Access follows assigned roles, while important decisions remain traceable through the workflow.</p></div>
          </div>
          <div className="cbe-floating-note"><span className="cbe-floating-icon">↗</span><span><strong>One connected process</strong><small>From setup to results</small></span></div>
        </div>
      </section>

      <section className="border-y border-[#e3e8f0] bg-white"><div className="mx-auto max-w-7xl px-6 py-16 lg:px-10 lg:py-20">
        <div className="grid gap-6 lg:grid-cols-[.85fr_1.15fr] lg:items-end"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-[#5368d5]">A clearer way to work</p><h2 className="mt-3 max-w-xl text-3xl font-semibold tracking-[-.04em] text-[#17243a] sm:text-4xl">Built around real assessment operations.</h2></div><p className="max-w-xl text-sm leading-7 text-[#5e6b80] lg:justify-self-end">A practical workspace for the people who organise assessments, prepare learners, capture marks and oversee the integrity of results.</p></div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{capabilities.map((item) => <article key={item.number} className="cbe-capability-card"><p className="text-xs font-semibold text-[#5368d5]">{item.number}</p><h3 className="mt-5 text-base font-semibold text-[#17243a]">{item.title}</h3><p className="mt-2 text-sm leading-6 text-[#718096]">{item.description}</p></article>)}</div>
      </div></section>

      <footer className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-8 text-xs text-[#8491a5] sm:flex-row sm:items-center sm:justify-between lg:px-10"><span>© {new Date().getFullYear()} CBE Assessment Management</span><span>Developed by Softflix</span></footer>
    </main>
  );
}
