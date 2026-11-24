'use client';

import { useMemo, useRef, useState, type KeyboardEvent } from "react";

type Candidate = {
  id: string;
  number: string;
  name: string;
  gender: "F" | "M";
  marks: string;
};

const candidates: Candidate[] = [
  { id: "c-001", number: "G6-001", name: "Amina Wanjiku", gender: "F", marks: "82" },
  { id: "c-002", number: "G6-002", name: "Brian Otieno", gender: "M", marks: "74" },
  { id: "c-003", number: "G6-003", name: "Chao Mwende", gender: "F", marks: "91" },
  { id: "c-004", number: "G6-004", name: "David Kiptoo", gender: "M", marks: "68" },
  { id: "c-005", number: "G6-005", name: "Esther Naliaka", gender: "F", marks: "87" },
  { id: "c-006", number: "G6-006", name: "Felix Barasa", gender: "M", marks: "76" },
  { id: "c-007", number: "G6-007", name: "Grace Achieng", gender: "F", marks: "" },
  { id: "c-008", number: "G6-008", name: "Hassan Noor", gender: "M", marks: "63" },
  { id: "c-009", number: "G6-009", name: "Irene Chebet", gender: "F", marks: "89" },
  { id: "c-010", number: "G6-010", name: "John Maina", gender: "M", marks: "72" },
  { id: "c-011", number: "G6-011", name: "Kevin Mutua", gender: "M", marks: "" },
  { id: "c-012", number: "G6-012", name: "Lilian Wairimu", gender: "F", marks: "95" },
  { id: "c-013", number: "G6-013", name: "Martin Ouma", gender: "M", marks: "81" },
  { id: "c-014", number: "G6-014", name: "Nancy Jepkosgei", gender: "F", marks: "78" },
  { id: "c-015", number: "G6-015", name: "Oscar Muli", gender: "M", marks: "84" },
  { id: "c-016", number: "G6-016", name: "Purity Atieno", gender: "F", marks: "88" },
];

const MAX_MARK = 100;
type Filter = "all" | "missing" | "invalid";

function getIssue(value: string) {
  if (value.trim() === "") return "missing";
  if (!/^(?:\d+\.?\d{0,2}|\.\d{1,2})$/.test(value.trim())) return "invalid";
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > MAX_MARK) return "invalid";
  return "valid";
}

export default function MarksEntryPrototypePage() {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(candidates.map((candidate) => [candidate.id, candidate.marks])),
  );
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [previewMessage, setPreviewMessage] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const rows = useMemo(() => candidates.map((candidate) => ({
    ...candidate,
    value: values[candidate.id] ?? "",
    issue: getIssue(values[candidate.id] ?? ""),
  })), [values]);

  const counts = useMemo(() => ({
    total: rows.length,
    entered: rows.filter((row) => row.issue === "valid").length,
    missing: rows.filter((row) => row.issue === "missing").length,
    invalid: rows.filter((row) => row.issue === "invalid").length,
  }), [rows]);

  const visibleRows = rows.filter((row) => {
    const matchesQuery = `${row.name} ${row.number}`.toLowerCase().includes(query.toLowerCase());
    const matchesFilter = filter === "all" || row.issue === filter;
    return matchesQuery && matchesFilter;
  });

  function updateValue(id: string, value: string) {
    setValues((current) => ({ ...current, [id]: value }));
    setPreviewMessage("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>, visibleIndex: number) {
    if (event.key === "ArrowDown" || event.key === "Enter") {
      event.preventDefault();
      inputRefs.current[visibleIndex + 1]?.focus();
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      inputRefs.current[visibleIndex - 1]?.focus();
    }
  }

  function savePreview() {
    setPreviewMessage("Preview state acknowledged in this page only. Nothing has been sent to a server or database.");
  }

  function markReviewed() {
    setPreviewMessage("This sample entry set is complete. In the real workflow, the class teacher coordinates and submits the school's marks.");
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-[#172b4d]">
      <div className="flex min-h-screen">
        <aside className="hidden w-[248px] shrink-0 border-r border-[#e4eaf2] bg-white px-5 py-6 lg:flex lg:flex-col">
          <a href="/" className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-[#2457c5] text-xs font-bold text-white">CBE</span>
            <span className="text-sm font-semibold tracking-tight">Assessment Hub</span>
          </a>
          <div className="mt-10">
            <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#94a3b8]">Workspace</p>
            <nav className="mt-3 space-y-1" aria-label="Main navigation">
              <a className="flex items-center gap-3 rounded-xl bg-[#edf4ff] px-3 py-2.5 text-sm font-semibold text-[#2457c5]" href="#entry"><span>▦</span> My mark entries</a>
              <a className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[#64748b] hover:bg-[#f5f7fb]" href="#assessment"><span>▤</span> Assessments</a>
              <a className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[#64748b] hover:bg-[#f5f7fb]" href="#support"><span>◷</span> Activity history</a>
            </nav>
          </div>
          <div className="mt-auto rounded-2xl border border-[#e7edf5] bg-[#f8faff] p-4">
            <p className="text-xs font-semibold text-[#263b5b]">Need a hand?</p>
            <p className="mt-1 text-xs leading-5 text-[#64748b]">Use the keyboard shortcuts to move through the marks column.</p>
            <button onClick={() => setShowHelp(true)} className="mt-3 text-xs font-semibold text-[#2457c5]">View quick guide →</button>
          </div>
          <div className="mt-5 flex items-center gap-3 border-t border-[#edf0f5] pt-5">
            <div className="grid size-9 place-items-center rounded-full bg-[#eaf0fb] text-xs font-semibold text-[#315a9f]">JT</div>
            <div><p className="text-xs font-semibold">Jordan Teacher</p><p className="mt-0.5 text-[11px] text-[#94a3b8]">Subject teacher · Demo</p></div>
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="flex h-[68px] items-center justify-between border-b border-[#e4eaf2] bg-white px-5 sm:px-8">
            <div className="flex items-center gap-3">
              <a href="/" className="grid size-9 place-items-center rounded-xl bg-[#2457c5] text-[10px] font-bold text-white lg:hidden">CBE</a>
              <div><p className="text-xs font-semibold text-[#263b5b]">Educator workspace</p><p className="mt-0.5 text-[11px] text-[#94a3b8]">Assessment management / Mark entry</p></div>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden rounded-full border border-[#f1d8a7] bg-[#fff8e9] px-3 py-1.5 text-[11px] font-semibold text-[#9a6819] sm:inline-flex">Prototype · Synthetic data</span>
              <button onClick={() => setShowHelp(true)} aria-label="Open help" className="grid size-9 place-items-center rounded-full border border-[#e5eaf1] text-sm text-[#64748b] hover:bg-[#f8faff]">?</button>
            </div>
          </header>

          <div className="mx-auto max-w-[1440px] px-4 py-7 sm:px-8 lg:px-10 lg:py-9">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <a href="/" className="text-xs font-medium text-[#64748b] hover:text-[#2457c5]">← Back to platform overview</a>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="rounded-lg bg-[#eaf1ff] px-2.5 py-1 text-[11px] font-semibold text-[#2457c5]">GRADE 6</span>
                  <span className="rounded-lg bg-[#edf7f2] px-2.5 py-1 text-[11px] font-semibold text-[#277c5b]">MATHEMATICS</span>
                  <span className="rounded-lg bg-white px-2.5 py-1 text-[11px] font-medium text-[#64748b] ring-1 ring-[#e5eaf1]">Internal assessment</span>
                </div>
                <h1 className="mt-3 text-2xl font-semibold tracking-[-0.035em] text-[#172b4d] sm:text-3xl">Enter learning area marks</h1>
                <p className="mt-2 text-sm text-[#64748b]">Mid-Year Assessment 2026 <span className="mx-1.5 text-[#cbd5e1]">·</span> Sample Primary School</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => setShowHelp(true)} className="rounded-xl border border-[#dfe6ef] bg-white px-4 py-2.5 text-xs font-semibold text-[#475569] hover:bg-[#f8faff]">Keyboard guide</button>
                <button onClick={savePreview} className="rounded-xl border border-[#cddaf0] bg-white px-4 py-2.5 text-xs font-semibold text-[#2457c5] hover:bg-[#f5f8ff]">Save preview state</button>
                <button onClick={markReviewed} disabled={counts.missing > 0 || counts.invalid > 0} className="rounded-xl bg-[#2457c5] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#1e49a6] disabled:cursor-not-allowed disabled:bg-[#9db2d8]">Review completion</button>
              </div>
            </div>

            <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-[#e5eaf1] bg-white p-4"><p className="text-xs text-[#64748b]">Candidates assigned</p><p className="mt-2 text-2xl font-semibold tabular-nums">{counts.total}</p><p className="mt-1 text-[11px] text-[#94a3b8]">In this sample class</p></div>
              <div className="rounded-2xl border border-[#e5eaf1] bg-white p-4"><p className="text-xs text-[#64748b]">Marks entered</p><p className="mt-2 text-2xl font-semibold tabular-nums">{counts.entered}<span className="ml-1 text-sm font-medium text-[#94a3b8]">/ {counts.total}</span></p><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#edf1f6]"><div className="h-full rounded-full bg-[#27825f] transition-all" style={{ width: `${(counts.entered / counts.total) * 100}%` }} /></div></div>
              <div className="rounded-2xl border border-[#e5eaf1] bg-white p-4"><p className="text-xs text-[#64748b]">Awaiting entry</p><p className="mt-2 text-2xl font-semibold tabular-nums">{counts.missing}</p><p className="mt-1 text-[11px] text-[#b7791f]">Candidates with blank marks</p></div>
              <div className="rounded-2xl border border-[#e5eaf1] bg-white p-4"><p className="text-xs text-[#64748b]">Validation issues</p><p className="mt-2 text-2xl font-semibold tabular-nums">{counts.invalid}</p><p className="mt-1 text-[11px] text-[#64748b]">Outside the sample mark rules</p></div>
            </div>

            <div id="entry" className="mt-7 overflow-hidden rounded-2xl border border-[#e3e9f1] bg-white shadow-[0_8px_30px_-24px_rgba(28,50,85,0.25)]">
              <div className="flex flex-col gap-4 border-b border-[#edf0f5] p-4 sm:p-5 xl:flex-row xl:items-center xl:justify-between">
                <div><h2 className="text-sm font-semibold text-[#263b5b]">Candidate marks</h2><p className="mt-1 text-xs text-[#94a3b8]">Maximum mark: {MAX_MARK} <span className="mx-1">·</span> Up to 2 decimal places <span className="mx-1">·</span> Sample configuration</p></div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <label className="relative block"><span className="sr-only">Search candidates</span><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search learner or number" className="h-10 w-full rounded-xl border border-[#e1e7ef] bg-white pl-9 pr-3 text-xs outline-none transition focus:border-[#8aa9e4] focus:ring-2 focus:ring-[#e8f0ff] sm:w-60" /></label>
                  <div className="flex rounded-xl border border-[#e1e7ef] bg-[#f8faff] p-1" aria-label="Filter candidates">
                    {(["all", "missing", "invalid"] as Filter[]).map((item) => <button key={item} onClick={() => setFilter(item)} aria-pressed={filter === item} className={`rounded-lg px-3 py-2 text-[11px] font-semibold capitalize transition ${filter === item ? "bg-white text-[#2457c5] shadow-sm" : "text-[#64748b] hover:text-[#263b5b]"}`}>{item === "all" ? "All" : item === "missing" ? "Missing" : "Issues"}</button>)}
                  </div>
                </div>
              </div>

              {previewMessage && <div role="status" className="border-b border-[#dce9ff] bg-[#f2f7ff] px-5 py-3 text-xs leading-5 text-[#315a9f]">{previewMessage}</div>}

              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-left">
                  <thead><tr className="bg-[#f8faff] text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8492a6]"><th className="w-12 px-5 py-3">#</th><th className="px-3 py-3">Candidate</th><th className="w-24 px-3 py-3">Gender</th><th className="w-44 px-3 py-3">Mark / {MAX_MARK}</th><th className="w-36 px-3 py-3">Entry status</th></tr></thead>
                  <tbody>
                    {visibleRows.map((row, index) => <tr key={row.id} className="border-t border-[#edf0f5] transition hover:bg-[#fbfcfe]">
                      <td className="px-5 py-3 text-xs tabular-nums text-[#94a3b8]">{String(candidates.findIndex((candidate) => candidate.id === row.id) + 1).padStart(2, "0")}</td>
                      <td className="px-3 py-3"><p className="text-xs font-semibold text-[#263b5b]">{row.name}</p><p className="mt-1 text-[10px] text-[#94a3b8]">{row.number}</p></td>
                      <td className="px-3 py-3"><span className="rounded-md bg-[#f2f5f9] px-2 py-1 text-[10px] font-medium text-[#64748b]">{row.gender}</span></td>
                      <td className="px-3 py-2"><div className="relative w-32"><input ref={(element) => { inputRefs.current[index] = element; }} inputMode="decimal" type="text" value={row.value} onChange={(event) => updateValue(row.id, event.target.value)} onKeyDown={(event) => handleKeyDown(event, index)} aria-label={`Mark for ${row.name}`} aria-invalid={row.issue === "invalid"} className={`h-9 w-full rounded-lg border bg-white px-3 pr-10 text-xs font-semibold tabular-nums outline-none transition focus:ring-2 ${row.issue === "invalid" ? "border-[#e7a7a7] bg-[#fffafa] text-[#b54747] focus:border-[#d97777] focus:ring-[#fff0f0]" : "border-[#dfe6ef] text-[#263b5b] focus:border-[#8aa9e4] focus:ring-[#e8f0ff]"}`} /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[#a0aec0]">pts</span></div>{row.issue === "invalid" && <p className="mt-1 text-[10px] text-[#b54747]">Enter 0–{MAX_MARK}, max 2 decimals.</p>}</td>
                      <td className="px-3 py-3">{row.issue === "valid" ? <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#27825f]"><span className="size-1.5 rounded-full bg-[#35a879]" />Entered</span> : row.issue === "missing" ? <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#a46a16]"><span className="size-1.5 rounded-full bg-[#d99a36]" />Awaiting entry</span> : <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#b54747]"><span className="size-1.5 rounded-full bg-[#d46c6c]" />Needs correction</span>}</td>
                    </tr>)}
                    {visibleRows.length === 0 && <tr><td colSpan={5} className="px-5 py-12 text-center"><p className="text-sm font-semibold text-[#475569]">No candidates found</p><p className="mt-1 text-xs text-[#94a3b8]">Try another search or filter.</p></td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-col gap-2 border-t border-[#edf0f5] bg-[#fbfcfe] px-5 py-3 text-[11px] text-[#94a3b8] sm:flex-row sm:items-center sm:justify-between"><span>Showing {visibleRows.length} of {counts.total} candidates</span><span>Use ↑ / ↓ or Enter in a mark field to move between candidates.</span></div>
            </div>

            <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-[#e5eaf1] bg-white p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
              <div className="flex gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#edf4ff] text-sm text-[#2457c5]">i</span><div><p className="text-xs font-semibold text-[#263b5b]">A note about the real workflow</p><p className="mt-1 max-w-3xl text-xs leading-5 text-[#64748b]">Subject teachers enter and correct marks for their assigned learning areas. The class teacher coordinates completeness and performs the final school submission. This prototype does not connect to the API, save records or submit results.</p></div></div>
              <span className="shrink-0 rounded-lg bg-[#f3f5f8] px-2.5 py-1.5 text-[10px] font-semibold text-[#64748b]">Demo only</span>
            </div>
          </div>
        </section>
      </div>

      {showHelp && <div role="dialog" aria-modal="true" aria-labelledby="guide-title" className="fixed inset-0 z-50 flex items-center justify-center bg-[#172b4d]/30 p-4" onClick={() => setShowHelp(false)}><div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#2457c5]">Quick guide</p><h2 id="guide-title" className="mt-2 text-lg font-semibold">Keyboard-friendly mark entry</h2></div><button onClick={() => setShowHelp(false)} aria-label="Close guide" className="grid size-8 place-items-center rounded-lg text-[#64748b] hover:bg-[#f2f5f9]">×</button></div><div className="mt-5 space-y-3 text-xs text-[#64748b]"><p><kbd className="rounded border border-[#dfe6ef] bg-[#f8faff] px-2 py-1 font-semibold text-[#263b5b]">↑</kbd> / <kbd className="rounded border border-[#dfe6ef] bg-[#f8faff] px-2 py-1 font-semibold text-[#263b5b]">↓</kbd> Move to the previous or next candidate.</p><p><kbd className="rounded border border-[#dfe6ef] bg-[#f8faff] px-2 py-1 font-semibold text-[#263b5b]">Enter</kbd> Move to the next candidate.</p><p>Blank marks are treated as incomplete. Values must be between 0 and {MAX_MARK}, with up to two decimal places in this sample.</p><p>Use search and status filters to isolate missing or invalid entries.</p></div><button onClick={() => setShowHelp(false)} className="mt-6 w-full rounded-xl bg-[#2457c5] px-4 py-3 text-xs font-semibold text-white hover:bg-[#1e49a6]">Got it</button></div></div>}
    </main>
  );
}
