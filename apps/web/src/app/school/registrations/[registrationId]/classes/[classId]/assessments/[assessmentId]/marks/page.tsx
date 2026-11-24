"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { apiRequest } from "../../../../../../../../../lib/api";
import { WorkspaceShell } from "../../../../../../../../../components/workspace-shell";

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
  const searchParams = useSearchParams();
  const learningAreaId = searchParams.get("learningAreaId");
  const [sheet, setSheet] = useState<MarkSheet | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [savingCells, setSavingCells] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const response = await apiRequest(`/school/registrations/${registrationId}/classes/${classId}/assessments/${assessmentId}/marks${learningAreaId ? `?learningAreaId=${encodeURIComponent(learningAreaId)}` : ""}`);
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
  }, [assessmentId, classId, registrationId, router, learningAreaId]);

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
      const response = await apiRequest(`/school/registrations/${registrationId}/classes/${classId}/assessments/${assessmentId}/marks/submit${learningAreaId ? `?learningAreaId=${encodeURIComponent(learningAreaId)}` : ""}`, { method: "POST" });
      if (!response.ok) throw new Error(await messageOf(response, "Class marks could not be submitted."));
      const result = await response.json() as { candidateCount: number; markCount: number };
      setNotice(`Submitted ${result.markCount} marks for ${result.candidateCount} learners. Submitted marks are locked.`);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Class marks could not be submitted."); }
    finally { setSubmitting(false); }
  }

  return (
    <WorkspaceShell
      section="School workspace"
      title="Marks entry"
      navigation={[
        { label: "Workspace overview", href: "/workspace" },
        { label: "Teaching desk", href: "/school/teaching" },
        { label: "Current mark sheet", href: "#mark-sheet", active: true },
      ]}
      actions={<Link href="/school/teaching" className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--surface-subtle)]">Back to teaching desk</Link>}
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div><p className="cbe-eyebrow">Assessment data entry</p><h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--ink-strong)] sm:text-3xl">{sheet?.assessment.name || "Assessment marks"}</h1>{sheet ? <p className="mt-2 text-xs text-[var(--muted)]">{sheet.assessment.code} · {sheet.class.grade.replace("GRADE_", "Grade ")} · {sheet.class.academicYear} · Stream {sheet.class.streamCode}</p> : <p className="mt-2 text-sm text-[var(--muted)]">Loading assessment details…</p>}</div>
        {sheet ? <div className="rounded-xl border border-[var(--line)] bg-white px-4 py-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Cells filled</p><p className="mt-1 cbe-tabular text-xl font-semibold text-[var(--ink-strong)]">{filledCells}<span className="text-sm font-medium text-[var(--subtle)]"> / {totalCells}</span></p></div> : null}
      </div>

      {error ? <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {notice ? <p role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p> : null}
      {loading ? <div className="cbe-panel p-8 text-sm text-[var(--muted)]">Loading assessment candidates and learning areas…</div> : sheet ? <>
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <div className="cbe-panel p-4"><p className="text-[11px] font-medium text-[var(--muted)]">Learners</p><p className="mt-1 cbe-tabular text-xl font-semibold text-[var(--ink-strong)]">{sheet.candidates.length}</p></div>
          <div className="cbe-panel p-4"><p className="text-[11px] font-medium text-[var(--muted)]">Learning areas</p><p className="mt-1 cbe-tabular text-xl font-semibold text-[var(--ink-strong)]">{sheet.learningAreas.length}</p></div>
          <div className="cbe-panel p-4"><p className="text-[11px] font-medium text-[var(--muted)]">Assessment closes</p><p className="mt-1 text-sm font-semibold text-[var(--ink-strong)]">{sheet.assessment.closesAt ? new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(sheet.assessment.closesAt)) : "Not specified"}</p></div>
        </div>

        <div className="mb-5 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-soft)] px-4 py-3 text-xs leading-5 text-[var(--brand-strong)]">Enter each learner&apos;s score and leave the field to save it. Scores are checked against the assessment&apos;s maximum marks and decimal precision. Submitted marks are locked unless the Council initiates a formal correction workflow.</div>

        <section id="mark-sheet" className="cbe-panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-4 sm:px-5">
            <div><h2 className="text-sm font-semibold text-[var(--ink-strong)]">{learningAreaId ? "Learning-area mark sheet" : "Class mark sheet"}</h2><p className="mt-1 text-xs text-[var(--muted)]">{sheet.candidates.length} learners · {sheet.learningAreas.length} learning areas</p></div>
            <span className="inline-flex items-center gap-2 rounded-full bg-[var(--success-soft)] px-3 py-1.5 text-[10px] font-semibold text-[var(--success)]"><span className="size-1.5 rounded-full bg-[var(--success)]"/>Assessment open</span>
          </div>
          {sheet.candidates.length === 0 || sheet.learningAreas.length === 0 ? <div className="p-10 text-center"><p className="text-sm font-semibold text-[var(--ink)]">No mark-entry rows available</p><p className="mt-1 text-xs text-[var(--muted)]">No assessment candidates or learning areas are available for this sheet.</p></div> : <div className="overflow-x-auto">
            <table className="report-table w-full min-w-[850px] border-collapse text-left">
              <thead className="bg-[var(--surface-subtle)]"><tr><th scope="col" className="sticky left-0 z-10 min-w-[230px] border-b border-[var(--line)] bg-[var(--surface-subtle)] px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Learner</th>{sheet.learningAreas.map((area) => <th scope="col" key={area.id} className="min-w-[150px] border-b border-[var(--line)] px-3 py-3 align-top"><p className="text-[11px] font-semibold text-[var(--ink)]">{area.displayLabel || area.canonicalName}</p><p className="mt-1 text-[10px] font-medium text-[var(--muted)]">Maximum {area.maxMarks} · {area.decimalPlaces} dp</p></th>)}</tr></thead>
              <tbody>{sheet.candidates.map((candidate) => <tr key={candidate.id} className="border-b border-[var(--line)] last:border-0 hover:bg-[var(--surface-subtle)]">
                <th scope="row" className="sticky left-0 z-10 border-r border-[var(--line)] bg-white px-4 py-3 text-left"><p className="text-xs font-semibold text-[var(--ink)]">{candidate.learnerName}</p><p className="mt-1 font-mono text-[10px] font-normal text-[var(--muted)]">{candidate.learnerNumber}</p></th>
                {sheet.learningAreas.map((area) => { const key = cellKey(candidate.id, area.id); const mark = candidate.marks.find((item) => item.assessmentLearningAreaId === area.id); const locked = mark?.status === "SUBMITTED"; return <td key={area.id} className="px-3 py-2 align-top"><div className="relative"><input aria-label={`${candidate.learnerName} — ${area.displayLabel || area.canonicalName}`} type="number" min="0" max={area.maxMarks} step={10 ** -area.decimalPlaces} value={values[key] ?? ""} disabled={locked || submitting} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} onBlur={() => { if (!locked && values[key] !== "") void saveCell(candidate, area); }} className="w-full rounded-lg border border-[var(--line-strong)] bg-white px-3 py-2.5 text-sm cbe-tabular text-[var(--ink)] outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)] disabled:bg-[var(--surface-subtle)] disabled:text-[var(--subtle)]" />{savingCells.includes(key) ? <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-medium text-[var(--brand)]">Saving</span> : locked ? <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-semibold text-[var(--success)]">Saved</span> : null}</div>{mark?.status === "RETURNED" && mark.returnedReason ? <p className="mt-1 max-w-[180px] text-[10px] leading-4 text-[var(--warning)]">Correction: {mark.returnedReason}</p> : null}</td>; })}
              </tr>)}</tbody>
            </table>
          </div>}
          <div className="flex flex-col gap-3 border-t border-[var(--line)] bg-[var(--surface-subtle)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="max-w-xl text-[11px] leading-5 text-[var(--muted)]">Leave a score field to save it. {learningAreaId ? "Submitting locks this learning area's marks." : "Submitting locks all marks for this class."}</p>
            <button onClick={() => void submitClass()} disabled={submitting || savingCells.length > 0 || totalCells === 0} className="rounded-lg bg-[var(--brand)] px-5 py-3 text-xs font-semibold text-white transition hover:bg-[var(--brand-strong)] disabled:cursor-not-allowed disabled:opacity-50">{submitting ? "Submitting marks…" : learningAreaId ? "Submit learning-area marks" : "Submit class marks"}</button>
          </div>
        </section>
      </> : null}
    </WorkspaceShell>
  );
}
