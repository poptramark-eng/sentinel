"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiRequest } from "../../../../../../../lib/api";

interface SchoolResults {
  assessment: { id: string; name: string; code: string; grade: string; academicYear: number; status: string };
  school: { name: string };
  publication: { version: number; publishedAt: string } | null;
  summary: { candidateCount: number; averagePercentage: number; highestPercentage: number; lowestPercentage: number } | null;
  learningAreas: { id: string; name: string; count: number; averagePercentage: number; highest: number; lowest: number }[];
  classes: { name: string; count: number; averagePercentage: number }[];
  candidates: {
    id: string; learnerNumber: string; learnerName: string; className: string;
    totalMarks: number; maximumMarks: number; percentage: number;
    overallBandLabel: string | null; gradeRank: number; schoolRank: number;
    learningAreas: { id: string; code: string; name: string; marks: number; maximumMarks: number; percentage: number }[];
  }[];
}
function messageOf(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: string | string[] }).message;
    if (Array.isArray(message)) return message.join(" ");
    if (message) return message;
  }
  return fallback;
}
function pct(value: number) { return value.toFixed(2) + "%"; }

export default function SchoolPublishedResultsPage() {
  const { registrationId, assessmentId } = useParams<{ registrationId: string; assessmentId: string }>();
  const router = useRouter();
  const [data, setData] = useState<SchoolResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    const response = await apiRequest("/school/registrations/" + registrationId + "/assessments/" + assessmentId + "/results");
    if (response.status === 401) { router.replace("/login"); return; }
    if (response.status === 403) { router.replace("/workspace"); return; }
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(messageOf(payload, "School results could not be loaded."));
    setData(payload as SchoolResults);
  }, [assessmentId, registrationId, router]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => { void load().catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load school results."); }).finally(() => { if (active) setLoading(false); }); });
    return () => { active = false; };
  }, [load]);

  const visibleCandidates = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return data?.candidates ?? [];
    return (data?.candidates ?? []).filter((row) => [row.learnerNumber, row.learnerName, row.className].some((value) => value.toLocaleLowerCase().includes(query)));
  }, [data, search]);

  function exportCsv() {
    if (!data) return;
    const headers = ["School rank", "Grade rank", "Learner number", "Learner name", "Class", "Total marks", "Maximum marks", "Percentage", "Classification"];
    const quote = (value: string | number) => '"' + String(value).replaceAll('"', '""') + '"';
    const rows = [headers.map(quote).join(","), ...visibleCandidates.map((row) => [
      row.schoolRank, row.gradeRank, row.learnerNumber, row.learnerName, row.className,
      row.totalMarks, row.maximumMarks, row.percentage, row.overallBandLabel ?? "Not classified",
    ].map(quote).join(","))];
    const url = URL.createObjectURL(new Blob(["\uFEFF" + rows.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "sentinel-school-assessment-results.csv"; anchor.click(); URL.revokeObjectURL(url);
  }

  return <main className="min-h-screen bg-[#f6f7fb]">
    <header className="no-print border-b border-[#e3e8f0] bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8"><Link href={"/school/registrations/" + registrationId + "/assessments"} className="text-sm font-semibold text-[#5368d5]">← School assessments</Link><span className="text-xs font-medium text-[#5e6b80]">CBE · Published results</span></div></header>
    <div className="report-screen mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
      {loading ? <div className="rounded-2xl border border-[#e3e8f0] bg-white p-8 text-sm text-[#5e6b80]">Loading published school results…</div> : null}
      {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {!loading && data ? <>
        <div className="report-print-header"><p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "#5368d5" }}>SENTINEL · OFFICIAL ASSESSMENT REPORT</p><h1 style={{ fontSize: 22, fontWeight: 700, marginTop: 8 }}>{data?.assessment.name}</h1><p style={{ fontSize: 11, marginTop: 4 }}>{data?.school.name} · {data?.assessment.grade.replace("_", " ")} · {data?.assessment.academicYear} · {data?.assessment.code}</p><p style={{ fontSize: 10, marginTop: 6, color: "#5e6b80" }}>Publication version {data?.publication?.version} · Published {data?.publication ? new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(data.publication.publishedAt)) : ""}</p></div><div className="no-print flex items-center justify-between gap-3"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#5368d5]">School performance dashboard</p>{data.publication ? <button type="button" onClick={() => window.print()} className="rounded-xl bg-[#5368d5] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#4358c3]">Print report & learner slips ↗</button> : null}</div>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold tracking-tight text-[#17243a] sm:text-3xl">{data.assessment.name}</h1><p className="mt-2 text-sm text-[#5e6b80]">{data.school.name} · {data.assessment.grade.replace("_", " ")} · {data.assessment.academicYear} · {data.assessment.code}</p></div>{data.publication ? <span className="rounded-full bg-[#e8f6f1] px-3 py-1.5 text-[11px] font-semibold text-[#287653]">Official results · v{data.publication.version}</span> : null}</div>
        {!data.publication || !data.summary ? <div className="mt-7 rounded-2xl border border-dashed border-[#ccd8e8] bg-white p-8"><h2 className="text-base font-semibold text-[#17243a]">Results not released yet</h2><p className="mt-2 text-sm leading-6 text-[#5e6b80]">The Council has not published the official results for this assessment. You can continue tracking your submission from the assessment desk.</p></div> : <>
          <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["Candidates", String(data.summary.candidateCount)], ["School average", pct(data.summary.averagePercentage)], ["Highest", pct(data.summary.highestPercentage)], ["Lowest", pct(data.summary.lowestPercentage)]].map(([label, value]) => <div key={label} className="rounded-2xl border border-[#e3e8f0] bg-white p-4"><p className="text-[11px] font-medium text-[#5e6b80]">{label}</p><p className="mt-2 text-xl font-semibold tabular-nums text-[#17243a]">{value}</p></div>)}</div>
          <section className="report-card mt-6 rounded-2xl border border-[#e3e8f0] bg-white p-5 sm:p-6"><h2 className="text-base font-semibold text-[#17243a]">Learning-area performance</h2><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[600px] text-left text-xs"><thead className="border-b border-[#e3e8f0] text-[10px] uppercase tracking-wide text-[#5e6b80]"><tr><th className="pb-3 pr-4">Learning area</th><th className="pb-3 pr-4">Candidates</th><th className="pb-3 pr-4">Average</th><th className="pb-3 pr-4">Highest</th><th className="pb-3">Lowest</th></tr></thead><tbody>{data.learningAreas.map((area) => <tr key={area.id} className="border-b border-[#f0f2f6] last:border-0"><td className="py-3 pr-4 font-medium text-[#17243a]">{area.name}</td><td className="py-3 pr-4 text-[#52627a]">{area.count}</td><td className="py-3 pr-4"><div className="flex items-center gap-3"><span className="w-14 font-semibold tabular-nums text-[#17243a]">{pct(area.averagePercentage)}</span><span className="h-1.5 min-w-20 flex-1 overflow-hidden rounded-full bg-[#edf1f7]"><span className="block h-full rounded-full bg-[#4d78cf]" style={{ width: Math.max(0, Math.min(100, area.averagePercentage)) + "%" }} /></span></div></td><td className="py-3 pr-4 text-[#52627a]">{pct(area.highest)}</td><td className="py-3 text-[#52627a]">{pct(area.lowest)}</td></tr>)}</tbody></table></div></section>
          <section className="report-card mt-6 rounded-2xl border border-[#e3e8f0] bg-white p-5 sm:p-6"><h2 className="text-base font-semibold text-[#17243a]">Class comparison</h2><div className="mt-4 grid gap-3 md:grid-cols-2">{data.classes.map((item) => <div key={item.name} className="rounded-xl bg-[#f6f7fb] p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold text-[#17243a]">{item.name}</p><p className="mt-1 text-[10px] text-[#718096]">{item.count} learners</p></div><span className="text-sm font-semibold text-[#5368d5]">{pct(item.averagePercentage)}</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#e7edf6]"><div className="h-full rounded-full bg-[#4d78cf]" style={{ width: Math.max(0, Math.min(100, item.averagePercentage)) + "%" }} /></div></div>)}</div></section>
          <section className="report-card mt-6 rounded-2xl border border-[#e3e8f0] bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-base font-semibold text-[#17243a]">Learner results</h2><p className="mt-1 text-xs text-[#5e6b80]">School rank is calculated within this school; grade rank is the official Council-wide rank.</p></div><div className="flex gap-2"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search learner or class" className="w-52 rounded-xl border border-[#d3dbe7] px-3 py-2 text-xs outline-none focus:border-[#6d94e8]" /><button type="button" onClick={exportCsv} disabled={!visibleCandidates.length} className="rounded-xl border border-[#d3dbe7] px-3 py-2 text-xs font-semibold text-[#5368d5] disabled:opacity-50">Export CSV ↓</button></div></div>
            <div className="mt-4 overflow-x-auto"><table className="report-table w-full min-w-[760px] text-left text-xs"><thead className="border-b border-[#e3e8f0] text-[10px] uppercase tracking-wide text-[#5e6b80]"><tr><th className="pb-3 pr-3">School rank</th><th className="pb-3 pr-3">Grade rank</th><th className="pb-3 pr-3">Learner</th><th className="pb-3 pr-3">Class</th><th className="pb-3 pr-3">Total</th><th className="pb-3 pr-3">Percentage</th><th className="pb-3">Classification</th></tr></thead><tbody>{visibleCandidates.map((row) => <tr key={row.id} className="border-b border-[#f0f2f6] last:border-0"><td className="py-3 pr-3 font-semibold text-[#5368d5]">{row.schoolRank}</td><td className="py-3 pr-3 text-[#52627a]">{row.gradeRank}</td><td className="py-3 pr-3"><p className="font-semibold text-[#17243a]">{row.learnerName}</p><p className="mt-1 text-[10px] text-[#8491a5]">{row.learnerNumber}</p></td><td className="py-3 pr-3 text-[#52627a]">{row.className}</td><td className="py-3 pr-3 tabular-nums text-[#17243a]">{row.totalMarks.toFixed(2)} / {row.maximumMarks.toFixed(2)}</td><td className="py-3 pr-3 font-semibold tabular-nums text-[#17243a]">{pct(row.percentage)}</td><td className="py-3 text-[#52627a]">{row.overallBandLabel ?? "Not classified"}</td></tr>)}</tbody></table></div>
          </section>
          <section className="report-print-only report-page-break">
            {data.candidates.map((row) => <article key={row.id} className="report-slip">
              <div style={{ borderBottom: "2px solid #5368d5", paddingBottom: 12, marginBottom: 18 }}>
                <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", color: "#5368d5" }}>SENTINEL · LEARNER RESULT SLIP</p>
                <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 8 }}>{data.assessment.name}</h2>
                <p style={{ fontSize: 11, marginTop: 4 }}>{data.school.name} · {data.assessment.grade.replace("_", " ")} · {data.assessment.academicYear}</p>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 11, marginBottom: 18 }}>
                <p><strong>Learner:</strong> {row.learnerName}</p><p><strong>Admission / learner no.:</strong> {row.learnerNumber}</p>
                <p><strong>Class:</strong> {row.className}</p><p><strong>School rank:</strong> {row.schoolRank}</p>
                <p><strong>Official grade rank:</strong> {row.gradeRank}</p><p><strong>Classification:</strong> {row.overallBandLabel ?? "Not classified"}</p>
              </div>
              <table className="report-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead><tr><th style={{ textAlign: "left" }}>Learning area</th><th style={{ textAlign: "right" }}>Marks</th><th style={{ textAlign: "right" }}>Maximum</th><th style={{ textAlign: "right" }}>Percentage</th></tr></thead>
                <tbody>{row.learningAreas.map((area) => <tr key={area.id}><td>{area.name}</td><td style={{ textAlign: "right" }}>{area.marks.toFixed(2)}</td><td style={{ textAlign: "right" }}>{area.maximumMarks.toFixed(2)}</td><td style={{ textAlign: "right" }}>{pct(area.percentage)}</td></tr>)}</tbody>
              </table>
              <div style={{ marginTop: 18, borderTop: "1px solid #cbd5e1", paddingTop: 12, display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <strong>Total: {row.totalMarks.toFixed(2)} / {row.maximumMarks.toFixed(2)} ({pct(row.percentage)})</strong><span>Publication v{data.publication?.version}</span>
              </div>
              <p style={{ marginTop: 26, fontSize: 9, color: "#5e6b80" }}>This slip reflects the official result snapshot published by the Council. Classification is shown only where configured for this assessment.</p>
            </article>)}
          </section>
        </>}
      </> : null}
    </div>
  </main>;
}
