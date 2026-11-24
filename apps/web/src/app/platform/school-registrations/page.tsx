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
      <header className="border-b border-[#e5eaf1] bg-white">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-5 py-4 sm:px-8">
          <a href="/" className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#2457c5] text-xs font-bold text-white">CBE</span><span className="text-sm font-semibold text-[#172b4d]">Platform operations</span></a>
          <div className="flex items-center gap-4"><Link href="/platform/curricula" className="hidden text-xs font-semibold text-[#2457c5] hover:underline sm:inline">Curriculum</Link><Link href="/platform/councils" className="hidden text-xs font-semibold text-[#2457c5] hover:underline sm:inline">Council setup</Link><span className="hidden text-xs text-[#64748b] sm:inline">Governance · School onboarding</span><button onClick={async () => { await apiRequest("/auth/logout", { method: "POST" }); clearStoredCsrfToken(); router.replace("/login"); }} className="rounded-lg border border-[#dbe3ee] px-3 py-2 text-xs font-semibold text-[#52647d] hover:bg-[#f6f8fb]">Sign out</button></div>
        </div>
      </header>

      <div className="mx-auto max-w-[1400px] px-5 py-8 sm:px-8">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2457c5]">Platform administration</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#172b4d]">School registrations</h1><p className="mt-2 text-sm text-[#64748b]">Review institutional identity, verify evidence and approve school access.</p></div>
          <div className="flex items-center gap-3"><div className="rounded-xl border border-[#e5eaf1] bg-white px-4 py-3"><p className="text-[11px] font-medium text-[#64748b]">Awaiting review</p><p className="mt-1 text-xl font-semibold text-[#172b4d]">{queue?.total ?? "—"}</p></div><button onClick={() => { setLoading(true); void loadQueue(); }} className="rounded-xl border border-[#dbe3ee] bg-white px-4 py-3 text-sm font-semibold text-[#52647d] hover:bg-[#f6f8fb]">Refresh</button></div>
        </div>

        {error ? <p role="alert" className="mt-5 rounded-xl border border-[#f3d0d0] bg-[#fff7f7] px-4 py-3 text-sm text-[#a33b3b]">{error}</p> : null}
        {notice ? <p role="status" className="mt-5 rounded-xl border border-[#cfe9dd] bg-[#f2fbf6] px-4 py-3 text-sm text-[#287653]">{notice}</p> : null}

        <div className="mt-7 grid min-h-[620px] gap-5 lg:grid-cols-[390px_minmax(0,1fr)]">
          <section className="overflow-hidden rounded-2xl border border-[#e5eaf1] bg-white">
            <div className="border-b border-[#edf0f5] p-4"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-[#172b4d]">Review queue</h2><span className="text-xs text-[#94a3b8]">{visibleItems.length} shown</span></div><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search school, Council or code" className="mt-3 w-full rounded-xl border border-[#dbe3ee] px-3 py-2.5 text-xs outline-none focus:border-[#6d94e8] focus:ring-4 focus:ring-[#eaf1ff]" /></div>
            <div className="max-h-[700px] overflow-y-auto">
              {loading ? <p className="p-5 text-sm text-[#64748b]">Loading registrations…</p> : null}
              {!loading && visibleItems.length === 0 ? <div className="p-6"><p className="text-sm font-semibold text-[#172b4d]">No pending registrations</p><p className="mt-2 text-xs leading-5 text-[#64748b]">New school submissions will appear here.</p></div> : null}
              {visibleItems.map((item) => <button key={item.id} onClick={() => { setError(""); setNotice(""); loadDetail(item.id).catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to load details.")); }} className={`block w-full border-b border-[#edf0f5] p-4 text-left transition hover:bg-[#f8faff] ${selected?.id === item.id ? "bg-[#f2f6ff]" : "bg-white"}`}>
                <div className="flex items-start justify-between gap-3"><span className="text-sm font-semibold text-[#263b5b]">{item.submittedSchoolName}</span><span className="shrink-0 rounded-full bg-[#fff6e8] px-2 py-1 text-[10px] font-semibold text-[#a46a16]">Pending</span></div>
                <p className="mt-1 text-xs text-[#64748b]">{item.council.name}</p>
                <div className="mt-3 flex items-center justify-between text-[11px] text-[#94a3b8]"><span>{item.cluster.name} · {item.cluster.zone.subcounty.name}</span><span>{new Date(item.submittedAt).toLocaleDateString()}</span></div>
              </button>)}
            </div>
          </section>

          <section className="rounded-2xl border border-[#e5eaf1] bg-white">
            {!selected ? <div className="grid min-h-[620px] place-items-center p-8 text-center"><div className="max-w-sm"><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#edf4ff] text-lg text-[#2457c5]">⌕</div><h2 className="mt-4 text-base font-semibold text-[#172b4d]">Select a registration</h2><p className="mt-2 text-sm leading-6 text-[#64748b]">Choose a submission from the queue to review its school identity, registration details and evidence.</p></div></div> : <div className="p-5 sm:p-7">
              <div className="flex flex-col justify-between gap-3 border-b border-[#edf0f5] pb-5 sm:flex-row sm:items-start"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#2457c5]">Registration review</p><h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#172b4d]">{selected.submittedSchoolName}</h2><p className="mt-1 text-sm text-[#64748b]">Canonical record: {selected.school.name}</p></div><span className="w-fit rounded-full bg-[#fff6e8] px-3 py-1.5 text-xs font-semibold text-[#a46a16]">Pending review · v{selected.version}</span></div>

              <div className="mt-6 grid gap-6 xl:grid-cols-2">
                <div><h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[#64748b]">Institution details</h3><dl className="mt-3 space-y-3 text-sm"><div className="flex justify-between gap-4"><dt className="text-[#94a3b8]">Council</dt><dd className="text-right font-medium text-[#263b5b]">{selected.council.name}</dd></div><div className="flex justify-between gap-4"><dt className="text-[#94a3b8]">Cluster</dt><dd className="text-right font-medium text-[#263b5b]">{selected.cluster.name}</dd></div><div className="flex justify-between gap-4"><dt className="text-[#94a3b8]">County</dt><dd className="text-right font-medium text-[#263b5b]">{selected.cluster.zone.subcounty.county.name}</dd></div><div className="flex justify-between gap-4"><dt className="text-[#94a3b8]">Registration code</dt><dd className="text-right font-medium text-[#263b5b]">{selected.registrationCode ?? "Not provided"}</dd></div><div className="flex justify-between gap-4"><dt className="text-[#94a3b8]">Submitted by</dt><dd className="text-right font-medium text-[#263b5b]">{selected.initialRegistrant.displayName || `${selected.initialRegistrant.givenName} ${selected.initialRegistrant.familyName}`}</dd></div></dl></div>

                <div><h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[#64748b]">School identifiers</h3><div className="mt-3 space-y-3">
                  {selected.school.identifiers.length === 0 ? <p className="rounded-xl bg-[#f6f8fb] p-4 text-xs leading-5 text-[#64748b]">No external identifier was supplied. Review the institution evidence before approval.</p> : selected.school.identifiers.map((identifier) => <div key={identifier.id} className="rounded-xl border border-[#e5eaf1] p-3"><div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold text-[#263b5b]">{identifier.type.replaceAll("_", " ")}</span><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${identifier.verifiedAt ? "bg-[#eaf8f2] text-[#27825f]" : "bg-[#fff6e8] text-[#a46a16]"}`}>{identifier.verifiedAt ? "Verified" : "Unverified claim"}</span></div><p className="mt-2 break-all text-xs text-[#64748b]">{identifier.issuer} · {identifier.normalizedValue}</p>{!identifier.verifiedAt ? <button disabled={busy} onClick={() => verifyIdentifier(identifier.id)} className="mt-3 rounded-lg border border-[#dbe3ee] px-3 py-2 text-xs font-semibold text-[#2457c5] hover:bg-[#f2f6ff] disabled:opacity-50">Verify identifier</button> : null}</div>)}
                </div></div>
              </div>

              <div className="mt-7 border-t border-[#edf0f5] pt-6"><label htmlFor="decision-reason" className="block text-xs font-semibold uppercase tracking-[0.12em] text-[#64748b]">Review notes / decision reason</label><textarea id="decision-reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={3} placeholder="Record what you verified, the evidence reviewed, or why the registration is being returned/rejected." className="mt-3 w-full resize-y rounded-xl border border-[#dbe3ee] px-4 py-3 text-sm leading-6 outline-none focus:border-[#6d94e8] focus:ring-4 focus:ring-[#eaf1ff]" /><p className="mt-2 text-[11px] text-[#94a3b8]">At least 12 characters. Identifier claims must be verified before approval.</p>
                <div className="mt-5 flex flex-wrap justify-end gap-3"><button disabled={busy || reason.trim().length < 12} onClick={() => decide("reject")} className="rounded-xl border border-[#e8caca] px-4 py-3 text-sm font-semibold text-[#a33b3b] hover:bg-[#fff7f7] disabled:opacity-50">Reject registration</button><button disabled={busy || reason.trim().length < 12 || selected.school.identifiers.some((identifier) => !identifier.verifiedAt)} onClick={() => decide("approve")} className="rounded-xl bg-[#2457c5] px-5 py-3 text-sm font-semibold text-white hover:bg-[#1e49a6] disabled:cursor-not-allowed disabled:opacity-50">Approve school</button></div>
              </div>
            </div>}
          </section>
        </div>
      </div>
    </main>
  );
}
