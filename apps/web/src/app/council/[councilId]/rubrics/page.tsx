"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiRequest } from "../../../../lib/api";

type ScaleType = "NUMERIC_BANDS" | "PERFORMANCE_LEVELS" | "DESCRIPTIVE";
interface BandDraft { code: string; label: string; lowerBound: string; upperBound: string; }
interface RubricVersion { id: string; versionLabel: string; status: string; scaleType: ScaleType; bands: { id: string; code: string; label: string; lowerBound: string | null; upperBound: string | null }[]; }
interface Rubric { id: string; code: string; name: string; versions: RubricVersion[]; }

function messageOf(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: string | string[] }).message;
    if (Array.isArray(message)) return message.join(" ");
    if (message) return message;
  }
  return fallback;
}

export default function CouncilRubricsPage() {
  const { councilId } = useParams<{ councilId: string }>();
  const router = useRouter();
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [form, setForm] = useState({ code: "", name: "", versionLabel: "v1", scaleType: "PERFORMANCE_LEVELS" as ScaleType, scoreUnit: "", minScore: "", maxScore: "" });
  const [bands, setBands] = useState<BandDraft[]>([{ code: "", label: "", lowerBound: "", upperBound: "" }]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const response = await apiRequest(`/councils/${councilId}/rubrics`);
    if (response.status === 401) { router.replace("/login"); return; }
    if (response.status === 403) { router.replace("/workspace"); return; }
    if (!response.ok) throw new Error("Council rubrics could not be loaded.");
    setRubrics(await response.json() as Rubric[]);
  }, [councilId, router]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      void load().catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load rubrics."); })
        .finally(() => { if (active) setLoading(false); });
    });
    return () => { active = false; };
  }, [load]);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validBands = bands.filter((band) => band.code.trim() && band.label.trim());
    if (!validBands.length) { setError("Add at least one rubric band with a code and label."); return; }
    if (form.scaleType === "NUMERIC_BANDS" && (
      form.minScore === "" || form.maxScore === "" || Number(form.maxScore) <= Number(form.minScore) ||
      validBands.some((band) => band.lowerBound === "" || band.upperBound === "" ||
        Number(band.upperBound) <= Number(band.lowerBound) ||
        Number(band.lowerBound) < Number(form.minScore) || Number(band.upperBound) > Number(form.maxScore))
    )) { setError("Numeric rubrics require valid score and band bounds. Bands use lower-inclusive, upper-exclusive intervals."); return; }

    setBusy(true); setError(""); setNotice("");
    try {
      const response = await apiRequest(`/councils/${councilId}/rubrics`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code.trim().toUpperCase(), name: form.name.trim(), versionLabel: form.versionLabel.trim(),
          scaleType: form.scaleType, ...(form.scoreUnit.trim() ? { scoreUnit: form.scoreUnit.trim() } : {}),
          ...(form.scaleType === "NUMERIC_BANDS" ? { minScore: Number(form.minScore), maxScore: Number(form.maxScore) } : {}),
          bands: validBands.map((band, index) => ({
            code: band.code.trim().toUpperCase(), label: band.label.trim(), sortOrder: index,
            ...(form.scaleType === "NUMERIC_BANDS" ? { lowerBound: Number(band.lowerBound), upperBound: Number(band.upperBound) } : {}),
          })),
        }),
      });
      const payload = await response.json().catch(() => null) as { id?: string; message?: string | string[] } | null;
      if (!response.ok || !payload?.id) throw new Error(messageOf(payload, "Rubric draft could not be created."));
      const review = await apiRequest(`/councils/${councilId}/rubrics/versions/${payload.id}/submit-review`, { method: "POST" });
      const reviewPayload = await review.json().catch(() => null);
      if (!review.ok) throw new Error(messageOf(reviewPayload, "Rubric draft was created but could not be submitted for review."));
      setForm({ code: "", name: "", versionLabel: "v1", scaleType: "PERFORMANCE_LEVELS", scoreUnit: "", minScore: "", maxScore: "" });
      setBands([{ code: "", label: "", lowerBound: "", upperBound: "" }]);
      await load();
      setNotice("Rubric submitted for independent governance review. It becomes available for assessments only after approval and publication.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Rubric creation failed."); }
    finally { setBusy(false); }
  }

  async function submitReview(versionId: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await apiRequest(`/councils/${councilId}/rubrics/versions/${versionId}/submit-review`, { method: "POST" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(messageOf(payload, "Rubric could not be submitted for review."));
      await load(); setNotice("Rubric submitted for independent governance review.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Rubric submission failed."); }
    finally { setBusy(false); }
  }

  return <main className="min-h-screen bg-[#f6f7fb]">
    <header className="border-b border-[#e3e8f0] bg-white"><div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
      <Link href="/workspace" className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#5368d5] text-xs font-bold text-white">CBE</span><span className="text-sm font-semibold text-[#17243a]">Council workspace</span></Link>
      <div className="flex gap-4"><Link href={`/council/${councilId}/assessments`} className="text-xs font-semibold text-[#52627a] hover:text-[#5368d5]">Assessments</Link><Link href="/workspace" className="text-xs font-semibold text-[#52627a] hover:text-[#5368d5]">Workspace</Link></div>
    </div></header>
    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#5368d5]">Council governance</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[#17243a] sm:text-3xl">Grading rubrics</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5e6b80]">Define the Council&apos;s grading scale and descriptors. Every new version is reviewed independently; published versions are immutable and can be attached to assessments.</p>
      {error ? <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {notice ? <div role="status" className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div> : null}
      {loading ? <div className="mt-8 rounded-2xl border border-[#e3e8f0] bg-white p-8 text-sm text-[#5e6b80]">Loading rubric catalogue…</div> : <>
        <section className="mt-7 rounded-2xl border border-[#e3e8f0] bg-white p-5 sm:p-6">
          <h2 className="text-base font-semibold text-[#17243a]">Create a rubric version</h2>
          <p className="mt-1 text-xs leading-5 text-[#5e6b80]">Do not use unverified national grading boundaries. Enter only formally approved Council criteria.</p>
          <form onSubmit={(event) => void create(event)} className="mt-5 space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-xs font-medium text-[#52627a]">Rubric code<input required maxLength={40} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} placeholder="e.g. CBE-PL" className="mt-2 w-full rounded-xl border border-[#d3dbe7] px-3 py-3 text-sm" /></label>
              <label className="text-xs font-medium text-[#52627a]">Name<input required minLength={2} maxLength={160} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Council performance levels" className="mt-2 w-full rounded-xl border border-[#d3dbe7] px-3 py-3 text-sm" /></label>
              <label className="text-xs font-medium text-[#52627a]">Version label<input required maxLength={40} value={form.versionLabel} onChange={(event) => setForm({ ...form, versionLabel: event.target.value })} className="mt-2 w-full rounded-xl border border-[#d3dbe7] px-3 py-3 text-sm" /></label>
              <label className="text-xs font-medium text-[#52627a]">Scale type<select value={form.scaleType} onChange={(event) => setForm({ ...form, scaleType: event.target.value as ScaleType })} className="mt-2 w-full rounded-xl border border-[#d3dbe7] bg-white px-3 py-3 text-sm"><option value="PERFORMANCE_LEVELS">Performance levels</option><option value="NUMERIC_BANDS">Numeric bands</option><option value="DESCRIPTIVE">Descriptive</option></select></label>
              <label className="text-xs font-medium text-[#52627a]">Score unit (optional)<input value={form.scoreUnit} onChange={(event) => setForm({ ...form, scoreUnit: event.target.value })} placeholder="e.g. points" className="mt-2 w-full rounded-xl border border-[#d3dbe7] px-3 py-3 text-sm" /></label>
              {form.scaleType === "NUMERIC_BANDS" ? <>
                <label className="text-xs font-medium text-[#52627a]">Minimum score<input required type="number" step="0.0001" value={form.minScore} onChange={(event) => setForm({ ...form, minScore: event.target.value })} className="mt-2 w-full rounded-xl border border-[#d3dbe7] px-3 py-3 text-sm" /></label>
                <label className="text-xs font-medium text-[#52627a]">Maximum score<input required type="number" step="0.0001" value={form.maxScore} onChange={(event) => setForm({ ...form, maxScore: event.target.value })} className="mt-2 w-full rounded-xl border border-[#d3dbe7] px-3 py-3 text-sm" /></label>
              </> : null}
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-[#17243a]">Rubric bands</h3><button type="button" onClick={() => setBands((previous) => [...previous, { code: "", label: "", lowerBound: "", upperBound: "" }])} className="rounded-lg border border-[#d3dbe7] px-3 py-2 text-xs font-semibold text-[#52627a]">Add band</button></div>
              {bands.map((band, index) => <div key={index} className="grid gap-3 rounded-xl border border-[#edf0f5] p-4 sm:grid-cols-2 lg:grid-cols-4">
                <label className="text-[11px] font-medium text-[#5e6b80]">Band code<input required value={band.code} onChange={(event) => setBands((previous) => previous.map((item, i) => i === index ? { ...item, code: event.target.value } : item))} placeholder="e.g. PL1" className="mt-1 w-full rounded-lg border border-[#d3dbe7] px-2.5 py-2 text-sm" /></label>
                <label className="text-[11px] font-medium text-[#5e6b80]">Descriptor<input required value={band.label} onChange={(event) => setBands((previous) => previous.map((item, i) => i === index ? { ...item, label: event.target.value } : item))} placeholder="Approved label" className="mt-1 w-full rounded-lg border border-[#d3dbe7] px-2.5 py-2 text-sm" /></label>
                {form.scaleType === "NUMERIC_BANDS" ? <>
                  <label className="text-[11px] font-medium text-[#5e6b80]">Lower bound<input required type="number" step="0.0001" value={band.lowerBound} onChange={(event) => setBands((previous) => previous.map((item, i) => i === index ? { ...item, lowerBound: event.target.value } : item))} className="mt-1 w-full rounded-lg border border-[#d3dbe7] px-2.5 py-2 text-sm" /></label>
                  <label className="text-[11px] font-medium text-[#5e6b80]">Upper bound<input required type="number" step="0.0001" value={band.upperBound} onChange={(event) => setBands((previous) => previous.map((item, i) => i === index ? { ...item, upperBound: event.target.value } : item))} className="mt-1 w-full rounded-lg border border-[#d3dbe7] px-2.5 py-2 text-sm" /></label>
                </> : null}
                <div className="sm:col-span-2 lg:col-span-4 flex justify-end"><button type="button" disabled={bands.length === 1} onClick={() => setBands((previous) => previous.filter((_, i) => i !== index))} className="text-[11px] font-semibold text-red-600 disabled:opacity-40">Remove band</button></div>
              </div>)}
            </div>
            <div className="flex justify-end border-t border-[#edf0f5] pt-4"><button type="submit" disabled={busy} className="rounded-xl bg-[#5368d5] px-5 py-3 text-xs font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Create and submit for review"}</button></div>
          </form>
        </section>
        <section className="mt-8"><div className="mb-4 flex items-end justify-between"><div><h2 className="text-lg font-semibold text-[#17243a]">Rubric register</h2><p className="mt-1 text-xs text-[#5e6b80]">A version must be independently approved before assessment use.</p></div><span className="text-xs text-[#5e6b80]">{rubrics.length} rubrics</span></div>
          {rubrics.length === 0 ? <div className="rounded-2xl border border-dashed border-[#ccd8e8] bg-white p-8 text-center text-sm text-[#5e6b80]">No rubrics configured yet.</div> : <div className="space-y-4">{rubrics.map((rubric) => <article key={rubric.id} className="rounded-2xl border border-[#e3e8f0] bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-[#17243a]">{rubric.name}</h3><p className="mt-1 text-xs text-[#5e6b80]">{rubric.code}</p></div><span className="text-xs text-[#5e6b80]">{rubric.versions.length} versions</span></div><div className="mt-4 space-y-2">{rubric.versions.map((version) => <div key={version.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f8faff] px-4 py-3"><div><p className="text-xs font-semibold text-[#17243a]">{version.versionLabel} · {version.scaleType.replaceAll("_", " ").toLowerCase()}</p><p className="mt-1 text-[11px] text-[#5e6b80]">{version.bands.length} bands · {version.bands.map((band) => band.label).join(" · ")}</p></div><div className="flex items-center gap-3"><span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-[#52627a]">{version.status}</span>{version.status === "DRAFT" ? <button type="button" disabled={busy} onClick={() => void submitReview(version.id)} className="text-[11px] font-semibold text-[#5368d5] disabled:opacity-40">Submit for review</button> : null}</div></div>)}</div></article>)}</div>}
        </section>
      </>}
    </div>
  </main>;
}
