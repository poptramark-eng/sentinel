"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiRequest, clearStoredCsrfToken } from "../../../../../../../lib/api";
import { WorkspaceShell } from "../../../../../../../components/workspace-shell";

type SubmissionData = {
  school: { name: string }; council: { name: string };
  assessment: { id: string; name: string; code: string; grade: string; academicYear: number; status: string; closesAt: string | null };
  progress: {
    candidateCount: number; learningAreaCount: number; expectedMarkCount: number; submittedMarkCount: number;
    returnedMarkCount: number; missingMarkCount: number; pendingMarkCount: number; isComplete: boolean;
    learningAreas: { id: string; code: string; name: string; maxMarks: number; candidateCount: number; submittedCount: number; returnedCount: number; pendingCount: number; complete: boolean }[];
    returnedReasons: { className: string; learningAreaName: string; reason: string }[];
    classes: { id: string; grade: string; academicYear: number; streamCode: string; displayName: string | null; candidateCount: number; submittedCount: number; expectedMarkCount: number }[];
  };
  submission: null | { id: string; status: string; version: number; candidateCount: number; markCount: number; submittedAt: string; returnedAt: string | null; returnedReason: string | null; versions: { version: number; candidateCount: number; markCount: number; createdAt: string; submittedBy: string }[] };
  canSubmit: boolean;
};

async function responseMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as { message?: string | string[] } | null;
  return Array.isArray(body?.message) ? body.message.join(" ") : body?.message ?? fallback;
}
function dateLabel(value: string | null) { return value ? new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Not scheduled"; }

export default function SchoolAssessmentSubmissionPage() {
  const { registrationId, assessmentId } = useParams<{ registrationId: string; assessmentId: string }>();
  const router = useRouter();
  const [data, setData] = useState<SubmissionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const response = await apiRequest(`/school/registrations/${registrationId}/assessments/${assessmentId}/submission`);
    if (response.status === 401) { router.replace("/login"); return; }
    if (response.status === 403) { router.replace("/workspace"); return; }
    if (!response.ok) throw new Error(await responseMessage(response, "Submission details could not be loaded."));
    setData(await response.json() as SubmissionData);
  }, [assessmentId, registrationId, router]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => { void load().catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load submission details."); }).finally(() => { if (active) setLoading(false); }); });
    return () => { active = false; };
  }, [load]);

  async function submitSchool() {
    if (!data?.canSubmit || submitting) return;
    const confirmed = window.confirm(`Submit ${data.assessment.name} for ${data.school.name}? This freezes the current submitted mark version for ordinary teacher editing.`);
    if (!confirmed) return;
    setSubmitting(true); setError(""); setNotice("");
    try {
      const response = await apiRequest(`/school/registrations/${registrationId}/assessments/${assessmentId}/submission`, { method: "POST" });
      if (!response.ok) throw new Error(await responseMessage(response, "The school submission could not be completed."));
      const result = await response.json() as { version: number; idempotent: boolean };
      setNotice(result.idempotent ? `This assessment was already submitted as version ${result.version}.` : `School submission version ${result.version} has been recorded and locked.`);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The school submission could not be completed."); }
    finally { setSubmitting(false); }
  }

  async function signOut() { await apiRequest("/auth/logout", { method: "POST" }); clearStoredCsrfToken(); router.replace("/login"); }

  const progress = data?.progress;
  const percent = progress?.expectedMarkCount ? Math.round(progress.submittedMarkCount / progress.expectedMarkCount * 100) : 0;

  return <WorkspaceShell section="School workspace" title="Assessment submission" navigation={[{ label: "Workspace overview", href: "/workspace" }, { label: "Teaching desk", href: "/school/teaching" }, { label: "Assessments", href: `/school/registrations/${registrationId}/assessments` }, { label: "School submission", href: `/school/registrations/${registrationId}/assessments/${assessmentId}/submission`, active: true }]} actions={<><Link href={`/school/registrations/${registrationId}/assessments`} className="cbe-button cbe-button-secondary">Back to assessments</Link><button type="button" onClick={() => void signOut()} className="cbe-button cbe-button-secondary">Sign out</button></>}>

    <div className="mx-auto max-w-6xl px-5 py-9 sm:px-8 sm:py-12"><Link href={`/school/registrations/${registrationId}/assessments`} className="text-xs font-semibold text-[var(--muted)] hover:text-[var(--brand)]">← Assessment submissions</Link>
      {error ? <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {notice ? <p role="status" className="mt-6 rounded-xl border border-[var(--success-soft)] bg-[var(--success-soft)] px-4 py-3 text-sm text-[var(--success)]">{notice}</p> : null}
      {loading ? <div className="mt-8 rounded-2xl border border-[var(--line)] bg-white p-8 text-sm text-[var(--muted)]">Loading assessment submission…</div> : data && progress ? <>
        <div className="mt-5 flex flex-col justify-between gap-5 lg:flex-row lg:items-end"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand)]">Final school submission</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--ink-strong)] sm:text-4xl">{data.assessment.name}</h1><p className="mt-2 text-sm text-[var(--muted)]">{data.school.name} · {data.council.name} · {data.assessment.grade.replace("GRADE_", "Grade ")} · {data.assessment.academicYear}</p><p className="mt-1 text-xs text-[var(--subtle)]">{data.assessment.code} · Entry closes {dateLabel(data.assessment.closesAt)}</p></div><div className="rounded-2xl border border-[var(--line)] bg-white px-5 py-4"><p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--subtle)]">School submission</p><p className="mt-1 text-lg font-semibold text-[var(--ink-strong)]">{data.submission?.status === "SUBMITTED" ? `Submitted · v${data.submission.version}` : data.submission?.status === "RETURNED" ? `Returned · v${data.submission.version}` : "Not submitted"}</p>{data.submission?.submittedAt ? <p className="mt-1 text-[11px] text-[var(--subtle)]">{dateLabel(data.submission.submittedAt)}</p> : null}</div></div>
        {progress.returnedReasons.length > 0 ? <div className="mt-6 rounded-xl border border-[var(--warning-border,var(--warning-soft))] bg-[var(--warning-soft)] p-4"><p className="text-xs font-semibold text-[var(--warning)]">Council correction requests</p><div className="mt-3 space-y-3">{progress.returnedReasons.map((item, index) => <div key={`${item.className}-${item.learningAreaName}-${index}`} className="border-t border-[var(--warning-border,var(--warning-soft))] pt-3 first:border-0 first:pt-0"><p className="text-xs font-semibold text-[var(--warning)]">{item.className} · {item.learningAreaName}</p><p className="mt-1 text-sm leading-6 text-[var(--warning)]">{item.reason}</p></div>)}</div></div> : data.submission?.returnedReason ? <div className="mt-6 rounded-xl border border-[var(--warning-border,var(--warning-soft))] bg-[var(--warning-soft)] p-4"><p className="text-xs font-semibold text-[var(--warning)]">Council correction request</p><p className="mt-1 text-sm leading-6 text-[var(--warning)]">{data.submission.returnedReason}</p></div> : null}
        <section className="mt-8 rounded-2xl border border-[var(--line)] bg-white p-5 sm:p-7"><div className="flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-base font-semibold text-[var(--ink-strong)]">Submission readiness</h2><p className="mt-1 text-xs text-[var(--muted)]">All candidate marks must be entered and submitted by their assigned Subject Teachers.</p></div><p className="text-2xl font-semibold tabular-nums text-[var(--brand)]">{percent}%</p></div><div className="mt-4 h-2.5 overflow-hidden rounded-full bg-[var(--line)]"><div className="h-full rounded-full bg-[var(--brand)] transition-all" style={{ width: `${percent}%` }} /></div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-xl bg-[var(--surface-subtle)] p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--subtle)]">Candidates</p><p className="mt-1 text-xl font-semibold tabular-nums text-[var(--ink-strong)]">{progress.candidateCount}</p></div><div className="rounded-xl bg-[var(--surface-subtle)] p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--subtle)]">Learning areas</p><p className="mt-1 text-xl font-semibold tabular-nums text-[var(--ink-strong)]">{progress.learningAreaCount}</p></div><div className="rounded-xl bg-[var(--surface-subtle)] p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--subtle)]">Submitted marks</p><p className="mt-1 text-xl font-semibold tabular-nums text-[var(--ink-strong)]">{progress.submittedMarkCount}/{progress.expectedMarkCount}</p></div><div className="rounded-xl bg-[var(--surface-subtle)] p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--subtle)]">Returned / missing</p><p className="mt-1 text-xl font-semibold tabular-nums text-[var(--ink-strong)]">{progress.returnedMarkCount} / {progress.missingMarkCount}</p></div></div></section>
        <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]"><div className="rounded-2xl border border-[var(--line)] bg-white p-5 sm:p-6"><h2 className="text-base font-semibold text-[var(--ink-strong)]">Learning-area completion</h2><p className="mt-1 text-xs text-[var(--muted)]">A learning area is complete only when every active candidate has a submitted mark.</p><div className="mt-4 divide-y divide-[var(--line)]">{progress.learningAreas.map((area) => <div key={area.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="text-sm font-semibold text-[var(--ink-strong)]">{area.name}</p><p className="mt-1 text-[11px] text-[var(--subtle)]">{area.code} · Maximum {area.maxMarks}</p></div><div className="text-right"><p className="text-xs font-semibold tabular-nums text-[var(--ink-strong)]">{area.submittedCount}/{area.candidateCount}</p><p className={`mt-1 text-[10px] font-semibold ${area.complete ? "text-[var(--success)]" : area.returnedCount ? "text-[var(--warning)]" : "text-[var(--subtle)]"}`}>{area.complete ? "Complete" : area.returnedCount ? `${area.returnedCount} returned` : `${area.pendingCount} pending`}</p></div></div>)}</div></div>
          <aside className="h-fit rounded-2xl border border-[var(--line)] bg-white p-5 sm:p-6"><h2 className="text-base font-semibold text-[var(--ink-strong)]">Class readiness</h2><div className="mt-4 space-y-3">{progress.classes.map((schoolClass) => <div key={schoolClass.id} className="rounded-xl border border-[var(--line)] p-3"><p className="text-xs font-semibold text-[var(--ink-strong)]">{schoolClass.displayName || `${schoolClass.grade.replace("GRADE_", "Grade ")} · ${schoolClass.streamCode}`}</p><p className="mt-1 text-[11px] text-[var(--subtle)]">{schoolClass.candidateCount} candidates</p><p className="mt-2 text-xs font-semibold tabular-nums text-[var(--ink)]">{schoolClass.submittedCount}/{schoolClass.expectedMarkCount} marks</p></div>)}</div>
            <div className="mt-5 border-t border-[var(--line)] pt-5"><p className="text-xs font-semibold text-[var(--ink-strong)]">Final submission declaration</p><p className="mt-2 text-xs leading-5 text-[var(--muted)]">Submitting confirms that the school has reviewed its completion status. The submitted version is recorded as an immutable snapshot. Ordinary teacher mark editing remains locked until a formal Council correction return.</p><button disabled={!data.canSubmit || submitting} onClick={() => void submitSchool()} className="mt-4 w-full rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-semibold text-white hover:bg-[var(--brand-strong)] disabled:cursor-not-allowed disabled:bg-[var(--line-strong)]">{submitting ? "Submitting…" : data.submission?.status === "RETURNED" ? "Resubmit corrected assessment" : data.submission?.status === "SUBMITTED" ? "School submitted" : "Submit assessment for school"}</button>{!data.canSubmit && data.submission?.status !== "SUBMITTED" ? <p className="mt-2 text-[11px] leading-5 text-[var(--subtle)]">{data.assessment.status !== "OPEN" ? "The Council has not opened this assessment for school submission." : progress.candidateCount === 0 ? "No active candidates are registered for this school." : !progress.isComplete ? "Complete and submit every learning area before final school submission." : "School submission is unavailable."}</p> : null}</div>
          </aside></section>
        {data.submission?.versions.length ? <section className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-5 sm:p-6"><h2 className="text-base font-semibold text-[var(--ink-strong)]">Submission history</h2><div className="mt-3 divide-y divide-[var(--line)]">{data.submission.versions.map((version) => <div key={version.version} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-xs font-semibold text-[var(--ink-strong)]">Version {version.version} · {version.submittedBy}</p><p className="mt-1 text-[11px] text-[var(--subtle)]">{dateLabel(version.createdAt)}</p></div><p className="text-[11px] tabular-nums text-[var(--muted)]">{version.candidateCount} candidates · {version.markCount} marks</p></div>)}</div></section> : null}
      </> : null}
    </div>
  </WorkspaceShell>;
}
