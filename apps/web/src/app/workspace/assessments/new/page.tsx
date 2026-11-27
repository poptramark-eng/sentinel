import Link from "next/link";
import { redirect } from "next/navigation";
import { WorkspaceShell } from "../../../../components/workspace-shell";
import { createClient } from "../../../../lib/supabase/server";
import { createAssessment } from "./actions";

export default async function NewAssessmentPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const supabase = await createClient();
  const { data: auth, error } = await supabase.auth.getClaims();
  if (error || !auth?.claims?.sub) redirect("/login");
  const { data: memberships } = await supabase.from("school_memberships").select("id,role").limit(1);
  if (!memberships?.length) redirect("/setup");
  if (memberships[0].role !== "school_admin") redirect("/workspace");
  const [{ data: classes }, { data: areas }] = await Promise.all([
    supabase.from("classes").select("id,display_name,grade_level,academic_year_id").eq("is_active", true).order("grade_level").order("display_name"),
    supabase.from("learning_areas").select("id,name,grade_level").eq("is_active", true).order("name"),
  ]);
  const params = await searchParams;
  return <WorkspaceShell section="Assessment management" title="New assessment" navigation={[
    { label: "Overview", href: "/workspace" }, { label: "Assessments", href: "/workspace/assessments", active: true },
  ]}>
    <div className="max-w-3xl"><Link href="/workspace/assessments" className="text-xs font-semibold text-[var(--brand)]">← Back to assessments</Link><p className="cbe-eyebrow mt-6">Assessment setup</p><h1 className="mt-2 text-2xl font-semibold text-[var(--ink-strong)]">Create assessment</h1><p className="mt-2 text-sm leading-6 text-[var(--muted)]">Choose the academic period, class and learning areas. The initial mark scale is 0–100.</p>
      {params.error ? <p role="alert" className="mt-5 rounded-lg bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">{params.error}</p> : null}
      <form action={createAssessment} className="mt-6 space-y-6 rounded-xl border border-[var(--line)] bg-white p-5 sm:p-7">
        <label className="block"><span className="mb-2 block text-sm font-medium">Assessment title *</span><input name="title" required minLength={2} maxLength={160} className="w-full rounded-lg border border-[var(--line)] px-3 py-3 text-sm" placeholder="e.g. Term 1 Mathematics Assessment" /></label>
        <div className="grid gap-5 sm:grid-cols-2">
          <label><span className="mb-2 block text-sm font-medium">Assessment type *</span><select name="assessment_type" required className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-3 text-sm"><option value="formative">Formative</option><option value="summative">Summative</option></select></label>
          <label><span className="mb-2 block text-sm font-medium">Assessment date</span><input type="date" name="assessment_date" className="w-full rounded-lg border border-[var(--line)] px-3 py-3 text-sm" /></label>
          <label className="sm:col-span-2"><span className="mb-2 block text-sm font-medium">Class / stream *</span><select name="class_id" required className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-3 text-sm"><option value="">Choose class</option>{classes?.map(c=><option key={c.id} value={c.id}>Grade {c.grade_level} · {c.display_name}</option>)}</select><span className="mt-1 block text-xs text-[var(--muted)]">The academic year is inherited from the selected class.</span></label>
        </div>
        <fieldset><legend className="text-sm font-semibold">Learning areas *</legend><p className="mt-1 text-xs text-[var(--muted)]">Select one or more. The database validates that the areas match the selected grade.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{areas?.map(a=><label key={a.id} className="flex items-center gap-3 rounded-lg border border-[var(--line)] p-3 text-sm"><input type="checkbox" name="learning_area_ids" value={a.id} className="size-4 accent-[var(--brand)]" /><span>{a.name}{a.grade_level ? <span className="ml-1 text-xs text-[var(--muted)]">· Grade {a.grade_level}</span> : null}</span></label>)}</div>{!areas?.length ? <p className="mt-3 text-sm text-[var(--muted)]">Add learning areas and classes in School setup before creating assessments.</p> : null}</fieldset>
        <div className="flex flex-wrap gap-3 border-t border-[var(--line)] pt-5"><button disabled={!classes?.length || !areas?.length} className="rounded-lg bg-[var(--brand)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">Create assessment</button><Link href="/workspace/assessments" className="rounded-lg border border-[var(--line)] px-5 py-3 text-sm font-medium">Cancel</Link></div>
      </form>
    </div>
  </WorkspaceShell>;
}
