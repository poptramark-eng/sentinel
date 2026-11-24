"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, clearStoredCsrfToken } from "../../../lib/api";

interface TeachingClass {
  membershipId: string;
  registrationId: string;
  councilId: string;
  schoolName: string;
  councilName: string;
  schoolClass: { id: string; grade: string; academicYear: number; streamCode: string; displayName: string | null };
  assessments: { id: string; name: string; code: string; opensAt: string | null; closesAt: string | null }[];
}

async function messageOf(response: Response) {
  const payload = await response.json().catch(() => null) as { message?: string | string[] } | null;
  return Array.isArray(payload?.message) ? payload.message.join(" ") : payload?.message ?? "The teaching workspace could not be loaded.";
}

export default function TeachingWorkspacePage() {
  const router = useRouter();
  const [classes, setClasses] = useState<TeachingClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const response = await apiRequest("/school/teaching/classes");
    if (response.status === 401) { router.replace("/login"); return; }
    if (response.status === 403) { router.replace("/workspace"); return; }
    if (!response.ok) throw new Error(await messageOf(response));
    setClasses(await response.json() as TeachingClass[]);
  }, [router]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      void load().catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load teaching workspace."); })
        .finally(() => { if (active) setLoading(false); });
    });
    return () => { active = false; };
  }, [load]);

  return <main className="min-h-screen bg-[#f6f8fc]">
    <header className="border-b border-[#e5eaf1] bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8"><Link href="/workspace" className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#2457c5] text-xs font-bold text-white">S</span><span className="text-sm font-semibold text-[#172b4d]">Sentinel · Teaching workspace</span></Link><button onClick={async () => { await apiRequest("/auth/logout", { method: "POST" }); clearStoredCsrfToken(); router.replace("/login"); }} className="rounded-lg border border-[#dbe3ee] px-3 py-2 text-xs font-semibold text-[#52647d]">Sign out</button></div></header>
    <div className="mx-auto max-w-6xl px-5 py-9 sm:px-8 sm:py-12">
      <Link href="/workspace" className="text-xs font-semibold text-[#64748b] hover:text-[#2457c5]">← Back to workspace</Link>
      <div className="mt-5 max-w-3xl"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2457c5]">Assigned classes</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#172b4d] sm:text-4xl">Your teaching desk.</h1><p className="mt-3 text-sm leading-7 text-[#64748b]">Only classes with an active Class Teacher assignment appear here. Assessment access is limited to your assigned class and the assessment&apos;s scheduled grade and academic year.</p></div>
      {error ? <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {loading ? <div className="mt-8 rounded-2xl border border-[#e5eaf1] bg-white p-8 text-sm text-[#64748b]">Loading your assigned classes…</div> : classes.length === 0 ? <div className="mt-8 rounded-2xl border border-dashed border-[#ccd8e8] bg-white p-10 text-center"><h2 className="text-base font-semibold text-[#172b4d]">No active class assignments</h2><p className="mt-2 text-sm text-[#64748b]">Ask your School Administrator to assign you as Class Teacher for a class.</p></div> : <div className="mt-8 grid gap-5 md:grid-cols-2">{classes.map((item) => <article key={item.schoolClass.id} className="rounded-2xl border border-[#e5eaf1] bg-white p-5 sm:p-6">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#2457c5]">{item.schoolName}</p><h2 className="mt-2 text-lg font-semibold text-[#172b4d]">{item.schoolClass.displayName || `${item.schoolClass.grade.replace("GRADE_", "Grade ")} · ${item.schoolClass.streamCode}`}</h2><p className="mt-1 text-xs text-[#7b8ba2]">{item.councilName} · {item.schoolClass.academicYear} · {item.schoolClass.grade.replace("GRADE_", "Grade ")}</p>
        <div className="mt-5 border-t border-[#edf0f5] pt-4"><div className="flex items-center justify-between"><p className="text-xs font-semibold text-[#52647d]">Open assessments</p><span className="rounded-full bg-[#edf4ff] px-2.5 py-1 text-[10px] font-semibold text-[#2457c5]">{item.assessments.length}</span></div>
          {item.assessments.length === 0 ? <p className="mt-3 rounded-xl bg-[#f8faff] p-3 text-xs leading-5 text-[#8291a6]">No open assessments currently match this class. Scheduled assessments will appear when opened by the Council.</p> : <div className="mt-3 space-y-2">{item.assessments.map((assessment) => <div key={assessment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#edf0f5] p-3"><div><p className="text-xs font-semibold text-[#263b5b]">{assessment.name}</p><p className="mt-1 text-[10px] text-[#8a99ad]">{assessment.code}{assessment.closesAt ? ` · Closes ${new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(assessment.closesAt))}` : ""}</p></div><Link href={`/school/registrations/${item.registrationId}/classes/${item.schoolClass.id}/assessments/${assessment.id}/marks`} className="rounded-lg bg-[#2457c5] px-3 py-2 text-[11px] font-semibold text-white hover:bg-[#1e49a6]">Enter marks</Link></div>)}</div>}
        </div>
        <div className="mt-4"><Link href={`/school/registrations/${item.registrationId}/classes/${item.schoolClass.id}/learners`} className="text-xs font-semibold text-[#2457c5] hover:underline">View learner roster →</Link></div>
      </article>)}</div>}
    </div>
  </main>;
}
