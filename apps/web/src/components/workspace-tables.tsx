"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type LearnerRow = {
  id: string;
  name: string;
  admissionNumber: string;
  grade: number | null;
  className: string;
};

type AssessmentRow = {
  id: string;
  title: string;
  type: string;
  status: string;
  date: string | null;
};

const fieldClass = "h-9 rounded-md border border-[var(--line)] bg-white px-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]";
const thClass = "whitespace-nowrap px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]";
const tdClass = "whitespace-nowrap px-3 py-2.5 text-xs text-[var(--ink)]";

function Pager({ page, pages, total, pageSize, onPage }: { page: number; pages: number; total: number; pageSize: number; onPage: (page: number) => void }) {
  if (total <= pageSize) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <div className="flex items-center justify-between border-t border-[var(--line)] px-3 py-2.5 text-xs text-[var(--muted)]">
      <span>{start}–{end} of {total}</span>
      <div className="flex items-center gap-2">
        <button type="button" disabled={page === 1} onClick={() => onPage(page - 1)} className="rounded border border-[var(--line)] px-2.5 py-1.5 disabled:opacity-40">Previous</button>
        <span className="tabular-nums">{page} / {pages}</span>
        <button type="button" disabled={page === pages} onClick={() => onPage(page + 1)} className="rounded border border-[var(--line)] px-2.5 py-1.5 disabled:opacity-40">Next</button>
      </div>
    </div>
  );
}

export function LearnersTable({ rows }: { rows: LearnerRow[] }) {
  const [query, setQuery] = useState("");
  const [grade, setGrade] = useState("all");
  const [sort, setSort] = useState<"name" | "admission" | "grade">("name");
  const [page, setPage] = useState(1);
  const pageSize = 15;
  const grades = useMemo(() => [...new Set(rows.map((row) => row.grade).filter((value): value is number => value !== null))].sort((a, b) => a - b), [rows]);
  const filtered = useMemo(() => rows.filter((row) => {
    const matchesQuery = !query || `${row.name} ${row.admissionNumber} ${row.className}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (grade === "all" || String(row.grade) === grade);
  }).sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "admission" ? a.admissionNumber.localeCompare(b.admissionNumber) : (a.grade ?? 0) - (b.grade ?? 0)), [rows, query, grade, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const changeSort = (next: typeof sort) => { setSort(next); setPage(1); };
  return (
    <section className="overflow-hidden rounded-lg border border-[var(--line)] bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] p-3">
        <input aria-label="Search learners" className={`${fieldClass} min-w-[220px] flex-1`} value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search name, admission number or class" />
        <select aria-label="Filter by grade" className={fieldClass} value={grade} onChange={(event) => { setGrade(event.target.value); setPage(1); }}>
          <option value="all">All grades</option>{grades.map((value) => <option key={value} value={value}>Grade {value}</option>)}
        </select>
        <span className="ml-auto text-xs text-[var(--muted)]"><strong className="text-[var(--ink-strong)]">{filtered.length}</strong> learners</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse text-left">
          <thead className="sticky top-0 bg-[var(--surface-subtle)]"><tr>
            <th className={thClass}><button type="button" onClick={() => changeSort("name")}>Learner {sort === "name" ? "↑" : ""}</button></th>
            <th className={thClass}><button type="button" onClick={() => changeSort("admission")}>Admission no. {sort === "admission" ? "↑" : ""}</button></th>
            <th className={thClass}><button type="button" onClick={() => changeSort("grade")}>Grade {sort === "grade" ? "↑" : ""}</button></th>
            <th className={thClass}>Class / stream</th>
          </tr></thead>
          <tbody className="divide-y divide-[var(--line)]">
            {visible.map((row) => <tr key={row.id} className="hover:bg-[var(--surface-subtle)]">
              <td className={`${tdClass} font-medium text-[var(--ink-strong)]`}>{row.name}</td>
              <td className={`${tdClass} tabular-nums text-[var(--muted)]`}>{row.admissionNumber}</td>
              <td className={`${tdClass} tabular-nums`}>{row.grade === null ? "—" : `Grade ${row.grade}`}</td>
              <td className={`${tdClass} text-[var(--muted)]`}>{row.className || "—"}</td>
            </tr>)}
            {!visible.length ? <tr><td colSpan={4} className="px-3 py-12 text-center text-sm text-[var(--muted)]">{rows.length ? "No learners match these filters." : "No active learner enrolments yet."}</td></tr> : null}
          </tbody>
        </table>
      </div>
      <Pager page={page} pages={pages} total={filtered.length} pageSize={pageSize} onPage={setPage} />
    </section>
  );
}

export function AssessmentsTable({ rows }: { rows: AssessmentRow[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState<"date" | "title">("date");
  const [page, setPage] = useState(1);
  const pageSize = 12;
  const statuses = useMemo(() => [...new Set(rows.map((row) => row.status))].sort(), [rows]);
  const filtered = useMemo(() => rows.filter((row) => {
    const matchesQuery = !query || `${row.title} ${row.type} ${row.status}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (status === "all" || row.status === status);
  }).sort((a, b) => sort === "title" ? a.title.localeCompare(b.title) : (b.date ?? "").localeCompare(a.date ?? "")), [rows, query, status, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  return (
    <section className="overflow-hidden rounded-lg border border-[var(--line)] bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] p-3">
        <input aria-label="Search assessments" className={`${fieldClass} min-w-[220px] flex-1`} value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search assessments" />
        <select aria-label="Filter by status" className={fieldClass} value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
          <option value="all">All statuses</option>{statuses.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <button type="button" onClick={() => { setSort((value) => value === "date" ? "title" : "date"); setPage(1); }} className="h-9 rounded-md border border-[var(--line)] px-3 text-xs font-medium text-[var(--muted)]">Sort: {sort === "date" ? "Newest" : "Title"} ↕</button>
        <span className="ml-auto text-xs text-[var(--muted)]">{filtered.length} assessments</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead className="bg-[var(--surface-subtle)]"><tr><th className={thClass}>Assessment</th><th className={thClass}>Type</th><th className={thClass}>Date</th><th className={thClass}>Status</th><th className={thClass}></th></tr></thead>
          <tbody className="divide-y divide-[var(--line)]">
            {visible.map((row) => <tr key={row.id} className="hover:bg-[var(--surface-subtle)]">
              <td className={`${tdClass} font-medium text-[var(--ink-strong)]`}><Link href={`/workspace/assessments/${row.id}`} className="hover:text-[var(--brand)]">{row.title}</Link></td>
              <td className={`${tdClass} capitalize text-[var(--muted)]`}>{row.type}</td>
              <td className={`${tdClass} tabular-nums text-[var(--muted)]`}>{row.date ?? "—"}</td>
              <td className={tdClass}><span className="capitalize">{row.status}</span></td>
              <td className={`${tdClass} text-right`}><Link href={`/workspace/assessments/${row.id}`} className="font-semibold text-[var(--brand)]">Open →</Link></td>
            </tr>)}
            {!visible.length ? <tr><td colSpan={5} className="px-3 py-12 text-center text-sm text-[var(--muted)]">{rows.length ? "No assessments match these filters." : "No assessments created yet."}</td></tr> : null}
          </tbody>
        </table>
      </div>
      <Pager page={page} pages={pages} total={filtered.length} pageSize={pageSize} onPage={setPage} />
    </section>
  );
}
