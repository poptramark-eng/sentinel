"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiRequest } from "../../../../../../lib/api";

type Candidate = {
  learnerNumber: string;
  learnerName: string;
  schoolName: string;
  totalMarks: number;
  maximumMarks: number;
  percentage: number;
  rank: number;
  overallBandCode: string | null;
  overallBandLabel: string | null;
};
type Preview = {
  assessment: { id: string; name: string; code: string; academicYear: number; grade: string; rubric: { name: string; code: string }; rubricVersion: string };
  summary: { candidateCount: number; schoolCount: number; learningAreaCount: number; maximumMarks: number; averagePercentage: number; highestPercentage: number; lowestPercentage: number };
  classification: { mode: "PERCENTAGE" | "RAW_MARKS" | "UNCONFIGURED"; note: string };
  schools: { schoolId: string; schoolName: string; candidateCount: number; averagePercentage: number; topRank: number }[];
  learningAreas: { assessmentLearningAreaId: string; displayLabel: string; candidateCount: number; averagePercentage: number; highestPercentage: number; lowestPercentage: number }[];
  classes: { schoolId: string; schoolName: string; className: string; candidateCount: number; averagePercentage: number; topRank: number }[];
  schoolLearningAreas: { schoolId: string; schoolName: string; areaId: string; areaLabel: string; candidateCount: number; averagePercentage: number }[];
  candidates: Candidate[];
  candidateRowsReturned: number;
  truncated: boolean;
};
type Published = {
  publication: { id: string; version: number; publishedAt: string; candidateCount: number; schoolCount: number };
  results: {
    id: string; rank: number; learnerNumberSnapshot: string; learnerNameSnapshot: string;
    schoolNameSnapshot: string; schoolClassNameSnapshot: string; totalMarks: string; maximumMarks: string; percentage: string;
    overallBandCode: string | null; overallBandLabel: string | null;
    learningAreas: { id: string; assessmentLearningAreaId: string; displayLabel: string; marks: string; maximumMarks: string; percentage: string }[];
  }[];
};
function messageOf(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: string | string[] }).message;
    if (Array.isArray(message)) return message.join(" ");
    if (message) return message;
  }
  return fallback;
}
function pct(value: number | string) {
  return `${Number(value).toFixed(2)}%`;
}
function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function AssessmentResultsPage() {
  const { councilId, assessmentId } = useParams<{ councilId: string; assessmentId: string }>();
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [published, setPublished] = useState<Published | null>(null);
  const [canPublish, setCanPublish] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [candidateSearch, setCandidateSearch] = useState("");

  const load = useCallback(async () => {
    const [publicationResponse, assessmentResponse] = await Promise.all([
      apiRequest(`/councils/${councilId}/assessments/${assessmentId}/results`),
      apiRequest(`/councils/${councilId}/assessments`),
    ]);
    if ([publicationResponse, assessmentResponse].some((response) => response.status === 401)) {
      router.replace("/login");
      return;
    }
    if ([publicationResponse, assessmentResponse].some((response) => response.status === 403)) {
      router.replace("/workspace");
      return;
    }
    if (!publicationResponse.ok || !assessmentResponse.ok) throw new Error("Results workspace could not be loaded.");
    const [publication, assessmentData] = await Promise.all([
      publicationResponse.json() as Promise<Published | null>,
      assessmentResponse.json() as Promise<{ canModerate: boolean }>,
    ]);
    setPublished(publication);
    setCanPublish(assessmentData.canModerate);
    if (!publication) {
      const response = await apiRequest(`/councils/${councilId}/assessments/${assessmentId}/results/preview`);
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(messageOf(payload, "A result preview is not available. Confirm that the assessment is closed and all active candidates have submitted marks."));
      setPreview(payload as Preview);
    } else {
      setPreview(null);
    }
  }, [assessmentId, councilId, router]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      void load().catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to load results.");
      }).finally(() => { if (active) setLoading(false); });
    });
    return () => { active = false; };
  }, [load]);

  const publishedAreas = useMemo(() => {
    if (!published) return [];
    const groups = new Map<string, { label: string; count: number; total: number; highest: number; lowest: number }>();
    for (const result of published.results) for (const area of result.learningAreas) {
      const group = groups.get(area.assessmentLearningAreaId) ?? { label: area.displayLabel, count: 0, total: 0, highest: 0, lowest: 100 };
      const value = Number(area.percentage);
      group.count += 1; group.total += value; group.highest = Math.max(group.highest, value); group.lowest = Math.min(group.lowest, value);
      groups.set(area.assessmentLearningAreaId, group);
    }
    return [...groups.entries()].map(([id, value]) => ({ id, ...value, average: value.total / value.count })).sort((a, b) => a.label.localeCompare(b.label));
  }, [published]);

  const publishedClasses = useMemo(() => {
    if (!published) return [];
    const groups = new Map<string, { school: string; name: string; count: number; total: number }>();
    for (const result of published.results) {
      const key = result.schoolNameSnapshot + "|" + result.schoolClassNameSnapshot;
      const group = groups.get(key) ?? { school: result.schoolNameSnapshot, name: result.schoolClassNameSnapshot, count: 0, total: 0 };
      group.count += 1; group.total += Number(result.percentage); groups.set(key, group);
    }
    return [...groups.values()].map((item) => ({ ...item, average: item.total / item.count })).sort((a, b) => b.average - a.average);
  }, [published]);

  const publishedSchoolAreas = useMemo(() => {
    if (!published) return [];
    const groups = new Map<string, { school: string; area: string; count: number; total: number }>();
    for (const result of published.results) for (const area of result.learningAreas) {
      const key = result.schoolNameSnapshot + "|" + area.assessmentLearningAreaId;
      const group = groups.get(key) ?? { school: result.schoolNameSnapshot, area: area.displayLabel, count: 0, total: 0 };
      group.count += 1; group.total += Number(area.percentage); groups.set(key, group);
    }
    return [...groups.values()].map((item) => ({ ...item, average: item.total / item.count })).sort((a, b) => a.school.localeCompare(b.school) || a.area.localeCompare(b.area));
  }, [published]);

  const visibleCandidates = useMemo(() => {
    const rows = published?.results.map((row) => ({
      id: row.id, rank: row.rank, number: row.learnerNumberSnapshot, name: row.learnerNameSnapshot,
      school: row.schoolNameSnapshot, total: Number(row.totalMarks), maximum: Number(row.maximumMarks),
      percentage: Number(row.percentage), band: row.overallBandLabel ?? "Not classified",
    })) ?? preview?.candidates.map((row) => ({
      id: row.learnerNumber, rank: row.rank, number: row.learnerNumber, name: row.learnerName,
      school: row.schoolName, total: row.totalMarks, maximum: row.maximumMarks,
      percentage: row.percentage, band: row.overallBandLabel ?? "Not classified",
    })) ?? [];
    const query = candidateSearch.trim().toLocaleLowerCase();
    return query ? rows.filter((row) => [row.number, row.name, row.school].some((value) => value.toLocaleLowerCase().includes(query))) : rows;
  }, [candidateSearch, preview, published]);

  function exportCandidates() {
    const quote = (value: string | number) => '"' + String(value).replaceAll('"', '""') + '"';
    const lines = [["Rank", "Learner number", "Learner name", "School", "Total marks", "Maximum marks", "Percentage", "Classification"].map(quote).join(","), ...visibleCandidates.map((row) => [row.rank, row.number, row.name, row.school, row.total, row.maximum, row.percentage, row.band].map(quote).join(","))];
    const url = URL.createObjectURL(new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "sentinel-assessment-results.csv"; anchor.click(); URL.revokeObjectURL(url);
  }

  async function publish() {
    if (!window.confirm("Publish these assessment results? Published result snapshots are immutable.")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await apiRequest(`/councils/${councilId}/assessments/${assessmentId}/results/publish`, { method: "POST" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(messageOf(payload, "Results could not be published."));
      await load();
      setNotice("Results published. This immutable publication is now the official result snapshot for the assessment.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Results could not be published.");
    } finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen bg-[#f6f8fb]">
      <header className="border-b border-[#e5eaf1] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href={`/council/${councilId}/assessments`} className="text-sm font-semibold text-[#2457c5]">← Assessment register</Link>
          <span className="text-xs font-medium text-[#64748b]">Sentinel · Results</span>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#2457c5]">Assessment outcomes</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[#172b4d] sm:text-3xl">Results review</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#64748b]">Review candidate totals, grade-wide ranks and school performance before publication. Calculations use the assessment&apos;s frozen candidate, learning-area and rubric snapshots.</p>
        {error ? <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {notice ? <div role="status" className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div> : null}
        {loading ? <div className="mt-8 rounded-2xl border border-[#e5eaf1] bg-white p-8 text-sm text-[#64748b]">Preparing assessment results…</div> : null}
        {!loading && preview ? <>
          <section className="mt-7 rounded-2xl border border-[#e5eaf1] bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><h2 className="text-lg font-semibold text-[#172b4d]">{preview.assessment.name}</h2><p className="mt-1 text-xs text-[#64748b]">{preview.assessment.code} · {preview.assessment.academicYear} · {preview.assessment.grade.replace("_", " ")} · {preview.assessment.rubric.name} {preview.assessment.rubricVersion}</p></div>
              <span className="rounded-full bg-amber-50 px-3 py-1.5 text-[11px] font-semibold text-amber-800">Preview · Not published</span>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Candidates", preview.summary.candidateCount.toLocaleString("en-KE")],
                ["Schools", preview.summary.schoolCount.toLocaleString("en-KE")],
                ["Average", pct(preview.summary.averagePercentage)],
                ["Highest / lowest", `${pct(preview.summary.highestPercentage)} / ${pct(preview.summary.lowestPercentage)}`],
              ].map(([label, value]) => <div key={label} className="rounded-xl bg-[#f7f9fc] p-4"><p className="text-[11px] font-medium text-[#64748b]">{label}</p><p className="mt-2 text-xl font-semibold tabular-nums text-[#172b4d]">{value}</p></div>)}
            </div>
            <div className={`mt-5 rounded-xl px-4 py-3 text-xs leading-5 ${preview.classification.mode === "UNCONFIGURED" ? "border border-amber-200 bg-amber-50 text-amber-900" : "border border-[#dce7f8] bg-[#f4f8ff] text-[#38547c]"}`}>
              <p className="font-semibold">Classification: {preview.classification.mode.replaceAll("_", " ")}</p><p className="mt-1">{preview.classification.note}</p>
            </div>
          </section>
          <section className="mt-6 rounded-2xl border border-[#e5eaf1] bg-white p-5 sm:p-6">
            <h2 className="text-base font-semibold text-[#172b4d]">School performance</h2>
            <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead className="border-b border-[#e5eaf1] text-[10px] uppercase tracking-wide text-[#64748b]"><tr><th className="pb-3 pr-4">School</th><th className="pb-3 pr-4">Candidates</th><th className="pb-3 pr-4">Average</th><th className="pb-3">Top candidate rank</th></tr></thead><tbody>{preview.schools.map((school) => <tr key={school.schoolId} className="border-b border-[#f0f2f6] last:border-0"><td className="py-3 pr-4 font-medium text-[#172b4d]">{school.schoolName}</td><td className="py-3 pr-4 tabular-nums text-[#52647d]">{school.candidateCount}</td><td className="py-3 pr-4 font-semibold tabular-nums text-[#172b4d]">{pct(school.averagePercentage)}</td><td className="py-3 tabular-nums text-[#52647d]">{school.topRank}</td></tr>)}</tbody></table></div>
          </section>
          <section className="mt-6 rounded-2xl border border-[#e5eaf1] bg-white p-5 sm:p-6">
            <h2 className="text-base font-semibold text-[#172b4d]">Learning-area performance</h2>
            <p className="mt-1 text-xs leading-5 text-[#64748b]">Area percentages are normalized against each area&apos;s configured maximum marks.</p>
            <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead className="border-b border-[#e5eaf1] text-[10px] uppercase tracking-wide text-[#64748b]"><tr><th className="pb-3 pr-4">Learning area</th><th className="pb-3 pr-4">Candidates</th><th className="pb-3 pr-4">Average</th><th className="pb-3 pr-4">Highest</th><th className="pb-3">Lowest</th></tr></thead><tbody>{preview.learningAreas.map((area) => <tr key={area.assessmentLearningAreaId} className="border-b border-[#f0f2f6] last:border-0"><td className="py-3 pr-4 font-medium text-[#172b4d]">{area.displayLabel}</td><td className="py-3 pr-4 text-[#52647d]">{area.candidateCount}</td><td className="py-3 pr-4"><div className="flex items-center gap-3"><span className="w-14 font-semibold tabular-nums text-[#172b4d]">{pct(area.averagePercentage)}</span><span className="h-1.5 min-w-20 flex-1 overflow-hidden rounded-full bg-[#edf1f7]"><span className="block h-full rounded-full bg-[#4d78cf]" style={{ width: Math.max(0, Math.min(100, area.averagePercentage)) + "%" }} /></span></div></td><td className="py-3 pr-4 text-[#52647d]">{pct(area.highestPercentage)}</td><td className="py-3 text-[#52647d]">{pct(area.lowestPercentage)}</td></tr>)}</tbody></table></div>
          </section>
          <section className="mt-6 rounded-2xl border border-[#e5eaf1] bg-white p-5 sm:p-6"><h2 className="text-base font-semibold text-[#172b4d]">School × learning-area comparison</h2><p className="mt-1 text-xs text-[#64748b]">Compare each participating school&apos;s average in every learning area.</p><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[600px] text-left text-xs"><thead className="border-b border-[#e5eaf1] text-[10px] uppercase tracking-wide text-[#64748b]"><tr><th className="pb-3 pr-4">School</th><th className="pb-3 pr-4">Learning area</th><th className="pb-3 pr-4">Candidates</th><th className="pb-3">Average</th></tr></thead><tbody>{preview.schoolLearningAreas.map((item) => <tr key={item.schoolId + item.areaId} className="border-b border-[#f0f2f6] last:border-0"><td className="py-3 pr-4 font-medium text-[#172b4d]">{item.schoolName}</td><td className="py-3 pr-4 text-[#52647d]">{item.areaLabel}</td><td className="py-3 pr-4 text-[#52647d]">{item.candidateCount}</td><td className="py-3 font-semibold tabular-nums text-[#172b4d]">{pct(item.averagePercentage)}</td></tr>)}</tbody></table></div></section>
          <section className="mt-6 rounded-2xl border border-[#e5eaf1] bg-white p-5 sm:p-6"><h2 className="text-base font-semibold text-[#172b4d]">Class performance</h2><div className="mt-4 grid gap-3 md:grid-cols-2">{preview.classes.slice(0, 12).map((item) => <div key={item.schoolId + item.className} className="rounded-xl bg-[#f7f9fc] p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-[#172b4d]">{item.className}</p><p className="mt-1 text-[10px] text-[#7b8ba2]">{item.schoolName} · {item.candidateCount} learners</p></div><span className="text-sm font-semibold tabular-nums text-[#2457c5]">{pct(item.averagePercentage)}</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#e7edf6]"><div className="h-full rounded-full bg-[#4d78cf]" style={{ width: Math.max(0, Math.min(100, item.averagePercentage)) + "%" }} /></div></div>)}</div></section>
        </> : null}
        {!loading && published ? <section className="mt-6 rounded-2xl border border-[#e5eaf1] bg-white p-5 sm:p-6"><h2 className="text-base font-semibold text-[#172b4d]">Published learning-area performance</h2><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[600px] text-left text-xs"><thead className="border-b border-[#e5eaf1] text-[10px] uppercase tracking-wide text-[#64748b]"><tr><th className="pb-3 pr-4">Learning area</th><th className="pb-3 pr-4">Candidates</th><th className="pb-3 pr-4">Average</th><th className="pb-3 pr-4">Highest</th><th className="pb-3">Lowest</th></tr></thead><tbody>{publishedAreas.map((area) => <tr key={area.id} className="border-b border-[#f0f2f6] last:border-0"><td className="py-3 pr-4 font-medium text-[#172b4d]">{area.label}</td><td className="py-3 pr-4 text-[#52647d]">{area.count}</td><td className="py-3 pr-4 font-semibold text-[#172b4d]">{pct(area.average)}</td><td className="py-3 pr-4 text-[#52647d]">{pct(area.highest)}</td><td className="py-3 text-[#52647d]">{pct(area.lowest)}</td></tr>)}</tbody></table></div></section> : null}
        {!loading && published ? <section className="mt-6 rounded-2xl border border-[#e5eaf1] bg-white p-5 sm:p-6"><h2 className="text-base font-semibold text-[#172b4d]">Published class performance</h2><div className="mt-4 grid gap-3 md:grid-cols-2">{publishedClasses.slice(0, 12).map((item) => <div key={item.school + item.name} className="rounded-xl bg-[#f7f9fc] p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-[#172b4d]">{item.name}</p><p className="mt-1 text-[10px] text-[#7b8ba2]">{item.school} · {item.count} learners</p></div><span className="text-sm font-semibold text-[#2457c5]">{pct(item.average)}</span></div></div>)}</div></section> : null}
        {!loading && published ? <section className="mt-6 rounded-2xl border border-[#e5eaf1] bg-white p-5 sm:p-6"><h2 className="text-base font-semibold text-[#172b4d]">Published school × learning-area comparison</h2><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[600px] text-left text-xs"><thead className="border-b border-[#e5eaf1] text-[10px] uppercase tracking-wide text-[#64748b]"><tr><th className="pb-3 pr-4">School</th><th className="pb-3 pr-4">Learning area</th><th className="pb-3 pr-4">Candidates</th><th className="pb-3">Average</th></tr></thead><tbody>{publishedSchoolAreas.map((item) => <tr key={item.school + item.area} className="border-b border-[#f0f2f6] last:border-0"><td className="py-3 pr-4 font-medium text-[#172b4d]">{item.school}</td><td className="py-3 pr-4 text-[#52647d]">{item.area}</td><td className="py-3 pr-4 text-[#52647d]">{item.count}</td><td className="py-3 font-semibold text-[#172b4d]">{pct(item.average)}</td></tr>)}</tbody></table></div></section> : null}
        {!loading && published ? <section className="mt-7 rounded-2xl border border-emerald-200 bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><span className="rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-800">Published · Immutable</span><h2 className="mt-3 text-lg font-semibold text-[#172b4d]">Publication v{published.publication.version}</h2><p className="mt-1 text-xs text-[#64748b]">Published {dateTime(published.publication.publishedAt)} · {published.publication.candidateCount} candidates · {published.publication.schoolCount} schools</p></div></div>
        </section> : null}
        {!loading ? <section className="mt-6 rounded-2xl border border-[#e5eaf1] bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-base font-semibold text-[#172b4d]">{published ? "Published candidate results" : "Candidate ranking"}</h2><p className="mt-1 text-xs text-[#64748b]">{published ? "The values below are read from the immutable publication snapshot." : `Showing the first ${preview?.candidateRowsReturned ?? 0} ranked candidates.`}</p></div><div className="flex flex-wrap gap-2"><input value={candidateSearch} onChange={(event) => setCandidateSearch(event.target.value)} placeholder="Search learner or school" className="w-52 rounded-xl border border-[#dbe3ee] px-3 py-2 text-xs outline-none focus:border-[#6d94e8]" /><button type="button" onClick={exportCandidates} disabled={!visibleCandidates.length} className="rounded-xl border border-[#dbe3ee] px-3 py-2 text-xs font-semibold text-[#2457c5] hover:bg-[#f7faff] disabled:opacity-50">Export CSV ↓</button></div>{preview?.truncated ? <span className="text-[11px] text-[#64748b]">Preview limited to 50 rows</span> : null}</div>
          <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="border-b border-[#e5eaf1] text-[10px] uppercase tracking-wide text-[#64748b]"><tr><th className="pb-3 pr-3">Rank</th><th className="pb-3 pr-3">Learner</th><th className="pb-3 pr-3">School</th><th className="pb-3 pr-3">Total</th><th className="pb-3 pr-3">Percentage</th><th className="pb-3">Classification</th></tr></thead><tbody>{visibleCandidates.map((row) => <tr key={row.id} className="border-b border-[#f0f2f6] last:border-0"><td className="py-3 pr-3 font-semibold tabular-nums text-[#2457c5]">{row.rank}</td><td className="py-3 pr-3"><p className="font-semibold text-[#172b4d]">{row.name}</p><p className="mt-1 text-[10px] text-[#94a3b8]">{row.number}</p></td><td className="py-3 pr-3 text-[#52647d]">{row.school}</td><td className="py-3 pr-3 tabular-nums text-[#172b4d]">{row.total.toFixed(2)} / {row.maximum.toFixed(2)}</td><td className="py-3 pr-3 font-semibold tabular-nums text-[#172b4d]">{pct(row.percentage)}</td><td className="py-3 text-[#52647d]">{row.band}</td></tr>)}</tbody></table></div>
          {!published && canPublish ? <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#edf0f5] pt-5"><p className="max-w-2xl text-xs leading-5 text-[#64748b]">Publication is a governance action. It freezes the computed results and releases the assessment; corrections afterward require a separately controlled republication workflow.</p><button disabled={busy} onClick={() => void publish()} className="rounded-xl bg-[#2457c5] px-5 py-3 text-xs font-semibold text-white hover:bg-[#1e49a6] disabled:opacity-50">{busy ? "Publishing…" : "Publish results"}</button></div> : null}
        </section> : null}
      </div>
    </main>
  );
}
