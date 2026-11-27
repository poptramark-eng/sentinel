import Link from "next/link";

export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { WorkspaceShell } from "../../../components/workspace-shell";
import { createClient } from "../../../lib/supabase/server";
import { createAcademicYear, createClass, createLearningArea } from "./actions";

export default async function SchoolSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const supabase = await createClient();
  const { data: auth, error } = await supabase.auth.getClaims();
  if (error || !auth?.claims?.sub) redirect("/login");
  const { data: memberships } = await supabase.from("school_memberships").select("id,role").limit(1);
  const membership = memberships?.[0];
  if (!membership) redirect("/setup");
  if (membership.role !== "school_admin") redirect("/workspace");
  const [{ data: years }, { data: classes }, { data: areas }] = await Promise.all([
    supabase.from("academic_years").select("id,name,starts_on,ends_on,is_current").order("starts_on", { ascending: false }),
    supabase.from("classes").select("id,display_name,grade_level,stream,academic_year_id").order("grade_level"),
    supabase.from("learning_areas").select("id,code,name,grade_level").order("name"),
  ]);
  const params = await searchParams;
  return <WorkspaceShell section="School configuration" title="Setup" navigation={[
    { label: "Overview", href: "/workspace" }, { label: "Assessments", href: "/workspace/assessments" }, { label: "Learners", href: "/workspace/learners" }, { label: "Setup", href: "/workspace/settings", active: true },
  ]} actions={<form action="/auth/signout" method="post"><button className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--muted)]">Sign out</button></form>}>
    <div className="mb-6"><p className="cbe-eyebrow">Essential school records</p><h1 className="mt-2 text-2xl font-semibold text-[var(--ink-strong)]">School setup</h1><p className="mt-2 text-sm text-[var(--muted)]">Configure only the academic structure needed to run assessments.</p></div>
    {params.error ? <p role="alert" className="mb-4 rounded-lg bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">{params.error}</p> : null}
    {params.saved ? <p role="status" className="mb-4 rounded-lg bg-[var(--success-soft)] p-3 text-sm text-[var(--success)]">Your changes were saved.</p> : null}
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="rounded-xl border border-[var(--line)] bg-white p-5"><h2 className="font-semibold text-[var(--ink-strong)]">Academic years</h2><p className="mt-1 text-xs text-[var(--muted)]">Creating a year also creates Term 1, Term 2 and Term 3.</p><form action={createAcademicYear} className="mt-4 grid gap-3"><input name="name" required maxLength={80} placeholder="e.g. 2027" className="rounded-lg border border-[var(--line)] px-3 py-2.5 text-sm"/><div className="grid grid-cols-2 gap-3"><label className="text-xs text-[var(--muted)]">Starts<input name="starts_on" type="date" required className="mt-1 w-full rounded-lg border border-[var(--line)] px-2 py-2 text-sm text-[var(--ink)]"/></label><label className="text-xs text-[var(--muted)]">Ends<input name="ends_on" type="date" required className="mt-1 w-full rounded-lg border border-[var(--line)] px-2 py-2 text-sm text-[var(--ink)]"/></label></div><button className="rounded-lg bg-[var(--brand)] px-4 py-2.5 text-xs font-semibold text-white">Add academic year</button></form><ul className="mt-5 divide-y divide-[var(--line)]">{years?.map(y=><li key={y.id} className="flex justify-between gap-2 py-2 text-xs"><span className="font-medium text-[var(--ink)]">{y.name}{y.is_current?" · Current":""}</span><span className="text-[var(--muted)]">{y.starts_on} – {y.ends_on}</span></li>)}</ul></section>
      <section className="rounded-xl border border-[var(--line)] bg-white p-5"><h2 className="font-semibold text-[var(--ink-strong)]">Classes and streams</h2><form action={createClass} className="mt-4 grid gap-3"><select name="academic_year_id" required className="rounded-lg border border-[var(--line)] bg-white px-3 py-2.5 text-sm"><option value="">Academic year</option>{years?.map(y=><option key={y.id} value={y.id}>{y.name}</option>)}</select><div className="grid grid-cols-3 gap-2"><select name="grade_level" required className="rounded-lg border border-[var(--line)] bg-white px-2 py-2.5 text-sm"><option value="">Grade</option>{Array.from({length:9},(_,i)=>i+1).map(g=><option key={g} value={g}>{g}</option>)}</select><input name="stream" maxLength={20} defaultValue="A" placeholder="Stream" className="rounded-lg border border-[var(--line)] px-3 py-2.5 text-sm"/><input name="display_name" required maxLength={80} placeholder="Class name" className="rounded-lg border border-[var(--line)] px-3 py-2.5 text-sm"/></div><button disabled={!years?.length} className="rounded-lg bg-[var(--brand)] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50">Add class</button></form><ul className="mt-5 divide-y divide-[var(--line)]">{classes?.map(c=><li key={c.id} className="py-2 text-xs text-[var(--ink)]">Grade {c.grade_level} · {c.display_name} <span className="text-[var(--muted)]">({c.stream})</span></li>)}</ul></section>
      <section className="rounded-xl border border-[var(--line)] bg-white p-5 xl:col-span-2"><h2 className="font-semibold text-[var(--ink-strong)]">Learning areas</h2><p className="mt-1 text-xs text-[var(--muted)]">Leave grade blank when an area applies across grades.</p><form action={createLearningArea} className="mt-4 grid gap-3 sm:grid-cols-[1fr_2fr_1fr_auto]"><input name="code" required maxLength={30} placeholder="Code e.g. ENG" className="rounded-lg border border-[var(--line)] px-3 py-2.5 text-sm"/><input name="name" required maxLength={120} placeholder="Learning area name" className="rounded-lg border border-[var(--line)] px-3 py-2.5 text-sm"/><select name="grade_level" className="rounded-lg border border-[var(--line)] bg-white px-3 py-2.5 text-sm"><option value="">All grades</option>{Array.from({length:9},(_,i)=>i+1).map(g=><option key={g} value={g}>Grade {g}</option>)}</select><button className="rounded-lg bg-[var(--brand)] px-4 py-2.5 text-xs font-semibold text-white">Add area</button></form><div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{areas?.map(a=><div key={a.id} className="rounded-lg border border-[var(--line)] px-3 py-2.5 text-xs"><span className="font-semibold text-[var(--ink)]">{a.name}</span><span className="ml-2 text-[var(--muted)]">{a.code} · {a.grade_level ? "Grade " + a.grade_level : "All grades"}</span></div>)}</div></section>
    </div>
    <div className="mt-6"><Link href="/workspace/learners" className="text-sm font-semibold text-[var(--brand)]">Continue to learner records →</Link></div>
  </WorkspaceShell>;
}
