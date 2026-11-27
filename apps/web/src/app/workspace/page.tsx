import Link from "next/link";

export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { WorkspaceShell } from "../../components/workspace-shell";
import { createClient } from "../../lib/supabase/server";

export default async function WorkspacePage() {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getClaims();
  if (authError || !auth?.claims?.sub) redirect("/login");

  const [{ data: profile }, { data: memberships }, { count: classCount }, { count: learnerCount }, { count: assessmentCount }, { data: recent }] = await Promise.all([
    supabase.from("profiles").select("display_name,email").eq("id", auth.claims.sub).maybeSingle(),
    supabase.from("school_memberships").select("id,role,status,school_id").limit(1),
    supabase.from("classes").select("id", { count: "exact", head: true }),
    supabase.from("learners").select("id", { count: "exact", head: true }),
    supabase.from("assessments").select("id", { count: "exact", head: true }),
    supabase.from("assessments").select("id,title,assessment_type,status,assessment_date,created_at").order("created_at", { ascending: false }).limit(5),
  ]);
  const membership = memberships?.[0];
  if (!membership) redirect("/setup");
  const { data: school } = await supabase.from("schools").select("name,county,sub_county").eq("id", membership.school_id).maybeSingle();
  const name = profile?.display_name || profile?.email || "School administrator";
  const isAdmin = membership.role === "school_admin";

  return <WorkspaceShell section="School assessment workspace" title="Overview" navigation={[
    { label: "Overview", href: "/workspace", active: true }, { label: "Assessments", href: "/workspace/assessments" }, { label: "Learners", href: "/workspace/learners" }, ...(isAdmin ? [{ label: "Setup", href: "/workspace/settings" }] : []),
  ]} actions={<form action="/auth/signout" method="post"><button className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--surface-subtle)]">Sign out</button></form>}>
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><p className="cbe-eyebrow">School overview</p><h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--ink-strong)] sm:text-3xl">{school?.name ?? "Your school"}</h1><p className="mt-2 text-sm text-[var(--muted)]">Welcome, {name}. {membership.role.replaceAll("_"," ")}.</p></div>{isAdmin ? <Link href="/workspace/assessments/new" className="rounded-lg bg-[var(--brand)] px-4 py-3 text-sm font-semibold text-white hover:bg-[var(--brand-strong)]">Create assessment <span aria-hidden="true">→</span></Link> : null}</div>
    <div className="grid gap-4 sm:grid-cols-3">{[["Classes",classCount??0],["Learners",learnerCount??0],["Assessments",assessmentCount??0]].map(([label,value])=><article key={label} className="rounded-xl border border-[var(--line)] bg-white p-5"><p className="text-xs font-medium text-[var(--muted)]">{label}</p><p className="mt-3 text-3xl font-semibold tabular-nums text-[var(--ink-strong)]">{value}</p></article>)}</div>
    <section className="mt-8 rounded-xl border border-[var(--line)] bg-white"><div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4"><div><h2 className="font-semibold text-[var(--ink-strong)]">Recent assessments</h2><p className="mt-1 text-xs text-[var(--muted)]">Your latest assessment activity</p></div><Link href="/workspace/assessments" className="text-xs font-semibold text-[var(--brand)]">View all</Link></div>
      {recent?.length ? <div className="divide-y divide-[var(--line)]">{recent.map(item=><Link key={item.id} href={`/workspace/assessments/${item.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition hover:bg-[var(--surface-subtle)]"><span><span className="block text-sm font-semibold text-[var(--ink-strong)]">{item.title}</span><span className="mt-1 block text-xs capitalize text-[var(--muted)]">{item.assessment_type} · {item.assessment_date??"Date not set"}</span></span><span className="rounded-full bg-[var(--surface-subtle)] px-3 py-1 text-xs text-[var(--muted)]">{item.status}</span></Link>)}</div> : <div className="px-5 py-12 text-center"><p className="text-sm font-medium text-[var(--ink-strong)]">No assessments yet</p><p className="mt-2 text-xs text-[var(--muted)]">Create the first assessment to begin recording learner progress.</p>{isAdmin ? <Link href="/workspace/assessments/new" className="mt-4 inline-flex rounded-lg bg-[var(--brand)] px-4 py-2.5 text-xs font-semibold text-white">Create first assessment</Link> : null}</div>}
    </section>
  </WorkspaceShell>;
}
