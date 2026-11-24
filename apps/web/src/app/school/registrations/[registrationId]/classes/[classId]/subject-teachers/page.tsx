"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiRequest, clearStoredCsrfToken } from "../../../../../../../lib/api";

type Teacher = { id: string; name: string; status: string; accountStatus: string };
type LearningArea = {
  id: string;
  curriculumVersionId: string;
  code: string;
  name: string;
  canonicalName: string;
  assignment: { id: string; membershipId: string; teacherName: string; startsAt: string } | null;
};
type SubjectRoster = { schoolClass: { id: string; grade: string; academicYear: number; streamCode: string }; learningAreas: LearningArea[] };

async function messageOf(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null) as { message?: string | string[] } | null;
  return Array.isArray(payload?.message) ? payload.message.join(" ") : payload?.message ?? fallback;
}

export default function SubjectTeachersPage() {
  const { registrationId, classId } = useParams<{ registrationId: string; classId: string }>();
  const router = useRouter();
  const [roster, setRoster] = useState<SubjectRoster | null>(null);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [learningAreaId, setLearningAreaId] = useState("");
  const [membershipId, setMembershipId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [endingId, setEndingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const [areasResponse, teachersResponse] = await Promise.all([
      apiRequest(`/school/registrations/${registrationId}/classes/${classId}/subject-teachers`),
      apiRequest(`/school/registrations/${registrationId}/teachers`),
    ]);
    if (areasResponse.status === 401 || teachersResponse.status === 401) { router.replace("/login"); return; }
    if (areasResponse.status === 403 || teachersResponse.status === 403) { router.replace("/workspace"); return; }
    if (!areasResponse.ok) throw new Error(await messageOf(areasResponse, "The curriculum learning areas could not be loaded."));
    if (!teachersResponse.ok) throw new Error(await messageOf(teachersResponse, "The school teacher directory could not be loaded."));
    const [areas, staff] = await Promise.all([areasResponse.json(), teachersResponse.json()]) as [SubjectRoster, { teachers: Teacher[] }];
    setRoster(areas);
    setTeachers(staff.teachers.filter((teacher) => teacher.status === "ACTIVE" && teacher.accountStatus === "ACTIVE"));
    setLearningAreaId((current) => current || areas.learningAreas.find((area) => !area.assignment)?.id || areas.learningAreas[0]?.id || "");
  }, [classId, registrationId, router]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => { void load().catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load subject assignments."); }).finally(() => { if (active) setLoading(false); }); });
    return () => { active = false; };
  }, [load]);

  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!learningAreaId || !membershipId) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await apiRequest(`/school/registrations/${registrationId}/classes/${classId}/subject-teachers`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId, councilGradeLearningAreaId: learningAreaId }),
      });
      if (!response.ok) throw new Error(await messageOf(response, "The Subject Teacher could not be assigned."));
      const result = await response.json() as { teacherName: string; learningAreaName: string };
      setNotice(`${result.teacherName} is now assigned to ${result.learningAreaName}.`);
      setMembershipId("");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The assignment could not be saved."); }
    finally { setSaving(false); }
  }

  async function endAssignment(assignmentId: string) {
    setEndingId(assignmentId); setError(""); setNotice("");
    try {
      const response = await apiRequest(`/school/registrations/${registrationId}/classes/${classId}/subject-teachers/${assignmentId}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await messageOf(response, "The Subject Teacher assignment could not be ended."));
      setNotice("Subject Teacher assignment ended. Its history remains available for audit.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The assignment could not be ended."); }
    finally { setEndingId(""); }
  }

  return <main className="min-h-screen bg-[#f6f7fb]">
    <header className="border-b border-[#e3e8f0] bg-white"><div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4 sm:px-8"><Link href="/workspace" className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#5368d5] text-xs font-bold text-white">S</span><span className="text-sm font-semibold text-[#17243a]">CBE · School workspace</span></Link><button onClick={async () => { await apiRequest("/auth/logout", { method: "POST" }); clearStoredCsrfToken(); router.replace("/login"); }} className="rounded-lg border border-[#d3dbe7] px-3 py-2 text-xs font-semibold text-[#52627a]">Sign out</button></div></header>
    <section className="mx-auto max-w-5xl px-5 py-9 sm:px-8 sm:py-12">
      <Link href={`/school/registrations/${registrationId}/classes`} className="text-xs font-semibold text-[#5e6b80] hover:text-[#5368d5]">← Back to classes</Link>
      <div className="mt-5"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#5368d5]">School administration</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#17243a]">Subject Teacher assignments.</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-[#5e6b80]">Assign an active school teacher to one learning area from the currently effective, published Council curriculum for this grade. Subject Teachers receive marks access only for their assigned learning area.</p>{roster ? <p className="mt-2 text-xs font-medium text-[#8a99ad]">{roster.schoolClass.grade.replace("GRADE_", "Grade ")} · {roster.schoolClass.academicYear} · Stream {roster.schoolClass.streamCode}</p> : null}</div>
      {error ? <p role="alert" className="mt-6 rounded-xl border border-[#f3d0d0] bg-[#fff7f7] px-4 py-3 text-sm text-[#a33b3b]">{error}</p> : null}
      {notice ? <p role="status" className="mt-6 rounded-xl border border-[#cfe9dd] bg-[#f2fbf6] px-4 py-3 text-sm text-[#287653]">{notice}</p> : null}
      {loading ? <div className="mt-8 rounded-2xl border border-[#e3e8f0] bg-white p-8 text-sm text-[#5e6b80]">Loading approved curriculum learning areas…</div> : <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-2xl border border-[#e3e8f0] bg-white p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><h2 className="text-base font-semibold text-[#17243a]">Learning-area assignments</h2><span className="rounded-full bg-[#eef0fc] px-3 py-1 text-xs font-semibold text-[#5368d5]">{roster?.learningAreas.length ?? 0} areas</span></div>
          {!roster?.learningAreas.length ? <div className="mt-6 rounded-xl border border-dashed border-[#ccd8e8] p-7 text-center"><p className="text-sm font-semibold text-[#17243a]">No assignable learning areas</p><p className="mt-2 text-xs leading-5 text-[#718096]">The Council must publish and enable the curriculum mappings for this grade before Subject Teachers can be assigned.</p></div> : <div className="mt-4 divide-y divide-[#edf1f6]">{roster.learningAreas.map((area) => <article key={area.id} className="flex flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center"><div><p className="text-sm font-semibold text-[#26364f]">{area.name}</p><p className="mt-1 text-[11px] text-[#8a99ad]">{area.code} · {area.canonicalName}</p>{area.assignment ? <p className="mt-2 text-xs font-medium text-[#287653]">Assigned to {area.assignment.teacherName}</p> : <p className="mt-2 text-xs text-[#8a99ad]">No Subject Teacher assigned</p>}</div>{area.assignment ? <button disabled={endingId === area.assignment.id} onClick={() => void endAssignment(area.assignment!.id)} className="w-fit rounded-lg border border-[#d3dbe7] px-3 py-2 text-xs font-semibold text-[#5e6b80] hover:bg-[#f6f7fb] disabled:opacity-50">{endingId === area.assignment.id ? "Ending…" : "End assignment"}</button> : <span className="w-fit rounded-full bg-[#f0f2f8] px-3 py-1 text-[10px] font-semibold text-[#5e6b80]">Unassigned</span>}</article>)}</div>}
        </section>
        <aside className="h-fit rounded-2xl border border-[#e3e8f0] bg-white p-5 sm:p-6"><h2 className="text-base font-semibold text-[#17243a]">Assign a Subject Teacher</h2><form onSubmit={assign} className="mt-5 space-y-4"><div><label htmlFor="learning-area" className="mb-2 block text-xs font-semibold text-[#52627a]">Learning area</label><select id="learning-area" required value={learningAreaId} onChange={(event) => setLearningAreaId(event.target.value)} className="w-full rounded-xl border border-[#d3dbe7] bg-white px-3 py-3 text-sm outline-none focus:border-[#6d94e8]"><option value="">Select learning area</option>{roster?.learningAreas.map((area) => <option key={area.id} value={area.id} disabled={Boolean(area.assignment)}>{area.name}{area.assignment ? " · Assigned" : ""}</option>)}</select></div><div><label htmlFor="teacher" className="mb-2 block text-xs font-semibold text-[#52627a]">Teacher</label><select id="teacher" required value={membershipId} onChange={(event) => setMembershipId(event.target.value)} className="w-full rounded-xl border border-[#d3dbe7] bg-white px-3 py-3 text-sm outline-none focus:border-[#6d94e8]"><option value="">Select an active teacher</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></div><button type="submit" disabled={saving || !learningAreaId || !membershipId || Boolean(roster?.learningAreas.find((area) => area.id === learningAreaId)?.assignment)} className="w-full rounded-xl bg-[#5368d5] px-4 py-3 text-sm font-semibold text-white hover:bg-[#4358c3] disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Assigning teacher…" : "Assign learning area"}</button></form><div className="mt-5 rounded-xl bg-[#f6f7fb] p-4"><p className="text-xs font-semibold text-[#52627a]">Access boundaries</p><ul className="mt-2 space-y-2 text-xs leading-5 text-[#718096]"><li>One active Subject Teacher per class learning area.</li><li>A teacher may hold multiple subject assignments.</li><li>Assignments do not grant access to other learning areas or class administration.</li><li>Ending an assignment preserves its audit history.</li></ul></div></aside>
      </div>}
    </section>
  </main>;
}
