import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { WorkspaceShell } from "../../../../components/workspace-shell";
import { PrintButton } from "../../../../components/print-button";
import { LearnerResultsTable } from "../../../../components/reports-tables";
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
    supabase.from("schools").select("name").eq("id", membership.school_id).maybeSingle(),
  ]);
  if (!submission) notFound();

  const snapshot = submission.snapshot as unknown as AssessmentReportSnapshot;
  const averages = snapshot.learners.map((learner) => learner.average).filter((value): value is number => typeof value === "number");
  const classAverage = averages.length ? averages.reduce((sum, value) => sum + value, 0) / averages.length : null;
  const areaStats = snapshot.learning_areas.map((area) => {
    const values = snapshot.learners
      .map((learner) => learner.scores.find((score) => score.learning_area_id === area.id)?.score)
      .filter((value): value is number => typeof value === "number");
    return {
      area,
      entries: values.length,
      average: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
      highest: values.length ? Math.max(...values) : null,
      lowest: values.length ? Math.min(...values) : null,
    };
  });
  const genderCounts = new Map<string, number>();
  for (const learner of snapshot.learners) {
    const gender = learner.gender ?? "not recorded";
    genderCounts.set(gender, (genderCounts.get(gender) ?? 0) + 1);
  }
  const genderStats = [...genderCounts.entries()].sort(([left], [right]) => left.localeCompare(right));

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

        <LearnerResultsTable learners={snapshot.learners} learningAreas={snapshot.learning_areas} maxScore={snapshot.assessment.max_score} />

        <section className="report-card mt-6 overflow-hidden rounded-xl border border-[var(--line)] bg-white">
          <div className="border-b border-[var(--line)] px-5 py-4">
            <h2 className="font-semibold text-[var(--ink-strong)]">Learning-area summary</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">Numeric averages and score ranges only; no rubric boundaries are inferred.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="report-table w-full border-collapse text-left">
              <thead className="bg-[var(--surface-subtle)]">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold text-[var(--muted)]">Learning area</th>
                  <th className="px-4 py-3 text-xs font-semibold text-[var(--muted)]">Entries</th>
                  <th className="px-4 py-3 text-xs font-semibold text-[var(--muted)]">Average</th>
                  <th className="px-4 py-3 text-xs font-semibold text-[var(--muted)]">Highest</th>
                  <th className="px-4 py-3 text-xs font-semibold text-[var(--muted)]">Lowest</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {areaStats.map((item) => (
                  <tr key={item.area.id}>
                    <td className="px-4 py-3 text-sm font-medium text-[var(--ink-strong)]">{item.area.name}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-[var(--ink)]">{item.entries}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-[var(--ink)]">{item.average?.toFixed(2) ?? "—"}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-[var(--ink)]">{item.highest?.toFixed(2) ?? "—"}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-[var(--ink)]">{item.lowest?.toFixed(2) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="report-card mt-6 overflow-hidden rounded-xl border border-[var(--line)] bg-white">
          <div className="border-b border-[var(--line)] px-5 py-4">
            <h2 className="font-semibold text-[var(--ink-strong)]">Learner distribution by gender</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">Counts use the gender recorded on each learner profile; missing values remain separate.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="report-table w-full border-collapse text-left">
              <thead className="bg-[var(--surface-subtle)]">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold text-[var(--muted)]">Recorded category</th>
                  <th className="px-4 py-3 text-xs font-semibold text-[var(--muted)]">Learners</th>
                  <th className="px-4 py-3 text-xs font-semibold text-[var(--muted)]">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {genderStats.map(([gender, count]) => (
                  <tr key={gender}>
                    <td className="px-4 py-3 text-sm capitalize text-[var(--ink-strong)]">{gender}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-[var(--ink)]">{count}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-[var(--ink)]">{snapshot.learners.length ? `${((count / snapshot.learners.length) * 100).toFixed(1)}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </WorkspaceShell>
  );
}
