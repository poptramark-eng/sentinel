"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, clearStoredCsrfToken } from "../../lib/api";
import { NotificationCenter } from "./notification-center";
import { WorkspaceShell } from "../../components/workspace-shell";

interface CurrentUser {
  id: string;
  person: {
    givenName: string;
    familyName: string;
    displayName?: string | null;
    schoolMemberships?: Array<{
      id: string;
      role: string;
      status: string;
      registration: {
        id: string;
        status: string;
        school: { name: string };
        council: { name: string };
      };
    }>;
    councilMemberships?: Array<{
      id: string;
      role: string;
      council: { id: string; name: string };
    }>;
  };
  platformOperator?: { status: string; role: string } | null;
}

export default function WorkspacePage() {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    queueMicrotask(() => {
      void apiRequest("/auth/me")
        .then(async (response) => {
          if (!response.ok) {
            router.replace("/login");
            return null;
          }
          return (await response.json()) as CurrentUser;
        })
        .then((data) => {
          if (data) setUser(data);
        })
        .catch(() => setError("We could not load your workspace."));
    });
  }, [router]);

  if (error) return <main className="mx-auto max-w-3xl p-8 text-sm text-[#a33b3b]">{error}</main>;
  if (!user) return <main className="grid min-h-screen place-items-center text-sm text-[#64748b]">Loading your workspace…</main>;

  const name = user.person.displayName || `${user.person.givenName} ${user.person.familyName}`;
  const schoolMemberships = user.person.schoolMemberships ?? [];
  const councilMemberships = user.person.councilMemberships ?? [];

  const navigation = [
    { label: "Overview", href: "/workspace", active: true },
    ...(user.platformOperator?.status === "ACTIVE" ? [{ label: "Council directory", href: "/platform/councils" }, { label: "School approvals", href: "/platform/school-registrations" }] : []),
    ...councilMemberships.filter((m) => m.role === "COUNCIL_ADMINISTRATOR").map((m) => ({ label: `${m.council.name} · Curriculum`, href: `/council/${m.council.id}/curriculum` })),
    ...(schoolMemberships.some((m) => m.role === "TEACHER" && m.status === "ACTIVE" && m.registration.status === "APPROVED") ? [{ label: "Teaching desk", href: "/school/teaching" }] : []),
  ];

  return (
    <WorkspaceShell section="Account workspace" title="Overview" navigation={navigation}
      actions={<><NotificationCenter /><Link href="/school-registration" className="hidden rounded-lg px-3 py-2 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--surface-subtle)] sm:inline">My registrations</Link><button onClick={async () => { await apiRequest("/auth/logout", { method: "POST" }); clearStoredCsrfToken(); router.replace("/login"); }} className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--surface-subtle)]">Sign out</button></>}>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div><p className="cbe-eyebrow">Your workspace</p><h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--ink-strong)] sm:text-3xl">Good to see you, {name}.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">Choose an organisation or work area to continue. School-management capabilities become available after the relevant Council registration has been approved.</p></div>
        <span className="rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--muted)]">Authenticated account</span>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {schoolMemberships.map((m) => <article key={m.id} className="cbe-panel p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3"><div><p className="cbe-eyebrow">{m.role.replaceAll("_", " ")}</p><h2 className="mt-2 text-lg font-semibold text-[var(--ink-strong)]">{m.registration.school.name}</h2><p className="mt-1 text-xs text-[var(--muted)]">{m.registration.council.name}</p></div><span className="rounded-lg bg-[var(--surface-subtle)] px-2.5 py-1.5 text-[10px] font-semibold text-[var(--muted)]">{m.registration.status.replaceAll("_", " ")}</span></div>
          {m.role === "SCHOOL_ADMINISTRATOR" && m.status === "ACTIVE" && m.registration.status === "APPROVED" ? <div className="mt-5 flex flex-wrap gap-2 border-t border-[var(--line)] pt-4"><Link href={`/school/registrations/${m.registration.id}/teachers`} className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-subtle)]">Manage teachers</Link><Link href={`/school/registrations/${m.registration.id}/classes`} className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-subtle)]">Manage classes</Link><Link href={`/school/registrations/${m.registration.id}/assessments`} className="rounded-lg bg-[var(--brand)] px-3 py-2 text-xs font-semibold text-white hover:bg-[var(--brand-strong)]">Assessment submissions</Link></div> : null}
          {m.role === "TEACHER" && m.status === "ACTIVE" && m.registration.status === "APPROVED" ? <div className="mt-5 border-t border-[var(--line)] pt-4"><Link href="/school/teaching" className="inline-flex rounded-lg bg-[var(--brand)] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[var(--brand-strong)]">Open teaching desk →</Link></div> : null}
        </article>)}
        {schoolMemberships.length === 0 ? <article className="cbe-panel border-dashed p-6"><p className="cbe-eyebrow">School access</p><h2 className="mt-2 text-lg font-semibold text-[var(--ink-strong)]">No school workspace yet</h2><p className="mt-2 max-w-lg text-sm leading-6 text-[var(--muted)]">Register a school or review a request already submitted. Its operational workspace appears here after Council approval.</p><div className="mt-5 flex flex-wrap gap-2"><Link href="/school-registration/new" className="rounded-lg bg-[var(--brand)] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[var(--brand-strong)]">Register a school</Link><Link href="/school-registration" className="rounded-lg border border-[var(--line)] px-4 py-2.5 text-xs font-semibold text-[var(--ink)]">My registrations</Link></div></article> : null}
        {councilMemberships.filter((m) => m.role === "COUNCIL_ADMINISTRATOR").map((m) => <article key={m.id} className="cbe-panel p-5 sm:p-6"><p className="cbe-eyebrow">Council administrator</p><h2 className="mt-2 text-lg font-semibold text-[var(--ink-strong)]">{m.council.name}</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">Manage the Council&apos;s curriculum, assessment configuration and grading rubrics.</p><div className="mt-5 flex flex-wrap gap-2 border-t border-[var(--line)] pt-4"><Link href={`/council/${m.council.id}/curriculum`} className="rounded-lg bg-[var(--brand)] px-3 py-2 text-xs font-semibold text-white">Curriculum</Link><Link href={`/council/${m.council.id}/assessments`} className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--ink)]">Assessments</Link><Link href={`/council/${m.council.id}/rubrics`} className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--ink)]">Rubrics</Link></div></article>)}
        {councilMemberships.filter((m) => m.role === "COUNCIL_GOVERNANCE_APPROVER").map((m) => <article key={m.id} className="cbe-panel p-5 sm:p-6"><p className="cbe-eyebrow">Council governance approver</p><h2 className="mt-2 text-lg font-semibold text-[var(--ink-strong)]">{m.council.name}</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">Independently review and approve Council grading rubric versions.</p><div className="mt-5 border-t border-[var(--line)] pt-4"><Link href={`/council/${m.council.id}/rubric-review`} className="inline-flex rounded-lg bg-[var(--brand)] px-4 py-2.5 text-xs font-semibold text-white">Review rubric versions →</Link></div></article>)}
      </div>
      {user.platformOperator?.status === "ACTIVE" ? <section className="mt-7 cbe-panel p-5 sm:p-6"><p className="cbe-eyebrow">Platform operations</p><h2 className="mt-2 text-lg font-semibold text-[var(--ink-strong)]">Platform administration</h2><p className="mt-2 text-sm text-[var(--muted)]">Oversee Council onboarding and school registration approvals.</p><div className="mt-4 flex flex-wrap gap-2"><Link href="/platform/councils" className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--ink)]">Council directory</Link><Link href="/platform/school-registrations" className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--ink)]">School approvals</Link></div></section> : null}
    </WorkspaceShell>
  );
}
