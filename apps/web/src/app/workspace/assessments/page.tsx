import Link from "next/link";

export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { WorkspaceShell } from "../../../components/workspace-shell";
import { createClient } from "../../../lib/supabase/server";

export default async function AssessmentsPage() {
  const supabase = await createClient();
  const { data: auth, error } = await supabase.auth.getClaims();
  if (error || !auth?.claims?.sub) redirect("/login");
  const { data: memberships } = await supabase.from("school_memberships").select("id,role").limit(1);
  const membership = memberships?.[0];
  if (!membership) redirect("/setup");
  const { data: assessments, error: queryError } = await supabase.from("assessments").select("id,title,assessment_type,status,assessment_date,created_at").order("created_at", { ascending: false });

  return <WorkspaceShell section="Assessment management" title="Assessments" navigation={[
    { label: "Overview", href: "/workspace" }, { label: "Assessments", href: "/workspace/assessments", active: true }, { label: "Learners", href: "/workspace/learners" }, ...(membership.role === "school_admin" ? [{ label: "Teachers", href: "/workspace/teachers" }, { label: "Reports", href: "/workspace/reports" }, { label: "Setup", href: "/workspace/settings" }] : []),
  ]} actions={<form action="/auth/signout" method="post"><button className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--muted)]">Sign out</button></form>}>
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="cbe-eyebrow">Assessment register</p><h1 className="mt-2 text-2xl font-semibold text-[var(--ink-strong)]">Assessments</h1><p className="mt-2 text-sm text-[var(--muted)]">Create and manage formative and summative assessments.</p></div>{membership.role === "school_admin" ? <Link href="/workspace/assessments/new" className="rounded-lg bg-[var(--brand)] px-4 py-3 text-sm font-semibold text-white">New assessment</Link> : null}</div>
    {queryError ? <p role="alert" className="mt-6 rounded-lg bg-[var(--danger-soft)] p-4 text-sm text-[var(--danger)]">Could not load assessments. Check your school access.</p> : null}
    <div className="mt-7 overflow-hidden rounded-xl border border-[var(--line)] bg-white">
      <div className="grid grid-cols-[1fr_120px_110px] gap-3 border-b border-[var(--line)] bg-[var(--surface-subtle)] px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]"><span>Assessment</span><span>Type</span><span>Status</span></div>
      {assessments?.length ? assessments.map(item => <Link key={item.id} href={`/workspace/assessments/${item.id}`} className="grid grid-cols-[1fr_120px_110px] items-center gap-3 border-b border-[var(--line)] px-5 py-4 last:border-0 hover:bg-[var(--surface-subtle)]"><span><span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--ink-strong)]">{item.title}</span><span className="mt-1 block text-xs text-[var(--muted)]">{item.assessment_date ?? "Date not set"}</span></span><span className="text-xs capitalize text-[var(--muted)]">{item.assessment_type}</span><span className="text-xs capitalize text-[var(--muted)]">{item.status}</span></Link>) : <p className="px-5 py-12 text-center text-sm text-[var(--muted)]">No assessments created yet.</p>}
    </div>
  </WorkspaceShell>;
}
