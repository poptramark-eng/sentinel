import Link from "next/link";

export const dynamic = "force-dynamic";
import { notFound, redirect } from "next/navigation";
import { WorkspaceShell } from "../../../../components/workspace-shell";
import { createClient } from "../../../../lib/supabase/server";
import { saveAssessmentScore } from "./actions";

type Params = { params: Promise<{ assessmentId: string }>; searchParams: Promise<{ error?: string; saved?: string }> };

export default async function AssessmentDetailPage({ params, searchParams }: Params) {
  const { assessmentId } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getClaims();
  if (authError || !auth?.claims?.sub) redirect("/login");

  const { data: assessment, error } = await supabase.from("assessments")
    .select("id,title,assessment_type,status,assessment_date,max_score,class_id,academic_year_id")
    .eq("id", assessmentId).maybeSingle();
  if (error || !assessment) notFound();

  const [{ data: areaLinks }, { data: enrollments }, { data: scores }, { data: classRow }] = await Promise.all([
    supabase.from("assessment_learning_areas").select("learning_area_id").eq("assessment_id", assessmentId),
    supabase.from("learner_enrollments").select("learner_id").eq("class_id", assessment.class_id).eq("status", "active"),
    supabase.from("assessment_scores").select("learner_id,learning_area_id,score").eq("assessment_id", assessmentId),
    supabase.from("classes").select("display_name,grade_level,stream").eq("id", assessment.class_id).maybeSingle(),
  ]);
  const areaIds = (areaLinks ?? []).map(x => x.learning_area_id);
  const learnerIds = (enrollments ?? []).map(x => x.learner_id);
  const [{ data: areas }, { data: learners }] = await Promise.all([
    areaIds.length ? supabase.from("learning_areas").select("id,name").in("id", areaIds).order("name") : Promise.resolve({ data: [] }),
    learnerIds.length ? supabase.from("learners").select("id,admission_number,given_name,family_name,other_names").in("id", learnerIds).order("family_name").order("given_name") : Promise.resolve({ data: [] }),
  ]);
  const scoreMap = new Map((scores ?? []).map(s => [`${s.learner_id}:${s.learning_area_id}`, s.score]));
  const editable = assessment.status === "open";

  return <WorkspaceShell section="Assessment management" title={assessment.title} navigation={[
    { label: "Overview", href: "/workspace" }, { label: "Assessments", href: "/workspace/assessments", active: true },
  ]} actions={<form action="/auth/signout" method="post"><button className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--muted)]">Sign out</button></form>}>
    <div className="mb-6"><Link href="/workspace/assessments" className="text-xs font-semibold text-[var(--brand)]">← All assessments</Link><div className="mt-5 flex flex-wrap items-end justify-between gap-3"><div><p className="cbe-eyebrow">{assessment.assessment_type} assessment · {assessment.assessment_date ?? "No date set"}</p><h1 className="mt-2 text-2xl font-semibold text-[var(--ink-strong)]">{assessment.title}</h1><p className="mt-2 text-sm text-[var(--muted)]">Grade {classRow?.grade_level} · {classRow?.display_name ?? "Class"} · {learners?.length ?? 0} active learners</p></div><span className="rounded-full bg-[var(--brand-soft)] px-3 py-1.5 text-xs font-semibold capitalize text-[var(--brand-strong)]">{assessment.status}</span></div></div>
    {query.error ? <p role="alert" className="mb-4 rounded-lg bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">{query.error}</p> : null}
    {query.saved ? <p role="status" className="mb-4 rounded-lg bg-[var(--success-soft)] p-3 text-sm text-[var(--success)]">Mark saved.</p> : null}
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-[var(--muted)]">Marks are recorded out of 100. Corrections require a reason and are retained in the revision history.</p><span className="text-xs font-semibold text-[var(--muted)]">{editable ? "Mark entry open" : "Mark entry closed"}</span></div>
    <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-white">
      <table className="w-full min-w-[760px] border-collapse text-left"><thead className="bg-[var(--surface-subtle)]"><tr><th className="sticky left-0 bg-[var(--surface-subtle)] px-4 py-3 text-xs font-semibold text-[var(--muted)]">Learner</th>{areas?.map(a=><th key={a.id} className="px-4 py-3 text-xs font-semibold text-[var(--muted)]">{a.name}</th>)}</tr></thead>
        <tbody className="divide-y divide-[var(--line)]">{learners?.map(learner=><tr key={learner.id} className="align-top"><td className="sticky left-0 bg-white px-4 py-3"><p className="text-sm font-semibold text-[var(--ink-strong)]">{[learner.given_name,learner.other_names,learner.family_name].filter(Boolean).join(" ")}</p><p className="mt-1 text-[11px] text-[var(--muted)]">{learner.admission_number}</p></td>{areas?.map(area=>{const current=scoreMap.get(`${learner.id}:${area.id}`);return <td key={area.id} className="min-w-[190px] px-3 py-3">{editable?<form action={saveAssessmentScore} className="space-y-2"><input type="hidden" name="assessment_id" value={assessment.id}/><input type="hidden" name="learner_id" value={learner.id}/><input type="hidden" name="learning_area_id" value={area.id}/><div className="flex items-center gap-2"><input aria-label={`Mark for ${learner.given_name} in ${area.name}`} name="score" type="number" min="0" max="100" step="0.01" required defaultValue={current===undefined?"":String(current)} className="w-20 rounded-md border border-[var(--line)] px-2 py-2 text-sm tabular-nums"/><button className="rounded-md bg-[var(--brand)] px-3 py-2 text-xs font-semibold text-white">Save</button></div><input name="reason" maxLength={500} placeholder={current===undefined?"":"Reason for correction"} className="w-full rounded-md border border-[var(--line)] px-2 py-1.5 text-[11px]"/></form>:<span className="text-sm tabular-nums text-[var(--ink)]">{current===undefined?"—":current}</span>}</td>})}</tr>)}</tbody>
      </table>
      {!learners?.length ? <p className="px-5 py-12 text-center text-sm text-[var(--muted)]">No active learners are enrolled in this class for the selected period.</p> : null}
      {!areas?.length ? <p className="px-5 py-12 text-center text-sm text-[var(--muted)]">No learning areas are attached to this assessment.</p> : null}
    </div>
  </WorkspaceShell>;
}
