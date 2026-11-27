import Link from "next/link";
import { redirect } from "next/navigation";
import { WorkspaceShell } from "../../components/workspace-shell";
import { ClassManager } from "../../components/class-manager";
import { SignOutButton } from "../../components/sign-out-button";
import { createClient } from "../../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ClassesPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login");
  const userId = claims.claims.sub as string;
  const { data: membership } = await supabase.from("school_memberships").select("school_id, role").eq("user_id", userId).eq("status", "active").maybeSingle();
  if (!membership) redirect("/setup");

  const [{ data: years }, { data: classes }] = await Promise.all([
    supabase.from("academic_years").select("id, name").eq("school_id", membership.school_id).order("starts_on", { ascending: false }),
    supabase.from("classes").select("id, display_name, grade_level, stream, academic_year_id").eq("school_id", membership.school_id).order("grade_level"),
  ]);
  const yearNames = new Map((years ?? []).map(y=>[y.id,y.name]));
  const mapped = (classes ?? []).map(c=>({...c, year_name: yearNames.get(c.academic_year_id)}));

  return <WorkspaceShell section="School workspace" title="Classes" navigation={[
    {label:"Overview",href:"/workspace"},{label:"Learners",href:"/learners"},{label:"Classes",href:"/classes",active:true},
    {label:"Assessments",href:"/assessments"},{label:"Learning areas",href:"/school/learning-areas"},{label:"School settings",href:"/school/settings"}
  ]} actions={<SignOutButton />}>
    <div className="mb-7 flex flex-wrap items-end justify-between gap-3"><div><p className="cbe-eyebrow">School structure</p><h1 className="mt-2 text-2xl font-semibold tracking-tight">Classes and streams</h1><p className="mt-2 text-sm text-[var(--muted)]">Organise learners by grade, stream and academic year.</p></div><Link href="/school/academic-years" className="cbe-button cbe-button-secondary">Academic years</Link></div>
    <ClassManager schoolId={membership.school_id} academicYears={years ?? []} initialClasses={mapped} canManage={membership.role === "school_admin"} />
  </WorkspaceShell>;
}
