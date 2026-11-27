import { redirect } from "next/navigation";
import { WorkspaceShell } from "../../components/workspace-shell";
import { SignOutButton } from "../../components/sign-out-button";
import { LearnerManager } from "../../components/learner-manager";
import { createClient } from "../../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LearnersPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login");
  const userId = claims.claims.sub as string;
  const { data: membership } = await supabase.from("school_memberships").select("school_id, role").eq("user_id", userId).eq("status", "active").maybeSingle();
  if (!membership) redirect("/setup");

  const [{ data: years }, { data: classes }, { data: learners }, { data: enrollments }] = await Promise.all([
    supabase.from("academic_years").select("id, name").eq("school_id", membership.school_id).order("starts_on", { ascending: false }),
    supabase.from("classes").select("id, display_name, academic_year_id").eq("school_id", membership.school_id).order("grade_level"),
    supabase.from("learners").select("id, admission_number, given_name, family_name, other_names, gender").eq("school_id", membership.school_id).order("family_name"),
    supabase.from("learner_enrollments").select("learner_id, class_id, academic_year_id").eq("school_id", membership.school_id).eq("status", "active"),
  ]);
  const classMap = new Map((classes ?? []).map(c => [c.id, c]));
  const yearMap = new Map((years ?? []).map(y => [y.id, y.name]));
  const enrollmentMap = new Map((enrollments ?? []).map(e => [e.learner_id, e]));
  const mapped = (learners ?? []).map(l => {
    const enrollment = enrollmentMap.get(l.id);
    const classRow = enrollment ? classMap.get(enrollment.class_id) : undefined;
    return { ...l, class_name: classRow?.display_name ?? "Not placed", year_name: enrollment ? yearMap.get(enrollment.academic_year_id) ?? "—" : "—" };
  });

  return <WorkspaceShell section="School workspace" title="Learners" navigation={[
    { label: "Overview", href: "/workspace" }, { label: "Learners", href: "/learners", active: true },
    { label: "Classes", href: "/classes" }, { label: "Assessments", href: "/assessments" },
    { label: "Learning areas", href: "/school/learning-areas" }, { label: "School settings", href: "/school/settings" }
  ]} actions={<SignOutButton />}>
    <div className="mb-7"><p className="cbe-eyebrow">Learner records</p><h1 className="mt-2 text-2xl font-semibold tracking-tight">Learner register</h1><p className="mt-2 text-sm text-[var(--muted)]">Manage learner identity, admission and class placement in one record.</p></div>
    <LearnerManager years={years ?? []} classes={classes ?? []} learners={mapped} canManage={membership.role === "school_admin"} />
  </WorkspaceShell>;
}
