import Link from "next/link";
import { redirect } from "next/navigation";
import { WorkspaceShell } from "../../../components/workspace-shell";
import { createClient } from "../../../lib/supabase/server";
import { requireChildDataProcessing } from "../../../lib/child-data";
import type { AssessmentReportSnapshot } from "../../../lib/assessment-report";

export const dynamic = "force-dynamic";

type Published = { id: string; version: number; published_at: string | null; snapshot: AssessmentReportSnapshot };

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}
function metric(value: number | null) {
  return value === null ? "—" : value.toFixed(2);
}

export default async function AnalyticsPage() {
  const supabase = await createClient();
  const { data: auth, error } = await supabase.auth.getClaims();
  if (error || !auth?.claims?.sub) redirect("/login");
  const { data: memberships } = await supabase.from("school_memberships").select("role,school_id").limit(1);
  const membership = memberships?.[0];
  if (!membership) redirect("/setup");
  if (membership.role !== "school_admin") redirect("/workspace");
  await requireChildDataProcessing(supabase);

  const [{ data: school }, { data: submissions, error: reportsError }] = await Promise.all([
    supabase.from("schools").select("name").eq("id", membership.school_id).maybeSingle(),
    supabase.from("assessment_submissions").select("id,version,published_at,snapshot")
      .eq("school_id", membership.school_id).eq("status", "published").order("published_at", { ascending: true }),
  ]);
  const reports = (submissions ?? []) as unknown as Published[];
  const learnerMap = new Map<string, { name: string; admission: string; grade: number; averages: number[] }>();
  const areaMap = new Map<string, { name: string; scores: number[] }>();
  const gradeMap = new Map<number, { reports: number; learners: number; averages: number[] }>();
  const assessmentRows = reports.map((report) => {
    const snapshot = report.snapshot;
    const grade = snapshot.class.grade_level;
    const gradeStats = gradeMap.get(grade) ?? { reports: 0, learners: 0, averages: [] };
    gradeStats.reports += 1;
    gradeStats.learners += snapshot.learners.length;
    const assessmentAverages = snapshot.learners.map((learner) => learner.average).filter((value): value is number => typeof value === "number");
    gradeStats.averages.push(...assessmentAverages);
    gradeMap.set(grade, gradeStats);

    for (const area of snapshot.learning_areas) {
      const entry = areaMap.get(area.id) ?? { name: area.name, scores: [] };
      for (const learner of snapshot.learners) {
        const score = learner.scores.find((item) => item.learning_area_id === area.id)?.score;
        if (typeof score === "number") entry.scores.push(score);
      }
      areaMap.set(area.id, entry);
    }
    for (const learner of snapshot.learners) {
      const existing = learnerMap.get(learner.id) ?? {
        name: learner.name, admission: learner.admission_number, grade, averages: [],
      };
      if (typeof learner.average === "number") existing.averages.push(learner.average);
      learnerMap.set(learner.id, existing);
    }
    return {
      id: report.id, title: snapshot.assessment.title, grade,
      className: snapshot.class.display_name, type: snapshot.assessment.assessment_type,
      learners: snapshot.learners.length,
      average: average(assessmentAverages),
      publishedAt: report.published_at,
    };
  });

  const allAssessmentAverages = assessmentRows.map((item) => item.average).filter((value): value is number => value !== null);
  const schoolAverage = average(allAssessmentAverages);
  const learnerRows = [...learnerMap.values()].map((learner) => ({
    ...learner, average: average(learner.averages), assessments: learner.averages.length,
  })).sort((a, b) => (b.average ?? -1) - (a.average ?? -1));
  const areaRows = [...areaMap.values()].map((area) => ({
    ...area, average: average(area.scores), entries: area.scores.length,
  })).sort((a, b) => (b.average ?? -1) - (a.average ?? -1));
  const gradeRows = [...gradeMap.entries()].map(([grade, item]) => ({
    grade, reports: item.reports, learners: item.learners, average: average(item.averages),
  })).sort((a, b) => a.grade - b.grade);

  return (
    <WorkspaceShell section="School reporting" title="School analytics" navigation={[
      { label: "Overview", href: "/workspace" },
      { label: "Assessments", href: "/workspace/assessments" },
      { label: "Learners", href: "/workspace/learners" },
      { label: "Teachers", href: "/workspace/teachers" },
      { label: "Analytics", href: "/workspace/analytics", active: true },
      { label: "Reports", href: "/workspace/reports" },
      { label: "Setup", href: "/workspace/settings" },
    ]} actions={<form action="/auth/signout" method="post"><button className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--muted)]">Sign out</button></form>}>
      <div className="mb-5">
        <p className="cbe-eyebrow">School performance · {school?.name ?? "School"}</p>
        <h1 className="mt-1 text-xl font-semibold text-[var(--ink-strong)]">Performance analytics</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">A consolidated view of approved and published assessment results across classes, learners and learning areas.</p>
      </div>
      {reportsError ? <p role="alert" className="mb-5 rounded-lg bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">Published assessment data could not be loaded. Refresh to try again.</p> : null}
      <div className="mb-5 overflow-x-auto rounded-lg border border-[var(--line)] bg-white">
        <table className="w-full min-w-[620px] border-collapse text-left"><tbody><tr>
          {[
            ["Published assessments", reports.length],
            ["Learners assessed", learnerRows.length],
            ["Learning areas", areaRows.length],
            ["Overall average", metric(schoolAverage)],
          ].map(([label, value]) => <td key={label} className="border-r border-[var(--line)] px-3 py-2.5 last:border-r-0"><p className="text-[10px] font-medium text-[var(--muted)]">{label}</p><p className="mt-0.5 text-lg font-semibold tabular-nums text-[var(--ink-strong)]">{value}</p></td>)}
        </tr></tbody></table>
      </div>

      {!reports.length ? <section className="mt-6 rounded-lg border border-[var(--line)] bg-white px-6 py-14 text-center"><h2 className="font-semibold text-[var(--ink-strong)]">No published results yet</h2><p className="mt-2 text-sm text-[var(--muted)]">Once assessments are reviewed, approved and published, their results will appear here.</p><Link href="/workspace/assessments" className="mt-4 inline-flex rounded-lg bg-[var(--brand)] px-4 py-2.5 text-xs font-semibold text-white">View assessments</Link></section> : <>
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <section className="overflow-hidden rounded-lg border border-[var(--line)] bg-white">
            <div className="border-b border-[var(--line)] px-3 py-2.5"><h2 className="text-sm font-semibold text-[var(--ink-strong)]">Learning-area performance</h2><p className="mt-0.5 text-[11px] text-[var(--muted)]">Average mark and recorded entries, out of 100</p></div>
            <div className="overflow-x-auto"><table className="w-full border-collapse text-left"><thead className="bg-[var(--surface-subtle)]"><tr><th className="px-3 py-2 text-[10px] font-semibold uppercase text-[var(--muted)]">Learning area</th><th className="px-3 py-2 text-right text-[10px] font-semibold uppercase text-[var(--muted)]">Marks</th><th className="px-3 py-2 text-right text-[10px] font-semibold uppercase text-[var(--muted)]">Average</th></tr></thead><tbody className="divide-y divide-[var(--line)]">{areaRows.map((area) => <tr key={area.name}><td className="px-3 py-2 text-xs font-medium text-[var(--ink-strong)]">{area.name}</td><td className="px-3 py-2 text-right text-xs tabular-nums text-[var(--muted)]">{area.entries}</td><td className="px-3 py-2 text-right text-xs font-semibold tabular-nums text-[var(--ink-strong)]">{metric(area.average)}</td></tr>)}</tbody></table></div>
          </section>
          <section className="overflow-hidden rounded-lg border border-[var(--line)] bg-white">
            <div className="border-b border-[var(--line)] px-3 py-2.5"><h2 className="font-semibold text-[var(--ink-strong)]">Performance by grade</h2><p className="mt-1 text-xs text-[var(--muted)]">Published assessment averages, grouped by grade</p></div>
            <div className="overflow-x-auto"><table className="w-full border-collapse text-left"><thead className="bg-[var(--surface-subtle)]"><tr>{["Grade","Reports","Learner entries","Average"].map((item)=><th key={item} className="px-3 py-2.5 text-xs font-semibold text-[var(--muted)]">{item}</th>)}</tr></thead><tbody className="divide-y divide-[var(--line)]">{gradeRows.map((row)=><tr key={row.grade}><td className="px-3 py-2.5 text-sm font-medium text-[var(--ink-strong)]">Grade {row.grade}</td><td className="px-3 py-2.5 text-sm tabular-nums text-[var(--ink)]">{row.reports}</td><td className="px-3 py-2.5 text-sm tabular-nums text-[var(--ink)]">{row.learners}</td><td className="px-3 py-2.5 text-sm font-semibold tabular-nums text-[var(--ink-strong)]">{metric(row.average)}</td></tr>)}</tbody></table></div>
          </section>
        </div>

        <section className="mt-6 overflow-hidden rounded-lg border border-[var(--line)] bg-white">
          <div className="border-b border-[var(--line)] px-3 py-2.5"><h2 className="font-semibold text-[var(--ink-strong)]">Learner performance across assessments</h2><p className="mt-1 text-xs text-[var(--muted)]">Average of each learner&apos;s published assessment averages; learners with no published result are not included.</p></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[620px] border-collapse text-left"><thead className="bg-[var(--surface-subtle)]"><tr>{["Position","Learner","Admission number","Assessments","Average"].map((item)=><th key={item} className="px-3 py-2.5 text-xs font-semibold text-[var(--muted)]">{item}</th>)}</tr></thead><tbody className="divide-y divide-[var(--line)]">{learnerRows.map((learner,index)=><tr key={learner.admission}><td className="px-3 py-2.5 text-xs tabular-nums text-[var(--muted)]">{index+1}</td><td className="px-3 py-2.5 text-sm font-medium text-[var(--ink-strong)]">{learner.name}</td><td className="px-3 py-2.5 text-xs tabular-nums text-[var(--muted)]">{learner.admission}</td><td className="px-3 py-2.5 text-sm tabular-nums text-[var(--ink)]">{learner.assessments}</td><td className="px-3 py-2.5 text-sm font-semibold tabular-nums text-[var(--ink-strong)]">{metric(learner.average)}</td></tr>)}</tbody></table></div>
        </section>

        <section className="mt-6 overflow-hidden rounded-lg border border-[var(--line)] bg-white">
          <div className="border-b border-[var(--line)] px-3 py-2.5"><h2 className="font-semibold text-[var(--ink-strong)]">Published assessment comparison</h2><p className="mt-1 text-xs text-[var(--muted)]">Open an individual report to inspect marks, averages and learner-level detail.</p></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[620px] border-collapse text-left"><thead className="bg-[var(--surface-subtle)]"><tr>{["Assessment","Grade / class","Type","Learners","Average",""].map((item)=><th key={item} className="px-3 py-2.5 text-xs font-semibold text-[var(--muted)]">{item}</th>)}</tr></thead><tbody className="divide-y divide-[var(--line)]">{assessmentRows.map((item)=><tr key={item.id}><td className="px-3 py-2.5 text-sm font-medium text-[var(--ink-strong)]">{item.title}</td><td className="px-3 py-2.5 text-xs text-[var(--muted)]">Grade {item.grade} · {item.className}</td><td className="px-3 py-2.5 text-xs capitalize text-[var(--muted)]">{item.type}</td><td className="px-3 py-2.5 text-sm tabular-nums text-[var(--ink)]">{item.learners}</td><td className="px-3 py-2.5 text-sm font-semibold tabular-nums text-[var(--ink-strong)]">{metric(item.average)}</td><td className="px-3 py-2.5 text-right"><Link href={`/workspace/reports/${item.id}`} className="text-xs font-semibold text-[var(--brand)]">View report →</Link></td></tr>)}</tbody></table></div>
        </section>
      </>}
      <p className="mt-5 text-xs text-[var(--muted)]">Analytics are calculated from immutable published assessment snapshots. Draft and unapproved marks are excluded.</p>
    </WorkspaceShell>
  );
}
