"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiRequest } from "../../../../lib/api";
import { CouncilWorkspaceShell } from "../../../../components/council-workspace-shell";

const GRADES = ["GRADE_1", "GRADE_2", "GRADE_3", "GRADE_4", "GRADE_5", "GRADE_6", "GRADE_7", "GRADE_8", "GRADE_9"] as const;
type Grade = typeof GRADES[number];
type AssessmentType = "FORMATIVE" | "SUMMATIVE" | "PRACTICE" | "OTHER";

interface GradeArea {
  id: string;
  enabled: boolean;
  assessmentEligible: boolean;
  displayLabel: string | null;
  sortOrder: number;
  gradeLearningArea: {
    grade: Grade;
    sourceLabel: string;
    optionality: "UNKNOWN" | "CORE" | "OPTIONAL";
    reviewStatus: "REVIEW_REQUIRED" | "REVIEWED";
    learningArea: { code: string; canonicalName: string };
  };
}
interface RubricVersion {
  id: string;
  versionLabel: string;
  status: string;
  scaleType: "NUMERIC_BANDS" | "PERFORMANCE_LEVELS" | "DESCRIPTIVE";
  rubric: { code: string; name: string };
  bands: { id: string; code: string; label: string }[];
}
interface Assessment {
  id: string;
  name: string;
  code: string;
  academicYear: number;
  grade: Grade;
  type: AssessmentType;
  status: "DRAFT" | "SCHEDULED" | "OPEN" | "CLOSED" | "RELEASED" | "CANCELLED";
  opensAt: string | null;
  closesAt: string | null;
  learningAreas: { id: string; sourceLabel: string; displayLabel: string | null; maxMarks: string; decimalPlaces: number; sortOrder: number }[];
  rubricBands: { id: string; code: string; label: string; lowerBound: string | null; upperBound: string | null }[];
  rubricVersion: { id: string; versionLabel: string; scaleType: string; rubric: { code: string; name: string } };
  candidates: {
    id: string;
    registrationId: string;
    schoolClassId: string;
    schoolClass: { displayName: string | null; streamCode: string; registration: { school: { name: string } } };
  }[];
}
interface CurriculumResponse {
  council: { id: string; name: string };
  selection: { curriculumVersion: { versionLabel: string; curriculum: { name: string } }; gradeAreas: GradeArea[] } | null;
}

function messageOf(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: string | string[] }).message;
    if (Array.isArray(message)) return message.join(" ");
    if (message) return message;
  }
  return fallback;
}
function dateTime(value: string | null) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function assessmentStatusClass(status: Assessment["status"]) {
  switch (status) {
    case "DRAFT": return "border border-[var(--line)] bg-[var(--surface-subtle)] text-[var(--muted)]";
    case "SCHEDULED": return "border border-blue-200 bg-blue-50 text-blue-800";
    case "OPEN": return "border border-teal-200 bg-teal-50 text-teal-800";
    case "CLOSED": return "border border-amber-200 bg-amber-50 text-amber-800";
    case "RELEASED": return "border border-emerald-200 bg-emerald-50 text-emerald-800";
    case "CANCELLED": return "border border-red-200 bg-red-50 text-red-800";
  }
}

export default function CouncilAssessmentsPage() {
  const { councilId } = useParams<{ councilId: string }>();
  const router = useRouter();
  const [curriculum, setCurriculum] = useState<CurriculumResponse | null>(null);
  const [rubrics, setRubrics] = useState<RubricVersion[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [permissions, setPermissions] = useState({ canManage: false, canModerate: false });
  const [grade, setGrade] = useState<Grade>("GRADE_1");
  const [selectedAreas, setSelectedAreas] = useState<Record<string, { selected: boolean; maxMarks: string; decimalPlaces: number }>>({});
  const [form, setForm] = useState({ name: "", code: "", academicYear: String(new Date().getFullYear()), type: "SUMMATIVE" as AssessmentType, rubricVersionId: "" });
  const [schedule, setSchedule] = useState<Record<string, { opensAt: string; closesAt: string }>>({});
  const [moderationReasons, setModerationReasons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const [curriculumResponse, rubricResponse, assessmentResponse] = await Promise.all([
      apiRequest(`/councils/${councilId}/curriculum`),
      apiRequest(`/councils/${councilId}/rubrics`),
      apiRequest(`/councils/${councilId}/assessments`),
    ]);
    if ([curriculumResponse, rubricResponse, assessmentResponse].some((response) => response.status === 401)) {
      router.replace("/login");
      return;
    }
    if ([curriculumResponse, rubricResponse, assessmentResponse].some((response) => response.status === 403)) {
      router.replace("/workspace");
      return;
    }
    if (!curriculumResponse.ok || !rubricResponse.ok || !assessmentResponse.ok) {
      throw new Error("Assessment workspace could not be loaded. Check the Council configuration and try again.");
    }
    const [curriculumData, rubricData, assessmentData] = await Promise.all([
      curriculumResponse.json() as Promise<CurriculumResponse>,
      rubricResponse.json() as Promise<{ code: string; name: string; versions: Omit<RubricVersion, "rubric">[] }[]>,
      assessmentResponse.json() as Promise<{ canManage: boolean; canModerate: boolean; assessments: Assessment[] }>,
    ]);
    setCurriculum(curriculumData);
    const versions = rubricData.flatMap((rubric) => (rubric.versions ?? []).map((version) => ({ ...version, rubric: { code: rubric.code, name: rubric.name } }))).filter((version) => version.status === "PUBLISHED");
    setRubrics(versions);
    setAssessments(assessmentData.assessments);
    setPermissions({ canManage: assessmentData.canManage, canModerate: assessmentData.canModerate });
    setForm((previous) => ({ ...previous, rubricVersionId: previous.rubricVersionId || versions[0]?.id || "" }));
  }, [councilId, router]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      void load().catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to load assessment workspace.");
      }).finally(() => { if (active) setLoading(false); });
    });
    return () => { active = false; };
  }, [load]);

  const availableAreas = useMemo(() => (curriculum?.selection?.gradeAreas ?? [])
    .filter((area) => area.gradeLearningArea.grade === grade && area.enabled && area.assessmentEligible &&
      area.gradeLearningArea.reviewStatus === "REVIEWED" && area.gradeLearningArea.optionality !== "UNKNOWN")
    .sort((a, b) => a.sortOrder - b.sortOrder), [curriculum, grade]);

  function toggleArea(area: GradeArea, selected: boolean) {
    setSelectedAreas((previous) => ({
      ...previous,
      [area.id]: { selected, maxMarks: previous[area.id]?.maxMarks ?? "100", decimalPlaces: previous[area.id]?.decimalPlaces ?? 0 },
    }));
  }

  async function createAssessment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const learningAreas = availableAreas.flatMap((area) => {
      const selected = selectedAreas[area.id];
      if (!selected?.selected) return [];
      return [{
        councilGradeLearningAreaId: area.id,
        maxMarks: Number(selected.maxMarks),
        decimalPlaces: selected.decimalPlaces,
      }];
    });
    if (!learningAreas.length) {
      setError("Select at least one assessment-eligible learning area for this grade.");
      return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await apiRequest(`/councils/${councilId}/assessments`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, academicYear: Number(form.academicYear), grade, learningAreas }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(messageOf(payload, "Assessment draft could not be created."));
      setForm((previous) => ({ ...previous, name: "", code: "" }));
      setSelectedAreas({});
      await load();
      setNotice("Assessment draft created with a frozen curriculum and rubric snapshot.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Assessment creation failed.");
    } finally { setBusy(false); }
  }

  async function transition(assessment: Assessment, action: "schedule" | "open" | "close") {
    const timing = schedule[assessment.id];
    if (action === "schedule" && (!timing?.opensAt || !timing.closesAt)) {
      setError("Choose both an opening and closing time before scheduling.");
      return;
    }
    const scheduleBody = action === "schedule" && timing
      ? { opensAt: new Date(timing.opensAt).toISOString(), closesAt: new Date(timing.closesAt).toISOString() }
      : null;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await apiRequest(`/councils/${councilId}/assessments/${assessment.id}/${action}`, {
        method: "POST",
        ...(scheduleBody ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(scheduleBody) } : {}),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(messageOf(payload, `Assessment could not be ${action}d.`));
      await load();
      setNotice(`Assessment ${action === "close" ? "closed" : action === "open" ? "opened" : "scheduled"} successfully.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Assessment status could not be updated.");
    } finally { setBusy(false); }
  }

  async function returnClassMarks(assessment: Assessment, classId: string) {
    const key = `${assessment.id}:${classId}`;
    const reason = moderationReasons[key]?.trim() ?? "";
    if (reason.length < 10) {
      setError("Provide a moderation reason of at least 10 characters.");
      return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await apiRequest(`/councils/${councilId}/assessments/${assessment.id}/classes/${classId}/return-marks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(messageOf(payload, "Class marks could not be returned."));
      setModerationReasons((previous) => ({ ...previous, [key]: "" }));
      await load();
      setNotice("Class marks returned for correction. The assessment is open for the assigned teacher to make the requested changes.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Class marks could not be returned.");
    } finally { setBusy(false); }
  }

  return (
    <CouncilWorkspaceShell councilId={councilId} active="assessments">
      <div className="w-full py-0">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--brand)]">Assessment operations</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--ink-strong)] sm:text-3xl">Assessments</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">Create grade-specific assessments from approved learning areas and published rubrics. Each assessment keeps its own curriculum and grading snapshot.</p>
          {curriculum?.council ? <p className="mt-2 text-xs font-medium text-[var(--muted)]">{curriculum.council.name}{curriculum.selection ? ` · ${curriculum.selection.curriculumVersion.curriculum.name} ${curriculum.selection.curriculumVersion.versionLabel}` : " · No curriculum selected"}</p> : null}
        </div>
        {error ? <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {notice ? <div role="status" className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div> : null}
        {loading ? <div className="mt-8 rounded-2xl border border-[var(--line)] bg-white p-8 text-sm text-[var(--muted)]">Loading assessment workspace…</div> : null}
        {!loading ? <>
          {permissions.canManage ? <section className="mt-7 rounded-2xl border border-[var(--line)] bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="text-base font-semibold text-[var(--ink-strong)]">Create assessment</h2><p className="mt-1 text-xs leading-5 text-[var(--muted)]">Only enabled, reviewed and assessment-eligible learning areas can be selected.</p></div>
              <span className="rounded-full bg-[var(--surface-subtle)] px-3 py-1 text-[11px] font-medium text-[var(--muted)]">{rubrics.length} published rubric versions</span>
            </div>
            {!curriculum?.selection ? <p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">Select a published curriculum before creating an assessment. <Link className="font-semibold underline" href={`/council/${councilId}/curriculum`}>Configure curriculum</Link></p> :
              rubrics.length === 0 ? <p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">No published rubric versions are available. A Council Administrator must configure a rubric and obtain independent governance approval before creating assessments.</p> :
              <form onSubmit={(event) => void createAssessment(event)} className="mt-5 space-y-5">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <label className="text-xs font-medium text-[var(--muted)]">Assessment name<input required minLength={2} maxLength={160} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Term 2 Assessment" className="mt-2 w-full rounded-xl border border-[var(--line-strong)] px-3 py-3 text-sm text-[var(--ink-strong)] outline-none focus:border-[var(--brand)]" /></label>
                  <label className="text-xs font-medium text-[var(--muted)]">Assessment code<input required minLength={2} maxLength={40} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} placeholder="e.g. T2-2026" className="mt-2 w-full rounded-xl border border-[var(--line-strong)] px-3 py-3 text-sm text-[var(--ink-strong)] outline-none focus:border-[var(--brand)]" /></label>
                  <label className="text-xs font-medium text-[var(--muted)]">Academic year<input required type="number" min={2000} max={2200} value={form.academicYear} onChange={(event) => setForm({ ...form, academicYear: event.target.value })} className="mt-2 w-full rounded-xl border border-[var(--line-strong)] px-3 py-3 text-sm text-[var(--ink-strong)] outline-none focus:border-[var(--brand)]" /></label>
                  <label className="text-xs font-medium text-[var(--muted)]">Grade<select value={grade} onChange={(event) => { setGrade(event.target.value as Grade); setSelectedAreas({}); }} className="mt-2 w-full rounded-xl border border-[var(--line-strong)] bg-white px-3 py-3 text-sm text-[var(--ink-strong)]">{GRADES.map((value) => <option key={value} value={value}>{value.replace("_", " ")}</option>)}</select></label>
                  <label className="text-xs font-medium text-[var(--muted)]">Assessment type<select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as AssessmentType })} className="mt-2 w-full rounded-xl border border-[var(--line-strong)] bg-white px-3 py-3 text-sm text-[var(--ink-strong)]">{(["FORMATIVE", "SUMMATIVE", "PRACTICE", "OTHER"] as const).map((value) => <option key={value} value={value}>{value.toLowerCase().replace(/^./, (char) => char.toUpperCase())}</option>)}</select></label>
                  <label className="text-xs font-medium text-[var(--muted)]">Published grading rubric<select required value={form.rubricVersionId} onChange={(event) => setForm({ ...form, rubricVersionId: event.target.value })} className="mt-2 w-full rounded-xl border border-[var(--line-strong)] bg-white px-3 py-3 text-sm text-[var(--ink-strong)]">{rubrics.map((rubric) => <option key={rubric.id} value={rubric.id}>{rubric.rubric.name} · {rubric.versionLabel} · {rubric.scaleType.replaceAll("_", " ").toLowerCase()}</option>)}</select></label>
                </div>
                <div><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-[var(--ink-strong)]">Learning areas · {grade.replace("_", " ")}</h3><span className="text-[11px] text-[var(--muted)]">{availableAreas.length} eligible</span></div>
                  {availableAreas.length === 0 ? <p className="mt-3 rounded-xl bg-[var(--brand-soft)] p-4 text-sm text-[var(--muted)]">No eligible learning areas are configured for this grade. Review the Council curriculum settings first.</p> :
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {availableAreas.map((area) => {
                        const draft = selectedAreas[area.id] ?? { selected: false, maxMarks: "100", decimalPlaces: 0 };
                        return <div key={area.id} className="rounded-xl border border-[var(--line)] p-4">
                          <label className="flex items-start gap-3"><input type="checkbox" checked={draft.selected} onChange={(event) => toggleArea(area, event.target.checked)} className="mt-0.5 size-4 accent-[var(--brand)]" /><span><span className="block text-sm font-semibold text-[var(--ink-strong)]">{area.displayLabel || area.gradeLearningArea.sourceLabel}</span><span className="mt-1 block text-[11px] text-[var(--subtle)]">{area.gradeLearningArea.learningArea.canonicalName} · {area.gradeLearningArea.optionality}</span></span></label>
                          {draft.selected ? <div className="mt-3 grid grid-cols-2 gap-3"><label className="text-[11px] font-medium text-[var(--muted)]">Maximum marks<input type="number" min="0.01" max="999999.99" step="0.01" value={draft.maxMarks} onChange={(event) => setSelectedAreas((previous) => ({ ...previous, [area.id]: { ...draft, maxMarks: event.target.value } }))} className="mt-1 w-full rounded-lg border border-[var(--line-strong)] px-2.5 py-2 text-sm text-[var(--ink-strong)]" /></label><label className="text-[11px] font-medium text-[var(--muted)]">Decimal places<select value={draft.decimalPlaces} onChange={(event) => setSelectedAreas((previous) => ({ ...previous, [area.id]: { ...draft, decimalPlaces: Number(event.target.value) } }))} className="mt-1 w-full rounded-lg border border-[var(--line-strong)] bg-white px-2.5 py-2 text-sm text-[var(--ink-strong)]"><option value={0}>0</option><option value={1}>1</option><option value={2}>2</option></select></label></div> : null}
                        </div>;
                      })}
                    </div>}
                </div>
                <div className="flex justify-end border-t border-[var(--line)] pt-4"><button type="submit" disabled={busy || !form.rubricVersionId || availableAreas.length === 0} className="rounded-xl bg-[var(--brand)] px-5 py-3 text-xs font-semibold text-white hover:bg-[var(--brand-strong)] disabled:opacity-50">{busy ? "Saving…" : "Create assessment draft"}</button></div>
              </form>}
          </section> : null}
          <section className="mt-8">
            <div className="mb-4 flex items-end justify-between gap-3"><div><h2 className="text-lg font-semibold text-[var(--ink-strong)]">Assessment register</h2><p className="mt-1 text-xs text-[var(--muted)]">Lifecycle actions are validated by the API and database.</p></div><span className="text-xs text-[var(--muted)]">{assessments.length} assessments</span></div>
            {assessments.length === 0 ? <div className="rounded-2xl border border-dashed border-[#ccd8e8] bg-white p-8 text-center text-sm text-[var(--muted)]">No assessments have been created for this Council yet.</div> :
              <div className="space-y-4">{assessments.map((assessment) => <article key={assessment.id} className="rounded-2xl border border-[var(--line)] bg-white p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-base font-semibold text-[var(--ink-strong)]">{assessment.name}</h3><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${assessmentStatusClass(assessment.status)}`}>{assessment.status}</span></div><p className="mt-1 text-xs text-[var(--muted)]">{assessment.code} · {assessment.academicYear} · {assessment.grade.replace("_", " ")} · {assessment.type.toLowerCase()}</p></div><span className="text-xs font-medium text-[var(--muted)]">{assessment.rubricVersion.rubric.name} · {assessment.rubricVersion.versionLabel}</span></div>
                <div className="mt-4 flex flex-wrap gap-2">{assessment.learningAreas.map((area) => <span key={area.id} className="rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-[11px] text-[var(--muted)]">{area.displayLabel || area.sourceLabel} · {area.maxMarks}</span>)}</div>
                {assessment.status === "CLOSED" || assessment.status === "RELEASED" ? <div className="mt-4 flex justify-end border-t border-[var(--line)] pt-4"><Link href={`/council/${councilId}/assessments/${assessment.id}/results`} className="rounded-xl border border-[#cbd8eb] px-4 py-2.5 text-xs font-semibold text-[var(--brand)] hover:bg-[var(--brand-soft)]">{assessment.status === "RELEASED" ? "View published results" : "Review results"}</Link></div> : null}
                {assessment.status === "DRAFT" ? <div className="mt-5 grid gap-3 border-t border-[var(--line)] pt-4 sm:grid-cols-[1fr_1fr_auto]"><label className="text-[11px] font-medium text-[var(--muted)]">Opens at<input type="datetime-local" value={schedule[assessment.id]?.opensAt ?? ""} onChange={(event) => setSchedule((previous) => ({ ...previous, [assessment.id]: { opensAt: event.target.value, closesAt: previous[assessment.id]?.closesAt ?? "" } }))} className="mt-1 w-full rounded-lg border border-[var(--line-strong)] px-2.5 py-2 text-sm text-[var(--ink-strong)]" /></label><label className="text-[11px] font-medium text-[var(--muted)]">Closes at<input type="datetime-local" value={schedule[assessment.id]?.closesAt ?? ""} onChange={(event) => setSchedule((previous) => ({ ...previous, [assessment.id]: { opensAt: previous[assessment.id]?.opensAt ?? "", closesAt: event.target.value } }))} className="mt-1 w-full rounded-lg border border-[var(--line-strong)] px-2.5 py-2 text-sm text-[var(--ink-strong)]" /></label><button disabled={busy || !schedule[assessment.id]?.opensAt || !schedule[assessment.id]?.closesAt} onClick={() => void transition(assessment, "schedule")} className="self-end rounded-xl border border-[var(--line-strong)] px-4 py-2.5 text-xs font-semibold text-[var(--brand)] disabled:opacity-40">Schedule</button></div> : null}
                {assessment.status === "SCHEDULED" ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4"><p className="text-xs text-[var(--muted)]">Opens {dateTime(assessment.opensAt)} · Closes {dateTime(assessment.closesAt)}</p><button disabled={busy} onClick={() => void transition(assessment, "open")} className="rounded-xl bg-[var(--brand)] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-40">Open assessment</button></div> : null}
                {assessment.status === "OPEN" ? <div className="mt-4 flex justify-end border-t border-[var(--line)] pt-4"><button disabled={busy} onClick={() => void transition(assessment, "close")} className="rounded-xl border border-[var(--line-strong)] px-4 py-2.5 text-xs font-semibold text-[var(--muted)] disabled:opacity-40">Close assessment</button></div> : null}
                {assessment.status === "CLOSED" && permissions.canModerate ? <div className="mt-4 border-t border-[var(--line)] pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold text-[var(--ink-strong)]">Mark moderation</p><p className="text-[11px] text-[var(--muted)]">Return an entire class sheet with a reason; submitted marks remain locked otherwise.</p></div>
                  {assessment.candidates.filter((candidate, index, all) => all.findIndex((item) => item.schoolClassId === candidate.schoolClassId) === index).length === 0
                    ? <p className="mt-3 text-xs text-[var(--muted)]">No active class candidates remain in this assessment.</p>
                    : <div className="mt-3 space-y-3">{assessment.candidates.filter((candidate, index, all) => all.findIndex((item) => item.schoolClassId === candidate.schoolClassId) === index).map((candidate) => {
                      const key = `${assessment.id}:${candidate.schoolClassId}`;
                      const candidateCount = assessment.candidates.filter((item) => item.schoolClassId === candidate.schoolClassId).length;
                      const className = candidate.schoolClass.displayName || `${assessment.grade.replace("_", " ")} · ${candidate.schoolClass.streamCode}`;
                      return <div key={candidate.schoolClassId} className="rounded-xl border border-[var(--line)] bg-[var(--surface-subtle)] p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-semibold text-[var(--ink-strong)]">{candidate.schoolClass.registration.school.name} · {className}</p><p className="mt-1 text-[11px] text-[var(--muted)]">{candidateCount} active candidates</p></div></div>
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row"><input value={moderationReasons[key] ?? ""} onChange={(event) => setModerationReasons((previous) => ({ ...previous, [key]: event.target.value }))} minLength={10} maxLength={2000} placeholder="Explain what needs to be checked or corrected (minimum 10 characters)" className="min-w-0 flex-1 rounded-lg border border-[var(--line-strong)] bg-white px-3 py-2 text-xs text-[var(--ink-strong)]" /><button disabled={busy || (moderationReasons[key]?.trim().length ?? 0) < 10} onClick={() => void returnClassMarks(assessment, candidate.schoolClassId)} className="rounded-lg border border-[#d7a58d] px-3 py-2 text-xs font-semibold text-[#8b4b2b] disabled:opacity-40">Return class marks</button></div>
                      </div>;
                    })}</div>}
                  <p className="mt-3 text-[11px] text-[var(--muted)]">Returning a class reopens correction entry for this assessment. Other submitted class sheets stay locked.</p>
                </div> : null}
              </article>)}</div>}
          </section>
        </> : null}
      </div>
    </CouncilWorkspaceShell>
  );
}
