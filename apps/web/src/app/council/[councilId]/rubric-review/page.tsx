"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiRequest } from "../../../../lib/api";
import { CouncilWorkspaceShell } from "../../../../components/council-workspace-shell";

interface ReviewVersion {
  id: string;
  versionLabel: string;
  createdByAccountId: string;
  createdAt: string;
  scaleType: string;
  rubric: { code: string; name: string };
  bands: { id: string; code: string; label: string; lowerBound: string | null; upperBound: string | null; sortOrder: number }[];
}

function messageOf(payload: unknown) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: string | string[] }).message;
    return Array.isArray(message) ? message.join(" ") : message ?? "The review action failed.";
  }
  return "The review action failed.";
}

export default function CouncilRubricReviewPage() {
  const { councilId } = useParams<{ councilId: string }>();
  const router = useRouter();
  const [queue, setQueue] = useState<ReviewVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const response = await apiRequest(`/councils/${councilId}/rubrics/review-queue`);
    if (response.status === 401) { router.replace("/login"); return; }
    if (response.status === 403) { router.replace("/workspace"); return; }
    if (!response.ok) throw new Error("The Council rubric review queue could not be loaded.");
    setQueue(await response.json() as ReviewVersion[]);
  }, [councilId, router]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      void load().catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load review queue."); })
        .finally(() => { if (active) setLoading(false); });
    });
    return () => { active = false; };
  }, [load]);

  async function returnForChanges(version: ReviewVersion) {
    const reason = reasons[version.id]?.trim() ?? "";
    if (reason.length < 10) { setError("Provide a review reason of at least 10 characters."); return; }
    setBusyId(version.id); setError(""); setNotice("");
    try {
      const response = await apiRequest(`/councils/${councilId}/rubrics/versions/${version.id}/return-for-changes`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(messageOf(payload));
      await load();
      setNotice(`${version.rubric.name} · ${version.versionLabel} was returned to its author.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Rubric could not be returned."); }
    finally { setBusyId(""); }
  }
  async function publish(version: ReviewVersion) {
    setBusyId(version.id); setError(""); setNotice("");
    try {
      const response = await apiRequest(`/councils/${councilId}/rubrics/versions/${version.id}/publish`, { method: "POST" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(messageOf(payload));
      await load();
      setNotice(`${version.rubric.name} · ${version.versionLabel} was published. Its contents are now immutable.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Rubric publication failed."); }
    finally { setBusyId(""); }
  }

  return <CouncilWorkspaceShell councilId={councilId} active="rubric-review">
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#2457c5]">Independent governance</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[#172b4d] sm:text-3xl">Rubric review queue</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-[#64748b]">Review the Council-authored descriptors and numeric intervals. Publishing is a privileged, irreversible action; verify the supporting Council decision before approval.</p>
      {error ? <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {notice ? <div role="status" className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div> : null}
      {loading ? <div className="mt-8 rounded-2xl border border-[#e5eaf1] bg-white p-8 text-sm text-[#64748b]">Loading review queue…</div> : queue.length === 0 ? <div className="mt-8 rounded-2xl border border-dashed border-[#ccd8e8] bg-white p-8 text-center text-sm text-[#64748b]">There are no rubric versions awaiting review.</div> :
        <div className="mt-8 space-y-4">{queue.map((version) => <article key={version.id} className="rounded-2xl border border-[#e5eaf1] bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold text-[#172b4d]">{version.rubric.name} · {version.versionLabel}</h2><p className="mt-1 text-xs text-[#64748b]">{version.rubric.code} · {version.scaleType.replaceAll("_", " ").toLowerCase()}</p><p className="mt-1 text-[11px] text-[#94a3b8]">Submitted {new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(version.createdAt))}</p></div><span className="rounded-full bg-amber-50 px-3 py-1 text-[10px] font-semibold text-amber-800">IN REVIEW</span></div>
          <div className="mt-4 overflow-hidden rounded-xl border border-[#edf0f5]"><div className="grid grid-cols-[minmax(5rem,0.5fr)_1fr_1fr] gap-3 bg-[#f8faff] px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-[#64748b]"><span>Code</span><span>Descriptor</span><span>Bounds</span></div>{version.bands.map((band) => <div key={band.id} className="grid grid-cols-[minmax(5rem,0.5fr)_1fr_1fr] gap-3 border-t border-[#edf0f5] px-4 py-3 text-xs text-[#52647d]"><span className="font-semibold text-[#172b4d]">{band.code}</span><span>{band.label}</span><span>{band.lowerBound === null ? "No numeric boundary" : `[${band.lowerBound}, ${band.upperBound})`}</span></div>)}</div>
          <div className="mt-5 space-y-3 border-t border-[#edf0f5] pt-4"><p className="text-[11px] text-[#64748b]">The author cannot approve their own rubric version. Return it with a reason if changes are needed.</p><textarea value={reasons[version.id] ?? ""} onChange={(event) => setReasons((previous) => ({ ...previous, [version.id]: event.target.value }))} maxLength={2000} rows={2} placeholder="Explain what needs to change (minimum 10 characters)…" className="w-full rounded-xl border border-[#dbe3ee] px-3 py-2.5 text-xs text-[#172b4d]" /><div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={Boolean(busyId)} onClick={() => void returnForChanges(version)} className="rounded-xl border border-[#dbe3ee] px-4 py-2.5 text-xs font-semibold text-[#52647d] disabled:opacity-50">Return for changes</button><button type="button" disabled={Boolean(busyId)} onClick={() => void publish(version)} className="rounded-xl bg-[#2457c5] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50">{busyId === version.id ? "Processing…" : "Approve and publish"}</button></div></div>
        </article>)}</div>}
    </div>
  </CouncilWorkspaceShell>;
}
