"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, clearStoredCsrfToken } from "../../lib/api";

interface RegistrationItem {
  id: string;
  status: string;
  submittedSchoolName: string;
  submittedAt: string;
  reviewedAt?: string | null;
  decisionReason?: string | null;
  school: { id: string; name: string };
  council: { id: string; name: string };
}

const ACTIVE_STATUSES = new Set(["PENDING_REVIEW", "APPROVED", "SUSPENDED"]);

function statusLabel(status: string): string {
  return status.replaceAll("_", " ").toLowerCase().replace(/^./, (value) => value.toUpperCase());
}

function statusStyle(status: string): string {
  if (status === "APPROVED") return "bg-[var(--success-soft)] text-[var(--success)]";
  if (status === "SUSPENDED") return "bg-[var(--warning-soft)] text-[var(--warning)]";
  if (status === "PENDING_REVIEW") return "bg-[var(--brand-soft)] text-[var(--brand)]";
  return "bg-[#f1f5f9] text-[var(--muted)]";
}

export default function SchoolRegistrationOverviewPage() {
  const router = useRouter();
  const [items, setItems] = useState<RegistrationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await apiRequest("/school-registrations/mine?page=1&pageSize=50");
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok) throw new Error("Your school registration history could not be loaded.");
      const data = (await response.json()) as { items: RegistrationItem[] };
      setItems(data.items);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load registrations.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);

  async function signOut() {
    await apiRequest("/auth/logout", { method: "POST" });
    clearStoredCsrfToken();
    router.replace("/login");
  }

  const active = items.find((item) => ACTIVE_STATUSES.has(item.status));
  const previous = items.filter((item) => !ACTIVE_STATUSES.has(item.status));

  return (
    <main className="min-h-screen bg-[var(--canvas)]">
      <header className="border-b border-[var(--line)] bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8"><Link href="/workspace" className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[var(--brand)] text-xs font-bold text-white">S</span><span className="text-sm font-semibold text-[var(--ink-strong)]">cbe · School onboarding</span></Link><div className="flex items-center gap-3"><Link href="/workspace" className="hidden text-xs font-semibold text-[var(--muted)] hover:text-[var(--brand)] sm:inline">Workspace</Link><button onClick={signOut} className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[#52647d] hover:bg-[var(--surface-subtle)]">Sign out</button></div></div></header>

      <div className="mx-auto max-w-5xl px-5 py-9 sm:px-8 sm:py-12">
        <div className="flex flex-wrap items-end justify-between gap-4"><div className="max-w-2xl"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand)]">Institution onboarding</p><h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--ink-strong)] sm:text-4xl">Your school registrations.</h1><p className="mt-3 text-sm leading-7 text-[var(--muted)]">Track requests submitted under your account. School-management access is activated only after the Platform Administrator approves the relevant Council registration.</p></div>{!active ? <Link href="/school-registration/new" className="inline-flex rounded-xl bg-[var(--brand)] px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[var(--brand-strong)]">Start a registration</Link> : null}</div>

        {error ? <p role="alert" className="mt-6 rounded-xl border border-[#fecaca] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">{error}</p> : null}
        {loading ? <div className="mt-8 rounded-2xl border border-[var(--line)] bg-white p-6 text-sm text-[var(--muted)]">Loading your registration history…</div> : null}

        {!loading && active ? <section className="mt-8 rounded-2xl border border-[var(--brand-border)] bg-white p-6 sm:p-8"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--brand)]">Current registration</p><h2 className="mt-2 text-2xl font-semibold text-[var(--ink-strong)]">{active.submittedSchoolName}</h2><p className="mt-1 text-sm text-[var(--muted)]">{active.council.name}</p></div><span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${statusStyle(active.status)}`}>{statusLabel(active.status)}</span></div><p className="mt-5 max-w-2xl text-sm leading-6 text-[var(--muted)]">{active.status === "PENDING_REVIEW" ? "Your school registration is waiting for Platform Administrator review. You cannot add teachers or manage school operations while it is pending." : active.status === "APPROVED" ? "Your school registration is approved. Your School Administrator capabilities are available in the workspace." : "This school registration is currently suspended. School-management operations remain unavailable while the suspension is active."}</p><dl className="mt-6 grid gap-4 border-t border-[var(--line)] pt-5 sm:grid-cols-2"><div><dt className="text-xs text-[var(--subtle)]">Reference</dt><dd className="mt-1 break-all text-sm font-medium text-[var(--ink)]">{active.id}</dd></div><div><dt className="text-xs text-[var(--subtle)]">Submitted</dt><dd className="mt-1 text-sm font-medium text-[var(--ink)]">{new Date(active.submittedAt).toLocaleString()}</dd></div></dl>{active.decisionReason ? <p className="mt-5 rounded-xl bg-[var(--surface-subtle)] p-4 text-sm leading-6 text-[var(--muted)]">Review note: {active.decisionReason}</p> : null}<Link href="/workspace" className="mt-6 inline-flex rounded-xl bg-[var(--brand)] px-5 py-3 text-sm font-semibold text-white hover:bg-[var(--brand-strong)]">Return to workspace</Link></section> : null}

        {!loading && !active && items.length === 0 ? <section className="mt-8 rounded-2xl border border-[var(--line)] bg-white p-8 text-center sm:p-12"><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[var(--brand-soft)] text-xl text-[var(--brand)]">⌂</div><h2 className="mt-5 text-xl font-semibold text-[var(--ink-strong)]">No school registration yet</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">Choose the appropriate Council and cluster, provide the school&apos;s official details, and submit a request for independent review.</p><Link href="/school-registration/new" className="mt-6 inline-flex rounded-xl bg-[var(--brand)] px-5 py-3 text-sm font-semibold text-white hover:bg-[var(--brand-strong)]">Register a school</Link></section> : null}

        {!loading && previous.length > 0 ? <section className="mt-8 rounded-2xl border border-[var(--line)] bg-white p-6"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-[var(--ink-strong)]">Previous requests</h2><span className="text-xs text-[var(--subtle)]">{previous.length}</span></div><div className="mt-4 divide-y divide-[var(--line)]">{previous.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="text-sm font-medium text-[var(--ink)]">{item.submittedSchoolName}</p><p className="mt-1 text-xs text-[var(--subtle)]">{item.council.name} · {new Date(item.submittedAt).toLocaleDateString()}</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyle(item.status)}`}>{statusLabel(item.status)}</span></div>)}</div>{!active ? <Link href="/school-registration/new" className="mt-5 inline-flex text-sm font-semibold text-[var(--brand)] hover:underline">Submit another school request</Link> : null}</section> : null}
      </div>
    </main>
  );
}
