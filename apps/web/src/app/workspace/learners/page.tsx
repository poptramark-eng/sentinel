import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
import { WorkspaceShell } from "../../../components/workspace-shell";
import { LearnersTable } from "../../../components/workspace-tables";
import { createClient } from "../../../lib/supabase/server";
import { requireChildDataProcessing } from "../../../lib/child-data";
import { createLearner } from "./actions";

export default async function LearnersPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const supabase = await createClient();
  const { data: auth, error } = await supabase.auth.getClaims();
  if (error || !auth?.claims?.sub) redirect("/login");
  const { data: memberships } = await supabase.from("school_memberships").select("id,role").limit(1);
  const membership = memberships?.[0];
  if (!membership) redirect("/setup");
  await requireChildDataProcessing(supabase);
  const [{ data: classes }, { data: enrollments }] = await Promise.all([
    supabase.from("classes").select("id,display_name,grade_level,academic_year_id").eq("is_active", true).order("grade_level"),
    supabase.from("learner_enrollments").select("learner_id,class_id,academic_year_id,status,learners(id,admission_number,given_name,family_name,other_names),classes(display_name,grade_level)").eq("status", "active").order("created_at", { ascending: false }).limit(100),
  ]);
  const params = await searchParams;
  const isAdmin = membership.role === "school_admin";
  const learnerRows = (enrollments ?? []).flatMap((row) => {
    const learner = Array.isArray(row.learners) ? row.learners[0] : row.learners;
    const cls = Array.isArray(row.classes) ? row.classes[0] : row.classes;
    if (!learner) return [];
    return [{
      id: row.learner_id,
      name: [learner.given_name, learner.other_names, learner.family_name].filter(Boolean).join(" "),
      admissionNumber: learner.admission_number ?? "",
      grade: cls?.grade_level ?? null,
      className: cls?.display_name ?? "",
    }];
  });

  return <WorkspaceShell section="Learner records" title="Learners" navigation={[
    { label: "Overview", href: "/workspace" }, { label: "Assessments", href: "/workspace/assessments" }, { label: "Learners", href: "/workspace/learners", active: true }, ...(isAdmin ? [{ label: "Teachers", href: "/workspace/teachers" }, { label: "Reports", href: "/workspace/reports" }, { label: "Setup", href: "/workspace/settings" }] : []),
  ]} actions={<form action="/auth/signout" method="post"><button className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--muted)]">Sign out</button></form>}>
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div><p className="cbe-eyebrow">School register</p><h1 className="mt-1 text-xl font-semibold text-[var(--ink-strong)]">Learners</h1><p className="mt-1 text-xs text-[var(--muted)]">Learner records and active class enrolments.</p></div>
      <span className="text-xs tabular-nums text-[var(--muted)]">{learnerRows.length} active enrolments</span>
    </div>
    {params.error ? <p role="alert" className="mb-3 rounded-md bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">{params.error}</p> : null}
    {params.saved ? <p role="status" className="mb-3 rounded-md bg-[var(--success-soft)] px-3 py-2 text-xs text-[var(--success)]">Learner record created.</p> : null}
    {isAdmin ? <details className="mb-3 rounded-lg border border-[var(--line)] bg-white">
      <summary className="cursor-pointer px-3 py-2.5 text-xs font-semibold text-[var(--ink-strong)]">Add learner</summary>
      <form action={createLearner} className="grid gap-2 border-t border-[var(--line)] p-3 sm:grid-cols-2 xl:grid-cols-3">
        <input name="admission_number" required maxLength={50} placeholder="Admission number *" className="cbe-field text-sm" />
        <input name="given_name" required maxLength={100} placeholder="Given name *" className="cbe-field text-sm" />
        <input name="family_name" required maxLength={100} placeholder="Family name *" className="cbe-field text-sm" />
        <input name="other_names" maxLength={100} placeholder="Other names" className="cbe-field text-sm" />
        <select name="gender" className="cbe-field text-sm"><option value="">Gender (optional)</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option><option value="undisclosed">Prefer not to say</option></select>
        <select name="class_id" required className="cbe-field text-sm"><option value="">Class / stream *</option>{classes?.map((cls) => <option key={cls.id} value={cls.id}>Grade {cls.grade_level} · {cls.display_name}</option>)}</select>
        <button disabled={!classes?.length} className="cbe-button cbe-button-primary sm:col-span-2 xl:col-span-3">Add learner</button>
      </form>
    </details> : null}
    <LearnersTable rows={learnerRows} />
  </WorkspaceShell>;
}
