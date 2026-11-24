"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiRequest, clearStoredCsrfToken } from "../../../../../lib/api";

type AssessmentItem = {
  id: string; name: string; code: string; grade: string; academicYear: number; status: string;
  opensAt: string | null; closesAt: string | null;
  progress: { candidateCount: number; learningAreaCount: number; expectedMarkCount: number; submittedMarkCount: number; returnedMarkCount: number; pendingMarkCount: number; isComplete: boolean };
  submission: { status: string; version: number; submittedAt: string | null; returnedAt: string | null; returnedReason: string | null } | null;
  canSubmit: boolean;
};

async function responseMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as { message?: string | string[] } | null;
  return Array.isArray(body?.message) ? body.message.join(" ") : body?.message ?? fallback;
}

function dateLabel(value: string | null) {
  return value ? new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Not scheduled";
}

export default function SchoolAssessmentsPage() {
  const { registrationId } = useParams<{ registrationId: string }>();
  const router = useRouter();
  const [items, setItems] = useState<AssessmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const response = await apiRequest(`/school/registrations/${registrationId}/assessments`);
    if (response.status === 401) { router.replace("/login"); return; }
    if (response.status === 403) { router.replace("/workspace"); return; }
    if (!response.ok) throw new Error(await responseMessage(response, "Assessments could not be loaded."));
    setItems(await response.json() as AssessmentItem[]);
  }, [registrationId, router]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => { void load().catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load assessments."); }).finally(() => { if (active) setLoading(false); }); });
    return () => { active = false; };
  }, [load]);

  async function signOut() { await apiRequest("/auth/logout", { method: "POST" }); clearStoredCsrfToken(); router.replace("/login"); }

  return <main className="min-h-screen bg-[var(--canvas)]">
    <header className="border-b border-[var(--line)] bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8"><Link href="/workspace" className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[var(--brand)] text-xs font-bold text-white">S</span><span className="text-sm font-semibold text-[var(--ink-strong)]">cbe · School workspace</span></Link><button onClick={signOut} className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[#52647d]">Sign out</button></div></header>
    <div className="mx-auto max-w-6xl px-5 py-9 sm:px-8 sm:py-12">
      <Link href={`/school/registrations/${registrationId}/classes`} className="text-xs font-semibold text-[var(--muted)] hover:text-[var(--brand)]">← Back to classes</Link>
      <div className="mt-5 max-w-3xl"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand)]">School assessment desk</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--ink-strong)] sm:text-4xl">Assessment submissions.</h1><p className="mt-3 text-sm leading-7 text-[var(--muted)]">Track learning-area completion across your school. The School Administrator makes the final submission only after every active candidate has a submitted mark in every assessment learning area.</p></div>
      {error ? <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {loading ? <div className="mt-8 rounded-2xl border border-[var(--line)] bg-white p-8 text-sm text-[var(--muted)]">Loading school assessments…</div> : items.length === 0 ? <div className="mt-8 rounded-2xl border border-dashed border-[#ccd8e8] bg-white p-10 text-center"><h2 className="text-base font-semibold text-[var(--ink-strong)]">No participating assessments yet</h2><p className="mt-2 text-sm text-[var(--muted)]">Assessments will appear here once your school has active candidates in a Council assessment.</p></div> : <div className="mt-8 grid gap-4 md:grid-cols-2">{items.map((item) => {
        const percent = item.progress.expectedMarkCount ? Math.round(item.progress.submittedMarkCount / item.progress.expectedMarkCount * 100) : 0;
        const status = item.submission?.status === "SUBMITTED" ? `Submitted · v${item.submission.version}` : item.submission?.status === "RETURNED" ? `Returned · v${item.submission.version}` : item.status === "RELEASED" ? "Results released" : item.status === "CLOSED" ? "Closed by Council" : "Not submitted";
        return <article key={item.id} className="rounded-2xl border border-[var(--line)] bg-white p-5 sm:p-6"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--brand)]">{item.grade.replace("GRADE_", "Grade ")} · {item.academicYear}</p><h2 className="mt-2 text-lg font-semibold text-[var(--ink-strong)]">{item.name}</h2><p className="mt-1 text-xs text-[#8492a6]">{item.code}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${item.submission?.status === "SUBMITTED" ? "bg-[var(--success-soft)] text-[#287653]" : item.submission?.status === "RETURNED" ? "bg-[#fff4e5] text-[#9a5a13]" : "bg-[var(--surface-subtle)] text-[var(--muted)]"}`}>{status}</span></div>
          <div className="mt-5"><div className="flex items-center justify-between text-xs"><span className="font-semibold text-[#52647d]">Marks completion</span><span className="font-semibold tabular-nums text-[var(--ink)]">{percent}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-[#edf1f7]"><div className="h-full rounded-full bg-[#3477d5]" style={{ width: `${percent}%` }} /></div><p className="mt-2 text-[11px] text-[#8291a6]">{item.progress.submittedMarkCount} of {item.progress.expectedMarkCount} marks submitted · {item.progress.candidateCount} candidates · {item.progress.learningAreaCount} learning areas</p></div>
          {item.submission?.returnedReason ? <p className="mt-3 rounded-xl border border-[#f2dfc4] bg-[#fff9f0] p-3 text-xs leading-5 text-[#8a5a22]">Council return: {item.submission.returnedReason}</p> : null}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4"><p className="text-[11px] text-[var(--subtle)]">{item.closesAt ? "Entry closes " + dateLabel(item.closesAt) : "Assessment " + item.status.toLowerCase()}</p><div className="flex flex-wrap gap-2">{item.status === "RELEASED" ? <Link href={"/school/registrations/" + registrationId + "/assessments/" + item.id + "/results"} className="rounded-lg border border-[var(--line)] px-3.5 py-2.5 text-xs font-semibold text-[var(--brand)] hover:bg-[#f7faff]">View results ↗</Link> : null}<Link href={"/school/registrations/" + registrationId + "/assessments/" + item.id + "/submission"} className="rounded-lg bg-[var(--brand)] px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-[var(--brand-strong)]">Review submission →</Link></div></div>
        </article>;
      })}</div>}
    </div>
  </main>;
}
