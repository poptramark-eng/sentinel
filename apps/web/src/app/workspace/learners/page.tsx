import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
import { WorkspaceShell } from "../../../components/workspace-shell";
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
    supabase.from("learner_enrollments").select("learner_id,class_id,academic_year_id,status,learners(id,admission_number,given_name,family_name,other_names,is_synthetic),classes(display_name,grade_level)").eq("status","active").order("created_at",{ascending:false}).limit(100),
  ]);
  const params = await searchParams;
  const isAdmin = membership.role === "school_admin";
  return <WorkspaceShell section="Learner records" title="Learners" navigation={[
    { label: "Overview", href: "/workspace" }, { label: "Assessments", href: "/workspace/assessments" }, { label: "Learners", href: "/workspace/learners", active: true }, ...(isAdmin ? [{label:"Teachers",href:"/workspace/teachers"},{label:"Reports",href:"/workspace/reports"},{label:"Setup",href:"/workspace/settings"}] : []),
  ]} actions={<form action="/auth/signout" method="post"><button className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--muted)]">Sign out</button></form>}>
    <div className="mb-6"><p className="cbe-eyebrow">School register</p><h1 className="mt-2 text-2xl font-semibold text-[var(--ink-strong)]">Learners</h1><p className="mt-2 text-sm text-[var(--muted)]">Learner records and academic-year class enrolments. Fictional sample learners are marked Demo.</p></div>
    {params.error ? <p role="alert" className="mb-4 rounded-lg bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">{params.error}</p> : null}
    {params.saved ? <p role="status" className="mb-4 rounded-lg bg-[var(--success-soft)] p-3 text-sm text-[var(--success)]">Learner record created.</p> : null}
    {isAdmin ? <form action={createLearner} className="mb-7 grid gap-3 rounded-xl border border-[var(--line)] bg-white p-5 sm:grid-cols-2 xl:grid-cols-3"><h2 className="sm:col-span-2 xl:col-span-3 font-semibold text-[var(--ink-strong)]">Add learner</h2><input name="admission_number" required maxLength={50} placeholder="Admission number *" className="rounded-lg border border-[var(--line)] px-3 py-2.5 text-sm"/><input name="given_name" required maxLength={100} placeholder="Given name *" className="rounded-lg border border-[var(--line)] px-3 py-2.5 text-sm"/><input name="family_name" required maxLength={100} placeholder="Family name *" className="rounded-lg border border-[var(--line)] px-3 py-2.5 text-sm"/><input name="other_names" maxLength={100} placeholder="Other names" className="rounded-lg border border-[var(--line)] px-3 py-2.5 text-sm"/><select name="gender" className="rounded-lg border border-[var(--line)] bg-white px-3 py-2.5 text-sm"><option value="">Gender (optional)</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option><option value="undisclosed">Prefer not to say</option></select><select name="class_id" required className="rounded-lg border border-[var(--line)] bg-white px-3 py-2.5 text-sm"><option value="">Class / stream *</option>{classes?.map(c=><option key={c.id} value={c.id}>Grade {c.grade_level} · {c.display_name}</option>)}</select><button disabled={!classes?.length} className="rounded-lg bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Add learner</button></form> : null}
    <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-white"><div className="grid grid-cols-[1fr_150px_130px] gap-3 border-b border-[var(--line)] bg-[var(--surface-subtle)] px-4 py-3 text-[11px] font-semibold uppercase text-[var(--muted)]"><span>Learner</span><span>Admission no.</span><span>Class</span></div>{enrollments?.map((row, index) => { const learner = Array.isArray(row.learners) ? row.learners[0] : row.learners; const cls = Array.isArray(row.classes) ? row.classes[0] : row.classes; return <div key={row.learner_id + "-" + index} className="grid grid-cols-[1fr_150px_130px] gap-3 border-b border-[var(--line)] px-4 py-3 last:border-0"><span className="flex flex-wrap items-center gap-2 text-sm font-medium text-[var(--ink-strong)]">{[learner?.given_name, learner?.other_names, learner?.family_name].filter(Boolean).join(" ")}{learner?.is_synthetic ? <span className="rounded-full bg-[var(--surface-subtle)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Demo</span> : null}</span><span className="text-xs text-[var(--muted)]">{learner?.admission_number}</span><span className="text-xs text-[var(--muted)]">Grade {cls?.grade_level} · {cls?.display_name}</span></div> })}{!enrollments?.length ? <p className="px-4 py-10 text-center text-sm text-[var(--muted)]">No active learner enrolments yet.</p> : null}</div>
  </WorkspaceShell>;
}
