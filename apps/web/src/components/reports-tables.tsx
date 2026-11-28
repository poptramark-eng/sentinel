"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { AssessmentReportSnapshot } from "../lib/assessment-report";

type PublishedReport = {
  id: string;
  version: number;
  publishedAt: string | null;
  title: string;
  assessmentType: string;
  grade: number;
  className: string;
  learnerCount: number;
};

type Learner = AssessmentReportSnapshot["learners"][number];
type LearningArea = AssessmentReportSnapshot["learning_areas"][number];

const controlClass = "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2.5 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]";

export function PublishedReportsTable({ reports }: { reports: PublishedReport[] }) {
  const [query, setQuery] = useState("");
  const [grade, setGrade] = useState("all");
  const [type, setType] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 8;
  const filtered = useMemo(() => reports.filter((report) => {
    const haystack = [report.title, report.className, report.assessmentType, `Grade ${report.grade}`].join(" ").toLowerCase();
    return (!query || haystack.includes(query.toLowerCase()))
      && (grade === "all" || String(report.grade) === grade)
      && (type === "all" || report.assessmentType === type);
  }), [reports, query, grade, type]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--line)] bg-white">
      <div className="grid gap-3 border-b border-[var(--line)] p-4 sm:grid-cols-3">
        <label className="sm:col-span-1"><span className="mb-1.5 block text-xs font-medium text-[var(--muted)]">Search reports</span><input className={controlClass} value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Assessment or class name" /></label>
        <label><span className="mb-1.5 block text-xs font-medium text-[var(--muted)]">Grade</span><select className={controlClass} value={grade} onChange={(event) => { setGrade(event.target.value); setPage(1); }}><option value="all">All grades</option>{[...new Set(reports.map((item) => item.grade))].sort((a,b)=>a-b).map((value)=><option key={value} value={value}>Grade {value}</option>)}</select></label>
        <label><span className="mb-1.5 block text-xs font-medium text-[var(--muted)]">Assessment type</span><select className={controlClass} value={type} onChange={(event) => { setType(event.target.value); setPage(1); }}><option value="all">All types</option>{[...new Set(reports.map((item) => item.assessmentType))].map((value)=><option key={value} value={value}>{value}</option>)}</select></label>
      </div>
      <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3"><p className="text-xs text-[var(--muted)]"><strong className="text-[var(--ink-strong)]">{filtered.length}</strong> published report versions</p><button type="button" onClick={() => { setQuery(""); setGrade("all"); setType("all"); setPage(1); }} className="text-xs font-semibold text-[var(--brand)]">Clear filters</button></div>
      {visible.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] border-collapse text-left"><thead className="bg-[var(--surface-subtle)]"><tr>{["Assessment","Grade / class","Type","Learners","Version","Published",""].map((label)=><th key={label} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">{label}</th>)}</tr></thead><tbody className="divide-y divide-[var(--line)]">{visible.map((report)=><tr key={report.id} className="transition hover:bg-[var(--surface-subtle)]"><td className="px-4 py-3"><Link href={`/workspace/reports/${report.id}`} className="text-sm font-semibold text-[var(--ink-strong)] hover:text-[var(--brand)]">{report.title}</Link></td><td className="px-4 py-3 text-xs text-[var(--muted)]">Grade {report.grade} · {report.className}</td><td className="px-4 py-3 text-xs capitalize text-[var(--muted)]">{report.assessmentType}</td><td className="px-4 py-3 text-sm tabular-nums text-[var(--ink)]">{report.learnerCount}</td><td className="px-4 py-3 text-sm tabular-nums text-[var(--ink)]">v{report.version}</td><td className="px-4 py-3 text-xs text-[var(--muted)]">{report.publishedAt ? new Date(report.publishedAt).toLocaleDateString("en-KE") : "—"}</td><td className="px-4 py-3 text-right"><Link href={`/workspace/reports/${report.id}`} className="text-xs font-semibold text-[var(--brand)]">View →</Link></td></tr>)}</tbody></table></div> : <p className="px-5 py-14 text-center text-sm text-[var(--muted)]">{reports.length ? "No reports match these filters." : "No published results yet. Submit, review and approve an assessment, then publish it to create its immutable report."}</p>}
      {filtered.length > pageSize ? <div className="flex items-center justify-between border-t border-[var(--line)] px-5 py-3 text-xs text-[var(--muted)]"><span>Showing {(page-1)*pageSize+1}–{Math.min(page*pageSize,filtered.length)} of {filtered.length}</span><div className="flex gap-2"><button disabled={page===1} onClick={()=>setPage((value)=>Math.max(1,value-1))} className="rounded-md border border-[var(--line)] px-3 py-1.5 disabled:opacity-40">Previous</button><button disabled={page===pageCount} onClick={()=>setPage((value)=>Math.min(pageCount,value+1))} className="rounded-md border border-[var(--line)] px-3 py-1.5 disabled:opacity-40">Next</button></div></div> : null}
    </section>
  );
}

export function LearnerResultsTable({ learners, learningAreas, maxScore }: { learners: Learner[]; learningAreas: LearningArea[]; maxScore: number }) {
  const [query, setQuery] = useState("");
  const [areaId, setAreaId] = useState("all");
  const [sort, setSort] = useState<"name" | "average">("name");
  const [page, setPage] = useState(1);
  const pageSize = 15;
  const filtered = useMemo(() => learners.filter((learner) => !query || `${learner.name} ${learner.admission_number}`.toLowerCase().includes(query.toLowerCase())).sort((a,b) => sort === "name" ? a.name.localeCompare(b.name) : (b.average ?? -1) - (a.average ?? -1)), [learners, query, sort]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const visibleAreas = learningAreas.filter((area) => areaId === "all" || area.id === areaId);
  return (
    <section className="report-card report-card-table overflow-hidden rounded-xl border border-[var(--line)] bg-white">
      <div className="no-print flex flex-wrap items-end justify-between gap-3 border-b border-[var(--line)] p-4">
        <label className="min-w-[220px] flex-1"><span className="mb-1.5 block text-xs font-medium text-[var(--muted)]">Find a learner</span><input className={controlClass} value={query} onChange={(event)=>{setQuery(event.target.value);setPage(1);}} placeholder="Name or admission number"/></label>
        <label className="min-w-[200px]"><span className="mb-1.5 block text-xs font-medium text-[var(--muted)]">Learning area</span><select className={controlClass} value={areaId} onChange={(event)=>{setAreaId(event.target.value);setPage(1);}}><option value="all">All learning areas</option>{learningAreas.map((area)=><option key={area.id} value={area.id}>{area.name}</option>)}</select></label>
        <button type="button" onClick={()=>{setSort((value)=>value==="name"?"average":"name");setPage(1);}} className="rounded-lg border border-[var(--line)] px-3 py-2.5 text-xs font-semibold text-[var(--muted)]">Sort by {sort === "name" ? "average" : "learner name"} ↕</button>
      </div>
      <div className="no-print border-b border-[var(--line)] px-5 py-3"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold text-[var(--ink-strong)]">Learner results</h2><span className="text-xs text-[var(--muted)]">{filtered.length} learners</span></div><p className="mt-1 text-xs text-[var(--muted)]">Scores are shown out of {maxScore}. This is the immutable published submission snapshot.</p></div>
      <div className="overflow-x-auto"><table className="report-table w-full min-w-[720px] border-collapse text-left"><thead className="bg-[var(--surface-subtle)]"><tr><th className="px-4 py-3 text-xs font-semibold text-[var(--muted)]">#</th><th className="px-4 py-3 text-xs font-semibold text-[var(--muted)]">Learner</th><th className="px-4 py-3 text-xs font-semibold text-[var(--muted)]">Admission no.</th>{visibleAreas.map((area)=><th key={area.id} className="px-4 py-3 text-xs font-semibold text-[var(--muted)]">{area.name}</th>)}<th className="px-4 py-3 text-xs font-semibold text-[var(--muted)]">Average</th></tr></thead><tbody className="divide-y divide-[var(--line)]">{visible.map((learner,index)=>{const scores=new Map(learner.scores.map((item)=>[item.learning_area_id,item.score]));return <tr key={learner.id}><td className="px-4 py-3 text-xs tabular-nums text-[var(--muted)]">{(page-1)*pageSize+index+1}</td><td className="px-4 py-3 text-sm font-medium text-[var(--ink-strong)]">{learner.name}</td><td className="px-4 py-3 text-xs tabular-nums text-[var(--muted)]">{learner.admission_number}</td>{visibleAreas.map((area)=><td key={area.id} className="px-4 py-3 text-sm tabular-nums text-[var(--ink)]">{scores.get(area.id)?.toFixed(2) ?? "—"}</td>)}<td className="px-4 py-3 text-sm font-semibold tabular-nums text-[var(--ink-strong)]">{learner.average?.toFixed(2) ?? "—"}</td></tr>;})}{!visible.length?<tr><td colSpan={visibleAreas.length+4} className="px-4 py-10 text-center text-sm text-[var(--muted)]">No learners match your search.</td></tr>:null}</tbody></table></div>
      {filtered.length>pageSize?<div className="no-print flex items-center justify-between border-t border-[var(--line)] px-5 py-3 text-xs text-[var(--muted)]"><span>Showing {(page-1)*pageSize+1}–{Math.min(page*pageSize,filtered.length)} of {filtered.length}</span><div className="flex gap-2"><button disabled={page===1} onClick={()=>setPage((value)=>Math.max(1,value-1))} className="rounded-md border border-[var(--line)] px-3 py-1.5 disabled:opacity-40">Previous</button><button disabled={page===pageCount} onClick={()=>setPage((value)=>Math.min(pageCount,value+1))} className="rounded-md border border-[var(--line)] px-3 py-1.5 disabled:opacity-40">Next</button></div></div>:null}
      <p className="report-print-only border-t border-[var(--line)] px-4 py-3 text-[10px] text-[var(--muted)]">Generated from published assessment snapshot.</p>
    </section>
  );
}
