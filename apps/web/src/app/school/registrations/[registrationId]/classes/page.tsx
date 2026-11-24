"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiRequest, clearStoredCsrfToken } from "../../../../../lib/api";
import { WorkspaceShell } from "../../../../../components/workspace-shell";

type Grade = "GRADE_1" | "GRADE_2" | "GRADE_3" | "GRADE_4" | "GRADE_5" | "GRADE_6" | "GRADE_7" | "GRADE_8" | "GRADE_9";
interface Teacher { id: string; name: string; status: string; accountStatus: string }
interface ClassTeacher { assignmentId: string; membershipId: string; name: string; startsAt: string }
interface SchoolClass { id: string; grade: Grade; academicYear: number; streamCode: string; displayName: string | null; status: string; classTeacher: ClassTeacher | null }
interface ClassesResponse { school: { name: string }; council: { name: string }; classes: SchoolClass[] }
interface TeachersResponse { teachers: Teacher[] }

const grades: Grade[] = ["GRADE_1", "GRADE_2", "GRADE_3", "GRADE_4", "GRADE_5", "GRADE_6", "GRADE_7", "GRADE_8", "GRADE_9"];
const gradeLabel = (grade: Grade) => grade.replace("GRADE_", "Grade ");

async function responseMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as { message?: string | string[] } | null;
  return Array.isArray(body?.message) ? body.message.join(" ") : body?.message ?? fallback;
}

export default function SchoolClassesPage() {
  const params = useParams<{ registrationId: string }>();
  const registrationId = params.registrationId;
  const router = useRouter();
  const [data, setData] = useState<ClassesResponse | null>(null);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [grade, setGrade] = useState<Grade>("GRADE_1");
  const [academicYear, setAcademicYear] = useState(String(new Date().getFullYear()));
  const [streamCode, setStreamCode] = useState("MAIN");
  const [displayName, setDisplayName] = useState("");
  const [teacherSelection, setTeacherSelection] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyClass, setBusyClass] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const [classesResponse, teachersResponse] = await Promise.all([
      apiRequest(`/school/registrations/${registrationId}/classes`),
      apiRequest(`/school/registrations/${registrationId}/teachers`),
    ]);
    if (classesResponse.status === 401 || teachersResponse.status === 401) { router.replace("/login"); return; }
    if (classesResponse.status === 403 || teachersResponse.status === 403) { router.replace("/workspace"); return; }
    if (!classesResponse.ok) throw new Error(await responseMessage(classesResponse, "Classes could not be loaded."));
    if (!teachersResponse.ok) throw new Error(await responseMessage(teachersResponse, "Teacher directory could not be loaded."));
    const [classesPayload, teachersPayload] = await Promise.all([classesResponse.json(), teachersResponse.json()]) as [ClassesResponse, TeachersResponse];
    setData(classesPayload);
    setTeachers(teachersPayload.teachers.filter((teacher) => teacher.status === "ACTIVE" && teacher.accountStatus === "ACTIVE"));
  }, [registrationId, router]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      void load().catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load school classes."); })
        .finally(() => { if (active) setLoading(false); });
    });
    return () => { active = false; };
  }, [load]);

  const classes = useMemo(() => data?.classes ?? [], [data]);

  async function createClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const response = await apiRequest(`/school/registrations/${registrationId}/classes`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grade, academicYear: Number(academicYear), streamCode: streamCode.trim() || "MAIN", displayName: displayName.trim() || undefined }),
      });
      if (!response.ok) throw new Error(await responseMessage(response, "The class could not be created."));
      setDisplayName(""); setNotice(`${gradeLabel(grade)} · ${streamCode.trim().toUpperCase() || "MAIN"} has been added.`);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The class could not be created."); }
    finally { setSaving(false); }
  }

  async function assignTeacher(classId: string) {
    const membershipId = teacherSelection[classId];
    if (!membershipId) return;
    setBusyClass(classId); setError(""); setNotice("");
    try {
      const response = await apiRequest(`/school/registrations/${registrationId}/classes/${classId}/class-teacher`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ membershipId }),
      });
      if (!response.ok) throw new Error(await responseMessage(response, "The Class Teacher could not be assigned."));
      setNotice("Class Teacher assigned. They can now coordinate this class and access its assigned learner roster through the teaching workspace.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The assignment could not be saved."); }
    finally { setBusyClass(""); }
  }

  async function endTeacher(classId: string) {
    setBusyClass(classId); setError(""); setNotice("");
    try {
      const response = await apiRequest(`/school/registrations/${registrationId}/classes/${classId}/class-teacher`, { method: "DELETE" });
      if (!response.ok) throw new Error(await responseMessage(response, "The assignment could not be ended."));
      setNotice("Class Teacher assignment ended. The assignment history is retained.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The assignment could not be ended."); }
    finally { setBusyClass(""); }
  }

  async function signOut() {
    await apiRequest("/auth/logout", { method: "POST" }); clearStoredCsrfToken(); router.replace("/login");
  }

  return <WorkspaceShell section="School workspace" title="Classes and streams" navigation={[{ label: "Workspace overview", href: "/workspace" }, { label: "Teaching desk", href: "/school/teaching" }, { label: "Classes", href: "#classes", active: true }, { label: "Assessments", href: `/school/registrations/${registrationId}/assessments` }]} actions={<><Link href={`/school/registrations/${registrationId}/assessments`} className="cbe-button cbe-button-secondary">Assessment submissions</Link><Link href={`/school/registrations/${registrationId}/teachers`} className="cbe-button cbe-button-secondary">Teachers</Link><button type="button" onClick={() => void signOut()} className="cbe-button cbe-button-secondary">Sign out</button></>}>
    
    <div className="mx-auto max-w-6xl px-5 py-9 sm:px-8 sm:py-12">
      <Link href="/workspace" className="text-xs font-semibold text-[var(--muted)] hover:text-[var(--brand)]">← Back to workspace</Link>
      <div className="mt-5 max-w-3xl"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand)]">School administration</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[var(--ink-strong)] sm:text-4xl">Classes and streams.</h1><p className="mt-3 text-sm leading-7 text-[var(--muted)]">Set up the school&apos;s grade and stream structure, then assign one Class Teacher to each class. Class Teacher is a class-scoped assignment, not a global role. It grants class-coordination and assigned-roster access; marks entry remains restricted to Subject Teacher assignments.</p>{data ? <p className="mt-2 text-xs font-medium text-[var(--subtle)]">{data.school.name} · {data.council.name}</p> : null}</div>
      {error ? <p role="alert" className="mt-6 rounded-xl border border-[var(--danger-border,var(--danger-soft))] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">{error}</p> : null}
      {notice ? <p role="status" className="mt-6 rounded-xl border border-[var(--success-soft)] bg-[var(--success-soft)] px-4 py-3 text-sm text-[var(--success)]">{notice}</p> : null}
      {loading ? <div className="mt-8 rounded-2xl border border-[var(--line)] bg-white p-6 text-sm text-[var(--muted)]">Loading classes and teacher memberships…</div> : <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-2xl border border-[var(--line)] bg-white p-6 sm:p-7"><div className="flex items-center justify-between gap-3"><div><h2 className="text-base font-semibold text-[var(--ink-strong)]">Class directory</h2><p className="mt-1 text-xs text-[var(--muted)]">{classes.length} class{classes.length === 1 ? "" : "es"} configured</p></div><span className="rounded-full bg-[var(--brand-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--brand)]">Grades 1–9</span></div>
          {classes.length === 0 ? <div className="mt-6 rounded-xl border border-dashed border-[var(--line-strong)] p-8 text-center"><p className="text-sm font-semibold text-[var(--ink-strong)]">No classes yet</p><p className="mt-2 text-xs leading-5 text-[var(--muted)]">Create the school&apos;s first class using the form beside this directory.</p></div> : <div className="mt-5 space-y-3">{classes.map((schoolClass) => <article key={schoolClass.id} className="rounded-xl border border-[var(--line)] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold text-[var(--ink)]">{schoolClass.displayName || `${gradeLabel(schoolClass.grade)} · ${schoolClass.streamCode}`}</p><p className="mt-1 text-xs text-[var(--subtle)]">{gradeLabel(schoolClass.grade)} · {schoolClass.academicYear} · Stream {schoolClass.streamCode}</p></div><span className="rounded-full bg-[var(--success-soft)] px-3 py-1 text-[11px] font-semibold text-[var(--success)]">{schoolClass.status}</span></div>
            <div className="mt-4 border-t border-[var(--line)] pt-4">{schoolClass.classTeacher ? <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--subtle)]">Class Teacher</p><p className="mt-1 text-sm font-semibold text-[var(--ink)]">{schoolClass.classTeacher.name}</p></div><button disabled={busyClass === schoolClass.id} onClick={() => void endTeacher(schoolClass.id)} className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--surface-subtle)] disabled:opacity-50">{busyClass === schoolClass.id ? "Saving…" : "End assignment"}</button></div> : <div className="flex flex-col gap-2 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--subtle)]">Assign Class Teacher</label><select value={teacherSelection[schoolClass.id] ?? ""} onChange={(event) => setTeacherSelection((current) => ({ ...current, [schoolClass.id]: event.target.value }))} className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2.5 text-xs outline-none focus:border-[var(--brand)]"><option value="">Select an active teacher</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></div><button disabled={busyClass === schoolClass.id || !teacherSelection[schoolClass.id]} onClick={() => void assignTeacher(schoolClass.id)} className="rounded-lg bg-[var(--brand)] px-3 py-2.5 text-xs font-semibold text-white hover:bg-[var(--brand-strong)] disabled:opacity-50">{busyClass === schoolClass.id ? "Saving…" : "Assign"}</button></div>}</div><div className="mt-4 flex flex-wrap justify-end gap-4"><Link href={`/school/registrations/${registrationId}/classes/${schoolClass.id}/learners`} className="text-xs font-semibold text-[var(--brand)] hover:text-[var(--brand-strong)]">Manage learners →</Link><Link href={`/school/registrations/${registrationId}/classes/${schoolClass.id}/subject-teachers`} className="text-xs font-semibold text-[var(--brand)] hover:text-[var(--brand-strong)]">Subject Teachers →</Link></div>
          </article>)}</div>}
        </section>
        <aside className="h-fit rounded-2xl border border-[var(--line)] bg-white p-6"><h2 className="text-base font-semibold text-[var(--ink-strong)]">Create a class</h2><p className="mt-2 text-xs leading-5 text-[var(--muted)]">A class belongs to one approved school registration and academic year. Use a short stream code such as A, B, EAST or MAIN.</p><form onSubmit={createClass} className="mt-5 space-y-4"><div><label htmlFor="grade" className="mb-2 block text-xs font-semibold text-[var(--ink)]">Grade</label><select id="grade" value={grade} onChange={(event) => setGrade(event.target.value as Grade)} className="w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-sm outline-none focus:border-[var(--brand)]">{grades.map((item) => <option key={item} value={item}>{gradeLabel(item)}</option>)}</select></div><div><label htmlFor="year" className="mb-2 block text-xs font-semibold text-[var(--ink)]">Academic year</label><input id="year" type="number" min="2000" max="2100" required value={academicYear} onChange={(event) => setAcademicYear(event.target.value)} className="w-full rounded-xl border border-[var(--line)] px-3 py-3 text-sm outline-none focus:border-[var(--brand)]" /></div><div><label htmlFor="stream" className="mb-2 block text-xs font-semibold text-[var(--ink)]">Stream code</label><input id="stream" maxLength={20} value={streamCode} onChange={(event) => setStreamCode(event.target.value.toUpperCase())} placeholder="MAIN" className="w-full rounded-xl border border-[var(--line)] px-3 py-3 text-sm outline-none focus:border-[var(--brand)]" /><p className="mt-1 text-[11px] text-[var(--subtle)]">Use MAIN if the grade has no streams.</p></div><div><label htmlFor="className" className="mb-2 block text-xs font-semibold text-[var(--ink)]">Display name <span className="font-normal text-[var(--subtle)]">(optional)</span></label><input id="className" maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="e.g. Grade 4 East" className="w-full rounded-xl border border-[var(--line)] px-3 py-3 text-sm outline-none focus:border-[var(--brand)]" /></div><button type="submit" disabled={saving || !academicYear} className="w-full rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-semibold text-white hover:bg-[var(--brand-strong)] disabled:opacity-50">{saving ? "Creating class…" : "Create class"}</button></form>
          <div className="mt-5 rounded-xl bg-[var(--surface-subtle)] p-4"><p className="text-xs font-semibold text-[var(--ink)]">Assignment boundaries</p><p className="mt-2 text-xs leading-5 text-[var(--muted)]">The Class Teacher coordinates this class and can access its roster. Marks entry is granted only through explicit Subject Teacher learning-area assignments.</p></div>
        </aside>
      </div>}
    </div>
  </WorkspaceShell>;
}
