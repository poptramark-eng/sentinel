import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { WorkspaceShell } from "../../../../components/workspace-shell";
import { PrintButton } from "../../../../components/print-button";
import { createClient } from "../../../../lib/supabase/server";
import { requireChildDataProcessing } from "../../../../lib/child-data";
import type { AssessmentReportSnapshot } from "../../../../lib/assessment-report";

export const dynamic = "force-dynamic";

export default async function AssessmentReportPage({ params }: { params: Promise<{ submissionId: string }> }) {
  const { submissionId } = await params;
  const supabase = await createClient();
  const { data: auth, error } = await supabase.auth.getClaims();
  if (error || !auth?.claims?.sub) redirect("/login");
  const { data: memberships } = await supabase.from("school_memberships").select("role,school_id").limit(1);
  const membership = memberships?.[0];
  if (!membership) redirect("/setup");
  if (membership.role !== "school_admin") redirect("/workspace");
  await requireChildDataProcessing(supabase);

  const [{ data: submission }, { data: school }] = await Promise.all([
    supabase.from("assessment_submissions").select("id,version,published_at,snapshot").eq("id", submissionId).eq("status", "published").maybeSingle(),
    supabase.from("schools").select("name,county,sub_county").eq("id", membership.school_id).maybeSingle(),
  ]);
  if (!submission) notFound();

  const snapshot = submission.snapshot as unknown as AssessmentReportSnapshot;
  const averages = snapshot.learners.map((learner) => learner.average).filter((value): value is number => typeof value === "number");
  const classAverage = averages.length ? averages.reduce((sum, value) => sum + value, 0) / averages.length : null;

  return (
    <WorkspaceShell
      section="School reporting"
      title={snapshot.assessment.title}
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
      <div className="report-screen mx-auto max-w-[var(--content-max)]">
        <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
          <Link href="/workspace/reports" className="text-xs font-semibold text-[var(--brand)]">← Published reports</Link>
          <div className="flex flex-wrap gap-2">
            <a href={`/workspace/reports/${submission.id}/csv`} className="rounded-lg bg-[var(--brand)] px-4 py-2.5 text-xs font-semibold text-white">Download CSV for Excel</a>
            <PrintButton />
          </div>
        </div>

        <header className="report-print-header">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--brand-strong)]">SOFTFLIX · CBE ASSESSMENT PLATFORM</p>
          <h1 className="mt-2 text-2xl font-bold text-[var(--ink-strong)]">{school?.name ?? "School"} — {snapshot.assessment.title}</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Grade {snapshot.class.grade_level} · {snapshot.class.display_name} · Version {submission.version} · Published {submission.published_at ? new Date(submission.published_at).toLocaleDateString("en-KE") : "—"}</p>
        </header>

        <div className="mb-6">
          <p className="cbe-eyebrow">Published assessment · Version {submission.version}</p>
          <h1 className="mt-2 text-2xl font-semibold text-[var(--ink-strong)]">{snapshot.assessment.title}</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">{school?.name ?? "School"} · Grade {snapshot.class.grade_level} · {snapshot.class.display_name} · {snapshot.assessment.assessment_type} · {snapshot.assessment.assessment_date ?? "No assessment date"}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">Published {submission.published_at ? new Date(submission.published_at).toLocaleString("en-KE") : "—"}</p>
        </div>

        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <article className="report-card rounded-xl border border-[var(--line)] bg-white p-4"><p className="text-xs text-[var(--muted)]">Learners</p><p className="mt-2 text-2xl font-semibold tabular-nums text-[var(--ink-strong)]">{snapshot.learners.length}</p></article>
          <article className="report-card rounded-xl border border-[var(--line)] bg-white p-4"><p className="text-xs text-[var(--muted)]">Learning areas</p><p className="mt-2 text-2xl font-semibold tabular-nums text-[var(--ink-strong)]">{snapshot.learning_areas.length}</p></article>
          <article className="report-card rounded-xl border border-[var(--line)] bg-white p-4"><p className="text-xs text-[var(--muted)]">Class average</p><p className="mt-2 text-2xl font-semibold tabular-nums text-[var(--ink-strong)]">{classAverage === null ? "—" : classAverage.toFixed(2)}</p></article>
        </div>

        <section className="report-card report-card-table overflow-hidden rounded-xl border border-[var(--line)] bg-white">
          <div className="no-print border-b border-[var(--line)] px-5 py-4">
            <h2 className="font-semibold text-[var(--ink-strong)]">Learner results</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">Scores are shown out of {snapshot.assessment.max_score}. This report reflects the exact published submission snapshot.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="report-table w-full min-w-[720px] border-collapse text-left">
              <thead className="bg-[var(--surface-subtle)]">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold text-[var(--muted)]">#</th>
                  <th className="px-4 py-3 text-xs font-semibold text-[var(--muted)]">Learner</th>
                  <th className="px-4 py-3 text-xs font-semibold text-[var(--muted)]">Admission no.</th>
                  {snapshot.learning_areas.map((area) => <th key={area.id} className="px-4 py-3 text-xs font-semibold text-[var(--muted)]">{area.name}</th>)}
                  <th className="px-4 py-3 text-xs font-semibold text-[var(--muted)]">Average</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {snapshot.learners.map((learner, index) => {
                  const scoreByArea = new Map(learner.scores.map((score) => [score.learning_area_id, score.score]));
                  return (
                    <tr key={learner.id}>
                      <td className="px-4 py-3 text-xs tabular-nums text-[var(--muted)]">{index + 1}</td>
                      <td className="px-4 py-3 text-sm font-medium text-[var(--ink-strong)]">{learner.name}</td>
                      <td className="px-4 py-3 text-xs tabular-nums text-[var(--muted)]">{learner.admission_number}</td>
                      {snapshot.learning_areas.map((area) => <td key={area.id} className="px-4 py-3 text-sm tabular-nums text-[var(--ink)]">{scoreByArea.get(area.id)?.toFixed(2) ?? "—"}</td>)}
                      <td className="px-4 py-3 text-sm font-semibold tabular-nums text-[var(--ink-strong)]">{learner.average?.toFixed(2) ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="report-print-only border-t border-[var(--line)] px-4 py-3 text-[10px] text-[var(--muted)]">Generated from published assessment snapshot · Version {submission.version}</p>
        </section>
      </div>
    </WorkspaceShell>
  );
}
