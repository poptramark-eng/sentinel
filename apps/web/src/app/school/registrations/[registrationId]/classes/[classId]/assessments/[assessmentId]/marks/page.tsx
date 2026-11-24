"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiRequest } from "../../../../../../../../../lib/api";

interface LearningArea { id: string; learningAreaCode: string; canonicalName: string; displayLabel: string | null; maxMarks: number; decimalPlaces: number; sortOrder: number }
interface MarkCell { id: string; assessmentLearningAreaId: string; marks: number | null; status: "DRAFT" | "SUBMITTED" | "RETURNED"; submittedAt: string | null; returnedReason: string | null }
interface Candidate { id: string; learnerNumber: string; learnerName: string; marks: MarkCell[] }
interface MarkSheet { assessment: { id: string; name: string; code: string; closesAt: string | null }; class: { grade: string; academicYear: number; streamCode: string }; learningAreas: LearningArea[]; candidates: Candidate[] }

async function messageOf(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null) as { message?: string | string[] } | null;
  return Array.isArray(payload?.message) ? payload.message.join(" ") : payload?.message ?? fallback;
}

const cellKey = (candidateId: string, areaId: string) => `${candidateId}:${areaId}`;

export default function AssessmentMarksPage() {
  const { registrationId, classId, assessmentId } = useParams<{ registrationId: string; classId: string; assessmentId: string }>();
  const router = useRouter();
  const [sheet, setSheet] = useState<MarkSheet | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [savingCells, setSavingCells] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const response = await apiRequest(`/school/registrations/${registrationId}/classes/${classId}/assessments/${assessmentId}/marks`);
    if (response.status === 401) { router.replace("/login"); return; }
    if (response.status === 403) { router.replace("/workspace"); return; }
    if (!response.ok) throw new Error(await messageOf(response, "The assessment mark sheet could not be loaded."));
    const payload = await response.json() as MarkSheet;
    setSheet(payload);
    const next: Record<string, string> = {};
    for (const candidate of payload.candidates) for (const mark of candidate.marks) {
      next[cellKey(candidate.id, mark.assessmentLearningAreaId)] = mark.marks === null ? "" : String(mark.marks);
    }
    setValues(next);
  }, [assessmentId, classId, registrationId, router]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      void load().catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load marks."); })
        .finally(() => { if (active) setLoading(false); });
    });
    return () => { active = false; };
  }, [load]);

  const totalCells = (sheet?.candidates.length ?? 0) * (sheet?.learningAreas.length ?? 0);
  const filledCells = useMemo(() => {
    if (!sheet) return 0;
    return sheet.candidates.reduce((count, candidate) => count + candidate.marks.filter((mark) => values[cellKey(candidate.id, mark.assessmentLearningAreaId)] !== "").length, 0);
  }, [sheet, values]);

  async function saveCell(candidate: Candidate, area: LearningArea) {
    const key = cellKey(candidate.id, area.id);
    const raw = values[key]?.trim() ?? "";
    if (raw === "") { setError("A mark cannot be left blank. Enter a score or ask the School Administrator to resolve the learner's participation."); return; }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > area.maxMarks) { setError(`Enter a valid score from 0 to ${area.maxMarks} for ${area.displayLabel || area.canonicalName}.`); return; }
    setSavingCells((current) => [...current, key]); setError(""); setNotice("");
    try {
      const response = await apiRequest(`/school/registrations/${registrationId}/classes/${classId}/assessments/${assessmentId}/marks`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId: candidate.id, assessmentLearningAreaId: area.id, marks: parsed }),
      });
      if (!response.ok) throw new Error(await messageOf(response, "The mark could not be saved."));
      setNotice("Mark saved.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The mark could not be saved."); }
    finally { setSavingCells((current) => current.filter((item) => item !== key)); }
  }

  async function submitClass() {
    if (!sheet) return;
    if (filledCells !== totalCells) { setError(`Complete all ${totalCells} mark cells before submitting this class.`); return; }
    if (savingCells.length > 0) { setError("Wait for pending mark saves to finish before submitting."); return; }
    setSubmitting(true); setError(""); setNotice("");
    try {
      const response = await apiRequest(`/school/registrations/${registrationId}/classes/${classId}/assessments/${assessmentId}/marks/submit`, { method: "POST" });
      if (!response.ok) throw new Error(await messageOf(response, "Class marks could not be submitted."));
      const result = await response.json() as { candidateCount: number; markCount: number };
      setNotice(`Submitted ${result.markCount} marks for ${result.candidateCount} learners. Submitted marks are locked.`);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Class marks could not be submitted."); }
    finally { setSubmitting(false); }
  }

  return <main className="min-h-screen bg-[#f6f8fc]">
    <header className="border-b border-[#e5eaf1] bg-white"><div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8"><Link href="/school/teaching" className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#2457c5] text-xs font-bold text-white">S</span><span className="text-sm font-semibold text-[#172b4d]">Sentinel · Teaching workspace</span></Link><Link href="/school/teaching" className="text-xs font-semibold text-[#52647d]">Back to assigned classes</Link></div></header>
    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
      <Link href="/school/teaching" className="text-xs font-semibold text-[#64748b] hover:text-[#2457c5]">← Teaching workspace</Link>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-4"><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#2457c5]">Assessment data entry</p><h1 className="mt-2 text-2xl font-semibold tracking-tight text-[#172b4d] sm:text-3xl">{sheet?.assessment.name || "Assessment marks"}</h1>{sheet ? <p className="mt-2 text-xs text-[#64748b]">{sheet.assessment.code} · {sheet.class.grade.replace("GRADE_", "Grade ")} · {sheet.class.academicYear} · Stream {sheet.class.streamCode}</p> : null}</div>{sheet ? <div className="rounded-xl border border-[#e5eaf1] bg-white px-4 py-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-[#8a99ad]">Entry completion</p><p className="mt-1 text-lg font-semibold tabular-nums text-[#172b4d]">{filledCells} <span className="text-sm font-medium text-[#8a99ad]">/ {totalCells}</span></p></div> : null}</div>
      {error ? <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {notice ? <p role="status" className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p> : null}
      {loading ? <div className="mt-8 rounded-2xl border border-[#e5eaf1] bg-white p-8 text-sm text-[#64748b]">Loading assessment candidates and learning areas…</div> : sheet ? <>
        <div className="mt-6 rounded-xl border border-[#dce7f6] bg-[#f1f6ff] px-4 py-3 text-xs leading-5 text-[#526b93]">Enter marks in the cells and move focus away to save each value. Scores are validated against the assessment&apos;s maximum marks and decimal precision. Once submitted, marks are locked pending a formal correction workflow.</div>
        <section className="mt-6 overflow-hidden rounded-2xl border border-[#e5eaf1] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf0f5] px-5 py-4"><div><h2 className="text-sm font-semibold text-[#172b4d]">Learner mark sheet</h2><p className="mt-1 text-xs text-[#7b8ba2]">{sheet.candidates.length} learners · {sheet.learningAreas.length} learning areas</p></div><span className="rounded-full bg-[#eaf8f2] px-3 py-1 text-[10px] font-semibold text-[#27825f]">Assessment open</span></div>
          {sheet.candidates.length === 0 || sheet.learningAreas.length === 0 ? <div className="p-10 text-center text-sm text-[#64748b]">No assessment candidates or learning areas are available.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[850px] border-collapse text-left"><thead className="bg-[#f8faff]"><tr><th className="sticky left-0 z-10 min-w-[230px] border-b border-[#e9eef5] bg-[#f8faff] px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-[#64748b]">Learner</th>{sheet.learningAreas.map((area) => <th key={area.id} className="min-w-[145px] border-b border-[#e9eef5] px-3 py-3 align-top"><p className="text-[11px] font-semibold text-[#263b5b]">{area.displayLabel || area.canonicalName}</p><p className="mt-1 text-[10px] font-medium text-[#8a99ad]">Max {area.maxMarks} · {area.decimalPlaces} dp</p></th>)}</tr></thead><tbody>{sheet.candidates.map((candidate) => <tr key={candidate.id} className="border-b border-[#f0f3f7] last:border-0"><td className="sticky left-0 z-10 border-r border-[#edf0f5] bg-white px-4 py-3"><p className="text-xs font-semibold text-[#263b5b]">{candidate.learnerName}</p><p className="mt-1 font-mono text-[10px] text-[#8a99ad]">{candidate.learnerNumber}</p></td>{sheet.learningAreas.map((area) => { const key = cellKey(candidate.id, area.id); const mark = candidate.marks.find((item) => item.assessmentLearningAreaId === area.id); const locked = mark?.status === "SUBMITTED"; return <td key={area.id} className="px-3 py-2"><div className="relative"><input aria-label={`${candidate.learnerName} — ${area.displayLabel || area.canonicalName}`} type="number" min="0" max={area.maxMarks} step={10 ** -area.decimalPlaces} value={values[key] ?? ""} disabled={locked || submitting} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} onBlur={() => { if (!locked && values[key] !== "") void saveCell(candidate, area); }} className="w-full rounded-lg border border-[#dbe3ee] bg-white px-3 py-2.5 text-sm tabular-nums text-[#172b4d] outline-none transition focus:border-[#6d94e8] focus:ring-2 focus:ring-[#edf4ff] disabled:bg-[#f5f7fa] disabled:text-[#8a99ad]" />{savingCells.includes(key) ? <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-[#2457c5]">Saving</span> : locked ? <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-[#27825f]">✓</span> : null}</div>{mark?.status === "RETURNED" && mark.returnedReason ? <p className="mt-1 max-w-[180px] text-[10px] leading-4 text-[#a15a38]">Correction: {mark.returnedReason}</p> : null}</td>})}</tr>)}</tbody></table></div>}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#edf0f5] bg-[#fbfcfe] px-5 py-4"><p className="text-[11px] text-[#7b8ba2]">Save each cell by leaving it. Submission locks all marks for this class.</p><button onClick={() => void submitClass()} disabled={submitting || savingCells.length > 0 || totalCells === 0} className="rounded-xl bg-[#2457c5] px-5 py-3 text-xs font-semibold text-white hover:bg-[#1e49a6] disabled:opacity-50">{submitting ? "Submitting marks…" : "Submit class marks"}</button></div>
        </section>
      </> : null}
    </div>
  </main>;
}
