import Link from "next/link";
import { redirect } from "next/navigation";
import { WorkspaceShell } from "../../../components/workspace-shell";
import { createClient } from "../../../lib/supabase/server";
import { requireChildDataProcessing } from "../../../lib/child-data";
import type { AssessmentReportSnapshot } from "../../../lib/assessment-report";
import { PublishedReportsTable } from "../../../components/reports-tables";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const supabase = await createClient();
  const { data: auth, error } = await supabase.auth.getClaims();
  if (error || !auth?.claims?.sub) redirect("/login");
  const { data: memberships } = await supabase.from("school_memberships").select("id,role,school_id").limit(1);
  const membership = memberships?.[0];
  if (!membership) redirect("/setup");
  if (membership.role !== "school_admin") redirect("/workspace");
  await requireChildDataProcessing(supabase);

  const [{ data: school }, { data: submissions, error: queryError }] = await Promise.all([
    supabase.from("schools").select("name").eq("id", membership.school_id).maybeSingle(),
    supabase.from("assessment_submissions").select("id,version,published_at,snapshot").eq("status", "published").order("published_at", { ascending: false }),
  ]);

  const reports = (submissions ?? []).map((submission) => {
    const snapshot = submission.snapshot as unknown as AssessmentReportSnapshot;
    return {
      id: submission.id,
      version: submission.version,
      publishedAt: submission.published_at,
      title: snapshot.assessment.title,
      assessmentType: snapshot.assessment.assessment_type,
      grade: snapshot.class.grade_level,
      className: snapshot.class.display_name,
      learnerCount: snapshot.learners.length,
    };
  });

  return (
    <WorkspaceShell
      section="School reporting"
      title="Published reports"
      navigation={[
        { label: "Overview", href: "/workspace" },
        { label: "Assessments", href: "/workspace/assessments" },
        { label: "Learners", href: "/workspace/learners" },
        { label: "Teachers", href: "/workspace/teachers" },
        { label: "Reports", href: "/workspace/reports", active: true },
        { label: "Setup", href: "/workspace/settings" },
      ]}
      actions={<form action="/auth/signout" method="post"><button className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--muted)]">Sign out</button></form>}
    >
      <div className="mb-6">
        <p className="cbe-eyebrow">Results archive · {school?.name ?? "School"}</p>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--ink-strong)]">Published assessment reports</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">Only approved and published assessment versions appear here. Each report uses the immutable learner and mark snapshot captured at submission.</p>
      </div>
      {queryError ? <p role="alert" className="mb-4 rounded-lg bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">Published reports could not be loaded.</p> : null}
      <PublishedReportsTable reports={reports} />
    </WorkspaceShell>
  );
}
