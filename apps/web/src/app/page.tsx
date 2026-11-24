const capabilities = [
  { number: "01", title: "Assessment operations", description: "Configure examination periods, participating schools, grades, learning areas and entry windows." },
  { number: "02", title: "Accurate mark collection", description: "Give educators a focused workspace for fast entry, validation, correction and safe submission." },
  { number: "03", title: "Governed results", description: "Separate submission, review, approval and release so results are never published prematurely." },
  { number: "04", title: "Meaningful reporting", description: "Turn approved results into clear school, cluster and council-level insights." },
];

const lifecycle = [
  ["01", "Assessment setup", "Configure", "bg-[#edf4ff] text-[#2457c5]"],
  ["02", "Candidate registration", "Prepare", "bg-[#f0f6ff] text-[#3c70bb]"],
  ["03", "Marks collection", "Capture", "bg-[#eaf8f2] text-[#27825f]"],
  ["04", "Review and validation", "Verify", "bg-[#fff6e8] text-[#a46a16]"],
  ["05", "Approval and release", "Publish", "bg-[#f2efff] text-[#7054b8]"],
];

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6 lg:px-10">
        <a href="/" className="flex items-center gap-3" aria-label="CBE Platform home">
          <span className="grid size-10 place-items-center rounded-xl bg-[#2457c5] text-sm font-bold text-white">CBE</span>
          <span className="text-sm font-semibold tracking-tight">Examination Management</span>
        </a>
        <div className="flex items-center gap-3"><span className="hidden rounded-full border border-[#dbe5f2] bg-white px-3 py-1.5 text-xs font-medium text-[#64748b] sm:inline">Platform foundation</span><div className="flex items-center gap-2"><a href="/register" className="hidden rounded-xl px-3 py-2.5 text-sm font-semibold text-[#64748b] hover:text-[#2457c5] sm:inline">Create account</a><a href="/login" className="rounded-xl border border-[#dbe3ee] bg-white px-4 py-2.5 text-sm font-semibold text-[#2457c5] transition hover:bg-[#f2f6ff]">Sign in</a></div></div>
      </header>

      <section className="mx-auto grid w-full max-w-7xl gap-12 px-6 pb-20 pt-12 lg:grid-cols-[1.08fr_0.92fr] lg:items-center lg:px-10 lg:pb-28 lg:pt-20">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#d8e6ff] bg-[#edf4ff] px-3 py-1.5 text-xs font-semibold text-[#2457c5]"><span className="size-1.5 rounded-full bg-[#2e9b75]" />Built for coordinated assessment</div>
          <h1 className="max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-0.045em] text-[#172b4d] sm:text-5xl lg:text-[4.1rem]">Better examination operations. <span className="text-[#2457c5]">Clearer outcomes.</span></h1>
          <p className="mt-7 max-w-xl text-base leading-8 text-[#64748b] sm:text-lg">A connected workspace for examination councils and schools to organise assessments, manage candidates, validate marks and release trusted results.</p>
          <div className="mt-9 flex flex-wrap items-center gap-3"><a href="/prototype/marks-entry" className="rounded-xl bg-[#2457c5] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1e49a6]">Explore educator workspace →</a><span className="text-sm text-[#64748b]">Secure by design · Built around school workflows</span></div>
          <div className="mt-12 grid max-w-lg grid-cols-3 gap-5 border-t border-[#e5eaf1] pt-7">
            <div><p className="text-2xl font-semibold tracking-tight">01–09</p><p className="mt-1 text-xs text-[#64748b]">Grade coverage</p></div>
            <div><p className="text-2xl font-semibold tracking-tight">Multi</p><p className="mt-1 text-xs text-[#64748b]">Council support</p></div>
            <div><p className="text-2xl font-semibold tracking-tight">Audit</p><p className="mt-1 text-xs text-[#64748b]">Governed results</p></div>
          </div>
        </div>

        <div className="relative">
          <div className="absolute -right-12 -top-12 size-64 rounded-full bg-[#dceaff] blur-3xl" />
          <div className="relative rounded-[2rem] border border-[#e3eaf3] bg-white p-5 shadow-[0_24px_80px_-40px_rgba(31,65,125,0.32)] sm:p-7">
            <div className="flex items-center justify-between border-b border-[#edf0f5] pb-5"><div><p className="text-xs font-medium text-[#64748b]">WORKSPACE OVERVIEW</p><p className="mt-1 text-lg font-semibold tracking-tight">Assessment lifecycle</p></div><span className="rounded-lg bg-[#f1f5fb] px-2.5 py-1.5 text-xs font-medium text-[#64748b]">Preview</span></div>
            <div className="mt-6 space-y-3">
              {lifecycle.map(([step, label, action, tone]) => <div key={step} className="flex items-center gap-4 rounded-2xl border border-[#edf0f5] p-4"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#f6f8fb] text-xs font-semibold text-[#64748b]">{step}</span><span className="min-w-0 flex-1 text-sm font-semibold text-[#263b5b]">{label}</span><span className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${tone}`}>{action}</span></div>)}
            </div>
            <div className="mt-5 rounded-2xl bg-[#f6f8fb] p-4"><div className="flex items-center justify-between text-xs"><span className="font-semibold text-[#263b5b]">Governance built into the workflow</span><span className="text-[#64748b]">Not just data entry</span></div><p className="mt-2 text-xs leading-5 text-[#64748b]">Every important transition will be permission-checked, traceable and recoverable.</p></div>
          </div>
        </div>
      </section>

      <section className="border-y border-[#e5eaf1] bg-white"><div className="mx-auto max-w-7xl px-6 py-16 lg:px-10 lg:py-20">
        <div className="max-w-2xl"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2457c5]">Product principles</p><h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-[#172b4d] sm:text-4xl">Designed around the work schools actually do.</h2><p className="mt-4 leading-7 text-[#64748b]">The experience will prioritise clarity, safe corrections, low-friction data entry and useful feedback across desktop, tablet and mobile.</p></div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{capabilities.map((item) => <article key={item.number} className="rounded-2xl border border-[#e5eaf1] bg-white p-5"><p className="text-xs font-semibold text-[#2457c5]">{item.number}</p><h3 className="mt-5 text-base font-semibold text-[#172b4d]">{item.title}</h3><p className="mt-2 text-sm leading-6 text-[#64748b]">{item.description}</p></article>)}</div>
      </div></section>

      <footer className="mx-auto flex max-w-7xl flex-col gap-2 px-6 py-8 text-xs text-[#64748b] sm:flex-row sm:items-center sm:justify-between lg:px-10"><span>© {new Date().getFullYear()} CBE Examination Management Platform</span><span>Foundation build · Synthetic data only</span></footer>
    </main>
  );
}
