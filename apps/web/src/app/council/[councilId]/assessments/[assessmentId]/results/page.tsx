"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiRequest } from "../../../../../../lib/api";
import { CouncilWorkspaceShell } from "../../../../../../components/council-workspace-shell";

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
  publication: { id: string; version: number; status: "PUBLISHED" | "SUPERSEDED"; publishedAt: string; candidateCount: number; schoolCount: number };
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
  const [publicationHistory, setPublicationHistory] = useState<{ id: string; version: number; status: "PUBLISHED" | "SUPERSEDED"; publishedAt: string; candidateCount: number; schoolCount: number; resultCount: number }[]>([]);
  const [assessmentStatus, setAssessmentStatus] = useState<string>("CLOSED");
  const [canPublish, setCanPublish] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [candidateSearch, setCandidateSearch] = useState("");

  const load = useCallback(async () => {
    const [publicationResponse, assessmentResponse, historyResponse] = await Promise.all([
      apiRequest(`/councils/${councilId}/assessments/${assessmentId}/results`),
      apiRequest(`/councils/${councilId}/assessments`),
      apiRequest(`/councils/${councilId}/assessments/${assessmentId}/results/history`),
    ]);
    if ([publicationResponse, assessmentResponse, historyResponse].some((response) => response.status === 401)) {
      router.replace("/login");
      return;
    }
    if ([publicationResponse, assessmentResponse, historyResponse].some((response) => response.status === 403)) {
      router.replace("/workspace");
      return;
    }
    if (!publicationResponse.ok || !assessmentResponse.ok || !historyResponse.ok) throw new Error("Results workspace could not be loaded.");
    const [publication, assessmentData, historyData] = await Promise.all([
      publicationResponse.json() as Promise<Published | null>,
      assessmentResponse.json() as Promise<{ canModerate: boolean; assessments: { id: string; status: string }[] }>,
      historyResponse.json() as Promise<{ publications: { id: string; version: number; status: "PUBLISHED" | "SUPERSEDED"; publishedAt: string; candidateCount: number; schoolCount: number; resultCount: number }[] }>,
    ]);
    const currentAssessment = assessmentData.assessments.find((item) => item.id === assessmentId);
    setAssessmentStatus(currentAssessment?.status ?? "CLOSED");
    setPublished(publication);
    setPublicationHistory(historyData.publications);
    setCanPublish(assessmentData.canModerate);
    if (!publication && currentAssessment?.status === "CLOSED") {
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
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "cbe-assessment-results.csv"; anchor.click(); URL.revokeObjectURL(url);
  }

  async function viewPublicationVersion(version: number) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await apiRequest(`/councils/${councilId}/assessments/${assessmentId}/results/versions/${version}`);
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(messageOf(payload, "The historical publication could not be loaded."));
      setPublished(payload as Published);
      setPreview(null);
      setNotice(`Viewing immutable publication version ${version}. Its historical results have not been changed.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The historical publication could not be loaded.");
    } finally { setBusy(false); }
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
    <CouncilWorkspaceShell councilId={councilId} active="assessments">
      <div className="report-screen w-full py-0">
        <div className="report-print-header"><p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", color: "#2457c5" }}>SOFTFLIX · CBE COUNCIL REPORT</p><h1 style={{ fontSize: 22, fontWeight: 700, marginTop: 8 }}>{published ? (published.publication.status === "PUBLISHED" ? "Official assessment results" : "Historical assessment results · Superseded") : "Assessment results preview"}</h1><p style={{ fontSize: 11, marginTop: 4 }}>{published ? `Publication v${published.publication.version} · Published ${dateTime(published.publication.publishedAt)}` : "PREVIEW · NOT PUBLISHED"}</p></div><div className="no-print flex flex-wrap items-center justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--brand)]">Assessment outcomes</p><h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--ink-strong)] sm:text-3xl">Results review</h1></div>{published ? <button type="button" onClick={() => window.print()} className="rounded-xl bg-[var(--brand)] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[var(--brand-strong)]">{published.publication.status === "PUBLISHED" ? "Print official report" : "Print historical snapshot"} ↗</button> : null}</div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">Review candidate totals, grade-wide ranks and school performance before publication. Calculations use the assessment&apos;s frozen candidate, learning-area and rubric snapshots.</p>
        {error ? <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {notice ? <div role="status" className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div> : null}
        {loading ? <div className="mt-8 rounded-2xl border border-[var(--line)] bg-white p-8 text-sm text-[var(--muted)]">Preparing assessment results…</div> : null}
        {!loading && preview ? <>
          <section className="report-card mt-7 rounded-2xl border border-[var(--line)] bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><h2 className="text-lg font-semibold text-[var(--ink-strong)]">{preview.assessment.name}</h2><p className="mt-1 text-xs text-[var(--muted)]">{preview.assessment.code} · {preview.assessment.academicYear} · {preview.assessment.grade.replace("_", " ")} · {preview.assessment.rubric.name} {preview.assessment.rubricVersion}</p></div>
              <span className="rounded-full bg-amber-50 px-3 py-1.5 text-[11px] font-semibold text-amber-800">Preview · Not published</span>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Candidates", preview.summary.candidateCount.toLocaleString("en-KE")],
                ["Schools", preview.summary.schoolCount.toLocaleString("en-KE")],
                ["Average", pct(preview.summary.averagePercentage)],
                ["Highest / lowest", `${pct(preview.summary.highestPercentage)} / ${pct(preview.summary.lowestPercentage)}`],
              ].map(([label, value]) => <div key={label} className="rounded-xl bg-[var(--surface-subtle)] p-4"><p className="text-[11px] font-medium text-[var(--muted)]">{label}</p><p className="mt-2 text-xl font-semibold tabular-nums text-[var(--ink-strong)]">{value}</p></div>)}
            </div>
            <div className={`mt-5 rounded-xl px-4 py-3 text-xs leading-5 ${preview.classification.mode === "UNCONFIGURED" ? "border border-amber-200 bg-amber-50 text-amber-900" : "border border-[var(--brand-border)] bg-[var(--brand-soft)] text-[#38547c]"}`}>
              <p className="font-semibold">Classification: {preview.classification.mode.replaceAll("_", " ")}</p><p className="mt-1">{preview.classification.note}</p>
            </div>
          </section>
          <section className="report-card mt-6 rounded-2xl border border-[var(--line)] bg-white p-5 sm:p-6">
            <h2 className="text-base font-semibold text-[var(--ink-strong)]">School performance</h2>
            <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead className="border-b border-[var(--line)] text-[10px] uppercase tracking-wide text-[var(--muted)]"><tr><th className="pb-3 pr-4">School</th><th className="pb-3 pr-4">Candidates</th><th className="pb-3 pr-4">Average</th><th className="pb-3">Top candidate rank</th></tr></thead><tbody>{preview.schools.map((school) => <tr key={school.schoolId} className="border-b border-[var(--line)] last:border-0"><td className="py-3 pr-4 font-medium text-[var(--ink-strong)]">{school.schoolName}</td><td className="py-3 pr-4 tabular-nums text-[var(--muted)]">{school.candidateCount}</td><td className="py-3 pr-4 font-semibold tabular-nums text-[var(--ink-strong)]">{pct(school.averagePercentage)}</td><td className="py-3 tabular-nums text-[var(--muted)]">{school.topRank}</td></tr>)}</tbody></table></div>
          </section>
          <section className="report-card mt-6 rounded-2xl border border-[var(--line)] bg-white p-5 sm:p-6">
            <h2 className="text-base font-semibold text-[var(--ink-strong)]">Learning-area performance</h2>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">Area percentages are normalized against each area&apos;s configured maximum marks.</p>
            <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead className="border-b border-[var(--line)] text-[10px] uppercase tracking-wide text-[var(--muted)]"><tr><th className="pb-3 pr-4">Learning area</th><th className="pb-3 pr-4">Candidates</th><th className="pb-3 pr-4">Average</th><th className="pb-3 pr-4">Highest</th><th className="pb-3">Lowest</th></tr></thead><tbody>{preview.learningAreas.map((area) => <tr key={area.assessmentLearningAreaId} className="border-b border-[var(--line)] last:border-0"><td className="py-3 pr-4 font-medium text-[var(--ink-strong)]">{area.displayLabel}</td><td className="py-3 pr-4 text-[var(--muted)]">{area.candidateCount}</td><td className="py-3 pr-4"><div className="flex items-center gap-3"><span className="w-14 font-semibold tabular-nums text-[var(--ink-strong)]">{pct(area.averagePercentage)}</span><span className="h-1.5 min-w-20 flex-1 overflow-hidden rounded-full bg-[var(--line)]"><span className="block h-full rounded-full bg-[var(--brand)]" style={{ width: Math.max(0, Math.min(100, area.averagePercentage)) + "%" }} /></span></div></td><td className="py-3 pr-4 text-[var(--muted)]">{pct(area.highestPercentage)}</td><td className="py-3 text-[var(--muted)]">{pct(area.lowestPercentage)}</td></tr>)}</tbody></table></div>
          </section>
          <section className="report-card mt-6 rounded-2xl border border-[var(--line)] bg-white p-5 sm:p-6"><h2 className="text-base font-semibold text-[var(--ink-strong)]">School × learning-area comparison</h2><p className="mt-1 text-xs text-[var(--muted)]">Compare each participating school&apos;s average in every learning area.</p><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[600px] text-left text-xs"><thead className="border-b border-[var(--line)] text-[10px] uppercase tracking-wide text-[var(--muted)]"><tr><th className="pb-3 pr-4">School</th><th className="pb-3 pr-4">Learning area</th><th className="pb-3 pr-4">Candidates</th><th className="pb-3">Average</th></tr></thead><tbody>{preview.schoolLearningAreas.map((item) => <tr key={item.schoolId + item.areaId} className="border-b border-[var(--line)] last:border-0"><td className="py-3 pr-4 font-medium text-[var(--ink-strong)]">{item.schoolName}</td><td className="py-3 pr-4 text-[var(--muted)]">{item.areaLabel}</td><td className="py-3 pr-4 text-[var(--muted)]">{item.candidateCount}</td><td className="py-3 font-semibold tabular-nums text-[var(--ink-strong)]">{pct(item.averagePercentage)}</td></tr>)}</tbody></table></div></section>
          <section className="report-card mt-6 rounded-2xl border border-[var(--line)] bg-white p-5 sm:p-6"><h2 className="text-base font-semibold text-[var(--ink-strong)]">Class performance</h2><div className="mt-4 grid gap-3 md:grid-cols-2">{preview.classes.slice(0, 12).map((item) => <div key={item.schoolId + item.className} className="rounded-xl bg-[var(--surface-subtle)] p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-[var(--ink-strong)]">{item.className}</p><p className="mt-1 text-[10px] text-[#7b8ba2]">{item.schoolName} · {item.candidateCount} learners</p></div><span className="text-sm font-semibold tabular-nums text-[var(--brand)]">{pct(item.averagePercentage)}</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--line)]"><div className="h-full rounded-full bg-[var(--brand)]" style={{ width: Math.max(0, Math.min(100, item.averagePercentage)) + "%" }} /></div></div>)}</div></section>
        </> : null}
        {!loading && published ? <section className="report-card mt-6 rounded-2xl border border-[var(--line)] bg-white p-5 sm:p-6"><h2 className="text-base font-semibold text-[var(--ink-strong)]">Published learning-area performance</h2><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[600px] text-left text-xs"><thead className="border-b border-[var(--line)] text-[10px] uppercase tracking-wide text-[var(--muted)]"><tr><th className="pb-3 pr-4">Learning area</th><th className="pb-3 pr-4">Candidates</th><th className="pb-3 pr-4">Average</th><th className="pb-3 pr-4">Highest</th><th className="pb-3">Lowest</th></tr></thead><tbody>{publishedAreas.map((area) => <tr key={area.id} className="border-b border-[var(--line)] last:border-0"><td className="py-3 pr-4 font-medium text-[var(--ink-strong)]">{area.label}</td><td className="py-3 pr-4 text-[var(--muted)]">{area.count}</td><td className="py-3 pr-4 font-semibold text-[var(--ink-strong)]">{pct(area.average)}</td><td className="py-3 pr-4 text-[var(--muted)]">{pct(area.highest)}</td><td className="py-3 text-[var(--muted)]">{pct(area.lowest)}</td></tr>)}</tbody></table></div></section> : null}
        {!loading && published ? <section className="report-card mt-6 rounded-2xl border border-[var(--line)] bg-white p-5 sm:p-6"><h2 className="text-base font-semibold text-[var(--ink-strong)]">Published class performance</h2><div className="mt-4 grid gap-3 md:grid-cols-2">{publishedClasses.slice(0, 12).map((item) => <div key={item.school + item.name} className="rounded-xl bg-[var(--surface-subtle)] p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-[var(--ink-strong)]">{item.name}</p><p className="mt-1 text-[10px] text-[#7b8ba2]">{item.school} · {item.count} learners</p></div><span className="text-sm font-semibold text-[var(--brand)]">{pct(item.average)}</span></div></div>)}</div></section> : null}
        {!loading && published ? <section className="report-card mt-6 rounded-2xl border border-[var(--line)] bg-white p-5 sm:p-6"><h2 className="text-base font-semibold text-[var(--ink-strong)]">Published school × learning-area comparison</h2><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[600px] text-left text-xs"><thead className="border-b border-[var(--line)] text-[10px] uppercase tracking-wide text-[var(--muted)]"><tr><th className="pb-3 pr-4">School</th><th className="pb-3 pr-4">Learning area</th><th className="pb-3 pr-4">Candidates</th><th className="pb-3">Average</th></tr></thead><tbody>{publishedSchoolAreas.map((item) => <tr key={item.school + item.area} className="border-b border-[var(--line)] last:border-0"><td className="py-3 pr-4 font-medium text-[var(--ink-strong)]">{item.school}</td><td className="py-3 pr-4 text-[var(--muted)]">{item.area}</td><td className="py-3 pr-4 text-[var(--muted)]">{item.count}</td><td className="py-3 font-semibold text-[var(--ink-strong)]">{pct(item.average)}</td></tr>)}</tbody></table></div></section> : null}
        {!loading && published ? <section className="report-card mt-7 rounded-2xl border border-emerald-200 bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><span className={`rounded-full px-3 py-1.5 text-[11px] font-semibold ${published.publication.status === "PUBLISHED" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>{published.publication.status === "PUBLISHED" ? "Published · Current" : "Superseded · Historical snapshot"}</span><h2 className="mt-3 text-lg font-semibold text-[var(--ink-strong)]">Publication v{published.publication.version}</h2><p className="mt-1 text-xs text-[var(--muted)]">Published {dateTime(published.publication.publishedAt)} · {published.publication.candidateCount} candidates · {published.publication.schoolCount} schools</p></div></div>
        </section> : null}
        {!loading && publicationHistory.length > 0 ? <section className="no-print mt-6 rounded-2xl border border-[var(--line)] bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold text-[var(--ink-strong)]">Publication history</h2><p className="mt-1 text-xs text-[var(--muted)]">Every published result set is retained as an immutable, versioned snapshot.</p></div><span className="rounded-full bg-[var(--surface-subtle)] px-3 py-1.5 text-[11px] font-semibold text-[var(--muted)]">{publicationHistory.length} version{publicationHistory.length === 1 ? "" : "s"}</span></div>
          <div className="mt-4 divide-y divide-[#edf0f5]">{publicationHistory.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-[var(--ink-strong)]">Publication v{item.version}</p><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${item.status === "PUBLISHED" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{item.status === "PUBLISHED" ? "Current" : "Superseded"}</span></div><p className="mt-1 text-xs text-[var(--muted)]">{dateTime(item.publishedAt)} · {item.resultCount} learners · {item.schoolCount} schools</p></div><button type="button" disabled={busy || published?.publication.version === item.version} onClick={() => void viewPublicationVersion(item.version)} className="rounded-lg border border-[var(--line-strong)] px-3 py-2 text-xs font-semibold text-[var(--brand)] hover:bg-[var(--brand-soft)] disabled:opacity-50">{published?.publication.version === item.version ? "Viewing" : "View snapshot"}</button></div>)}</div>
        </section> : null}
        {!loading && !published && !preview && assessmentStatus === "OPEN" ? <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:p-6"><h2 className="text-sm font-semibold text-amber-950">Results correction in progress</h2><p className="mt-2 text-xs leading-5 text-amber-900">The previous publication has been superseded because governance returned marks for correction. The historical version remains available above. A new official result set can be published after all corrections are resubmitted and the assessment is closed again.</p></section> : null}
        {!loading ? <section className="report-card mt-6 rounded-2xl border border-[var(--line)] bg-white p-5 sm:p-6">
          <div className="no-print flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-base font-semibold text-[var(--ink-strong)]">{published ? "Published candidate results" : "Candidate ranking"}</h2><p className="mt-1 text-xs text-[var(--muted)]">{published ? "The values below are read from the immutable publication snapshot." : `Showing the first ${preview?.candidateRowsReturned ?? 0} ranked candidates.`}</p></div><div className="flex flex-wrap gap-2"><label className="sr-only" htmlFor="candidate-results-search">Search candidate results by learner number, learner name, or school</label><input id="candidate-results-search" type="search" value={candidateSearch} onChange={(event) => setCandidateSearch(event.target.value)} placeholder="Search learner or school" className="w-52 rounded-xl border border-[var(--line-strong)] px-3 py-2 text-xs outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15" /><button type="button" onClick={exportCandidates} disabled={!visibleCandidates.length} className="rounded-xl border border-[var(--line-strong)] px-3 py-2 text-xs font-semibold text-[var(--brand)] hover:bg-[var(--brand-soft)] disabled:opacity-50">Export CSV ↓</button></div>{preview?.truncated ? <span className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-900">Preview limited to 50 rows. The full candidate list is not included in this preview.</span> : null}</div>
          <p className="no-print mt-3 text-[11px] text-[var(--muted)]" aria-live="polite">Showing {visibleCandidates.length.toLocaleString("en-KE")} of {(published?.results.length ?? preview?.candidates.length ?? 0).toLocaleString("en-KE")} candidate rows{candidateSearch.trim() ? " matching your search" : ""}. Export downloads the currently visible rows.</p><div className="mt-4 overflow-x-auto rounded-xl focus-within:ring-2 focus-within:ring-[var(--brand)]/20" tabIndex={0} role="region" aria-label="Candidate results table; scroll horizontally to view all columns"><table className="report-table w-full min-w-[760px] text-left text-xs"><caption className="sr-only">Ranked candidate results including learner identity, school, total marks, percentage, and classification</caption><thead className="border-b border-[var(--line)] text-[10px] uppercase tracking-wide text-[var(--muted)]"><tr><th className="pb-3 pr-3">Rank</th><th className="pb-3 pr-3">Learner</th><th className="pb-3 pr-3">School</th><th className="pb-3 pr-3">Total</th><th className="pb-3 pr-3">Percentage</th><th className="pb-3">Classification</th></tr></thead><tbody>{visibleCandidates.map((row) => <tr key={row.id} className="border-b border-[var(--line)] last:border-0"><td className="py-3 pr-3 font-semibold tabular-nums text-[var(--brand)]">{row.rank}</td><td className="py-3 pr-3"><p className="font-semibold text-[var(--ink-strong)]">{row.name}</p><p className="mt-1 text-[10px] text-[var(--subtle)]">{row.number}</p></td><td className="py-3 pr-3 text-[var(--muted)]">{row.school}</td><td className="py-3 pr-3 tabular-nums text-[var(--ink-strong)]">{row.total.toFixed(2)} / {row.maximum.toFixed(2)}</td><td className="py-3 pr-3 font-semibold tabular-nums text-[var(--ink-strong)]">{pct(row.percentage)}</td><td className="py-3 text-[var(--muted)]">{row.band}</td></tr>)}</tbody></table></div>
          {!published && canPublish ? <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-5"><p className="max-w-2xl text-xs leading-5 text-[var(--muted)]">Publication is a governance action. It freezes the computed results and releases the assessment; corrections afterward require a separately controlled republication workflow.</p><button disabled={busy} onClick={() => void publish()} className="rounded-xl bg-[var(--brand)] px-5 py-3 text-xs font-semibold text-white hover:bg-[var(--brand-strong)] disabled:opacity-50">{busy ? "Publishing…" : "Publish results"}</button></div> : null}
        </section> : null}
      </div>
    </CouncilWorkspaceShell>
  );
}
