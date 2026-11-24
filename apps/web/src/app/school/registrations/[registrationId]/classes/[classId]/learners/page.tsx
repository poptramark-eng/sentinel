"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiRequest } from "../../../../../../../lib/api";

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
  return <main className="min-h-screen bg-[#f6f8fc]">
    <header className="border-b border-[#e5eaf1] bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8"><Link href="/workspace" className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#2457c5] text-xs font-bold text-white">S</span><span className="text-sm font-semibold text-[#172b4d]">Sentinel · School workspace</span></Link><Link href={`/school/registrations/${registrationId}/classes`} className="text-xs font-semibold text-[#52647d]">Back to classes</Link></div></header>
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
      <Link href={`/school/registrations/${registrationId}/classes`} className="text-xs font-semibold text-[#64748b] hover:text-[#2457c5]">← Classes and streams</Link>
      <div className="mt-5"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#2457c5]">Learner administration</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#172b4d]">Class learner roster</h1>{schoolClass ? <p className="mt-2 text-sm text-[#64748b]">{data?.school.name} · {schoolClass.displayName || `${schoolClass.grade.replace("GRADE_", "Grade ")} · ${schoolClass.streamCode}`} · {schoolClass.academicYear}</p> : null}</div>
      {error ? <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {notice ? <p role="status" className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p> : null}
      {loading ? <div className="mt-8 rounded-2xl border border-[#e5eaf1] bg-white p-8 text-sm text-[#64748b]">Loading learner roster…</div> : data ? <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-2xl border border-[#e5eaf1] bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-semibold text-[#172b4d]">Enrolled learners</h2><p className="mt-1 text-xs text-[#7b8ba2]">{data.learners.length} active learner{data.learners.length === 1 ? "" : "s"}</p></div><span className="rounded-full bg-[#edf4ff] px-3 py-1.5 text-[11px] font-semibold text-[#2457c5]">{data.accessRole === "TEACHER" ? "Assigned Class Teacher" : "School Administrator"}</span></div>
          {data.learners.length === 0 ? <div className="mt-6 rounded-xl border border-dashed border-[#ccd8e8] p-8 text-center"><p className="text-sm font-semibold text-[#172b4d]">No learners enrolled</p><p className="mt-2 text-xs text-[#7b8ba2]">Learners added to this class will appear here.</p></div> : <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[560px] text-left"><thead><tr className="border-b border-[#edf0f5] text-[10px] font-semibold uppercase tracking-wide text-[#8a99ad]"><th className="px-3 py-3">Learner</th><th className="px-3 py-3">System ID</th><th className="px-3 py-3">Admission no.</th><th className="px-3 py-3">Enrolled</th></tr></thead><tbody>{data.learners.map((learner) => <tr key={learner.enrollmentId} className="border-b border-[#f0f3f7] last:border-0"><td className="px-3 py-3 text-sm font-medium text-[#263b5b]">{learner.name}</td><td className="px-3 py-3 font-mono text-xs text-[#64748b]">{learner.learnerNumber}</td><td className="px-3 py-3 text-xs text-[#64748b]">{learner.admissionNumber || "—"}</td><td className="px-3 py-3 text-xs text-[#64748b]">{new Intl.DateTimeFormat("en-KE", { dateStyle: "medium" }).format(new Date(learner.enrolledAt))}</td></tr>)}</tbody></table></div>}
          <p className="mt-5 rounded-xl bg-[#f7faff] p-3 text-[11px] leading-5 text-[#73839a]">Learner system IDs are identifiers only. They are not passwords, login codes or proof of identity.</p>
        </section>
        {data.accessRole === "SCHOOL_ADMINISTRATOR" ? <aside className="space-y-5">
          <section className="rounded-2xl border border-[#e5eaf1] bg-white p-5"><h2 className="text-base font-semibold text-[#172b4d]">Find an existing learner</h2><p className="mt-1 text-xs leading-5 text-[#7b8ba2]">Use this to avoid creating a duplicate global learner identity when a learner transfers or returns.</p><form onSubmit={searchExisting} className="mt-4 flex gap-2"><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} minLength={2} placeholder="Name or system ID" className="min-w-0 flex-1 rounded-xl border border-[#dbe3ee] px-3 py-2.5 text-xs outline-none focus:border-[#6d94e8]" /><button className="rounded-xl bg-[#edf4ff] px-3 py-2.5 text-xs font-semibold text-[#2457c5]">Search</button></form>{searchResults.length ? <div className="mt-3 space-y-2">{searchResults.map((result) => <div key={result.id} className="rounded-xl border border-[#edf0f5] p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-xs font-semibold text-[#263b5b]">{result.name}</p><p className="mt-1 font-mono text-[10px] text-[#7b8ba2]">{result.learnerNumber}</p></div>{result.hasActiveEnrollment ? <span className="text-[10px] font-semibold text-amber-700">{result.alreadyEnrolledAtThisSchool ? "Already here" : "Active elsewhere"}</span> : <button type="button" onClick={() => { setSelectedLearnerId(result.id); setGivenName(""); setFamilyName(""); setOtherNames(""); }} className="rounded-lg border border-[#dbe3ee] px-2 py-1.5 text-[10px] font-semibold text-[#2457c5]">Select</button>}</div></div>)}</div> : null}</section>
          <section className="rounded-2xl border border-[#e5eaf1] bg-white p-5"><h2 className="text-base font-semibold text-[#172b4d]">{selectedLearnerId ? "Enroll existing identity" : "Register new learner"}</h2><p className="mt-1 text-xs leading-5 text-[#7b8ba2]">{selectedLearnerId ? "The learner's global identity will be reused; only a new school enrollment is created." : "Sentinel creates a global learner number automatically. No learner account or password is created."}</p><form onSubmit={enroll} className="mt-4 space-y-3">{selectedLearnerId ? <div className="flex items-center justify-between rounded-xl bg-[#f7faff] p-3"><p className="text-xs font-semibold text-[#2457c5]">Existing learner selected</p><button type="button" onClick={() => setSelectedLearnerId("")} className="text-[11px] font-semibold text-[#64748b]">Clear</button></div> : <><input required maxLength={80} value={givenName} onChange={(event) => setGivenName(event.target.value)} placeholder="Given name" className="w-full rounded-xl border border-[#dbe3ee] px-3 py-2.5 text-xs outline-none focus:border-[#6d94e8]" /><input maxLength={120} value={otherNames} onChange={(event) => setOtherNames(event.target.value)} placeholder="Other names (optional)" className="w-full rounded-xl border border-[#dbe3ee] px-3 py-2.5 text-xs outline-none focus:border-[#6d94e8]" /><input required maxLength={80} value={familyName} onChange={(event) => setFamilyName(event.target.value)} placeholder="Family name" className="w-full rounded-xl border border-[#dbe3ee] px-3 py-2.5 text-xs outline-none focus:border-[#6d94e8]" /></>}<input maxLength={40} value={admissionNumber} onChange={(event) => setAdmissionNumber(event.target.value.toUpperCase())} placeholder="School admission number (optional)" className="w-full rounded-xl border border-[#dbe3ee] px-3 py-2.5 text-xs outline-none focus:border-[#6d94e8]" /><button disabled={saving} className="w-full rounded-xl bg-[#2457c5] px-4 py-3 text-xs font-semibold text-white disabled:opacity-50">{saving ? "Enrolling learner…" : "Enroll learner in this class"}</button></form></section>
        </aside> : <aside className="h-fit rounded-2xl border border-[#e5eaf1] bg-white p-5"><h2 className="text-sm font-semibold text-[#172b4d]">Teacher access</h2><p className="mt-2 text-xs leading-5 text-[#7b8ba2]">You can view this class roster because you are the active assigned Class Teacher. Learner creation and school enrollment remain restricted to the School Administrator.</p></aside>}
      </div> : null}
    </div>
  </main>;
}
