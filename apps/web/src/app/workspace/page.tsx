import Link from "next/link";
import { redirect } from "next/navigation";
import { WorkspaceShell } from "../../components/workspace-shell";
import { SignOutButton } from "../../components/sign-out-button";
import { createClient } from "../../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return <main className="mx-auto max-w-2xl p-8"><h1 className="text-2xl font-semibold">Connect your school workspace</h1><p className="mt-3 text-sm leading-6 text-[var(--muted)]">Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to the web deployment environment, then redeploy.</p></main>;
  }

  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login");
  const userId = claims.claims.sub as string;

  const { data: membership, error: membershipError } = await supabase
    .from("school_memberships")
    .select("school_id, role")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (membershipError || !membership) redirect("/setup");

  const schoolId = membership.school_id;
  const [{ data: school }, { data: year }, classesCount, learnersCount, assessmentsCount, areasCount] = await Promise.all([
    supabase.from("schools").select("name, county, sub_county").eq("id", schoolId).single(),
    supabase.from("academic_years").select("id, name").eq("school_id", schoolId).eq("is_current", true).maybeSingle(),
    supabase.from("classes").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
    supabase.from("learners").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
    supabase.from("assessments").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
    supabase.from("learning_areas").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
  ]);

  const metrics = [
    { label: "Learners", value: learnersCount.count ?? 0, href: "/learners", note: "Enrolled learner records" },
    { label: "Classes", value: classesCount.count ?? 0, href: "/classes", note: "Current class groups" },
    { label: "Assessments", value: assessmentsCount.count ?? 0, href: "/assessments", note: "School assessments" },
    { label: "Learning areas", value: areasCount.count ?? 0, href: "/school/learning-areas", note: "Configured learning areas" },
  ];

  const navigation = [
    { label: "Overview", href: "/workspace", active: true },
    { label: "Learners", href: "/learners" },
    { label: "Classes", href: "/classes" },
    { label: "Assessments", href: "/assessments" },
    { label: "Learning areas", href: "/school/learning-areas" },
    { label: "School settings", href: "/school/settings" },
  ];

  const setupTasks = [
    { title: "Set up the academic year", description: "Add the school year and its terms.", done: Boolean(year), href: "/school/academic-years" },
    { title: "Create your classes", description: "Set up Grades 1–9 and streams.", done: (classesCount.count ?? 0) > 0, href: "/classes" },
    { title: "Add learning areas", description: "Configure the learning areas offered by the school.", done: (areasCount.count ?? 0) > 0, href: "/school/learning-areas" },
    { title: "Register learners", description: "Import or add the learners in each class.", done: (learnersCount.count ?? 0) > 0, href: "/learners" },
  ];

  return (
    <WorkspaceShell section="School workspace" title="Overview" navigation={navigation} actions={<SignOutButton />}>
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div><p className="cbe-eyebrow">School overview</p><h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--ink-strong)] sm:text-3xl">{school?.name ?? "Your school"}</h1><p className="mt-2 text-sm text-[var(--muted)]">{[school?.sub_county, school?.county].filter(Boolean).join(" · ") || "School profile"} · {year?.name ?? "Academic year not set"}</p></div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--line)] bg-white px-3 py-2 text-xs font-semibold capitalize text-[var(--muted)]"><span className="size-2 rounded-full bg-emerald-500" />{String(membership.role).replaceAll("_", " ")}</span>
      </div>

      <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => <Link key={metric.label} href={metric.href} className="cbe-panel p-5 transition hover:-translate-y-0.5 hover:border-[var(--brand-border)]">
          <p className="text-sm font-medium text-[var(--muted)]">{metric.label}</p><p className="mt-3 text-3xl font-semibold tracking-tight text-[var(--ink-strong)] tabular-nums">{metric.value.toLocaleString()}</p><p className="mt-1 text-xs text-[var(--subtle)]">{metric.note}</p>
        </Link>)}
      </section>

      <section className="mt-8 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="cbe-panel p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3"><div><p className="cbe-eyebrow">Getting started</p><h2 className="mt-2 text-lg font-semibold text-[var(--ink-strong)]">Prepare your school workspace</h2><p className="mt-1 text-sm text-[var(--muted)]">Complete these foundations before recording assessment results.</p></div><span className="rounded-lg bg-[var(--brand-soft)] px-2.5 py-1.5 text-xs font-semibold text-[var(--brand-strong)]">{setupTasks.filter(t=>t.done).length}/{setupTasks.length}</span></div>
          <div className="mt-5 space-y-2">
            {setupTasks.map((task,index)=><Link key={task.title} href={task.href} className="flex items-center gap-3 rounded-xl border border-[var(--line)] p-3 transition hover:bg-[var(--surface-subtle)]">
              <span className={task.done ? "grid size-8 shrink-0 place-items-center rounded-full bg-[var(--success-soft)] text-sm font-bold text-[var(--success)]" : "grid size-8 shrink-0 place-items-center rounded-full bg-[var(--surface-subtle)] text-xs font-semibold text-[var(--muted)]"}>{task.done ? "✓" : index+1}</span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-[var(--ink)]">{task.title}</span><span className="mt-0.5 block text-xs text-[var(--muted)]">{task.description}</span></span>
              <span className="text-sm text-[var(--subtle)]">→</span>
            </Link>)}
          </div>
        </div>

        <div className="cbe-panel p-5 sm:p-6">
          <p className="cbe-eyebrow">Quick actions</p><h2 className="mt-2 text-lg font-semibold text-[var(--ink-strong)]">Keep work moving</h2><p className="mt-1 text-sm leading-6 text-[var(--muted)]">Shortcuts to the tasks school teams return to most often.</p>
          <div className="mt-5 grid gap-2">
            <Link href="/learners" className="cbe-button cbe-button-primary w-full justify-between">Add or review learners <span>→</span></Link>
            <Link href="/classes" className="cbe-button cbe-button-secondary w-full justify-between">Manage classes <span>→</span></Link>
            <Link href="/assessments" className="cbe-button cbe-button-secondary w-full justify-between">Create an assessment <span>→</span></Link>
          </div>
          <div className="mt-6 rounded-xl bg-[var(--surface-subtle)] p-4"><p className="text-xs font-semibold text-[var(--ink)]">Designed for focused school operations</p><p className="mt-1 text-xs leading-5 text-[var(--muted)]">One school workspace now, with explicit school ownership in the data model so broader deployment can be introduced deliberately later.</p></div>
        </div>
      </section>
    </WorkspaceShell>
  );
}
