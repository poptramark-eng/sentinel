import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { WorkspaceShell } from "../../../components/workspace-shell";
import { SignOutButton } from "../../../components/sign-out-button";
import { MarkEntryGrid } from "../../../components/mark-entry-grid";
import { createClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AssessmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login");
  const userId = claims.claims.sub as string;
  const { data: membership } = await supabase.from("school_memberships").select("school_id, role").eq("user_id", userId).eq("status", "active").maybeSingle();
  if (!membership) redirect("/setup");

  const { data: assessment } = await supabase.from("assessments").select("id,title,assessment_type,status,assessment_date,class_id,academic_year_id,max_score").eq("id", id).eq("school_id", membership.school_id).maybeSingle();
  if (!assessment) notFound();

  const [{ data: classRow }, { data: areaLinks }, { data: enrollments }, { data: assignments }, { data: scores }] = await Promise.all([
    supabase.from("classes").select("display_name,grade_level").eq("id", assessment.class_id).single(),
    supabase.from("assessment_learning_areas").select("learning_area_id").eq("assessment_id", id),
    supabase.from("learner_enrollments").select("learner_id").eq("class_id", assessment.class_id).eq("status", "active"),
    supabase.from("teacher_assignments").select("learning_area_id,assignment_role").eq("teacher_id", userId).eq("class_id", assessment.class_id),
    supabase.from("assessment_scores").select("id,learner_id,learning_area_id,score").eq("assessment_id", id),
  ]);

  const learnerIds = (enrollments ?? []).map(e => e.learner_id);
  const areaIds = (areaLinks ?? []).map(a => a.learning_area_id);
  const [{ data: learners }, { data: areas }] = await Promise.all([
    learnerIds.length ? supabase.from("learners").select("id,admission_number,given_name,family_name").in("id", learnerIds).order("family_name") : Promise.resolve({ data: [] as any[] }),
    areaIds.length ? supabase.from("learning_areas").select("id,name,code").in("id", areaIds).order("name") : Promise.resolve({ data: [] as any[] }),
  ]);

  const isAdmin = membership.role === "school_admin";
  const isSubjectTeacher = membership.role === "subject_teacher";
  const assignedAreaIds = (assignments ?? []).filter(a => a.assignment_role === "subject_teacher" && a.learning_area_id).map(a => a.learning_area_id as string);
  const allowedAreaIds = isAdmin ? [] : assignedAreaIds;
  const canEnter = isAdmin || isSubjectTeacher;

  return <WorkspaceShell section="School workspace" title="Assessment" navigation={[
    { label: "Overview", href: "/workspace" }, { label: "Learners", href: "/learners" }, { label: "Classes", href: "/classes" },
    { label: "Assessments", href: "/assessments", active: true }, { label: "Learning areas", href: "/school/learning-areas" },
    { label: "School settings", href: "/school/settings" }
  ]} actions={<SignOutButton />}>
    <div className="mb-6"><Link href="/assessments" className="text-xs font-semibold text-[var(--brand)]">← Back to assessments</Link><div className="mt-4 flex flex-wrap items-end justify-between gap-3"><div><p className="cbe-eyebrow">{assessment.assessment_type} assessment</p><h1 className="mt-2 text-2xl font-semibold tracking-tight">{assessment.title}</h1><p className="mt-2 text-sm text-[var(--muted)]">{classRow?.display_name ?? "Class"} · {assessment.assessment_date ?? "No date set"}</p></div><span className="rounded-full bg-[var(--brand-soft)] px-3 py-1.5 text-xs font-semibold capitalize text-[var(--brand-strong)]">{assessment.status}</span></div></div>
    <MarkEntryGrid assessmentId={id} learners={learners ?? []} areas={areas ?? []} scores={scores ?? []} allowedAreaIds={allowedAreaIds} canEnter={canEnter} />
  </WorkspaceShell>;
}
