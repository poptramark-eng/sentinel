"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest, clearStoredCsrfToken } from "../../../lib/api";

interface Registration {
  id: string;
  status: string;
  submittedSchoolName: string;
  registrationCode?: string | null;
  submittedAt: string;
  version: number;
  school: { id: string; name: string; status: string };
  council: { id: string; name: string };
  cluster: {
    id: string;
    name: string;
    zone: { name: string; subcounty: { name: string; county: { name: string } } };
  };
}

interface RegistrationDetail extends Registration {
  initialRegistrant: {
    givenName: string;
    familyName: string;
    displayName?: string | null;
  };
  school: Registration["school"] & {
    identifiers: Array<{
      id: string;
      type: string;
      issuer: string;
      normalizedValue: string;
      verifiedAt?: string | null;
    }>;
  };
  memberships: Array<{ id: string; role: string; status: string }>;
}

interface PageResult {
  items: Registration[];
  page: number;
  pageSize: number;
  total: number;
}

export default function PlatformSchoolRegistrationsPage() {
  const router = useRouter();
  const [queue, setQueue] = useState<PageResult | null>(null);
  const [selected, setSelected] = useState<RegistrationDetail | null>(null);
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadQueue = useCallback(async () => {
    try {
      const response = await apiRequest("/platform/school-registrations");
      if (response.status === 401 || response.status === 403) {
        router.replace("/login");
        return;
      }
      if (!response.ok) {
        throw new Error("The review queue could not be loaded.");
      }
      setQueue((await response.json()) as PageResult);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load queue.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  const loadDetail = useCallback(async (id: string) => {
    const response = await apiRequest(`/platform/school-registrations/${id}`);
    if (!response.ok) throw new Error("Registration details could not be loaded.");
    setSelected((await response.json()) as RegistrationDetail);
    setReason("");
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadQueue();
    });
  }, [loadQueue]);

  const visibleItems = (queue?.items ?? []).filter((item) =>
    `${item.submittedSchoolName} ${item.council.name} ${item.registrationCode ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  async function verifyIdentifier(identifierId: string) {
    if (!selected || reason.trim().length < 12) {
      setError("Add a verification note of at least 12 characters first.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await apiRequest(
        `/platform/school-registrations/${selected.id}/verify-identifier`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifierId, reason }),
        },
      );
      if (!response.ok) throw new Error("Identifier verification failed.");
      await loadDetail(selected.id);
      setNotice("School identifier verified. Review the remaining evidence before deciding.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Identifier verification failed.");
    } finally {
      setBusy(false);
    }
  }

  async function decide(decision: "approve" | "reject") {
    if (!selected || reason.trim().length < 12) {
      setError("A clear decision reason of at least 12 characters is required.");
      return;
    }
    if (
      decision === "approve" &&
      selected.school.identifiers.some((identifier) => !identifier.verifiedAt)
    ) {
      setError("Verify all claimed school identifiers before approval.");
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await apiRequest(
        `/platform/school-registrations/${selected.id}/${decision}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason, expectedVersion: selected.version }),
        },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? "The registration decision could not be saved.");
      }
      setSelected(null);
      setReason("");
      setNotice(decision === "approve" ? "School registration approved." : "School registration rejected.");
      await loadQueue();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Decision failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-[var(--line)] bg-white">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-5 py-4 sm:px-8">
          <a href="/" className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[var(--brand)] text-xs font-bold text-white">CBE</span><span className="text-sm font-semibold text-[var(--ink-strong)]">Platform operations</span></a>
          <div className="flex items-center gap-4"><Link href="/platform/curricula" className="hidden text-xs font-semibold text-[var(--brand)] hover:underline sm:inline">Curriculum</Link><Link href="/platform/councils" className="hidden text-xs font-semibold text-[var(--brand)] hover:underline sm:inline">Council setup</Link><span className="hidden text-xs text-[var(--muted)] sm:inline">Governance · School onboarding</span><button onClick={async () => { await apiRequest("/auth/logout", { method: "POST" }); clearStoredCsrfToken(); router.replace("/login"); }} className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[#52647d] hover:bg-[var(--surface-subtle)]">Sign out</button></div>
        </div>
      </header>

      <div className="mx-auto max-w-[1400px] px-5 py-8 sm:px-8">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand)]">Platform administration</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[var(--ink-strong)]">School registrations</h1><p className="mt-2 text-sm text-[var(--muted)]">Review institutional identity, verify evidence and approve school access.</p></div>
          <div className="flex items-center gap-3"><div className="rounded-xl border border-[var(--line)] bg-white px-4 py-3"><p className="text-[11px] font-medium text-[var(--muted)]">Awaiting review</p><p className="mt-1 text-xl font-semibold text-[var(--ink-strong)]">{queue?.total ?? "—"}</p></div><button onClick={() => { setLoading(true); void loadQueue(); }} className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-[#52647d] hover:bg-[var(--surface-subtle)]">Refresh</button></div>
        </div>

        {error ? <p role="alert" className="mt-5 rounded-xl border border-[#fecaca] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">{error}</p> : null}
        {notice ? <p role="status" className="mt-5 rounded-xl border border-[#cfe9dd] bg-[#f2fbf6] px-4 py-3 text-sm text-[#287653]">{notice}</p> : null}

        <div className="mt-7 grid min-h-[620px] gap-5 lg:grid-cols-[390px_minmax(0,1fr)]">
          <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white">
            <div className="border-b border-[var(--line)] p-4"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-[var(--ink-strong)]">Review queue</h2><span className="text-xs text-[var(--subtle)]">{visibleItems.length} shown</span></div><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search school, Council or code" className="mt-3 w-full rounded-xl border border-[var(--line)] px-3 py-2.5 text-xs outline-none focus:border-[var(--brand)] focus:ring-4 focus:ring-[var(--brand-soft)]" /></div>
            <div className="max-h-[700px] overflow-y-auto">
              {loading ? <p className="p-5 text-sm text-[var(--muted)]">Loading registrations…</p> : null}
              {!loading && visibleItems.length === 0 ? <div className="p-6"><p className="text-sm font-semibold text-[var(--ink-strong)]">No pending registrations</p><p className="mt-2 text-xs leading-5 text-[var(--muted)]">New school submissions will appear here.</p></div> : null}
              {visibleItems.map((item) => <button key={item.id} onClick={() => { setError(""); setNotice(""); loadDetail(item.id).catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to load details.")); }} className={`block w-full border-b border-[var(--line)] p-4 text-left transition hover:bg-[#f8faff] ${selected?.id === item.id ? "bg-[var(--brand-soft)]" : "bg-white"}`}>
                <div className="flex items-start justify-between gap-3"><span className="text-sm font-semibold text-[var(--ink)]">{item.submittedSchoolName}</span><span className="shrink-0 rounded-full bg-[var(--warning-soft)] px-2 py-1 text-[10px] font-semibold text-[var(--warning)]">Pending</span></div>
                <p className="mt-1 text-xs text-[var(--muted)]">{item.council.name}</p>
                <div className="mt-3 flex items-center justify-between text-[11px] text-[var(--subtle)]"><span>{item.cluster.name} · {item.cluster.zone.subcounty.name}</span><span>{new Date(item.submittedAt).toLocaleDateString()}</span></div>
              </button>)}
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--line)] bg-white">
            {!selected ? <div className="grid min-h-[620px] place-items-center p-8 text-center"><div className="max-w-sm"><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[var(--brand-soft)] text-lg text-[var(--brand)]">⌕</div><h2 className="mt-4 text-base font-semibold text-[var(--ink-strong)]">Select a registration</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">Choose a submission from the queue to review its school identity, registration details and evidence.</p></div></div> : <div className="p-5 sm:p-7">
              <div className="flex flex-col justify-between gap-3 border-b border-[var(--line)] pb-5 sm:flex-row sm:items-start"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--brand)]">Registration review</p><h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--ink-strong)]">{selected.submittedSchoolName}</h2><p className="mt-1 text-sm text-[var(--muted)]">Canonical record: {selected.school.name}</p></div><span className="w-fit rounded-full bg-[var(--warning-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--warning)]">Pending review · v{selected.version}</span></div>

              <div className="mt-6 grid gap-6 xl:grid-cols-2">
                <div><h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Institution details</h3><dl className="mt-3 space-y-3 text-sm"><div className="flex justify-between gap-4"><dt className="text-[var(--subtle)]">Council</dt><dd className="text-right font-medium text-[var(--ink)]">{selected.council.name}</dd></div><div className="flex justify-between gap-4"><dt className="text-[var(--subtle)]">Cluster</dt><dd className="text-right font-medium text-[var(--ink)]">{selected.cluster.name}</dd></div><div className="flex justify-between gap-4"><dt className="text-[var(--subtle)]">County</dt><dd className="text-right font-medium text-[var(--ink)]">{selected.cluster.zone.subcounty.county.name}</dd></div><div className="flex justify-between gap-4"><dt className="text-[var(--subtle)]">Registration code</dt><dd className="text-right font-medium text-[var(--ink)]">{selected.registrationCode ?? "Not provided"}</dd></div><div className="flex justify-between gap-4"><dt className="text-[var(--subtle)]">Submitted by</dt><dd className="text-right font-medium text-[var(--ink)]">{selected.initialRegistrant.displayName || `${selected.initialRegistrant.givenName} ${selected.initialRegistrant.familyName}`}</dd></div></dl></div>

                <div><h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">School identifiers</h3><div className="mt-3 space-y-3">
                  {selected.school.identifiers.length === 0 ? <p className="rounded-xl bg-[var(--surface-subtle)] p-4 text-xs leading-5 text-[var(--muted)]">No external identifier was supplied. Review the institution evidence before approval.</p> : selected.school.identifiers.map((identifier) => <div key={identifier.id} className="rounded-xl border border-[var(--line)] p-3"><div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold text-[var(--ink)]">{identifier.type.replaceAll("_", " ")}</span><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${identifier.verifiedAt ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-[var(--warning-soft)] text-[var(--warning)]"}`}>{identifier.verifiedAt ? "Verified" : "Unverified claim"}</span></div><p className="mt-2 break-all text-xs text-[var(--muted)]">{identifier.issuer} · {identifier.normalizedValue}</p>{!identifier.verifiedAt ? <button disabled={busy} onClick={() => verifyIdentifier(identifier.id)} className="mt-3 rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--brand)] hover:bg-[var(--brand-soft)] disabled:opacity-50">Verify identifier</button> : null}</div>)}
                </div></div>
              </div>

              <div className="mt-7 border-t border-[var(--line)] pt-6"><label htmlFor="decision-reason" className="block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Review notes / decision reason</label><textarea id="decision-reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={3} placeholder="Record what you verified, the evidence reviewed, or why the registration is being returned/rejected." className="mt-3 w-full resize-y rounded-xl border border-[var(--line)] px-4 py-3 text-sm leading-6 outline-none focus:border-[var(--brand)] focus:ring-4 focus:ring-[var(--brand-soft)]" /><p className="mt-2 text-[11px] text-[var(--subtle)]">At least 12 characters. Identifier claims must be verified before approval.</p>
                <div className="mt-5 flex flex-wrap justify-end gap-3"><button disabled={busy || reason.trim().length < 12} onClick={() => decide("reject")} className="rounded-xl border border-[#e8caca] px-4 py-3 text-sm font-semibold text-[var(--danger)] hover:bg-[var(--danger-soft)] disabled:opacity-50">Reject registration</button><button disabled={busy || reason.trim().length < 12 || selected.school.identifiers.some((identifier) => !identifier.verifiedAt)} onClick={() => decide("approve")} className="rounded-xl bg-[var(--brand)] px-5 py-3 text-sm font-semibold text-white hover:bg-[var(--brand-strong)] disabled:cursor-not-allowed disabled:opacity-50">Approve school</button></div>
              </div>
            </div>}
          </section>
        </div>
      </div>
    </main>
  );
}
