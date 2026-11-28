import Link from "next/link";

export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { WorkspaceShell } from "../../../components/workspace-shell";
import { AssessmentsTable } from "../../../components/workspace-tables";
import { createClient } from "../../../lib/supabase/server";

export default async function AssessmentsPage() {
  const supabase = await createClient();
  const { data: auth, error } = await supabase.auth.getClaims();
  if (error || !auth?.claims?.sub) redirect("/login");
  const { data: memberships } = await supabase.from("school_memberships").select("id,role").limit(1);
  const membership = memberships?.[0];
  if (!membership) redirect("/setup");
  const { data: assessments, error: queryError } = await supabase.from("assessments").select("id,title,assessment_type,status,assessment_date,created_at").order("created_at", { ascending: false });
  const rows = (assessments ?? []).map((item) => ({
    id: item.id,
    title: item.title,
    type: item.assessment_type,
    status: item.status,
    date: item.assessment_date,
  }));

  return <WorkspaceShell section="Assessment management" title="Assessments" navigation={[
    { label: "Overview", href: "/workspace" }, { label: "Assessments", href: "/workspace/assessments", active: true }, { label: "Learners", href: "/workspace/learners" }, ...(membership.role === "school_admin" ? [{ label: "Teachers", href: "/workspace/teachers" }, { label: "Reports", href: "/workspace/reports" }, { label: "Setup", href: "/workspace/settings" }] : []),
  ]} actions={<form action="/auth/signout" method="post"><button className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--muted)]">Sign out</button></form>}>
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div><p className="cbe-eyebrow">Assessment register</p><h1 className="mt-1 text-xl font-semibold text-[var(--ink-strong)]">Assessments</h1><p className="mt-1 text-xs text-[var(--muted)]">Manage assessment periods and class results.</p></div>
      {membership.role === "school_admin" ? <Link href="/workspace/assessments/new" className="cbe-button cbe-button-primary">New assessment</Link> : null}
    </div>
    {queryError ? <p role="alert" className="mb-3 rounded-md bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">Could not load assessments. Check your school access.</p> : null}
    <AssessmentsTable rows={rows} />
  </WorkspaceShell>;
}
