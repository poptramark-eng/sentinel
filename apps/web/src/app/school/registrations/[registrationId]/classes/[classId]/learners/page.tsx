"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiRequest } from "../../../../../../../lib/api";
import { WorkspaceShell } from "../../../../../../../components/workspace-shell";
import { LearnerCsvImport } from "./learner-csv-import";

interface LearnerRow { enrollmentId: string; learnerId: string; learnerNumber: string; name: string; admissionNumber: string | null; enrolledAt: string }
interface RosterResponse { school: { name: string }; class: { id: string; grade: string; academicYear: number; streamCode: string; displayName: string | null }; accessRole: "SCHOOL_ADMINISTRATOR" | "TEACHER"; learners: LearnerRow[] }
interface SearchResult { id: string; learnerNumber: string; name: string; alreadyEnrolledAtThisSchool: boolean; hasActiveEnrollment: boolean }

async function messageOf(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null) as { message?: string | string[] } | null;
  return Array.isArray(payload?.message) ? payload.message.join(" ") : payload?.message ?? fallback;
}

export default function ClassLearnersPage() {
  const { registrationId, classId } = useParams<{ registrationId: string; classId: string }>();
  const router = useRouter();
  const [data, setData] = useState<RosterResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [givenName, setGivenName] = useState("");
  const [otherNames, setOtherNames] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [admissionNumber, setAdmissionNumber] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedLearnerId, setSelectedLearnerId] = useState("");
  const [endingId, setEndingId] = useState("");
  const [endStatus, setEndStatus] = useState<"TRANSFERRED" | "WITHDRAWN" | "COMPLETED">("TRANSFERRED");
  const [endReason, setEndReason] = useState("");
  const [ending, setEnding] = useState(false);

  const load = useCallback(async () => {
    const response = await apiRequest(`/school/registrations/${registrationId}/classes/${classId}/learners`);
    if (response.status === 401) { router.replace("/login"); return; }
    if (response.status === 403) { router.replace("/workspace"); return; }
    if (!response.ok) throw new Error(await messageOf(response, "Learner roster could not be loaded."));
    setData(await response.json() as RosterResponse);
  }, [classId, registrationId, router]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      void load().catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load learner roster."); })
        .finally(() => { if (active) setLoading(false); });
    });
    return () => { active = false; };
  }, [load]);

  async function searchExisting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setNotice("");
    try {
      const response = await apiRequest(`/school/registrations/${registrationId}/learners/search?q=${encodeURIComponent(searchQuery.trim())}`);
      if (!response.ok) throw new Error(await messageOf(response, "Learner search failed."));
      setSearchResults(await response.json() as SearchResult[]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Learner search failed."); }
  }

  async function endEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (endReason.trim().length < 10) { setError("Provide a reason of at least 10 characters."); return; }
    setEnding(true); setError(""); setNotice("");
    try {
      const response = await apiRequest(`/school/registrations/${registrationId}/learners/${endingId}/end`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: endStatus, reason: endReason.trim() }),
      });
      if (!response.ok) throw new Error(await messageOf(response, "Learner enrollment could not be ended."));
      setNotice(`Learner enrollment updated: ${endStatus.toLowerCase()}.`);
      setEndingId(""); setEndReason(""); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Learner enrollment could not be ended."); }
    finally { setEnding(false); }
  }

  async function enroll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    const body = selectedLearnerId
      ? { learnerId: selectedLearnerId, admissionNumber: admissionNumber.trim() || undefined }
      : { givenName: givenName.trim(), otherNames: otherNames.trim() || undefined, familyName: familyName.trim(), admissionNumber: admissionNumber.trim() || undefined };
    try {
      const response = await apiRequest(`/school/registrations/${registrationId}/classes/${classId}/learners`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(await messageOf(response, "Learner could not be enrolled."));
      const payload = await response.json() as { learner: { learnerNumber: string; name: string } };
      setNotice(`${payload.learner.name} enrolled successfully. System learner number: ${payload.learner.learnerNumber}. This number identifies the learner; it is not a login credential.`);
      setGivenName(""); setOtherNames(""); setFamilyName(""); setAdmissionNumber(""); setSelectedLearnerId(""); setSearchResults([]);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Learner could not be enrolled."); }
    finally { setSaving(false); }
  }

  const schoolClass = data?.class;
  return <WorkspaceShell section="School workspace" title="Class learner roster" navigation={[{ label: "Workspace overview", href: "/workspace" }, { label: "Teaching desk", href: "/school/teaching" }, { label: "Classes", href: `/school/registrations/${registrationId}/classes` }, { label: "Learners", href: "#learners", active: true }]} actions={<Link href={`/school/registrations/${registrationId}/classes`} className="cbe-button cbe-button-secondary">Back to classes</Link>}>

    
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
      <Link href={`/school/registrations/${registrationId}/classes`} className="text-xs font-semibold text-[var(--muted)] hover:text-[var(--brand)]">← Classes and streams</Link>
      <div className="mt-5"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--brand)]">Learner administration</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--ink-strong)]">Class learner roster</h1>{schoolClass ? <p className="mt-2 text-sm text-[var(--muted)]">{data?.school.name} · {schoolClass.displayName || `${schoolClass.grade.replace("GRADE_", "Grade ")} · ${schoolClass.streamCode}`} · {schoolClass.academicYear}</p> : null}</div>
      {error ? <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {notice ? <p role="status" className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p> : null}
      {loading ? <div className="mt-8 rounded-2xl border border-[var(--line)] bg-white p-8 text-sm text-[var(--muted)]">Loading learner roster…</div> : data ? <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-2xl border border-[var(--line)] bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-semibold text-[var(--ink-strong)]">Enrolled learners</h2><p className="mt-1 text-xs text-[var(--muted)]">{data.learners.length} active learner{data.learners.length === 1 ? "" : "s"}</p></div><span className="rounded-full bg-[var(--brand-soft)] px-3 py-1.5 text-[11px] font-semibold text-[var(--brand)]">{data.accessRole === "TEACHER" ? "Assigned Class Teacher" : "School Administrator"}</span></div>
          {data.learners.length === 0 ? <div className="mt-6 rounded-xl border border-dashed border-[var(--line-strong)] p-8 text-center"><p className="text-sm font-semibold text-[var(--ink-strong)]">No learners enrolled</p><p className="mt-2 text-xs text-[var(--muted)]">Learners added to this class will appear here.</p></div> : <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[560px] text-left"><thead><tr className="border-b border-[var(--line)] text-[10px] font-semibold uppercase tracking-wide text-[var(--subtle)]"><th className="px-3 py-3">Learner</th><th className="px-3 py-3">System ID</th><th className="px-3 py-3">Admission no.</th><th className="px-3 py-3">Enrolled</th>{data.accessRole === "SCHOOL_ADMINISTRATOR" ? <th className="px-3 py-3">Actions</th> : null}</tr></thead><tbody>{data.learners.map((learner) => <tr key={learner.enrollmentId} className="border-b border-[#f0f3f7] last:border-0"><td className="px-3 py-3 text-sm font-medium text-[var(--ink-strong)]">{learner.name}</td><td className="px-3 py-3 font-mono text-xs text-[var(--muted)]">{learner.learnerNumber}</td><td className="px-3 py-3 text-xs text-[var(--muted)]">{learner.admissionNumber || "—"}</td><td className="px-3 py-3 text-xs text-[var(--muted)]">{new Intl.DateTimeFormat("en-KE", { dateStyle: "medium" }).format(new Date(learner.enrolledAt))}</td>{data.accessRole === "SCHOOL_ADMINISTRATOR" ? <td className="px-3 py-3"><button type="button" onClick={() => { setEndingId(learner.enrollmentId); setEndReason(""); }} className="text-[11px] font-semibold text-[#a15a38] hover:underline">End enrollment</button></td> : null}</tr>)}</tbody></table></div>}{endingId && data.accessRole === "SCHOOL_ADMINISTRATOR" ? <form onSubmit={endEnrollment} className="mt-5 rounded-xl border border-[#f0dfd4] bg-[#fffaf7] p-4"><p className="text-xs font-semibold text-[#8b4b2b]">End this learner enrollment</p><div className="mt-3 grid gap-3 sm:grid-cols-[180px_1fr]"><select value={endStatus} onChange={(event) => setEndStatus(event.target.value as "TRANSFERRED" | "WITHDRAWN" | "COMPLETED")} className="rounded-lg border border-[#e7d6cb] bg-white px-3 py-2 text-xs"><option value="TRANSFERRED">Transferred</option><option value="WITHDRAWN">Withdrawn</option><option value="COMPLETED">Completed</option></select><input value={endReason} onChange={(event) => setEndReason(event.target.value)} minLength={10} maxLength={1000} placeholder="Reason (minimum 10 characters)" className="rounded-lg border border-[#e7d6cb] bg-white px-3 py-2 text-xs" /></div><div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => setEndingId("")} className="rounded-lg border border-[#e7d6cb] px-3 py-2 text-xs font-semibold text-[#8b4b2b]">Cancel</button><button disabled={ending} className="rounded-lg bg-[#8b4b2b] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{ending ? "Saving…" : "Confirm status change"}</button></div></form> : null}
          <p className="mt-5 rounded-xl bg-[#f7faff] p-3 text-[11px] leading-5 text-[#73839a]">Learner system IDs are identifiers only. They are not passwords, login codes or proof of identity.</p>
        </section>
        {data.accessRole === "SCHOOL_ADMINISTRATOR" ? <aside className="space-y-5">
          <section className="rounded-2xl border border-[var(--line)] bg-white p-5"><h2 className="text-base font-semibold text-[var(--ink-strong)]">Find an existing learner</h2><p className="mt-1 text-xs leading-5 text-[var(--muted)]">Use this to avoid creating a duplicate global learner identity when a learner transfers or returns.</p><form onSubmit={searchExisting} className="mt-4 flex gap-2"><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} minLength={2} placeholder="Name or system ID" className="min-w-0 flex-1 rounded-xl border border-[var(--line)] px-3 py-2.5 text-xs outline-none focus:border-[var(--brand)]" /><button className="rounded-xl bg-[var(--brand-soft)] px-3 py-2.5 text-xs font-semibold text-[var(--brand)]">Search</button></form>{searchResults.length ? <div className="mt-3 space-y-2">{searchResults.map((result) => <div key={result.id} className="rounded-xl border border-[var(--line)] p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-xs font-semibold text-[var(--ink-strong)]">{result.name}</p><p className="mt-1 font-mono text-[10px] text-[var(--muted)]">{result.learnerNumber}</p></div>{result.hasActiveEnrollment ? <span className="text-[10px] font-semibold text-amber-700">{result.alreadyEnrolledAtThisSchool ? "Already here" : "Active elsewhere"}</span> : <button type="button" onClick={() => { setSelectedLearnerId(result.id); setGivenName(""); setFamilyName(""); setOtherNames(""); }} className="rounded-lg border border-[var(--line)] px-2 py-1.5 text-[10px] font-semibold text-[var(--brand)]">Select</button>}</div></div>)}</div> : null}</section>
          <section className="rounded-2xl border border-[var(--line)] bg-white p-5"><h2 className="text-base font-semibold text-[var(--ink-strong)]">{selectedLearnerId ? "Enroll existing identity" : "Register new learner"}</h2><p className="mt-1 text-xs leading-5 text-[var(--muted)]">{selectedLearnerId ? "The learner's global identity will be reused; only a new school enrollment is created." : "Sentinel creates a global learner number automatically. No learner account or password is created."}</p><form onSubmit={enroll} className="mt-4 space-y-3">{selectedLearnerId ? <div className="flex items-center justify-between rounded-xl bg-[#f7faff] p-3"><p className="text-xs font-semibold text-[var(--brand)]">Existing learner selected</p><button type="button" onClick={() => setSelectedLearnerId("")} className="text-[11px] font-semibold text-[var(--muted)]">Clear</button></div> : <><input required maxLength={80} value={givenName} onChange={(event) => setGivenName(event.target.value)} placeholder="Given name" className="w-full rounded-xl border border-[var(--line)] px-3 py-2.5 text-xs outline-none focus:border-[var(--brand)]" /><input maxLength={120} value={otherNames} onChange={(event) => setOtherNames(event.target.value)} placeholder="Other names (optional)" className="w-full rounded-xl border border-[var(--line)] px-3 py-2.5 text-xs outline-none focus:border-[var(--brand)]" /><input required maxLength={80} value={familyName} onChange={(event) => setFamilyName(event.target.value)} placeholder="Family name" className="w-full rounded-xl border border-[var(--line)] px-3 py-2.5 text-xs outline-none focus:border-[var(--brand)]" /></>}<input maxLength={40} value={admissionNumber} onChange={(event) => setAdmissionNumber(event.target.value.toUpperCase())} placeholder="School admission number (optional)" className="w-full rounded-xl border border-[var(--line)] px-3 py-2.5 text-xs outline-none focus:border-[var(--brand)]" /><button disabled={saving} className="w-full rounded-xl bg-[var(--brand)] px-4 py-3 text-xs font-semibold text-white disabled:opacity-50">{saving ? "Enrolling learner…" : "Enroll learner in this class"}</button></form></section>
          <LearnerCsvImport registrationId={registrationId} classId={classId} onImported={load} />
        </aside> : <aside className="h-fit rounded-2xl border border-[var(--line)] bg-white p-5"><h2 className="text-sm font-semibold text-[var(--ink-strong)]">Teacher access</h2><p className="mt-2 text-xs leading-5 text-[var(--muted)]">You can view this class roster because you are the active assigned Class Teacher. Learner creation and school enrollment remain restricted to the School Administrator.</p></aside>}
      </div> : null}
    </div>
  </WorkspaceShell>;
}
