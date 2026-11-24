"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiRequest } from "../../../../lib/api";

type Optionality = "UNKNOWN" | "CORE" | "OPTIONAL";
type ReviewStatus = "REVIEW_REQUIRED" | "REVIEWED";

interface PublishedVersion {
  id: string;
  versionLabel: string;
  publishedAt: string | null;
  sourceTitle: string;
  curriculum: { code: string; name: string; track: string };
  _count: { gradeLearningAreas: number; councilCurricula: number };
}

interface CouncilGradeArea {
  id: string;
  enabled: boolean;
  assessmentEligible: boolean;
  displayLabel: string | null;
  sortOrder: number;
  gradeLearningArea: {
    grade: string;
    sourceLabel: string;
    optionality: Optionality;
    reviewStatus: ReviewStatus;
    learningArea: { code: string; canonicalName: string };
  };
}

interface CurrentSelection {
  id: string;
  status: string;
  effectiveFrom: string;
  curriculumVersion: {
    id: string;
    versionLabel: string;
    publishedAt: string | null;
    curriculum: { code: string; name: string; track: string };
  };
  gradeAreas: CouncilGradeArea[];
}

interface CurrentResponse {
  council: { id: string; name: string; slug: string; status: string };
  selection: CurrentSelection | null;
}

interface AreaDraft {
  enabled: boolean;
  assessmentEligible: boolean;
  displayLabel: string;
  sortOrder: number;
  reason: string;
}

function dateLabel(value?: string | null) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : new Intl.DateTimeFormat("en-KE", { dateStyle: "medium" }).format(date);
}

export default function CouncilCurriculumPage() {
  const params = useParams<{ councilId: string }>();
  const councilId = params.councilId;
  const router = useRouter();
  const [catalogue, setCatalogue] = useState<PublishedVersion[]>([]);
  const [current, setCurrent] = useState<CurrentResponse | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, AreaDraft>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const [catalogueResponse, currentResponse] = await Promise.all([
      apiRequest(`/councils/${councilId}/curriculum/catalogue`),
      apiRequest(`/councils/${councilId}/curriculum`),
    ]);
    if (catalogueResponse.status === 401 || currentResponse.status === 401) {
      router.replace("/login");
      return;
    }
    if (catalogueResponse.status === 403 || currentResponse.status === 403) {
      router.replace("/workspace");
      return;
    }
    if (!catalogueResponse.ok || !currentResponse.ok) {
      throw new Error("Council curriculum settings could not be loaded.");
    }
    const [versions, selection] = await Promise.all([
      catalogueResponse.json() as Promise<PublishedVersion[]>,
      currentResponse.json() as Promise<CurrentResponse>,
    ]);
    setCatalogue(versions);
    setCurrent(selection);
    setSelectedVersionId((previous) => previous || selection.selection?.curriculumVersion.id || versions[0]?.id || "");
  }, [councilId, router]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      void load()
        .then(() => { if (active) setError(""); })
        .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load Council curriculum."); })
        .finally(() => { if (active) setLoading(false); });
    });
    return () => { active = false; };
  }, [load]);

  const groupedAreas = useMemo(() => {
    const groups = new Map<string, CouncilGradeArea[]>();
    for (const area of current?.selection?.gradeAreas ?? []) {
      const group = groups.get(area.gradeLearningArea.grade) ?? [];
      group.push(area);
      groups.set(area.gradeLearningArea.grade, group);
    }
    return [...groups.entries()].sort(([a], [b]) => Number(a.replace("GRADE_", "")) - Number(b.replace("GRADE_", "")));
  }, [current]);

  const updateDraft = (area: CouncilGradeArea, patch: Partial<AreaDraft>) => {
    setDrafts((previous) => {
      const existing = previous[area.id] ?? {
        enabled: area.enabled,
        assessmentEligible: area.assessmentEligible,
        displayLabel: area.displayLabel ?? "",
        sortOrder: area.sortOrder,
        reason: "",
      };
      const next = { ...existing, ...patch };
      if (!next.enabled) next.assessmentEligible = false;
      return { ...previous, [area.id]: next };
    });
  };

  async function selectCurriculum() {
    if (!selectedVersionId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await apiRequest(`/councils/${councilId}/curriculum`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ curriculumVersionId: selectedVersionId }),
      });
      const payload = await response.json().catch(() => null) as { message?: string | string[] } | null;
      if (!response.ok) throw new Error(Array.isArray(payload?.message) ? payload.message.join(" ") : payload?.message ?? "The curriculum could not be selected.");
      setDrafts({});
      await load();
      setNotice("Published curriculum selected. Learning areas are disabled by default; enable only the areas this Council offers, then approve assessment eligibility separately.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The curriculum selection failed.");
    } finally {
      setBusy(false);
    }
  }

  async function saveArea(area: CouncilGradeArea) {
    const draft = drafts[area.id] ?? {
      enabled: area.enabled,
      assessmentEligible: area.assessmentEligible,
      displayLabel: area.displayLabel ?? "",
      sortOrder: area.sortOrder,
      reason: "",
    };
    if (draft.reason.trim().length < 10) {
      setError("Add a reason of at least 10 characters for this Council configuration change.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await apiRequest(`/councils/${councilId}/curriculum/grade-areas/${area.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const payload = await response.json().catch(() => null) as { message?: string | string[] } | null;
      if (!response.ok) throw new Error(Array.isArray(payload?.message) ? payload.message.join(" ") : payload?.message ?? "The grade-area configuration could not be saved.");
      await load();
      setDrafts((previous) => { const next = { ...previous }; delete next[area.id]; return next; });
      setNotice(`${area.gradeLearningArea.grade.replace("_", " ")} · ${area.gradeLearningArea.sourceLabel} saved.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The configuration update failed.");
    } finally {
      setBusy(false);
    }
  }

  const activeVersionId = current?.selection?.curriculumVersion.id ?? "";

  return (
    <main className="min-h-screen bg-[#f6f7fb]">
      <header className="border-b border-[#e3e8f0] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/workspace" className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-[#5368d5] text-xs font-bold text-white">CBE</span>
            <span className="text-sm font-semibold text-[#17243a]">Council workspace</span>
          </Link>
          <Link href="/workspace" className="text-xs font-semibold text-[#52627a] hover:text-[#5368d5]">Back to workspace</Link>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#5368d5]">Council configuration</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[#17243a] sm:text-3xl">Curriculum and learning areas</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5e6b80]">Choose a published curriculum for this Council, then decide which grade-level learning areas are enabled and eligible for assessment.</p>
          </div>
          {current?.council ? <span className="rounded-full border border-[#d3dbe7] bg-white px-3 py-1.5 text-xs font-semibold text-[#52627a]">{current.council.name}</span> : null}
        </div>

        {error ? <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {notice ? <div role="status" className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div> : null}

        {loading ? <div className="mt-8 rounded-2xl border border-[#e3e8f0] bg-white p-8 text-sm text-[#5e6b80]">Loading curriculum configuration…</div> : null}

        {!loading ? (
          <>
            <section className="mt-7 rounded-2xl border border-[#e3e8f0] bg-white p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold text-[#17243a]">Published curriculum catalogue</h2>
                  <p className="mt-1 text-xs leading-5 text-[#5e6b80]">Only independently reviewed and published versions can be selected.</p>
                </div>
                <span className="rounded-full bg-[#f0f2f8] px-3 py-1 text-[11px] font-medium text-[#52627a]">{catalogue.length} published versions</span>
              </div>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <select value={selectedVersionId} onChange={(event) => setSelectedVersionId(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-[#d3dbe7] bg-white px-3 py-3 text-sm text-[#17243a] outline-none focus:border-[#6d94e8] focus:ring-4 focus:ring-[#eceffd]" disabled={catalogue.length === 0}>
                  {catalogue.length === 0 ? <option value="">No published curriculum versions available</option> : null}
                  {catalogue.map((version) => <option key={version.id} value={version.id}>{version.curriculum.name} · {version.versionLabel} · {version._count.gradeLearningAreas} grade mappings</option>)}
                </select>
                <button onClick={() => void selectCurriculum()} disabled={busy || !selectedVersionId || selectedVersionId === activeVersionId} className="rounded-xl bg-[#5368d5] px-5 py-3 text-xs font-semibold text-white hover:bg-[#1d49a7] disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Saving…" : activeVersionId ? "Switch curriculum" : "Select curriculum"}</button>
              </div>
              {current?.selection ? (
                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[#edf0f5] pt-4 text-xs text-[#5e6b80]">
                  <span><strong className="text-[#17243a]">Current:</strong> {current.selection.curriculumVersion.curriculum.name} · {current.selection.curriculumVersion.versionLabel}</span>
                  <span>Effective {dateLabel(current.selection.effectiveFrom)}</span>
                  <span>{current.selection.gradeAreas.length} Council mappings</span>
                </div>
              ) : <p className="mt-4 rounded-xl bg-[#f8faff] px-4 py-3 text-xs leading-5 text-[#52627a]">No curriculum has been selected for this Council. Select a published version to begin configuring learning areas.</p>}
            </section>

            {current?.selection ? (
              <section className="mt-7">
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-[#17243a]">Grade-level configuration</h2>
                    <p className="mt-1 text-xs text-[#5e6b80]">Assessment eligibility is separate from availability and must be explicitly approved.</p>
                  </div>
                  <div className="flex gap-3 text-[11px] text-[#5e6b80]"><span><strong className="text-[#17243a]">{current.selection.gradeAreas.filter((area) => area.enabled).length}</strong> enabled</span><span><strong className="text-[#17243a]">{current.selection.gradeAreas.filter((area) => area.assessmentEligible).length}</strong> assessment-eligible</span></div>
                </div>
                {groupedAreas.length === 0 ? <div className="rounded-2xl border border-dashed border-[#ccd8e8] bg-white p-8 text-center text-sm text-[#5e6b80]">This curriculum version has no grade-level mappings.</div> : null}
                <div className="grid gap-4 xl:grid-cols-2">
                  {groupedAreas.map(([grade, areas]) => (
                    <section key={grade} className="overflow-hidden rounded-2xl border border-[#e3e8f0] bg-white">
                      <div className="flex items-center justify-between border-b border-[#edf0f5] bg-[#fbfcfe] px-5 py-4">
                        <h3 className="text-sm font-semibold text-[#17243a]">{grade.replace("_", " ")}</h3>
                        <span className="text-[11px] text-[#8491a5]">{areas.length} learning areas</span>
                      </div>
                      <div className="divide-y divide-[#edf0f5]">
                        {areas.map((area) => {
                          const draft = drafts[area.id] ?? {
                            enabled: area.enabled,
                            assessmentEligible: area.assessmentEligible,
                            displayLabel: area.displayLabel ?? "",
                            sortOrder: area.sortOrder,
                            reason: "",
                          };
                          const changed = Boolean(drafts[area.id]);
                          const source = area.gradeLearningArea;
                          return (
                            <article key={area.id} className="p-4 sm:p-5">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-[#17243a]">{draft.displayLabel || source.sourceLabel}</p>
                                  <p className="mt-1 text-[11px] text-[#8491a5]">{source.learningArea.canonicalName} · {source.learningArea.code}</p>
                                </div>
                                <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${source.reviewStatus === "REVIEWED" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{source.reviewStatus === "REVIEWED" ? "Source reviewed" : "Review required"}</span>
                              </div>
                              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                <label className="flex items-center gap-2 text-xs font-medium text-[#52627a]">
                                  <input type="checkbox" checked={draft.enabled} onChange={(event) => updateDraft(area, { enabled: event.target.checked })} className="size-4 accent-[#5368d5]" />
                                  Enabled for this Council
                                </label>
                                <label className={`flex items-center gap-2 text-xs font-medium ${!draft.enabled || source.reviewStatus !== "REVIEWED" || source.optionality === "UNKNOWN" ? "text-[#a0aaba]" : "text-[#52627a]"}`}>
                                  <input type="checkbox" checked={draft.assessmentEligible} disabled={!draft.enabled || source.reviewStatus !== "REVIEWED" || source.optionality === "UNKNOWN"} onChange={(event) => updateDraft(area, { assessmentEligible: event.target.checked })} className="size-4 accent-[#16734b]" />
                                  Eligible for assessment
                                </label>
                              </div>
                              <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_100px]">
                                <label className="text-[10px] font-semibold text-[#5e6b80]">Council display label
                                  <input value={draft.displayLabel} onChange={(event) => updateDraft(area, { displayLabel: event.target.value })} placeholder={source.sourceLabel} className="mt-1 w-full rounded-lg border border-[#d3dbe7] px-3 py-2 text-xs font-normal text-[#17243a]" />
                                </label>
                                <label className="text-[10px] font-semibold text-[#5e6b80]">Order
                                  <input type="number" min="0" max="10000" value={draft.sortOrder} onChange={(event) => updateDraft(area, { sortOrder: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-[#d3dbe7] px-3 py-2 text-xs font-normal text-[#17243a]" />
                                </label>
                              </div>
                              <label className="mt-3 block text-[10px] font-semibold text-[#5e6b80]">Reason for this change
                                <input value={draft.reason} onChange={(event) => updateDraft(area, { reason: event.target.value })} placeholder="Required for the Council audit trail" className="mt-1 w-full rounded-lg border border-[#d3dbe7] px-3 py-2 text-xs font-normal text-[#17243a]" />
                              </label>
                              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                                <p className="text-[10px] text-[#8491a5]">Source classification: {source.optionality === "UNKNOWN" ? "Unresolved" : source.optionality}</p>
                                <button disabled={busy || !changed} onClick={() => void saveArea(area)} className="rounded-lg border border-[#d3dbe7] bg-white px-3 py-2 text-[11px] font-semibold text-[#5368d5] hover:bg-[#f3f6fc] disabled:cursor-not-allowed disabled:opacity-40">Save configuration</button>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
