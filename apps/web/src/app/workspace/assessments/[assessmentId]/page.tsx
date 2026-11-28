import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { WorkspaceShell } from "../../../../components/workspace-shell";
import { createClient } from "../../../../lib/supabase/server";
import { requireChildDataProcessing } from "../../../../lib/child-data";
import {
  approveAssessment,
  publishAssessment,
  returnAssessmentForCorrection,
  reviewAssessment,
  saveAssessmentScore,
  submitAssessment,
} from "./actions";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ assessmentId: string }>;
  searchParams: Promise<{ error?: string; saved?: string; submitted?: string; reviewed?: string; approved?: string; published?: string; returned?: string }>;
};

export default async function AssessmentDetailPage({ params, searchParams }: Params) {
  const { assessmentId } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getClaims();
  if (authError || !auth?.claims?.sub) redirect("/login");
  await requireChildDataProcessing(supabase);

  const { data: assessment, error } = await supabase.from("assessments")
    .select("id,title,assessment_type,status,assessment_date,max_score,class_id,academic_year_id")
    .eq("id", assessmentId).maybeSingle();
  if (error || !assessment) notFound();

  const { data: memberships } = await supabase.from("school_memberships").select("role").limit(1);
  const isAdmin = memberships?.[0]?.role === "school_admin";
  const { data: classTeacherAssignments } = isAdmin
    ? { data: [] }
    : await supabase.from("teacher_assignments").select("id")
      .eq("class_id", assessment.class_id).eq("assignment_role", "class_teacher").limit(1);
  const canSubmit = isAdmin || Boolean(classTeacherAssignments?.length);
  const { data: latestSubmission } = isAdmin
    ? await supabase.from("assessment_submissions").select("id,version,status,published_at,is_synthetic")
      .eq("assessment_id", assessmentId).order("version", { ascending: false }).limit(1).maybeSingle()
    : { data: null };

  const [{ data: areaLinks }, { data: enrollments }, { data: scores }, { data: classRow }] = await Promise.all([
    supabase.from("assessment_learning_areas").select("learning_area_id").eq("assessment_id", assessmentId),
    supabase.from("learner_enrollments").select("learner_id").eq("class_id", assessment.class_id).eq("status", "active"),
    supabase.from("assessment_scores").select("learner_id,learning_area_id,score").eq("assessment_id", assessmentId),
    supabase.from("classes").select("display_name,grade_level,stream").eq("id", assessment.class_id).maybeSingle(),
  ]);
  const areaIds = (areaLinks ?? []).map((x) => x.learning_area_id);
  const learnerIds = (enrollments ?? []).map((x) => x.learner_id);
  const [{ data: areas }, { data: learners }] = await Promise.all([
    areaIds.length ? supabase.from("learning_areas").select("id,name").in("id", areaIds).order("name") : Promise.resolve({ data: [] }),
    learnerIds.length ? supabase.from("learners").select("id,admission_number,given_name,family_name,other_names").in("id", learnerIds).order("family_name").order("given_name") : Promise.resolve({ data: [] }),
  ]);
  const scoreMap = new Map((scores ?? []).map((score) => [`${score.learner_id}:${score.learning_area_id}`, score.score]));
  const editable = assessment.status === "open";

  return (
    <WorkspaceShell
      section="Assessment management"
      title={assessment.title}
      navigation={[
        { label: "Overview", href: "/workspace" },
        { label: "Assessments", href: "/workspace/assessments", active: true },
        { label: "Learners", href: "/workspace/learners" },
        ...(isAdmin ? [{ label: "Teachers", href: "/workspace/teachers" }, { label: "Reports", href: "/workspace/reports" }, { label: "Setup", href: "/workspace/settings" }] : []),
      ]}
      actions={<form action="/auth/signout" method="post"><button className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--muted)]">Sign out</button></form>}
    >
      <div className="mb-6">
        <Link href="/workspace/assessments" className="text-xs font-semibold text-[var(--brand)]">← All assessments</Link>
        <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="cbe-eyebrow">{assessment.assessment_type} assessment · {assessment.assessment_date ?? "No date set"}</p>
            <h1 className="mt-2 text-2xl font-semibold text-[var(--ink-strong)]">{assessment.title}</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">Grade {classRow?.grade_level} · {classRow?.display_name ?? "Class"} · {learners?.length ?? 0} active learners</p>
          </div>
          <span className="rounded-full bg-[var(--brand-soft)] px-3 py-1.5 text-xs font-semibold capitalize text-[var(--brand-strong)]">{assessment.status}</span>
        </div>
      </div>

      {query.error ? <p role="alert" className="mb-4 rounded-lg bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">{query.error}</p> : null}
      {query.saved ? <p role="status" className="mb-4 rounded-lg bg-[var(--success-soft)] p-3 text-sm text-[var(--success)]">Mark saved.</p> : null}
      {query.submitted ? <p role="status" className="mb-4 rounded-lg bg-[var(--success-soft)] p-3 text-sm text-[var(--success)]">Class submitted. Marks are now locked for review.</p> : null}
      {query.reviewed ? <p role="status" className="mb-4 rounded-lg bg-[var(--success-soft)] p-3 text-sm text-[var(--success)]">Assessment review recorded.</p> : null}
      {query.approved ? <p role="status" className="mb-4 rounded-lg bg-[var(--success-soft)] p-3 text-sm text-[var(--success)]">Assessment approved.</p> : null}
      {query.published ? <p role="status" className="mb-4 rounded-lg bg-[var(--success-soft)] p-3 text-sm text-[var(--success)]">Assessment published. The report is now available.</p> : null}
      {query.returned ? <p role="status" className="mb-4 rounded-lg bg-[var(--warning-soft)] p-3 text-sm text-[var(--warning)]">Assessment returned for correction. Mark entry has reopened.</p> : null}

      <section className="mb-6 rounded-xl border border-[var(--line)] bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="cbe-eyebrow">Assessment lifecycle</p>
            <h2 className="mt-1 font-semibold text-[var(--ink-strong)]">Submission and release</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--muted)]">Class submission checks every active learner against every assessment learning area. After submission, marks and assessment scope are locked. A School Administrator reviews, approves and publishes the immutable version.</p>
            {latestSubmission ? <p className="mt-2 text-xs font-semibold text-[var(--muted)]">Version {latestSubmission.version} · {latestSubmission.status}</p> : null}
          </div>
          {assessment.status === "published" && latestSubmission ? <Link href={`/workspace/reports/${latestSubmission.id}`} className="rounded-lg bg-[var(--brand)] px-4 py-2.5 text-xs font-semibold text-white">Open published report</Link> : null}
        </div>

        <div className="mt-4 flex flex-wrap items-start gap-3">
          {assessment.status === "open" && canSubmit ? (
            <form action={submitAssessment}>
              <input type="hidden" name="assessment_id" value={assessment.id} />
              <button className="rounded-lg bg-[var(--brand)] px-4 py-2.5 text-xs font-semibold text-white">Submit class for review</button>
            </form>
          ) : null}

          {isAdmin && assessment.status === "submitted" ? (
            <form action={reviewAssessment} className="flex min-w-[240px] flex-1 flex-wrap items-end gap-2">
              <input type="hidden" name="assessment_id" value={assessment.id} />
              <label className="min-w-[220px] flex-1"><span className="mb-1 block text-[11px] font-semibold text-[var(--muted)]">Review notes (optional)</span><input name="notes" maxLength={2000} className="w-full rounded-lg border border-[var(--line)] px-3 py-2 text-xs" placeholder="Record review observations" /></label>
              <button className="rounded-lg bg-[var(--brand)] px-4 py-2.5 text-xs font-semibold text-white">Mark reviewed</button>
            </form>
          ) : null}

          {isAdmin && assessment.status === "reviewed" ? (
            <form action={approveAssessment} className="flex min-w-[240px] flex-1 flex-wrap items-end gap-2">
              <input type="hidden" name="assessment_id" value={assessment.id} />
              <label className="min-w-[220px] flex-1"><span className="mb-1 block text-[11px] font-semibold text-[var(--muted)]">Approval notes (optional)</span><input name="notes" maxLength={2000} className="w-full rounded-lg border border-[var(--line)] px-3 py-2 text-xs" placeholder="Record approval notes" /></label>
              <button className="rounded-lg bg-[var(--brand)] px-4 py-2.5 text-xs font-semibold text-white">Approve assessment</button>
            </form>
          ) : null}

          {isAdmin && assessment.status === "approved" ? (
            <form action={publishAssessment}>
              <input type="hidden" name="assessment_id" value={assessment.id} />
              <button className="rounded-lg bg-[var(--brand)] px-4 py-2.5 text-xs font-semibold text-white">Publish results</button>
            </form>
          ) : null}

          {isAdmin && ["submitted", "reviewed", "approved"].includes(assessment.status) ? (
            <form action={returnAssessmentForCorrection} className="flex min-w-[240px] flex-1 flex-wrap items-end gap-2">
              <input type="hidden" name="assessment_id" value={assessment.id} />
              <label className="min-w-[220px] flex-1"><span className="mb-1 block text-[11px] font-semibold text-[var(--muted)]">Reason for returning (required)</span><input name="reason" required minLength={3} maxLength={2000} className="w-full rounded-lg border border-[var(--line)] px-3 py-2 text-xs" placeholder="Explain what needs correction" /></label>
              <button className="rounded-lg border border-[var(--line)] px-4 py-2.5 text-xs font-semibold text-[var(--ink)]">Return for correction</button>
            </form>
          ) : null}

          {assessment.status === "open" && !canSubmit ? <p className="text-xs text-[var(--muted)]">Only the assigned class teacher or School Administrator can submit this class.</p> : null}
          {assessment.status === "published" ? <p className="text-xs font-medium text-[var(--success)]">Published results are locked and cannot be edited.</p> : null}
        </div>
      </section>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--muted)]">Marks are recorded out of 100. Corrections require a reason and are retained in the revision history.</p>
        <span className="text-xs font-semibold text-[var(--muted)]">{editable ? "Mark entry open" : "Mark entry closed"}</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-white">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead className="bg-[var(--surface-subtle)]">
            <tr><th className="sticky left-0 bg-[var(--surface-subtle)] px-4 py-3 text-xs font-semibold text-[var(--muted)]">Learner</th>{areas?.map((area) => <th key={area.id} className="px-4 py-3 text-xs font-semibold text-[var(--muted)]">{area.name}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {learners?.map((learner) => (
              <tr key={learner.id} className="align-top">
                <td className="sticky left-0 bg-white px-4 py-3">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--ink-strong)]">{[learner.given_name, learner.other_names, learner.family_name].filter(Boolean).join(" ")}</p>
                  <p className="mt-1 text-[11px] text-[var(--muted)]">{learner.admission_number}</p>
                </td>
                {areas?.map((area) => {
                  const current = scoreMap.get(`${learner.id}:${area.id}`);
                  return <td key={area.id} className="min-w-[190px] px-3 py-3">
                    {editable ? <form action={saveAssessmentScore} className="space-y-2">
                      <input type="hidden" name="assessment_id" value={assessment.id} />
                      <input type="hidden" name="learner_id" value={learner.id} />
                      <input type="hidden" name="learning_area_id" value={area.id} />
                      <div className="flex items-center gap-2">
                        <input aria-label={`Mark for ${learner.given_name} in ${area.name}`} name="score" type="number" min="0" max="100" step="0.01" required defaultValue={current === undefined ? "" : String(current)} className="w-20 rounded-md border border-[var(--line)] px-2 py-2 text-sm tabular-nums" />
                        <button className="rounded-md bg-[var(--brand)] px-3 py-2 text-xs font-semibold text-white">Save</button>
                      </div>
                      <input name="reason" maxLength={500} placeholder={current === undefined ? "" : "Reason for correction"} className="w-full rounded-md border border-[var(--line)] px-2 py-1.5 text-[11px]" />
                    </form> : <span className="text-sm tabular-nums text-[var(--ink)]">{current === undefined ? "—" : current}</span>}
                  </td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {!learners?.length ? <p className="px-5 py-12 text-center text-sm text-[var(--muted)]">No active learners are enrolled in this class for the selected period.</p> : null}
        {!areas?.length ? <p className="px-5 py-12 text-center text-sm text-[var(--muted)]">No learning areas are attached to this assessment.</p> : null}
      </div>
    </WorkspaceShell>
  );
}
