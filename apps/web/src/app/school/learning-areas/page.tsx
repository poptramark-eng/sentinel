import { redirect } from "next/navigation";
import { WorkspaceShell } from "../../../components/workspace-shell";
import { SignOutButton } from "../../../components/sign-out-button";
import { LearningAreaManager } from "../../../components/learning-area-manager";
import { createClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LearningAreasPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login");
  const userId = claims.claims.sub as string;
  const { data: membership } = await supabase.from("school_memberships").select("school_id, role").eq("user_id", userId).eq("status", "active").maybeSingle();
  if (!membership) redirect("/setup");
  const { data: areas } = await supabase.from("learning_areas").select("id, code, name, grade_level").eq("school_id", membership.school_id).order("name");

  return <WorkspaceShell section="School workspace" title="Learning areas" navigation={[
    { label: "Overview", href: "/workspace" }, { label: "Learners", href: "/learners" }, { label: "Classes", href: "/classes" },
    { label: "Assessments", href: "/assessments" }, { label: "Learning areas", href: "/school/learning-areas", active: true },
    { label: "School settings", href: "/school/settings" }
  ]} actions={<SignOutButton />}>
    <div className="mb-7"><p className="cbe-eyebrow">Curriculum configuration</p><h1 className="mt-2 text-2xl font-semibold tracking-tight">Learning areas</h1><p className="mt-2 text-sm text-[var(--muted)]">Configure the learning areas your school teaches and assesses.</p></div>
    <LearningAreaManager schoolId={membership.school_id} areas={areas ?? []} canManage={membership.role === "school_admin"} />
  </WorkspaceShell>;
}
