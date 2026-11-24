"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, clearStoredCsrfToken } from "../../lib/api";
import { AppShell } from "@astryxdesign/core/AppShell";
import { SideNav, SideNavHeading, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { TopNav } from "@astryxdesign/core/TopNav";
import { BrandMark } from "../../components/brand";

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
  if (!user) return <main className="grid min-h-screen place-items-center text-sm text-[#5e6b80]">Loading your workspace…</main>;

  async function signOut() {
    await apiRequest("/auth/logout", { method: "POST" });
    clearStoredCsrfToken();
    router.replace("/login");
  }

  const name = user.person.displayName || `${user.person.givenName} ${user.person.familyName}`;
  const schoolMemberships = user.person.schoolMemberships ?? [];
  const councilMemberships = user.person.councilMemberships ?? [];

  return (
    <AppShell
      height="auto"
      variant="wash"
      contentPadding={0}
      sideNav={
        <SideNav
          collapsible
          header={<SideNavHeading heading="CBE" superheading="SOFTFLIX" subheading="Assessment management" icon={<BrandMark compact />} headingHref="/workspace" />}
          footer={<div className="px-3 py-3"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#8491a5]">A Softflix product</p><p className="mt-1 text-[11px] text-[#718096]">Assessment operations, connected.</p></div>}
        >
          <SideNavSection title="Workspace">
            <SideNavItem label="Overview" href="/workspace" isSelected />
            <SideNavItem label="School registrations" href="/school-registration" />
          </SideNavSection>
          {schoolMemberships.some((membership) => membership.status === "ACTIVE" && membership.registration.status === "APPROVED") ? (
            <SideNavSection title="School operations">
              {schoolMemberships.filter((membership) => membership.status === "ACTIVE" && membership.registration.status === "APPROVED").map((membership) => (
                <SideNavItem key={membership.id} label={membership.registration.school.name}>
                  {membership.role === "SCHOOL_ADMINISTRATOR" ? <>
                    <SideNavItem label="Manage teachers" href={`/school/registrations/${membership.registration.id}/teachers`} />
                    <SideNavItem label="Manage classes" href={`/school/registrations/${membership.registration.id}/classes`} />
                    <SideNavItem label="Assessments" href={`/school/registrations/${membership.registration.id}/assessments`} />
                  </> : null}
                  {membership.role === "TEACHER" ? <SideNavItem label="Teaching workspace" href="/school/teaching" /> : null}
                </SideNavItem>
              ))}
            </SideNavSection>
          ) : null}
          {councilMemberships.length > 0 ? (
            <SideNavSection title="Council administration">
              {councilMemberships.filter((membership) => membership.role === "COUNCIL_ADMINISTRATOR").map((membership) => <SideNavItem key={membership.id} label={membership.council.name}>
                <SideNavItem label="Curriculum" href={`/council/${membership.council.id}/curriculum`} />
                <SideNavItem label="Assessments" href={`/council/${membership.council.id}/assessments`} />
                <SideNavItem label="Rubrics" href={`/council/${membership.council.id}/rubrics`} />
              </SideNavItem>)}
              {councilMemberships.filter((membership) => membership.role === "COUNCIL_GOVERNANCE_APPROVER").map((membership) => <SideNavItem key={membership.id} label={`${membership.council.name} · Governance`}>
                <SideNavItem label="Rubric review" href={`/council/${membership.council.id}/rubric-review`} />
              </SideNavItem>)}
            </SideNavSection>
          ) : null}
          {user.platformOperator?.status === "ACTIVE" ? (
            <SideNavSection title="Platform administration">
              <SideNavItem label="Councils & geography" href="/platform/councils" />
              <SideNavItem label="Curricula" href="/platform/curricula" />
              <SideNavItem label="School approvals" href="/platform/school-registrations" />
            </SideNavSection>
          ) : null}
        </SideNav>
      }
      topNav={
        <TopNav
          label="CBE workspace controls"
          endContent={<div className="flex items-center gap-3"><button onClick={() => void signOut()} className="rounded-xl border border-[#d3dbe7] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#52627a] transition hover:bg-[#f6f7fb]">Sign out</button></div>}
        />
      }
    >
      <div className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#5368d5]">Your workspace</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-.04em] text-[#17243a]">Good to see you, {name}.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5e6b80]">Your workspaces and responsibilities are shown below. Access is activated according to Council approval and your assigned role.</p>
          </div>
          <Link href="/school-registration/new" className="cbe-button cbe-button-primary">Register a school <span aria-hidden="true">+</span></Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <article className="rounded-2xl border border-[#e3e8f0] bg-white p-5 shadow-[0_2px_8px_rgba(23,36,58,.025)]"><p className="text-xs font-medium text-[#718096]">School memberships</p><p className="mt-2 text-3xl font-semibold tracking-tight text-[#17243a]">{schoolMemberships.length}</p><p className="mt-1 text-xs text-[#8491a5]">Assigned school roles</p></article>
          <article className="rounded-2xl border border-[#e3e8f0] bg-white p-5 shadow-[0_2px_8px_rgba(23,36,58,.025)]"><p className="text-xs font-medium text-[#718096]">Council memberships</p><p className="mt-2 text-3xl font-semibold tracking-tight text-[#17243a]">{councilMemberships.length}</p><p className="mt-1 text-xs text-[#8491a5]">Governance responsibilities</p></article>
          <article className="rounded-2xl border border-[#e3e8f0] bg-white p-5 shadow-[0_2px_8px_rgba(23,36,58,.025)]"><p className="text-xs font-medium text-[#718096]">Platform access</p><p className="mt-2 text-lg font-semibold tracking-tight text-[#17243a]">{user.platformOperator?.status === "ACTIVE" ? "Active" : "Not assigned"}</p><p className="mt-1 text-xs text-[#8491a5]">Platform-level authority</p></article>
        </div>

        <div className="mt-9 flex items-center justify-between gap-4"><div><h2 className="text-lg font-semibold text-[#17243a]">Your workspaces</h2><p className="mt-1 text-xs text-[#718096]">Choose an area to continue.</p></div><Link href="/school-registration" className="text-xs font-semibold text-[#5368d5] hover:underline">View registration history →</Link></div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {schoolMemberships.map((membership) => <article key={membership.id} className="rounded-2xl border border-[#e3e8f0] bg-white p-5 shadow-[0_2px_8px_rgba(23,36,58,.025)]"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#5368d5]">{membership.role.replaceAll("_", " ")}</p><h3 className="mt-2 text-lg font-semibold text-[#17243a]">{membership.registration.school.name}</h3><p className="mt-1 text-sm text-[#718096]">{membership.registration.council.name}</p></div><span className="rounded-full bg-[#eef0fc] px-3 py-1.5 text-[10px] font-bold text-[#485bbd]">{membership.registration.status.replaceAll("_", " ")}</span></div><div className="mt-5 flex flex-wrap gap-2">{membership.role === "SCHOOL_ADMINISTRATOR" && membership.status === "ACTIVE" && membership.registration.status === "APPROVED" ? <><Link href={`/school/registrations/${membership.registration.id}/teachers`} className="cbe-button cbe-button-secondary">Teachers</Link><Link href={`/school/registrations/${membership.registration.id}/classes`} className="cbe-button cbe-button-secondary">Classes</Link><Link href={`/school/registrations/${membership.registration.id}/assessments`} className="cbe-button cbe-button-secondary">Assessments</Link></> : null}{membership.role === "TEACHER" && membership.status === "ACTIVE" && membership.registration.status === "APPROVED" ? <Link href="/school/teaching" className="cbe-button cbe-button-primary">Open teaching workspace <span aria-hidden="true">→</span></Link> : null}{membership.registration.status !== "APPROVED" ? <Link href="/school-registration" className="text-xs font-semibold text-[#5368d5]">View registration status →</Link> : null}</div></article>)}

          {schoolMemberships.length === 0 ? <article className="rounded-2xl border border-dashed border-[#ccd5e3] bg-white p-7"><div className="grid size-10 place-items-center rounded-xl bg-[#eef0fc] text-lg text-[#5368d5]">⌂</div><h3 className="mt-4 text-base font-semibold text-[#17243a]">No school workspace yet</h3><p className="mt-2 max-w-md text-sm leading-6 text-[#718096]">Submit a school registration request and follow its review status here. School-management access becomes available after Council registration approval.</p><div className="mt-5 flex flex-wrap gap-3"><Link href="/school-registration/new" className="cbe-button cbe-button-primary">Start registration</Link><Link href="/school-registration" className="cbe-button cbe-button-secondary">My registrations</Link></div></article> : null}

          {councilMemberships.filter((membership) => membership.role === "COUNCIL_ADMINISTRATOR").map((membership) => <article key={membership.id} className="rounded-2xl border border-[#dce2f4] bg-white p-5 shadow-[0_2px_8px_rgba(23,36,58,.025)]"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#5368d5]">Council administrator</p><h3 className="mt-2 text-lg font-semibold text-[#17243a]">{membership.council.name}</h3><p className="mt-2 text-sm leading-6 text-[#718096]">Manage published curriculum, learning areas, assessment periods and grading rubrics for this Council.</p><div className="mt-5 flex flex-wrap gap-2"><Link href={`/council/${membership.council.id}/curriculum`} className="cbe-button cbe-button-secondary">Curriculum</Link><Link href={`/council/${membership.council.id}/assessments`} className="cbe-button cbe-button-secondary">Assessments</Link><Link href={`/council/${membership.council.id}/rubrics`} className="cbe-button cbe-button-secondary">Rubrics</Link></div></article>)}
          {councilMemberships.filter((membership) => membership.role === "COUNCIL_GOVERNANCE_APPROVER").map((membership) => <article key={membership.id} className="rounded-2xl border border-[#dce2f4] bg-white p-5 shadow-[0_2px_8px_rgba(23,36,58,.025)]"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#5368d5]">Council governance approver</p><h3 className="mt-2 text-lg font-semibold text-[#17243a]">{membership.council.name}</h3><p className="mt-2 text-sm leading-6 text-[#718096]">Independently review and approve Council grading rubric versions.</p><Link href={`/council/${membership.council.id}/rubric-review`} className="mt-5 inline-flex cbe-button cbe-button-primary">Review rubrics <span aria-hidden="true">→</span></Link></article>)}
        </div>

        {user.platformOperator?.status === "ACTIVE" ? <section className="mt-9 rounded-2xl border border-[#dce2f4] bg-white p-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#5368d5]">Platform operations</p><h2 className="mt-2 text-lg font-semibold text-[#17243a]">Platform administration</h2><p className="mt-1 text-sm text-[#718096]">Oversee Council configuration and school registration approvals.</p></div><div className="flex flex-wrap gap-2"><Link href="/platform/councils" className="cbe-button cbe-button-secondary">Councils & geography</Link><Link href="/platform/curricula" className="cbe-button cbe-button-secondary">Curricula</Link><Link href="/platform/school-registrations" className="cbe-button cbe-button-primary">School approvals</Link></div></div></section> : null}
        <footer className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-[#e3e8f0] pt-5 text-[11px] text-[#8491a5]"><span>© {new Date().getFullYear()} CBE Assessment Management</span><span>Developed by Softflix</span></footer>
      </div>
    </AppShell>
  );
}
