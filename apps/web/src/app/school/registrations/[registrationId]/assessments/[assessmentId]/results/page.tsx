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

  return <main className="min-h-screen bg-[#f6f8fc]">
    <header className="border-b border-[#e5eaf1] bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8"><Link href={"/school/registrations/" + registrationId + "/assessments"} className="text-sm font-semibold text-[#2457c5]">← School assessments</Link><span className="text-xs font-medium text-[#64748b]">Sentinel · Published results</span></div></header>
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
      {loading ? <div className="rounded-2xl border border-[#e5eaf1] bg-white p-8 text-sm text-[#64748b]">Loading published school results…</div> : null}
      {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {!loading && data ? <>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#2457c5]">School performance dashboard</p>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold tracking-tight text-[#172b4d] sm:text-3xl">{data.assessment.name}</h1><p className="mt-2 text-sm text-[#64748b]">{data.school.name} · {data.assessment.grade.replace("_", " ")} · {data.assessment.academicYear} · {data.assessment.code}</p></div>{data.publication ? <span className="rounded-full bg-[#eaf8f2] px-3 py-1.5 text-[11px] font-semibold text-[#287653]">Official results · v{data.publication.version}</span> : null}</div>
        {!data.publication || !data.summary ? <div className="mt-7 rounded-2xl border border-dashed border-[#ccd8e8] bg-white p-8"><h2 className="text-base font-semibold text-[#172b4d]">Results not released yet</h2><p className="mt-2 text-sm leading-6 text-[#64748b]">The Council has not published the official results for this assessment. You can continue tracking your submission from the assessment desk.</p></div> : <>
          <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["Candidates", String(data.summary.candidateCount)], ["School average", pct(data.summary.averagePercentage)], ["Highest", pct(data.summary.highestPercentage)], ["Lowest", pct(data.summary.lowestPercentage)]].map(([label, value]) => <div key={label} className="rounded-2xl border border-[#e5eaf1] bg-white p-4"><p className="text-[11px] font-medium text-[#64748b]">{label}</p><p className="mt-2 text-xl font-semibold tabular-nums text-[#172b4d]">{value}</p></div>)}</div>
          <section className="mt-6 rounded-2xl border border-[#e5eaf1] bg-white p-5 sm:p-6"><h2 className="text-base font-semibold text-[#172b4d]">Learning-area performance</h2><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[600px] text-left text-xs"><thead className="border-b border-[#e5eaf1] text-[10px] uppercase tracking-wide text-[#64748b]"><tr><th className="pb-3 pr-4">Learning area</th><th className="pb-3 pr-4">Candidates</th><th className="pb-3 pr-4">Average</th><th className="pb-3 pr-4">Highest</th><th className="pb-3">Lowest</th></tr></thead><tbody>{data.learningAreas.map((area) => <tr key={area.id} className="border-b border-[#f0f2f6] last:border-0"><td className="py-3 pr-4 font-medium text-[#172b4d]">{area.name}</td><td className="py-3 pr-4 text-[#52647d]">{area.count}</td><td className="py-3 pr-4"><div className="flex items-center gap-3"><span className="w-14 font-semibold tabular-nums text-[#172b4d]">{pct(area.averagePercentage)}</span><span className="h-1.5 min-w-20 flex-1 overflow-hidden rounded-full bg-[#edf1f7]"><span className="block h-full rounded-full bg-[#4d78cf]" style={{ width: Math.max(0, Math.min(100, area.averagePercentage)) + "%" }} /></span></div></td><td className="py-3 pr-4 text-[#52647d]">{pct(area.highest)}</td><td className="py-3 text-[#52647d]">{pct(area.lowest)}</td></tr>)}</tbody></table></div></section>
          <section className="mt-6 rounded-2xl border border-[#e5eaf1] bg-white p-5 sm:p-6"><h2 className="text-base font-semibold text-[#172b4d]">Class comparison</h2><div className="mt-4 grid gap-3 md:grid-cols-2">{data.classes.map((item) => <div key={item.name} className="rounded-xl bg-[#f7f9fc] p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold text-[#172b4d]">{item.name}</p><p className="mt-1 text-[10px] text-[#7b8ba2]">{item.count} learners</p></div><span className="text-sm font-semibold text-[#2457c5]">{pct(item.averagePercentage)}</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#e7edf6]"><div className="h-full rounded-full bg-[#4d78cf]" style={{ width: Math.max(0, Math.min(100, item.averagePercentage)) + "%" }} /></div></div>)}</div></section>
          <section className="mt-6 rounded-2xl border border-[#e5eaf1] bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-base font-semibold text-[#172b4d]">Learner results</h2><p className="mt-1 text-xs text-[#64748b]">School rank is calculated within this school; grade rank is the official Council-wide rank.</p></div><div className="flex gap-2"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search learner or class" className="w-52 rounded-xl border border-[#dbe3ee] px-3 py-2 text-xs outline-none focus:border-[#6d94e8]" /><button type="button" onClick={exportCsv} disabled={!visibleCandidates.length} className="rounded-xl border border-[#dbe3ee] px-3 py-2 text-xs font-semibold text-[#2457c5] disabled:opacity-50">Export CSV ↓</button></div></div>
            <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="border-b border-[#e5eaf1] text-[10px] uppercase tracking-wide text-[#64748b]"><tr><th className="pb-3 pr-3">School rank</th><th className="pb-3 pr-3">Grade rank</th><th className="pb-3 pr-3">Learner</th><th className="pb-3 pr-3">Class</th><th className="pb-3 pr-3">Total</th><th className="pb-3 pr-3">Percentage</th><th className="pb-3">Classification</th></tr></thead><tbody>{visibleCandidates.map((row) => <tr key={row.id} className="border-b border-[#f0f2f6] last:border-0"><td className="py-3 pr-3 font-semibold text-[#2457c5]">{row.schoolRank}</td><td className="py-3 pr-3 text-[#52647d]">{row.gradeRank}</td><td className="py-3 pr-3"><p className="font-semibold text-[#172b4d]">{row.learnerName}</p><p className="mt-1 text-[10px] text-[#94a3b8]">{row.learnerNumber}</p></td><td className="py-3 pr-3 text-[#52647d]">{row.className}</td><td className="py-3 pr-3 tabular-nums text-[#172b4d]">{row.totalMarks.toFixed(2)} / {row.maximumMarks.toFixed(2)}</td><td className="py-3 pr-3 font-semibold tabular-nums text-[#172b4d]">{pct(row.percentage)}</td><td className="py-3 text-[#52647d]">{row.overallBandLabel ?? "Not classified"}</td></tr>)}</tbody></table></div>
          </section>
        </>}
      </> : null}
    </div>
  </main>;
}
