"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";

interface CurrentUser {
  id: string;
  person: { givenName: string; familyName: string; displayName?: string | null };
  platformOperator?: { status: string } | null;
  schoolMemberships?: Array<{
    id: string;
    role: string;
    registration: {
      status: string;
      school: { name: string };
      council: { name: string };
    };
  }>;
}

export default function WorkspacePage() {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API_BASE}/auth/me`, { credentials: "include", cache: "no-store" })
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
  }, [router]);

  if (error) return <main className="mx-auto max-w-3xl p-8 text-sm text-[#a33b3b]">{error}</main>;
  if (!user) return <main className="grid min-h-screen place-items-center text-sm text-[#64748b]">Loading your workspace…</main>;

  const name = user.person.displayName || `${user.person.givenName} ${user.person.familyName}`;

  return (
    <main className="min-h-screen">
      <header className="border-b border-[#e5eaf1] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <a href="/" className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#2457c5] text-xs font-bold text-white">CBE</span><span className="text-sm font-semibold text-[#172b4d]">Examination Management</span></a>
          <button onClick={async () => { const csrf = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("cbe_csrf="))?.split("=").slice(1).join("="); await fetch(`${API_BASE}/auth/logout`, { method: "POST", credentials: "include", headers: { "x-csrf-token": decodeURIComponent(csrf ?? "") } }); router.replace("/login"); }} className="rounded-lg border border-[#dbe3ee] px-3 py-2 text-xs font-semibold text-[#52647d] hover:bg-[#f6f8fb]">Sign out</button>
        </div>
      </header>
      <section className="mx-auto max-w-6xl px-6 py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2457c5]">Your workspace</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#172b4d]">Good to see you, {name}.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#64748b]">Your account is authenticated. School-management capabilities become available after the relevant Council school registration has been approved.</p>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {(user.schoolMemberships ?? []).map((membership) => <article key={membership.id} className="rounded-2xl border border-[#e5eaf1] bg-white p-5"><p className="text-xs font-semibold text-[#2457c5]">{membership.role.replaceAll("_", " ")}</p><h2 className="mt-2 text-lg font-semibold text-[#172b4d]">{membership.registration.school.name}</h2><p className="mt-1 text-sm text-[#64748b]">{membership.registration.council.name}</p><span className="mt-4 inline-flex rounded-full bg-[#edf4ff] px-3 py-1 text-xs font-semibold text-[#2457c5]">{membership.registration.status}</span></article>)}
          {(!user.schoolMemberships || user.schoolMemberships.length === 0) ? <article className="rounded-2xl border border-dashed border-[#ccd8e8] bg-white p-6"><h2 className="font-semibold text-[#172b4d]">No active school workspace yet</h2><p className="mt-2 text-sm leading-6 text-[#64748b]">When a school registration is submitted and approved, its authorized workspace will appear here.</p></article> : null}
        </div>
      </section>
    </main>
  );
}
