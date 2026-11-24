"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, clearStoredCsrfToken } from "../../../lib/api";

interface Council {
  id: string;
  name: string;
  slug: string;
  status: string;
  _count: { regions: number; registrations: number };
}

interface Cluster {
  id: string;
  name: string;
  code?: string | null;
  status: string;
}

interface Zone {
  id: string;
  name: string;
  code?: string | null;
  status: string;
  clusters: Cluster[];
}

interface Subcounty {
  id: string;
  name: string;
  code?: string | null;
  status: string;
  zones: Zone[];
}

interface County {
  id: string;
  name: string;
  code?: string | null;
  status: string;
  subcounties: Subcounty[];
}

interface Region {
  id: string;
  name: string;
  code?: string | null;
  status: string;
  counties: County[];
}

interface Geography {
  council: { id: string; name: string; slug: string; status: string };
  regions: Region[];
}

interface ParentOption {
  id: string;
  label: string;
}

const NODE_TYPES = [
  { value: "REGION", label: "Region" },
  { value: "COUNTY", label: "County" },
  { value: "SUBCOUNTY", label: "Subcounty" },
  { value: "ZONE", label: "Zone" },
  { value: "CLUSTER", label: "Cluster" },
];

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export default function PlatformCouncilsPage() {
  const router = useRouter();
  const [councils, setCouncils] = useState<Council[]>([]);
  const [selectedCouncilId, setSelectedCouncilId] = useState("");
  const [geography, setGeography] = useState<Geography | null>(null);
  const [councilName, setCouncilName] = useState("");
  const [councilSlug, setCouncilSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [nodeType, setNodeType] = useState("REGION");
  const [parentId, setParentId] = useState("");
  const [nodeName, setNodeName] = useState("");
  const [nodeCode, setNodeCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadCouncils = useCallback(async () => {
    const response = await apiRequest("/platform/councils");
    if (response.status === 401) {
      router.replace("/login");
      return [] as Council[];
    }
    if (response.status === 403) {
      router.replace("/workspace");
      return [] as Council[];
    }
    if (!response.ok) throw new Error("Council directory could not be loaded.");
    const data = (await response.json()) as Council[];
    setCouncils(data);
    setSelectedCouncilId((current) => current || data[0]?.id || "");
    return data;
  }, [router]);

  const loadGeography = useCallback(async (id: string) => {
    if (!id) {
      setGeography(null);
      return;
    }
    const response = await apiRequest(`/platform/councils/${id}/geography`);
    if (!response.ok) throw new Error("Council geography could not be loaded.");
    setGeography((await response.json()) as Geography);
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      void loadCouncils()
        .then(() => { if (active) setError(""); })
        .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load Councils."); })
        .finally(() => { if (active) setLoading(false); });
    });
    return () => { active = false; };
  }, [loadCouncils]);

  useEffect(() => {
    let active = true;
    if (!selectedCouncilId) {
      queueMicrotask(() => { if (active) setGeography(null); });
      return () => { active = false; };
    }
    queueMicrotask(() => {
      void loadGeography(selectedCouncilId)
        .then(() => { if (active) setError(""); })
        .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load geography."); });
    });
    return () => { active = false; };
  }, [selectedCouncilId, loadGeography]);

  const parentOptions = useMemo<ParentOption[]>(() => {
    if (!geography) return [];
    if (nodeType === "COUNTY") return geography.regions.map((region) => ({ id: region.id, label: region.name }));
    if (nodeType === "SUBCOUNTY") return geography.regions.flatMap((region) => region.counties.map((county) => ({ id: county.id, label: `${region.name} / ${county.name}` })));
    if (nodeType === "ZONE") return geography.regions.flatMap((region) => region.counties.flatMap((county) => county.subcounties.map((subcounty) => ({ id: subcounty.id, label: `${region.name} / ${county.name} / ${subcounty.name}` }))));
    if (nodeType === "CLUSTER") return geography.regions.flatMap((region) => region.counties.flatMap((county) => county.subcounties.flatMap((subcounty) => subcounty.zones.map((zone) => ({ id: zone.id, label: `${region.name} / ${county.name} / ${subcounty.name} / ${zone.name}` })))));
    return [];
  }, [geography, nodeType]);

  async function createCouncil(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await apiRequest("/platform/councils", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: councilName, slug: councilSlug }),
      });
      const payload = await response.json().catch(() => null) as { id?: string; message?: string } | null;
      if (!response.ok) throw new Error(payload?.message ?? "Council could not be created.");
      setCouncilName("");
      setCouncilSlug("");
      setSlugTouched(false);
      await loadCouncils();
      if (payload?.id) setSelectedCouncilId(payload.id);
      setNotice("Council created. Add its official geography hierarchy next.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Council creation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function createNode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCouncilId) return;
    if (nodeType !== "REGION" && !parentId) {
      setError("Select the parent geography item first.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await apiRequest(`/platform/councils/${selectedCouncilId}/geography/nodes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: nodeType,
          ...(parentId ? { parentId } : {}),
          name: nodeName,
          ...(nodeCode.trim() ? { code: nodeCode.trim() } : {}),
        }),
      });
      const payload = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(payload?.message ?? "Geography item could not be created.");
      setNodeName("");
      setNodeCode("");
      setParentId("");
      await loadGeography(selectedCouncilId);
      await loadCouncils();
      setNotice(`${NODE_TYPES.find((item) => item.value === nodeType)?.label ?? "Geography item"} created.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Geography item creation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await apiRequest("/auth/logout", { method: "POST" });
    clearStoredCsrfToken();
    router.replace("/login");
  }

  return (
    <main className="min-h-screen bg-[#f6f8fc]">
      <header className="border-b border-[#e5eaf1] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/workspace" className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#2457c5] text-xs font-bold text-white">S</span><span className="text-sm font-semibold text-[#172b4d]">Platform operations</span></Link>
          <div className="flex items-center gap-3"><Link href="/platform/school-registrations" className="hidden text-xs font-semibold text-[#64748b] hover:text-[#2457c5] sm:inline">School reviews</Link><button onClick={signOut} className="rounded-lg border border-[#dbe3ee] px-3 py-2 text-xs font-semibold text-[#52647d] hover:bg-[#f6f8fb]">Sign out</button></div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-9 sm:px-8">
        <div className="max-w-3xl"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2457c5]">Platform configuration</p><h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[#172b4d] sm:text-4xl">Councils and geography.</h1><p className="mt-3 text-sm leading-7 text-[#64748b]">Create a Council tenant, then configure its official Region → County → Subcounty → Zone → Cluster hierarchy. Registrants can only select active items in this hierarchy.</p></div>

        {error ? <p role="alert" className="mt-6 rounded-xl border border-[#f3d0d0] bg-[#fff7f7] px-4 py-3 text-sm text-[#a33b3b]">{error}</p> : null}
        {notice ? <p role="status" className="mt-6 rounded-xl border border-[#cfe9dd] bg-[#f2fbf6] px-4 py-3 text-sm text-[#287653]">{notice}</p> : null}

        <div className="mt-8 grid gap-6 xl:grid-cols-[350px_minmax(0,1fr)]">
          <aside className="space-y-5">
            <section className="rounded-2xl border border-[#e5eaf1] bg-white p-5"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-[#172b4d]">Council directory</h2><span className="text-xs text-[#94a3b8]">{councils.length}</span></div>
              {loading ? <p className="mt-4 text-sm text-[#64748b]">Loading…</p> : null}
              <div className="mt-3 space-y-2">{councils.map((council) => <button key={council.id} onClick={() => { setSelectedCouncilId(council.id); setNodeType("REGION"); setParentId(""); }} className={`w-full rounded-xl border p-3 text-left transition ${selectedCouncilId === council.id ? "border-[#b8cbea] bg-[#f4f8ff]" : "border-[#edf0f5] hover:bg-[#f8faff]"}`}><div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold text-[#263b5b]">{council.name}</span><span className="rounded-full bg-[#eaf8f2] px-2 py-1 text-[10px] font-semibold text-[#27825f]">{council.status}</span></div><p className="mt-1 text-xs text-[#94a3b8]">/{council.slug}</p><p className="mt-2 text-[11px] text-[#64748b]">{council._count.regions} regions · {council._count.registrations} school requests</p></button>)}</div>
            </section>

            <section className="rounded-2xl border border-[#e5eaf1] bg-white p-5"><h2 className="text-sm font-semibold text-[#172b4d]">Create a Council</h2><p className="mt-1 text-xs leading-5 text-[#64748b]">Council is the tenant boundary for assessments, school participation and reporting.</p><form onSubmit={createCouncil} className="mt-4 space-y-3"><div><label htmlFor="councilName" className="mb-1.5 block text-xs font-medium text-[#52647d]">Council name</label><input id="councilName" required minLength={2} maxLength={180} value={councilName} onChange={(event) => { setCouncilName(event.target.value); if (!slugTouched) setCouncilSlug(slugify(event.target.value)); }} className="w-full rounded-xl border border-[#dbe3ee] px-3 py-2.5 text-sm outline-none focus:border-[#6d94e8]" placeholder="Example Examination Council" /></div><div><label htmlFor="councilSlug" className="mb-1.5 block text-xs font-medium text-[#52647d]">Unique slug</label><input id="councilSlug" required minLength={2} maxLength={80} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={councilSlug} onChange={(event) => { setSlugTouched(true); setCouncilSlug(event.target.value.toLowerCase()); }} className="w-full rounded-xl border border-[#dbe3ee] px-3 py-2.5 text-sm outline-none focus:border-[#6d94e8]" placeholder="example-examination-council" /></div><button disabled={busy} className="w-full rounded-xl bg-[#2457c5] px-4 py-3 text-sm font-semibold text-white hover:bg-[#1e49a6] disabled:opacity-50">{busy ? "Saving…" : "Create Council"}</button></form></section>
          </aside>

          <section className="space-y-5">
            <section className="rounded-2xl border border-[#e5eaf1] bg-white p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold text-[#172b4d]">Geography hierarchy</h2><p className="mt-1 text-xs text-[#64748b]">{geography?.council.name ?? "Select or create a Council to begin."}</p></div>{geography ? <span className="rounded-full bg-[#edf4ff] px-3 py-1.5 text-xs font-semibold text-[#2457c5]">{geography.regions.length} regions</span> : null}</div>
              {!selectedCouncilId ? <div className="mt-6 rounded-xl border border-dashed border-[#ccd8e8] p-8 text-center"><p className="text-sm font-semibold text-[#172b4d]">No Council selected</p><p className="mt-2 text-xs text-[#64748b]">Create a Council or select one from the directory.</p></div> : null}
              {selectedCouncilId && geography?.regions.length === 0 ? <p className="mt-5 rounded-xl bg-[#f6f8fb] p-4 text-sm text-[#64748b]">No Regions configured yet. Add the first Region below.</p> : null}
              {geography?.regions.length ? <div className="mt-5 space-y-3">{geography.regions.map((region) => <details key={region.id} className="rounded-xl border border-[#e5eaf1] p-4" open><summary className="cursor-pointer text-sm font-semibold text-[#263b5b]">{region.name} <span className="ml-2 text-xs font-normal text-[#94a3b8]">{region.counties.length} counties</span></summary><div className="mt-3 space-y-3 border-l border-[#dbe3ee] pl-4">{region.counties.map((county) => <details key={county.id} className="rounded-lg bg-[#f8faff] p-3"><summary className="cursor-pointer text-xs font-semibold text-[#52647d]">{county.name} <span className="ml-2 font-normal text-[#94a3b8]">{county.subcounties.length} subcounties</span></summary><div className="mt-3 space-y-2 border-l border-[#dbe3ee] pl-3">{county.subcounties.map((subcounty) => <details key={subcounty.id} className="rounded-lg bg-white p-3"><summary className="cursor-pointer text-xs font-semibold text-[#52647d]">{subcounty.name} <span className="ml-2 font-normal text-[#94a3b8]">{subcounty.zones.length} zones</span></summary><div className="mt-3 space-y-2 border-l border-[#dbe3ee] pl-3">{subcounty.zones.map((zone) => <details key={zone.id} className="rounded-lg bg-[#f8faff] p-3"><summary className="cursor-pointer text-xs font-semibold text-[#52647d]">{zone.name} <span className="ml-2 font-normal text-[#94a3b8]">{zone.clusters.length} clusters</span></summary><div className="mt-2 flex flex-wrap gap-2">{zone.clusters.map((cluster) => <span key={cluster.id} className="rounded-lg border border-[#e5eaf1] bg-white px-2.5 py-1.5 text-[11px] text-[#64748b]">{cluster.name}{cluster.code ? ` · ${cluster.code}` : ""}</span>)}</div></details>)}</div></details>)}</div></details>)}</div></details>)}</div> : null}
            </section>

            {selectedCouncilId ? <section className="rounded-2xl border border-[#e5eaf1] bg-white p-5 sm:p-6"><h2 className="text-base font-semibold text-[#172b4d]">Add geography item</h2><p className="mt-1 text-xs leading-5 text-[#64748b]">Create one level at a time. A child must belong to an active parent in this Council.</p><form onSubmit={createNode} className="mt-5 grid gap-4 sm:grid-cols-2"><div><label htmlFor="nodeType" className="mb-2 block text-xs font-medium text-[#52647d]">Geography level</label><select id="nodeType" value={nodeType} onChange={(event) => { setNodeType(event.target.value); setParentId(""); }} className="w-full rounded-xl border border-[#dbe3ee] bg-white px-3 py-3 text-sm outline-none focus:border-[#6d94e8]">{NODE_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>{nodeType !== "REGION" ? <div><label htmlFor="parentId" className="mb-2 block text-xs font-medium text-[#52647d]">Parent item</label><select id="parentId" required value={parentId} onChange={(event) => setParentId(event.target.value)} className="w-full rounded-xl border border-[#dbe3ee] bg-white px-3 py-3 text-sm outline-none focus:border-[#6d94e8]"><option value="">Select parent</option>{parentOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></div> : <div className="flex items-end text-xs text-[#94a3b8]">A Region belongs directly to the Council.</div>}<div><label htmlFor="nodeName" className="mb-2 block text-xs font-medium text-[#52647d]">Name</label><input id="nodeName" required minLength={2} maxLength={120} value={nodeName} onChange={(event) => setNodeName(event.target.value)} className="w-full rounded-xl border border-[#dbe3ee] px-3 py-3 text-sm outline-none focus:border-[#6d94e8]" /></div><div><label htmlFor="nodeCode" className="mb-2 block text-xs font-medium text-[#52647d]">Code <span className="font-normal text-[#94a3b8]">(optional)</span></label><input id="nodeCode" maxLength={32} value={nodeCode} onChange={(event) => setNodeCode(event.target.value)} className="w-full rounded-xl border border-[#dbe3ee] px-3 py-3 text-sm outline-none focus:border-[#6d94e8]" /></div><div className="sm:col-span-2"><button disabled={busy || (nodeType !== "REGION" && parentOptions.length === 0)} className="rounded-xl bg-[#2457c5] px-5 py-3 text-sm font-semibold text-white hover:bg-[#1e49a6] disabled:opacity-50">{busy ? "Saving…" : `Add ${NODE_TYPES.find((item) => item.value === nodeType)?.label ?? "item"}`}</button></div></form></section> : null}
          </section>
        </div>
      </div>
    </main>
  );
}
