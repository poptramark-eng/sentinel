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
  if (status === "APPROVED") return "bg-[#eaf8f2] text-[#27825f]";
  if (status === "SUSPENDED") return "bg-[#fff6e8] text-[#a46a16]";
  if (status === "PENDING_REVIEW") return "bg-[#edf4ff] text-[#2457c5]";
  return "bg-[#f1f5f9] text-[#64748b]";
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
    <main className="min-h-screen bg-[#f6f8fc]">
      <header className="border-b border-[#e5eaf1] bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8"><Link href="/workspace" className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#2457c5] text-xs font-bold text-white">S</span><span className="text-sm font-semibold text-[#172b4d]">Sentinel · School onboarding</span></Link><div className="flex items-center gap-3"><Link href="/workspace" className="hidden text-xs font-semibold text-[#64748b] hover:text-[#2457c5] sm:inline">Workspace</Link><button onClick={signOut} className="rounded-lg border border-[#dbe3ee] px-3 py-2 text-xs font-semibold text-[#52647d] hover:bg-[#f6f8fb]">Sign out</button></div></div></header>

      <div className="mx-auto max-w-5xl px-5 py-9 sm:px-8 sm:py-12">
        <div className="flex flex-wrap items-end justify-between gap-4"><div className="max-w-2xl"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2457c5]">Institution onboarding</p><h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[#172b4d] sm:text-4xl">Your school registrations.</h1><p className="mt-3 text-sm leading-7 text-[#64748b]">Track requests submitted under your account. School-management access is activated only after the Platform Administrator approves the relevant Council registration.</p></div>{!active ? <Link href="/school-registration/new" className="inline-flex rounded-xl bg-[#2457c5] px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#1e49a6]">Start a registration</Link> : null}</div>

        {error ? <p role="alert" className="mt-6 rounded-xl border border-[#f3d0d0] bg-[#fff7f7] px-4 py-3 text-sm text-[#a33b3b]">{error}</p> : null}
        {loading ? <div className="mt-8 rounded-2xl border border-[#e5eaf1] bg-white p-6 text-sm text-[#64748b]">Loading your registration history…</div> : null}

        {!loading && active ? <section className="mt-8 rounded-2xl border border-[#dbe7f7] bg-white p-6 sm:p-8"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#2457c5]">Current registration</p><h2 className="mt-2 text-2xl font-semibold text-[#172b4d]">{active.submittedSchoolName}</h2><p className="mt-1 text-sm text-[#64748b]">{active.council.name}</p></div><span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${statusStyle(active.status)}`}>{statusLabel(active.status)}</span></div><p className="mt-5 max-w-2xl text-sm leading-6 text-[#64748b]">{active.status === "PENDING_REVIEW" ? "Your school registration is waiting for Platform Administrator review. You cannot add teachers or manage school operations while it is pending." : active.status === "APPROVED" ? "Your school registration is approved. Your School Administrator capabilities are available in the workspace." : "This school registration is currently suspended. School-management operations remain unavailable while the suspension is active."}</p><dl className="mt-6 grid gap-4 border-t border-[#edf0f5] pt-5 sm:grid-cols-2"><div><dt className="text-xs text-[#94a3b8]">Reference</dt><dd className="mt-1 break-all text-sm font-medium text-[#263b5b]">{active.id}</dd></div><div><dt className="text-xs text-[#94a3b8]">Submitted</dt><dd className="mt-1 text-sm font-medium text-[#263b5b]">{new Date(active.submittedAt).toLocaleString()}</dd></div></dl>{active.decisionReason ? <p className="mt-5 rounded-xl bg-[#f6f8fb] p-4 text-sm leading-6 text-[#64748b]">Review note: {active.decisionReason}</p> : null}<Link href="/workspace" className="mt-6 inline-flex rounded-xl bg-[#2457c5] px-5 py-3 text-sm font-semibold text-white hover:bg-[#1e49a6]">Return to workspace</Link></section> : null}

        {!loading && !active && items.length === 0 ? <section className="mt-8 rounded-2xl border border-[#e5eaf1] bg-white p-8 text-center sm:p-12"><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#edf4ff] text-xl text-[#2457c5]">⌂</div><h2 className="mt-5 text-xl font-semibold text-[#172b4d]">No school registration yet</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#64748b]">Choose the appropriate Council and cluster, provide the school&apos;s official details, and submit a request for independent review.</p><Link href="/school-registration/new" className="mt-6 inline-flex rounded-xl bg-[#2457c5] px-5 py-3 text-sm font-semibold text-white hover:bg-[#1e49a6]">Register a school</Link></section> : null}

        {!loading && previous.length > 0 ? <section className="mt-8 rounded-2xl border border-[#e5eaf1] bg-white p-6"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-[#172b4d]">Previous requests</h2><span className="text-xs text-[#94a3b8]">{previous.length}</span></div><div className="mt-4 divide-y divide-[#edf0f5]">{previous.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="text-sm font-medium text-[#263b5b]">{item.submittedSchoolName}</p><p className="mt-1 text-xs text-[#94a3b8]">{item.council.name} · {new Date(item.submittedAt).toLocaleDateString()}</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyle(item.status)}`}>{statusLabel(item.status)}</span></div>)}</div>{!active ? <Link href="/school-registration/new" className="mt-5 inline-flex text-sm font-semibold text-[#2457c5] hover:underline">Submit another school request</Link> : null}</section> : null}
      </div>
    </main>
  );
}
