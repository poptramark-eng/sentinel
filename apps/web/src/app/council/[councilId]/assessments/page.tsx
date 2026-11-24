"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiRequest } from "../../../../lib/api";

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

export default function CouncilAssessmentsPage() {
  const { councilId } = useParams<{ councilId: string }>();
  const router = useRouter();
  const [curriculum, setCurriculum] = useState<CurriculumResponse | null>(null);
  const [rubrics, setRubrics] = useState<RubricVersion[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [grade, setGrade] = useState<Grade>("GRADE_1");
  const [selectedAreas, setSelectedAreas] = useState<Record<string, { selected: boolean; maxMarks: string; decimalPlaces: number }>>({});
  const [form, setForm] = useState({ name: "", code: "", academicYear: String(new Date().getFullYear()), type: "SUMMATIVE" as AssessmentType, rubricVersionId: "" });
  const [schedule, setSchedule] = useState<Record<string, { opensAt: string; closesAt: string }>>({});
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
      assessmentResponse.json() as Promise<Assessment[]>,
    ]);
    setCurriculum(curriculumData);
    const versions = rubricData.flatMap((rubric) => (rubric.versions ?? []).map((version) => ({ ...version, rubric: { code: rubric.code, name: rubric.name } }))).filter((version) => version.status === "PUBLISHED");
    setRubrics(versions);
    setAssessments(assessmentData);
    setForm((previous) => ({ ...previous, rubricVersionId: previous.rubricVersionId || versions[0]?.id || "" }));
  }, [councilId, router]);

  useEffect(() => {
    let active = true;
    void load().catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : "Unable to load assessment workspace.");
    }).finally(() => { if (active) setLoading(false); });
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
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await apiRequest(`/councils/${councilId}/assessments/${assessment.id}/${action}`, {
        method: "POST",
        ...(action === "schedule" && timing ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ opensAt: new Date(timing.opensAt).toISOString(), closesAt: new Date(timing.closesAt).toISOString() }) } : {}),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(messageOf(payload, `Assessment could not be ${action}d.`));
      await load();
      setNotice(`Assessment ${action === "close" ? "closed" : action === "open" ? "opened" : "scheduled"} successfully.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Assessment status could not be updated.");
    } finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen bg-[#f6f8fb]">
      <header className="border-b border-[#e5eaf1] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/workspace" className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#2457c5] text-xs font-bold text-white">CBE</span><span className="text-sm font-semibold text-[#172b4d]">Council workspace</span></Link>
          <Link href={`/council/${councilId}/curriculum`} className="text-xs font-semibold text-[#52647d] hover:text-[#2457c5]">Curriculum settings</Link>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#2457c5]">Assessment operations</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[#172b4d] sm:text-3xl">Assessments</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#64748b]">Create grade-specific assessments from approved learning areas and published rubrics. Each assessment keeps its own curriculum and grading snapshot.</p>
          {curriculum?.council ? <p className="mt-2 text-xs font-medium text-[#52647d]">{curriculum.council.name}{curriculum.selection ? ` · ${curriculum.selection.curriculumVersion.curriculum.name} ${curriculum.selection.curriculumVersion.versionLabel}` : " · No curriculum selected"}</p> : null}
        </div>
        {error ? <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {notice ? <div role="status" className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div> : null}
        {loading ? <div className="mt-8 rounded-2xl border border-[#e5eaf1] bg-white p-8 text-sm text-[#64748b]">Loading assessment workspace…</div> : null}
        {!loading ? <>
          <section className="mt-7 rounded-2xl border border-[#e5eaf1] bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="text-base font-semibold text-[#172b4d]">Create assessment</h2><p className="mt-1 text-xs leading-5 text-[#64748b]">Only enabled, reviewed and assessment-eligible learning areas can be selected.</p></div>
              <span className="rounded-full bg-[#f1f5fb] px-3 py-1 text-[11px] font-medium text-[#52647d]">{rubrics.length} published rubric versions</span>
            </div>
            {!curriculum?.selection ? <p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">Select a published curriculum before creating an assessment. <Link className="font-semibold underline" href={`/council/${councilId}/curriculum`}>Configure curriculum</Link></p> :
              rubrics.length === 0 ? <p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">No published rubric versions are available. A Council Administrator must configure a rubric and obtain independent governance approval before creating assessments.</p> :
              <form onSubmit={(event) => void createAssessment(event)} className="mt-5 space-y-5">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <label className="text-xs font-medium text-[#52647d]">Assessment name<input required minLength={2} maxLength={160} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Term 2 Assessment" className="mt-2 w-full rounded-xl border border-[#dbe3ee] px-3 py-3 text-sm text-[#172b4d] outline-none focus:border-[#6d94e8]" /></label>
                  <label className="text-xs font-medium text-[#52647d]">Assessment code<input required minLength={2} maxLength={40} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} placeholder="e.g. T2-2026" className="mt-2 w-full rounded-xl border border-[#dbe3ee] px-3 py-3 text-sm text-[#172b4d] outline-none focus:border-[#6d94e8]" /></label>
                  <label className="text-xs font-medium text-[#52647d]">Academic year<input required type="number" min={2000} max={2200} value={form.academicYear} onChange={(event) => setForm({ ...form, academicYear: event.target.value })} className="mt-2 w-full rounded-xl border border-[#dbe3ee] px-3 py-3 text-sm text-[#172b4d] outline-none focus:border-[#6d94e8]" /></label>
                  <label className="text-xs font-medium text-[#52647d]">Grade<select value={grade} onChange={(event) => { setGrade(event.target.value as Grade); setSelectedAreas({}); }} className="mt-2 w-full rounded-xl border border-[#dbe3ee] bg-white px-3 py-3 text-sm text-[#172b4d]">{GRADES.map((value) => <option key={value} value={value}>{value.replace("_", " ")}</option>)}</select></label>
                  <label className="text-xs font-medium text-[#52647d]">Assessment type<select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as AssessmentType })} className="mt-2 w-full rounded-xl border border-[#dbe3ee] bg-white px-3 py-3 text-sm text-[#172b4d]">{(["FORMATIVE", "SUMMATIVE", "PRACTICE", "OTHER"] as const).map((value) => <option key={value} value={value}>{value.toLowerCase().replace(/^./, (char) => char.toUpperCase())}</option>)}</select></label>
                  <label className="text-xs font-medium text-[#52647d]">Published grading rubric<select required value={form.rubricVersionId} onChange={(event) => setForm({ ...form, rubricVersionId: event.target.value })} className="mt-2 w-full rounded-xl border border-[#dbe3ee] bg-white px-3 py-3 text-sm text-[#172b4d]">{rubrics.map((rubric) => <option key={rubric.id} value={rubric.id}>{rubric.rubric.name} · {rubric.versionLabel} · {rubric.scaleType.replaceAll("_", " ").toLowerCase()}</option>)}</select></label>
                </div>
                <div><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-[#172b4d]">Learning areas · {grade.replace("_", " ")}</h3><span className="text-[11px] text-[#64748b]">{availableAreas.length} eligible</span></div>
                  {availableAreas.length === 0 ? <p className="mt-3 rounded-xl bg-[#f8faff] p-4 text-sm text-[#64748b]">No eligible learning areas are configured for this grade. Review the Council curriculum settings first.</p> :
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {availableAreas.map((area) => {
                        const draft = selectedAreas[area.id] ?? { selected: false, maxMarks: "100", decimalPlaces: 0 };
                        return <div key={area.id} className="rounded-xl border border-[#e5eaf1] p-4">
                          <label className="flex items-start gap-3"><input type="checkbox" checked={draft.selected} onChange={(event) => toggleArea(area, event.target.checked)} className="mt-0.5 size-4 accent-[#2457c5]" /><span><span className="block text-sm font-semibold text-[#172b4d]">{area.displayLabel || area.gradeLearningArea.sourceLabel}</span><span className="mt-1 block text-[11px] text-[#94a3b8]">{area.gradeLearningArea.learningArea.canonicalName} · {area.gradeLearningArea.optionality}</span></span></label>
                          {draft.selected ? <div className="mt-3 grid grid-cols-2 gap-3"><label className="text-[11px] font-medium text-[#64748b]">Maximum marks<input type="number" min="0.01" max="999999.99" step="0.01" value={draft.maxMarks} onChange={(event) => setSelectedAreas((previous) => ({ ...previous, [area.id]: { ...draft, maxMarks: event.target.value } }))} className="mt-1 w-full rounded-lg border border-[#dbe3ee] px-2.5 py-2 text-sm text-[#172b4d]" /></label><label className="text-[11px] font-medium text-[#64748b]">Decimal places<select value={draft.decimalPlaces} onChange={(event) => setSelectedAreas((previous) => ({ ...previous, [area.id]: { ...draft, decimalPlaces: Number(event.target.value) } }))} className="mt-1 w-full rounded-lg border border-[#dbe3ee] bg-white px-2.5 py-2 text-sm text-[#172b4d]"><option value={0}>0</option><option value={1}>1</option><option value={2}>2</option></select></label></div> : null}
                        </div>;
                      })}
                    </div>}
                </div>
                <div className="flex justify-end border-t border-[#edf0f5] pt-4"><button type="submit" disabled={busy || !form.rubricVersionId || availableAreas.length === 0} className="rounded-xl bg-[#2457c5] px-5 py-3 text-xs font-semibold text-white hover:bg-[#1e49a6] disabled:opacity-50">{busy ? "Saving…" : "Create assessment draft"}</button></div>
              </form>}
          </section>
          <section className="mt-8">
            <div className="mb-4 flex items-end justify-between gap-3"><div><h2 className="text-lg font-semibold text-[#172b4d]">Assessment register</h2><p className="mt-1 text-xs text-[#64748b]">Lifecycle actions are validated by the API and database.</p></div><span className="text-xs text-[#64748b]">{assessments.length} assessments</span></div>
            {assessments.length === 0 ? <div className="rounded-2xl border border-dashed border-[#ccd8e8] bg-white p-8 text-center text-sm text-[#64748b]">No assessments have been created for this Council yet.</div> :
              <div className="space-y-4">{assessments.map((assessment) => <article key={assessment.id} className="rounded-2xl border border-[#e5eaf1] bg-white p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-base font-semibold text-[#172b4d]">{assessment.name}</h3><span className="rounded-full bg-[#f1f5fb] px-2.5 py-1 text-[10px] font-semibold text-[#52647d]">{assessment.status}</span></div><p className="mt-1 text-xs text-[#64748b]">{assessment.code} · {assessment.academicYear} · {assessment.grade.replace("_", " ")} · {assessment.type.toLowerCase()}</p></div><span className="text-xs font-medium text-[#52647d]">{assessment.rubricVersion.rubric.name} · {assessment.rubricVersion.versionLabel}</span></div>
                <div className="mt-4 flex flex-wrap gap-2">{assessment.learningAreas.map((area) => <span key={area.id} className="rounded-lg border border-[#e5eaf1] px-2.5 py-1.5 text-[11px] text-[#52647d]">{area.displayLabel || area.sourceLabel} · {area.maxMarks}</span>)}</div>
                {assessment.status === "DRAFT" ? <div className="mt-5 grid gap-3 border-t border-[#edf0f5] pt-4 sm:grid-cols-[1fr_1fr_auto]"><label className="text-[11px] font-medium text-[#64748b]">Opens at<input type="datetime-local" value={schedule[assessment.id]?.opensAt ?? ""} onChange={(event) => setSchedule((previous) => ({ ...previous, [assessment.id]: { opensAt: event.target.value, closesAt: previous[assessment.id]?.closesAt ?? "" } }))} className="mt-1 w-full rounded-lg border border-[#dbe3ee] px-2.5 py-2 text-sm text-[#172b4d]" /></label><label className="text-[11px] font-medium text-[#64748b]">Closes at<input type="datetime-local" value={schedule[assessment.id]?.closesAt ?? ""} onChange={(event) => setSchedule((previous) => ({ ...previous, [assessment.id]: { opensAt: previous[assessment.id]?.opensAt ?? "", closesAt: event.target.value } }))} className="mt-1 w-full rounded-lg border border-[#dbe3ee] px-2.5 py-2 text-sm text-[#172b4d]" /></label><button disabled={busy || !schedule[assessment.id]?.opensAt || !schedule[assessment.id]?.closesAt} onClick={() => void transition(assessment, "schedule")} className="self-end rounded-xl border border-[#dbe3ee] px-4 py-2.5 text-xs font-semibold text-[#2457c5] disabled:opacity-40">Schedule</button></div> : null}
                {assessment.status === "SCHEDULED" ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#edf0f5] pt-4"><p className="text-xs text-[#64748b]">Opens {dateTime(assessment.opensAt)} · Closes {dateTime(assessment.closesAt)}</p><button disabled={busy} onClick={() => void transition(assessment, "open")} className="rounded-xl bg-[#2457c5] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-40">Open assessment</button></div> : null}
                {assessment.status === "OPEN" ? <div className="mt-4 flex justify-end border-t border-[#edf0f5] pt-4"><button disabled={busy} onClick={() => void transition(assessment, "close")} className="rounded-xl border border-[#dbe3ee] px-4 py-2.5 text-xs font-semibold text-[#52647d] disabled:opacity-40">Close assessment</button></div> : null}
                {assessment.status === "CLOSED" ? <p className="mt-4 border-t border-[#edf0f5] pt-4 text-xs text-[#64748b]">Closed. Results publication is a separate governed action.</p> : null}
              </article>)}</div>}
          </section>
        </> : null}
      </div>
    </main>
  );
}
