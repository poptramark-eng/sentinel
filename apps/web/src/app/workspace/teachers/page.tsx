import Link from "next/link";
import { redirect } from "next/navigation";
import { WorkspaceShell } from "../../../components/workspace-shell";
import { createClient } from "../../../lib/supabase/server";
import { assignTeacher } from "./actions";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ error?: string; saved?: string }> };

export default async function TeachersPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getClaims();
  if (authError || !auth?.claims?.sub) redirect("/login");
  const { data: memberships } = await supabase.from("school_memberships").select("id, role").limit(1);
  const membership = memberships?.[0];
  if (!membership) redirect("/setup");
  if (membership.role !== "school_admin") redirect("/workspace");

  const [{ data: classes }, { data: areas }, { data: assignments }] = await Promise.all([
    supabase.from("classes").select("id, display_name, grade_level").eq("is_active", true).order("grade_level").order("display_name"),
    supabase.from("learning_areas").select("id, name, grade_level").eq("is_active", true).order("name"),
    supabase.from("teacher_assignments").select("id, teacher_id, class_id, learning_area_id, assignment_role, created_at, classes(display_name, grade_level), learning_areas(name)").order("created_at", { ascending: false }),
  ]);

  const teacherIds = [...new Set((assignments ?? []).map((item) => item.teacher_id))];
  const { data: profiles } = teacherIds.length
    ? await supabase.from("profiles").select("id, display_name, email").in("id", teacherIds)
    : { data: [] };
  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const params = await searchParams;

  return (
    <WorkspaceShell
      section="School configuration"
      title="Teacher assignments"
      navigation={[
        { label: "Overview", href: "/workspace" },
        { label: "Assessments", href: "/workspace/assessments" },
        { label: "Learners", href: "/workspace/learners" },
        { label: "Teachers", href: "/workspace/teachers", active: true },
        { label: "Setup", href: "/workspace/settings" },
      ]}
      actions={<form action="/auth/signout" method="post"><button className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--muted)]">Sign out</button></form>}
    >
      <div className="mb-6">
        <p className="cbe-eyebrow">Staff and responsibilities</p>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--ink-strong)]">Teacher assignments</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">Assign an existing verified account to a class, then scope subject teachers to the learning areas they teach.</p>
      </div>
      {params.error ? <p role="alert" className="mb-4 rounded-lg bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">{params.error}</p> : null}
      {params.saved ? <p role="status" className="mb-4 rounded-lg bg-[var(--success-soft)] p-3 text-sm text-[var(--success)]">Teacher assignment saved.</p> : null}

      <section className="mb-7 rounded-xl border border-[var(--line)] bg-white p-5 sm:p-6">
        <h2 className="font-semibold text-[var(--ink-strong)]">Assign a teacher</h2>
        <p className="mt-1 text-xs leading-5 text-[var(--muted)]">The teacher must already have a verified Supabase Auth account. Create accounts in Supabase Dashboard → Authentication → Users first. This release does not send invitations or messages.</p>
        <form action={assignTeacher} className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className="block xl:col-span-2">
            <span className="mb-2 block text-xs font-semibold text-[var(--muted)]">Teacher account email *</span>
            <input name="email" type="email" required maxLength={254} autoComplete="off" placeholder="teacher@school.example" className="w-full rounded-lg border border-[var(--line)] px-3 py-3 text-sm" />
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-[var(--muted)]">Class / stream *</span>
            <select name="class_id" required className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-3 text-sm">
              <option value="">Choose class</option>
              {classes?.map((item) => <option key={item.id} value={item.id}>Grade {item.grade_level} · {item.display_name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-[var(--muted)]">Assignment type *</span>
            <select name="assignment_role" required defaultValue="subject_teacher" className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-3 text-sm">
              <option value="subject_teacher">Subject teacher</option>
              <option value="class_teacher">Class teacher</option>
            </select>
          </label>
          <label className="block sm:col-span-2 xl:col-span-3">
            <span className="mb-2 block text-xs font-semibold text-[var(--muted)]">Learning area</span>
            <select name="learning_area_id" defaultValue="" className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-3 text-sm">
              <option value="">No learning area (class teacher only)</option>
              {areas?.map((item) => <option key={item.id} value={item.id}>{item.name}{item.grade_level ? ` · Grade ${item.grade_level}` : " · All grades"}</option>)}
            </select>
            <span className="mt-1 block text-[11px] text-[var(--muted)]">Required for subject teachers; leave blank for class teachers.</span>
          </label>
          <div className="flex items-end"><button disabled={!classes?.length} className="w-full rounded-lg bg-[var(--brand)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">Save assignment</button></div>
        </form>
      </section>

      <section className="overflow-hidden rounded-xl border border-[var(--line)] bg-white">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
          <div><h2 className="font-semibold text-[var(--ink-strong)]">Current assignments</h2><p className="mt-1 text-xs text-[var(--muted)]">{assignments?.length ?? 0} class and subject assignments</p></div>
        </div>
        <div className="grid grid-cols-[1fr_1fr_150px] gap-3 border-b border-[var(--line)] bg-[var(--surface-subtle)] px-5 py-3 text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]"><span>Teacher</span><span>Class</span><span>Responsibility</span></div>
        {assignments?.length ? assignments.map((item) => {
          const profile = profileById.get(item.teacher_id);
          const classRow = Array.isArray(item.classes) ? item.classes[0] : item.classes;
          const areaRow = Array.isArray(item.learning_areas) ? item.learning_areas[0] : item.learning_areas;
          return (
            <div key={item.id} className="grid grid-cols-[1fr_1fr_150px] gap-3 border-b border-[var(--line)] px-5 py-4 last:border-0">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--ink-strong)]">{profile?.display_name || profile?.email || "Teacher account"}</p>
                <p className="mt-1 truncate text-xs text-[var(--muted)]">{profile?.email || "Account email unavailable"}</p>
              </div>
              <p className="text-sm text-[var(--ink)]">Grade {classRow?.grade_level} · {classRow?.display_name}</p>
              <div><p className="text-xs font-semibold capitalize text-[var(--ink)]">{item.assignment_role.replace("_", " ")}</p>{areaRow?.name ? <p className="mt-1 text-xs text-[var(--muted)]">{areaRow.name}</p> : null}</div>
            </div>
          );
        }) : <p className="px-5 py-12 text-center text-sm text-[var(--muted)]">No teacher assignments yet. Add a teacher to a class to begin.</p>}
      </section>
    </WorkspaceShell>
  );
}
