"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, clearStoredCsrfToken } from "../../../lib/api";
import { WorkspaceShell } from "../../../components/workspace-shell";
import { NotificationCenter } from "../../workspace/notification-center";

interface TeachingClass {
  membershipId: string;
  registrationId: string;
  councilId: string;
  schoolName: string;
  councilName: string;
  schoolClass: { id: string; grade: string; academicYear: number; streamCode: string; displayName: string | null };
  isClassTeacher: boolean;
  learningAreas: { id: string; code: string; name: string }[];
  assessments: { id: string; name: string; code: string; opensAt: string | null; closesAt: string | null; learningAreas: { id: string; code: string; name: string }[] }[];
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

  return (
    <WorkspaceShell
      section="School workspace"
      title="Teaching desk"
      description="Your active class and learning-area assignments. Class Teachers coordinate class readiness; only Subject Teachers can enter marks for their explicitly assigned learning areas."
      navigation={[
        { label: "Workspace overview", href: "/workspace" },
        { label: "Teaching desk", href: "/school/teaching", active: true },
      ]}
      actions={
        <>
          <NotificationCenter />
          <button onClick={async () => { await apiRequest("/auth/logout", { method: "POST" }); clearStoredCsrfToken(); router.replace("/login"); }} className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--muted)] transition hover:bg-[var(--surface-subtle)]">Sign out</button>
        </>
      }
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div><p className="cbe-eyebrow">Assigned classes</p><h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--ink-strong)] sm:text-3xl">Your teaching desk</h1></div>
        {!loading && !error ? <span className="rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--muted)]">{classes.length} {classes.length === 1 ? "class" : "classes"}</span> : null}
      </div>
      {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {loading ? <div className="cbe-panel p-8 text-sm text-[var(--muted)]">Loading your assigned classes…</div> : classes.length === 0 && !error ? <div className="cbe-panel border-dashed p-10 text-center"><div className="mx-auto grid size-11 place-items-center rounded-xl bg-[var(--surface-subtle)] text-[var(--muted)]">—</div><h2 className="mt-4 text-base font-semibold text-[var(--ink-strong)]">No active teaching assignments</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">Ask your School Administrator to assign you as Class Teacher or Subject Teacher. Your classes will appear here once those assignments are active.</p></div> : <div className="grid gap-4 xl:grid-cols-2">
        {classes.map((item) => <article key={item.schoolClass.id} className="cbe-panel overflow-hidden">
          <div className="border-b border-[var(--line)] px-5 py-4 sm:px-6">
            <p className="cbe-eyebrow">{item.schoolName}</p>
            <div className="mt-2 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold tracking-tight text-[var(--ink-strong)]">{item.schoolClass.displayName || `${item.schoolClass.grade.replace("GRADE_", "Grade ")} · ${item.schoolClass.streamCode}`}</h2><p className="mt-1 text-xs text-[var(--muted)]">{item.councilName} · Academic year {item.schoolClass.academicYear}</p></div><span className="rounded-lg bg-[var(--surface-subtle)] px-2.5 py-1.5 text-[10px] font-semibold text-[var(--muted)]">{item.isClassTeacher ? "Class Teacher" : "Subject Teacher"}</span></div>
          </div>
          <div className="p-5 sm:px-6">
            <div className="flex items-center justify-between"><h3 className="text-xs font-semibold text-[var(--ink)]">Open assessments</h3><span className="cbe-tabular text-xs text-[var(--muted)]">{item.assessments.length}</span></div>
            {item.assessments.length === 0 ? <p className="mt-3 rounded-lg bg-[var(--surface-subtle)] p-3 text-xs leading-5 text-[var(--muted)]">No open assessments currently match this class. Scheduled assessments appear when opened by the Council.</p> : <div className="mt-3 space-y-3">{item.assessments.map((assessment) => <div key={assessment.id} className="rounded-xl border border-[var(--line)] p-3.5">
              <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-semibold text-[var(--ink)]">{assessment.name}</p><p className="mt-1 text-[11px] text-[var(--muted)]">{assessment.code}{assessment.closesAt ? ` · Closes ${new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(assessment.closesAt))}` : ""}</p></div><span className="rounded-md bg-[var(--brand-soft)] px-2 py-1 text-[10px] font-semibold text-[var(--brand-strong)]">{item.isClassTeacher ? "Class coordination" : "Subject access"}</span></div>
              {assessment.learningAreas.length > 0 ? <div className="mt-3 flex flex-wrap gap-2">{assessment.learningAreas.map((area) => <Link key={area.id} href={`/school/registrations/${item.registrationId}/classes/${item.schoolClass.id}/assessments/${assessment.id}/marks?learningAreaId=${area.id}`} className="inline-flex items-center gap-2 rounded-lg border border-[var(--brand-border)] bg-white px-3 py-2 text-xs font-semibold text-[var(--brand-strong)] transition hover:bg-[var(--brand-soft)]">{area.name}<span aria-hidden="true">→</span></Link>)}</div> : <p className="mt-3 rounded-lg bg-[var(--surface-subtle)] px-3 py-2 text-[11px] leading-5 text-[var(--muted)]">No assigned learning areas are part of this assessment. Class coordination alone does not grant marks access.</p>}
            </div>)}</div>}
            <div className="mt-4 border-t border-[var(--line)] pt-3"><Link href={`/school/registrations/${item.registrationId}/classes/${item.schoolClass.id}/learners`} className="text-xs font-semibold text-[var(--brand-strong)] hover:underline">View learner roster →</Link></div>
          </div>
        </article>)}
      </div>}
    </WorkspaceShell>
  );
}
