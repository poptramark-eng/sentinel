"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, clearStoredCsrfToken } from "../../../lib/api";

type Council = { id: string; name: string; slug: string };
type Cluster = { id: string; name: string; code: string | null; region: string; county: string; subcounty: string; zone: string };
type Submitted = { id: string; status: string; submittedSchoolName: string; submittedAt: string; school: { id: string; name: string }; council: { id: string; name: string } };
type IdentifierType = "MINISTRY_REGISTRY" | "COUNCIL_REGISTRY" | "OTHER";

async function responseMessage(response: Response, fallback: string): Promise<string> {
  const payload = await response.json().catch(() => null) as { message?: string | string[] } | null;
  if (Array.isArray(payload?.message)) return payload.message.join(" ");
  return payload?.message ?? fallback;
}

export default function NewSchoolRegistrationPage() {
  const router = useRouter();
  const [councils, setCouncils] = useState<Council[]>([]);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [councilId, setCouncilId] = useState("");
  const [clusterId, setClusterId] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [registrationCode, setRegistrationCode] = useState("");
  const [hasIdentifier, setHasIdentifier] = useState(false);
  const [identifierType, setIdentifierType] = useState<IdentifierType>("MINISTRY_REGISTRY");
  const [issuer, setIssuer] = useState("Ministry of Education");
  const [identifierValue, setIdentifierValue] = useState("");
  const [loadingCouncils, setLoadingCouncils] = useState(true);
  const [loadingRegistration, setLoadingRegistration] = useState(true);
  const [activeRegistration, setActiveRegistration] = useState<Submitted | null>(null);
  const [loadingClusters, setLoadingClusters] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState<Submitted | null>(null);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      void apiRequest("/school-registrations/options/councils")
        .then(async (response) => {
          if (response.status === 401) { router.replace("/login"); return []; }
          if (!response.ok) throw new Error(await responseMessage(response, "Council options could not be loaded."));
          return await response.json() as Council[];
        })
        .then((items) => {
          if (cancelled || !items) return;
          setCouncils(items);
          const onlyCouncil = items.length === 1 ? items[0] : undefined;
          if (onlyCouncil) setCouncilId(onlyCouncil.id);
        })
        .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Council options could not be loaded."); })
        .finally(() => { if (!cancelled) setLoadingCouncils(false); });
    });
    return () => { cancelled = true; };
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      void apiRequest("/school-registrations/mine?page=1&pageSize=50")
        .then(async (response) => {
          if (response.status === 401) { router.replace("/login"); return { items: [] as Submitted[] }; }
          if (!response.ok) throw new Error(await responseMessage(response, "Your registration history could not be be checked."));
          return await response.json() as { items: Submitted[] };
        })
        .then((data) => {
          if (cancelled || !data) return;
          setActiveRegistration(data.items.find((item) => ["PENDING_REVIEW", "APPROVED", "SUSPENDED"].includes(item.status)) ?? null);
        })
        .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Your registration history could not be checked."); })
        .finally(() => { if (!cancelled) setLoadingRegistration(false); });
    });
    return () => { cancelled = true; };
  }, [router]);

  useEffect(() => {
    if (!councilId) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setLoadingClusters(true);
      void apiRequest(`/school-registrations/options/councils/${councilId}/clusters`)
        .then(async (response) => {
          if (response.status === 401) { router.replace("/login"); return []; }
          if (!response.ok) throw new Error(await responseMessage(response, "Clusters for this Council could not be loaded."));
          return await response.json() as Cluster[];
        })
        .then((items) => { if (!cancelled && items) setClusters(items); })
        .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Clusters could not be loaded."); })
        .finally(() => { if (!cancelled) setLoadingClusters(false); });
    });
    return () => { cancelled = true; };
  }, [councilId, router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!councilId || !clusterId) { setError("Choose the Council and cluster for this school."); return; }
    if (hasIdentifier && (issuer.trim().length < 2 || identifierValue.trim().length < 2)) { setError("Complete both the identifier issuer and identifier value, or leave the identifier claim blank."); return; }

    setSubmitting(true);
    try {
      const response = await apiRequest("/school-registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          councilId,
          clusterId,
          school: {
            name: schoolName.trim(),
            ...(hasIdentifier ? { identifier: { type: identifierType, issuer: issuer.trim(), value: identifierValue.trim() } } : {}),
          },
          ...(registrationCode.trim() ? { registrationCode: registrationCode.trim() } : {}),
        }),
      });
      if (response.status === 401) { router.replace("/login"); return; }
      if (!response.ok) throw new Error(await responseMessage(response, "The school registration could not be submitted."));
      setSubmitted((await response.json()) as Submitted);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The school registration could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  }

  const selectedCouncil = councils.find((council) => council.id === councilId);

  return (
    <main className="min-h-screen">
      <header className="border-b border-[#e5eaf1] bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8"><Link href="/workspace" className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#2457c5] text-xs font-bold text-white">S</span><span className="text-sm font-semibold text-[#172b4d]">School onboarding</span></Link><div className="flex items-center gap-4"><Link href="/school-registration" className="text-xs font-semibold text-[#52647d] hover:text-[#2457c5]">My registrations</Link><button onClick={async () => { await apiRequest("/auth/logout", { method: "POST" }); clearStoredCsrfToken(); router.replace("/login"); }} className="rounded-lg border border-[#dbe3ee] px-3 py-2 text-xs font-semibold text-[#52647d] hover:bg-[#f6f8fb]">Sign out</button></div></div></header>

      <section className="mx-auto grid max-w-6xl gap-8 px-5 py-10 lg:grid-cols-[minmax(0,1fr)_340px] sm:px-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2457c5]">Institutional onboarding · Step 2</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#172b4d]">Register your school.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#64748b]">Provide the school identity and the Council geography where it operates. Your request is reviewed independently before the School Administrator membership becomes active.</p>

          {error ? <p role="alert" className="mt-5 rounded-xl border border-[#f3d0d0] bg-[#fff7f7] px-4 py-3 text-sm text-[#a33b3b]">{error}</p> : null}

          {loadingRegistration ? <div className="mt-8 rounded-2xl border border-[#e5eaf1] bg-white p-6 text-sm text-[#64748b]">Checking your existing school registrations…</div> : null}

          {!loadingRegistration && activeRegistration && !submitted ? (
            <div className="mt-8 rounded-2xl border border-[#dbe7f7] bg-white p-6 sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#2457c5]">Active registration already exists</p>
              <h2 className="mt-2 text-2xl font-semibold text-[#172b4d]">{activeRegistration.submittedSchoolName}</h2>
              <p className="mt-2 text-sm text-[#64748b]">{activeRegistration.council.name} · {activeRegistration.status.replaceAll("_", " ")}</p>
              <p className="mt-4 text-sm leading-6 text-[#64748b]">You already have an active registration request for this account. Resolve it before starting another school registration.</p>
              <Link href="/school-registration" className="mt-6 inline-flex rounded-xl bg-[#2457c5] px-5 py-3 text-sm font-semibold text-white hover:bg-[#1e49a6]">View registration status</Link>
            </div>
          ) : null}

          {submitted ? (
            <div className="mt-8 rounded-2xl border border-[#cfe9dd] bg-white p-6 sm:p-8">
              <div className="grid size-12 place-items-center rounded-full bg-[#e8f6ef] text-xl text-[#26744f]">✓</div>
              <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-[#26744f]">Submitted for review</p>
              <h2 className="mt-2 text-2xl font-semibold text-[#172b4d]">{submitted.submittedSchoolName}</h2>
              <p className="mt-2 text-sm text-[#64748b]">{submitted.council.name}</p>
              <p className="mt-4 text-sm leading-6 text-[#52647d]">Your registration is now pending Platform Administrator review. You will remain unable to manage the school or add staff until it is approved.</p>
              <div className="mt-6 flex flex-wrap gap-3"><Link href="/school-registration" className="rounded-xl bg-[#2457c5] px-5 py-3 text-sm font-semibold text-white hover:bg-[#1e49a6]">View registration status</Link><Link href="/workspace" className="rounded-xl border border-[#dbe3ee] px-5 py-3 text-sm font-semibold text-[#52647d] hover:bg-[#f7f9fc]">Return to workspace</Link></div>
            </div>
          ) : !loadingRegistration && !activeRegistration ? (
            <form onSubmit={submit} className="mt-8 space-y-6 rounded-2xl border border-[#e5eaf1] bg-white p-5 sm:p-7">
              <section><div className="mb-4"><h2 className="text-base font-semibold text-[#172b4d]">School identity</h2><p className="mt-1 text-xs leading-5 text-[#7b8ba2]">Use the institution&apos;s official registered name. A name alone is not used to merge school identities.</p></div>
                <div><label htmlFor="school-name" className="mb-2 block text-sm font-medium text-[#263b5b]">Official school name</label><input id="school-name" required minLength={2} maxLength={180} value={schoolName} onChange={(event) => setSchoolName(event.target.value)} placeholder="e.g. Example Primary School" className="w-full rounded-xl border border-[#dbe3ee] px-4 py-3 text-sm outline-none focus:border-[#6d94e8] focus:ring-4 focus:ring-[#eaf1ff]" /></div>
                <div className="mt-4"><label htmlFor="registration-code" className="mb-2 block text-sm font-medium text-[#263b5b]">Council registration code <span className="font-normal text-[#94a3b8]">(optional)</span></label><input id="registration-code" maxLength={80} value={registrationCode} onChange={(event) => setRegistrationCode(event.target.value)} placeholder="If your Council has already issued one" className="w-full rounded-xl border border-[#dbe3ee] px-4 py-3 text-sm outline-none focus:border-[#6d94e8] focus:ring-4 focus:ring-[#eaf1ff]" /></div>
                <div className="mt-5 rounded-xl border border-[#e5eaf1] p-4"><label className="flex items-start gap-3"><input type="checkbox" checked={hasIdentifier} onChange={(event) => setHasIdentifier(event.target.checked)} className="mt-1 size-4 rounded border-[#cbd5e1] accent-[#2457c5]" /><span><span className="block text-sm font-semibold text-[#263b5b]">I have an official school identifier</span><span className="mt-1 block text-xs leading-5 text-[#7b8ba2]">Optional. A claimed identifier must be independently verified by the Platform Administrator.</span></span></label>
                  {hasIdentifier ? <div className="mt-4 grid gap-4 sm:grid-cols-2"><div><label htmlFor="identifier-type" className="mb-1.5 block text-xs font-semibold text-[#52647d]">Identifier source</label><select id="identifier-type" value={identifierType} onChange={(event) => setIdentifierType(event.target.value as IdentifierType)} className="w-full rounded-xl border border-[#dbe3ee] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#6d94e8]"><option value="MINISTRY_REGISTRY">Ministry registry</option><option value="COUNCIL_REGISTRY">Council registry</option><option value="OTHER">Other issuer</option></select></div><div><label htmlFor="identifier-issuer" className="mb-1.5 block text-xs font-semibold text-[#52647d]">Issuer name</label><input id="identifier-issuer" required minLength={2} maxLength={120} value={issuer} onChange={(event) => setIssuer(event.target.value)} placeholder="Ministry of Education" className="w-full rounded-xl border border-[#dbe3ee] px-3 py-2.5 text-sm outline-none focus:border-[#6d94e8]" /></div><div className="sm:col-span-2"><label htmlFor="identifier-value" className="mb-1.5 block text-xs font-semibold text-[#52647d]">Identifier value</label><input id="identifier-value" required minLength={2} maxLength={120} value={identifierValue} onChange={(event) => setIdentifierValue(event.target.value)} placeholder="Enter the official identifier exactly as issued" className="w-full rounded-xl border border-[#dbe3ee] px-3 py-2.5 text-sm outline-none focus:border-[#6d94e8]" /></div></div> : null}
                </div>
              </section>

              <div className="h-px bg-[#edf1f6]" />
              <section><div className="mb-4"><h2 className="text-base font-semibold text-[#172b4d]">Council and location</h2><p className="mt-1 text-xs leading-5 text-[#7b8ba2]">Select the Council and the smallest configured geography group that contains your school.</p></div>
                <div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="council" className="mb-2 block text-sm font-medium text-[#263b5b]">Council</label><select id="council" required disabled={loadingCouncils || councils.length === 0} value={councilId} onChange={(event) => { setCouncilId(event.target.value); setClusters([]); setClusterId(""); setLoadingClusters(false); }} className="w-full rounded-xl border border-[#dbe3ee] bg-white px-4 py-3 text-sm outline-none focus:border-[#6d94e8] disabled:bg-[#f7f9fc]">{loadingCouncils ? <option value="">Loading Councils…</option> : <option value="">Choose a Council…</option>}{councils.map((council) => <option key={council.id} value={council.id}>{council.name}</option>)}</select></div><div><label htmlFor="cluster" className="mb-2 block text-sm font-medium text-[#263b5b]">Cluster</label><select id="cluster" required disabled={!councilId || loadingClusters || clusters.length === 0} value={clusterId} onChange={(event) => setClusterId(event.target.value)} className="w-full rounded-xl border border-[#dbe3ee] bg-white px-4 py-3 text-sm outline-none focus:border-[#6d94e8] disabled:bg-[#f7f9fc]">{loadingClusters ? <option value="">Loading clusters…</option> : <option value="">Choose a cluster…</option>}{clusters.map((cluster) => <option key={cluster.id} value={cluster.id}>{cluster.name} — {cluster.region} / {cluster.county} / {cluster.subcounty} / {cluster.zone}</option>)}</select></div></div>
                {!loadingCouncils && councils.length === 0 ? <p className="mt-3 rounded-xl bg-[#fff8ec] px-4 py-3 text-xs leading-5 text-[#936522]">No active Councils are configured yet. Please contact the platform team; registration will become available when Council geography is ready.</p> : null}
                {councilId && !loadingClusters && clusters.length === 0 ? <p className="mt-3 rounded-xl bg-[#fff8ec] px-4 py-3 text-xs leading-5 text-[#936522]">This Council has no active clusters configured yet. Please contact the platform team before submitting.</p> : null}
                {selectedCouncil ? <p className="mt-3 text-xs text-[#8a99ad]">Selected Council: {selectedCouncil.name}</p> : null}
              </section>

              <div className="flex flex-col-reverse justify-between gap-3 border-t border-[#edf1f6] pt-5 sm:flex-row sm:items-center"><p className="max-w-md text-xs leading-5 text-[#8a99ad]">By submitting, you confirm that the details are accurate and that you are authorized to initiate this request.</p><button type="submit" disabled={submitting || loadingCouncils || loadingClusters || !councils.length || !clusters.length} className="rounded-xl bg-[#2457c5] px-6 py-3 text-sm font-semibold text-white hover:bg-[#1e49a6] disabled:cursor-not-allowed disabled:opacity-50">{submitting ? "Submitting…" : "Submit for review"}</button></div>
            </form>
          ) : null}
        </div>

        <aside className="h-fit rounded-2xl border border-[#e5eaf1] bg-white p-5 sm:p-6"><p className="text-xs font-semibold uppercase tracking-wide text-[#2457c5]">What happens next</p><ol className="mt-5 space-y-5"><li className="flex gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#edf4ff] text-xs font-bold text-[#2457c5]">1</span><div><p className="text-sm font-semibold text-[#263b5b]">Independent review</p><p className="mt-1 text-xs leading-5 text-[#7b8ba2]">A Platform Administrator checks the school identity, Council and location details.</p></div></li><li className="flex gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#edf4ff] text-xs font-bold text-[#2457c5]">2</span><div><p className="text-sm font-semibold text-[#263b5b]">Decision and feedback</p><p className="mt-1 text-xs leading-5 text-[#7b8ba2]">You can track the review status and read the reason if the request is returned or rejected.</p></div></li><li className="flex gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#edf4ff] text-xs font-bold text-[#2457c5]">3</span><div><p className="text-sm font-semibold text-[#263b5b]">School access activates</p><p className="mt-1 text-xs leading-5 text-[#7b8ba2]">If approved, your pending School Administrator membership becomes active for this Council registration.</p></div></li></ol><div className="mt-6 rounded-xl bg-[#f7f9fc] p-4"><p className="text-xs font-semibold text-[#52647d]">Important</p><p className="mt-1 text-xs leading-5 text-[#7b8ba2]">A school name or identifier claim is not proof of ownership. Do not submit another school&apos;s details or credentials.</p></div></aside>
      </section>
    </main>
  );
}
