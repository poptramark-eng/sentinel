"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, clearStoredCsrfToken } from "../../lib/api";

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

  return (
    <main className="min-h-screen">
      <header className="border-b border-[#e5eaf1] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link href="/" className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#2457c5] text-xs font-bold text-white">CBE</span><span className="text-sm font-semibold text-[#172b4d]">Examination Management</span></Link>
          <div className="flex items-center gap-3">
            <Link href="/school-registration" className="hidden text-xs font-semibold text-[#52647d] hover:text-[#2457c5] sm:inline">My registrations</Link>
            {user.platformOperator?.status === "ACTIVE" ? <Link href="/platform/councils" className="hidden text-xs font-semibold text-[#2457c5] hover:underline sm:inline">Platform setup</Link> : null}
            <button onClick={async () => { await apiRequest("/auth/logout", { method: "POST" }); clearStoredCsrfToken(); router.replace("/login"); }} className="rounded-lg border border-[#dbe3ee] px-3 py-2 text-xs font-semibold text-[#52647d] hover:bg-[#f6f8fb]">Sign out</button>
          </div>
        </div>
      </header>
      <section className="mx-auto max-w-6xl px-6 py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2457c5]">Your workspace</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#172b4d]">Good to see you, {name}.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#64748b]">Your account is authenticated. School-management capabilities become available after the relevant Council school registration has been approved.</p>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {schoolMemberships.map((membership) => <article key={membership.id} className="rounded-2xl border border-[#e5eaf1] bg-white p-5"><p className="text-xs font-semibold text-[#2457c5]">{membership.role.replaceAll("_", " ")}</p><h2 className="mt-2 text-lg font-semibold text-[#172b4d]">{membership.registration.school.name}</h2><p className="mt-1 text-sm text-[#64748b]">{membership.registration.council.name}</p><span className="mt-4 inline-flex rounded-full bg-[#edf4ff] px-3 py-1 text-xs font-semibold text-[#2457c5]">{membership.registration.status}</span>{membership.role === "SCHOOL_ADMINISTRATOR" && membership.status === "ACTIVE" && membership.registration.status === "APPROVED" ? <div className="mt-4 flex flex-wrap gap-4"><Link href={`/school/registrations/${membership.registration.id}/teachers`} className="inline-flex text-xs font-semibold text-[#2457c5] hover:underline">Manage teachers</Link><Link href={`/school/registrations/${membership.registration.id}/classes`} className="inline-flex text-xs font-semibold text-[#2457c5] hover:underline">Manage classes</Link></div> : null}</article>)}
          {schoolMemberships.length === 0 ? <article className="rounded-2xl border border-dashed border-[#ccd8e8] bg-white p-6"><h2 className="font-semibold text-[#172b4d]">No active school workspace yet</h2><p className="mt-2 text-sm leading-6 text-[#64748b]">Start a school registration or review the status of a request you have already submitted. The school workspace appears here after approval.</p><div className="mt-5 flex flex-wrap gap-3"><Link href="/school-registration/new" className="rounded-xl bg-[#2457c5] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#1e49a6]">Register a school</Link><Link href="/school-registration" className="rounded-xl border border-[#dbe3ee] px-4 py-2.5 text-xs font-semibold text-[#52647d] hover:bg-[#f7f9fc]">My registrations</Link></div></article> : null}
        </div>
        {user.platformOperator?.status === "ACTIVE" ? <section className="mt-8 rounded-2xl border border-[#dbe7f7] bg-white p-5"><p className="text-xs font-semibold uppercase tracking-wide text-[#2457c5]">Platform operations</p><div className="mt-3 flex flex-wrap gap-3"><Link href="/platform/councils" className="rounded-xl border border-[#dbe3ee] px-4 py-2.5 text-xs font-semibold text-[#52647d] hover:bg-[#f7f9fc]">Manage Councils and geography</Link><Link href="/platform/school-registrations" className="rounded-xl border border-[#dbe3ee] px-4 py-2.5 text-xs font-semibold text-[#52647d] hover:bg-[#f7f9fc]">Review school registrations</Link></div></section> : null}
      </section>
    </main>
  );
}
