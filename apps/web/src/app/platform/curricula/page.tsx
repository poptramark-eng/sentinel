"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, clearStoredCsrfToken } from "../../../lib/api";

type VersionStatus = "DRAFT" | "IN_REVIEW" | "PUBLISHED" | "RETIRED";
type Optionality = "UNKNOWN" | "CORE" | "OPTIONAL";

interface CurriculumVersionSummary {
  id: string;
  versionLabel: string;
  status: VersionStatus;
  sourceTitle: string;
  sourceUrl: string;
  sourceRetrievedAt: string;
  sourceSha256: string;
  effectiveFrom?: string | null;
  publishedAt?: string | null;
  createdAt: string;
  author: { id: string };
  reviewer?: { id: string } | null;
  _count: { gradeLearningAreas: number; councilCurricula: number };
}

interface Curriculum {
  id: string;
  code: string;
  name: string;
  track: string;
  versions: CurriculumVersionSummary[];
}

interface GradeLearningArea {
  id: string;
  grade: string;
  sourceLabel: string;
  sourceUrl: string;
  sortOrder: number;
  optionality: Optionality;
  reviewStatus: "REVIEW_REQUIRED" | "REVIEWED";
  reviewNote?: string | null;
  learningArea: { code: string; canonicalName: string };
}

interface CurriculumVersionDetail extends CurriculumVersionSummary {
  curriculum: { id: string; code: string; name: string; track: string };
  gradeLearningAreas: GradeLearningArea[];
}

const statusLabels: Record<VersionStatus, string> = {
  DRAFT: "Draft",
  IN_REVIEW: "In review",
  PUBLISHED: "Published",
  RETIRED: "Retired",
};

function dateLabel(value?: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not set"
    : new Intl.DateTimeFormat("en-KE", { dateStyle: "medium" }).format(date);
}

function shortHash(value: string) {
  return value ? `${value.slice(0, 12)}…${value.slice(-8)}` : "Unavailable";
}

function statusClass(status: VersionStatus) {
  if (status === "PUBLISHED") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "IN_REVIEW") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "RETIRED") return "border-slate-200 bg-slate-100 text-slate-600";
  return "border-blue-200 bg-blue-50 text-blue-700";
}

function gradeNumber(grade: string) {
  return Number(grade.replace("GRADE_", ""));
}

export default function PlatformCurriculaPage() {
  const router = useRouter();
  const [curricula, setCurricula] = useState<Curriculum[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<CurriculumVersionDetail | null>(null);
  const [search, setSearch] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [mappingReviews, setMappingReviews] = useState<Record<string, { optionality: "CORE" | "OPTIONAL"; reason: string }>>({});
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadCatalogue = useCallback(async () => {
    const response = await apiRequest("/platform/curricula");
    if (response.status === 401) {
      router.replace("/login");
      return [] as Curriculum[];
    }
    if (response.status === 403) {
      router.replace("/workspace");
      return [] as Curriculum[];
    }
    if (!response.ok) throw new Error("The curriculum catalogue could not be loaded.");
    const data = (await response.json()) as Curriculum[];
    setCurricula(data);
    return data;
  }, [router]);

  const loadDetail = useCallback(async (versionId: string) => {
    if (!versionId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    try {
      const response = await apiRequest(`/platform/curricula/${versionId}`);
      if (!response.ok) throw new Error("Curriculum version details could not be loaded.");
      setDetail((await response.json()) as CurriculumVersionDetail);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      void loadCatalogue()
        .then((data) => {
          if (active) {
            setSelectedId((current) => current || data[0]?.versions[0]?.id || "");
            setError("");
          }
        })
        .catch((cause) => {
          if (active) setError(cause instanceof Error ? cause.message : "Unable to load the curriculum catalogue.");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    });
    return () => { active = false; };
  }, [loadCatalogue]);

  useEffect(() => {
    let active = true;
    if (!selectedId) {
      queueMicrotask(() => { if (active) setDetail(null); });
      return () => { active = false; };
    }
    queueMicrotask(() => {
      void loadDetail(selectedId)
        .then(() => { if (active) setError(""); })
        .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load version details."); });
    });
    return () => { active = false; };
  }, [selectedId, loadDetail]);

  const versions = useMemo(
    () => curricula.flatMap((curriculum) => curriculum.versions.map((version) => ({ curriculum, version }))),
    [curricula],
  );
  const visibleVersions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return versions.filter(({ curriculum, version }) =>
      !query || `${curriculum.name} ${curriculum.code} ${version.versionLabel} ${version.status}`.toLowerCase().includes(query),
    );
  }, [versions, search]);

  const totals = useMemo(() => ({
    all: versions.length,
    published: versions.filter(({ version }) => version.status === "PUBLISHED").length,
    review: versions.filter(({ version }) => version.status === "IN_REVIEW").length,
    draft: versions.filter(({ version }) => version.status === "DRAFT").length,
  }), [versions]);

  async function saveMappingReview(area: GradeLearningArea) {
    if (!detail) return;
    const review = mappingReviews[area.id] ?? { optionality: "CORE" as const, reason: "" };
    if (review.reason.trim().length < 10) {
      setError("Add a review note of at least 10 characters for this learning area.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await apiRequest(`/platform/curricula/${detail.id}/grade-areas/${area.id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(review),
      });
      const payload = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(payload?.message ?? "The learning area review could not be saved.");
      await loadDetail(detail.id);
      setNotice(`${area.sourceLabel} review saved.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The learning area review failed.");
    } finally {
      setBusy(false);
    }
  }

  async function performAction(action: "submit-review" | "publish" | "return") {
    if (!detail) return;
    if (action === "return" && returnReason.trim().length < 10) {
      setError("Add a clear review note of at least 10 characters.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await apiRequest(`/platform/curricula/${detail.id}/${action}`, {
        method: "POST",
        headers: action === "return" ? { "Content-Type": "application/json" } : undefined,
        ...(action === "return" ? { body: JSON.stringify({ reason: returnReason }) } : {}),
      });
      const payload = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(payload?.message ?? "The curriculum action could not be completed.");
      await loadCatalogue();
      await loadDetail(detail.id);
      setReturnReason("");
      setNotice(
        action === "submit-review" ? "Curriculum version submitted for independent review."
          : action === "publish" ? "Curriculum version published and locked."
          : "Curriculum version returned to draft with your review note.",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The curriculum action failed.");
    } finally {
      setBusy(false);
    }
  }

  const groupedAreas = useMemo(() => {
    if (!detail) return [];
    const groups = new Map<string, GradeLearningArea[]>();
    for (const area of detail.gradeLearningAreas) {
      const current = groups.get(area.grade) ?? [];
      current.push(area);
      groups.set(area.grade, current);
    }
    return [...groups.entries()].sort(([a], [b]) => gradeNumber(a) - gradeNumber(b));
  }, [detail]);

  async function signOut() {
    await apiRequest("/auth/logout", { method: "POST" });
    clearStoredCsrfToken();
    router.replace("/login");
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-[#e5eaf1] bg-white">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-[#2457c5] text-xs font-bold text-white">CBE</span>
            <span className="text-sm font-semibold text-[#172b4d]">Platform operations</span>
          </Link>
          <nav className="flex items-center gap-4 text-xs font-semibold">
            <Link href="/platform/councils" className="hidden text-[#52647d] hover:text-[#2457c5] sm:inline">Councils</Link>
            <Link href="/platform/school-registrations" className="hidden text-[#52647d] hover:text-[#2457c5] sm:inline">School approvals</Link>
            <span className="hidden text-[#94a3b8] md:inline">Curriculum governance</span>
            <button onClick={signOut} className="rounded-lg border border-[#dbe3ee] px-3 py-2 text-xs font-semibold text-[#52647d] hover:bg-[#f6f8fb]">Sign out</button>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2457c5]">Platform administration / academic standards</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#172b4d]">Curriculum catalogue</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#64748b]">Review source-backed curriculum versions, inspect grade mappings and publish only after independent review.</p>
          </div>
          <button onClick={() => { setLoading(true); void loadCatalogue().catch((cause) => setError(cause instanceof Error ? cause.message : "Refresh failed.")).finally(() => setLoading(false)); }} className="rounded-xl border border-[#dbe3ee] bg-white px-4 py-3 text-sm font-semibold text-[#52647d] hover:bg-[#f6f8fb]">Refresh catalogue</button>
        </div>

        {error ? <p role="alert" className="mt-5 rounded-xl border border-[#f3d0d0] bg-[#fff7f7] px-4 py-3 text-sm text-[#a33b3b]">{error}</p> : null}
        {notice ? <p role="status" className="mt-5 rounded-xl border border-[#cfe9dd] bg-[#f2fbf6] px-4 py-3 text-sm text-[#287653]">{notice}</p> : null}

        <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Total versions", value: totals.all, hint: "Across all curriculum tracks" },
            { label: "Published", value: totals.published, hint: "Immutable and available to Councils" },
            { label: "Awaiting review", value: totals.review, hint: "Requires independent decision" },
            { label: "Drafts", value: totals.draft, hint: "Still being prepared" },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-[#e5eaf1] bg-white p-4">
              <p className="text-xs font-medium text-[#64748b]">{item.label}</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-[#172b4d]">{loading ? "—" : item.value}</p>
              <p className="mt-1 text-xs text-[#94a3b8]">{item.hint}</p>
            </div>
          ))}
        </section>

        <div className="mt-6 grid min-h-[680px] gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
          <section className="overflow-hidden rounded-2xl border border-[#e5eaf1] bg-white">
            <div className="border-b border-[#edf0f5] p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[#172b4d]">Version directory</h2>
                <span className="text-xs text-[#94a3b8]">{visibleVersions.length} shown</span>
              </div>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search curriculum or version" className="mt-3 w-full rounded-xl border border-[#dbe3ee] px-3 py-2.5 text-xs outline-none focus:border-[#6d94e8] focus:ring-4 focus:ring-[#eaf1ff]" />
            </div>
            <div className="max-h-[760px] overflow-y-auto">
              {loading ? <p className="p-5 text-sm text-[#64748b]">Loading curriculum versions…</p> : null}
              {!loading && visibleVersions.length === 0 ? (
                <div className="p-6">
                  <div className="grid size-10 place-items-center rounded-xl bg-[#eef4ff] text-[#2457c5]"><span className="text-lg">◎</span></div>
                  <h3 className="mt-4 text-sm font-semibold text-[#172b4d]">No curriculum versions yet</h3>
                  <p className="mt-2 text-xs leading-5 text-[#64748b]">The catalogue is intentionally not pre-populated with unverified learning-area data. Add a source-backed draft when the import workflow is available.</p>
                </div>
              ) : null}
              {visibleVersions.map(({ curriculum, version }) => (
                <button key={version.id} onClick={() => { setSelectedId(version.id); setError(""); setNotice(""); }} className={`block w-full border-b border-[#edf0f5] p-4 text-left transition hover:bg-[#f8faff] ${selectedId === version.id ? "bg-[#f1f5ff] shadow-[inset_3px_0_0_#2457c5]" : ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#172b4d]">{curriculum.name}</p>
                      <p className="mt-1 text-xs text-[#64748b]">{curriculum.code} · {version.versionLabel}</p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold ${statusClass(version.status)}`}>{statusLabels[version.status]}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[11px] text-[#94a3b8]">
                    <span>{version._count.gradeLearningAreas} grade mappings</span>
                    <span>{dateLabel(version.createdAt)}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-[#e5eaf1] bg-white">
            {detailLoading ? <div className="p-8 text-sm text-[#64748b]">Loading version details…</div> : null}
            {!detailLoading && !detail ? (
              <div className="grid min-h-[500px] place-items-center p-8 text-center">
                <div className="max-w-sm">
                  <p className="text-sm font-semibold text-[#172b4d]">Select a curriculum version</p>
                  <p className="mt-2 text-xs leading-5 text-[#64748b]">Its source evidence, grade coverage and review state will appear here.</p>
                </div>
              </div>
            ) : null}
            {!detailLoading && detail ? (
              <>
                <div className="border-b border-[#edf0f5] p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2457c5]">{detail.curriculum.track} curriculum</p>
                      <h2 className="mt-2 text-xl font-semibold tracking-tight text-[#172b4d]">{detail.curriculum.name}</h2>
                      <p className="mt-1 text-xs text-[#64748b]">{detail.curriculum.code} · Version {detail.versionLabel}</p>
                    </div>
                    <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${statusClass(detail.status)}`}>{statusLabels[detail.status]}</span>
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl bg-[#f7f9fc] p-3"><p className="text-[11px] text-[#64748b]">Grade mappings</p><p className="mt-1 text-lg font-semibold text-[#172b4d]">{detail.gradeLearningAreas.length}</p></div>
                    <div className="rounded-xl bg-[#f7f9fc] p-3"><p className="text-[11px] text-[#64748b]">Reviewed mappings</p><p className="mt-1 text-lg font-semibold text-[#172b4d]">{detail.gradeLearningAreas.filter((area) => area.reviewStatus === "REVIEWED" && area.optionality !== "UNKNOWN").length}</p></div>
                    <div className="rounded-xl bg-[#f7f9fc] p-3"><p className="text-[11px] text-[#64748b]">Council selections</p><p className="mt-1 text-lg font-semibold text-[#172b4d]">{detail._count.councilCurricula}</p></div>
                  </div>
                </div>

                <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_300px]">
                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-[#172b4d]">Grade-level learning areas</h3>
                      <span className="text-[11px] text-[#94a3b8]">Grades 1–9</span>
                    </div>
                    {groupedAreas.length === 0 ? <p className="mt-4 rounded-xl border border-dashed border-[#dbe3ee] p-5 text-xs text-[#64748b]">No grade mappings have been added to this version.</p> : null}
                    <div className="mt-4 space-y-4">
                      {groupedAreas.map(([grade, areas]) => (
                        <div key={grade} className="overflow-hidden rounded-xl border border-[#e8edf4]">
                          <div className="flex items-center justify-between bg-[#f8faff] px-4 py-3">
                            <h4 className="text-xs font-semibold text-[#172b4d]">{grade.replace("_", " ")}</h4>
                            <span className="text-[11px] text-[#64748b]">{areas.length} learning areas</span>
                          </div>
                          <div className="divide-y divide-[#edf0f5]">
                            {areas.map((area) => (
                              <div key={area.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-[#172b4d]">{area.sourceLabel}</p>
                                  <p className="mt-1 text-[11px] text-[#94a3b8]">{area.learningArea.canonicalName} · {area.learningArea.code}</p>
                                </div>
                                <div className="flex shrink-0 flex-wrap items-center gap-2">
                                  <span className={`rounded-full px-2 py-1 text-[10px] font-medium ${area.reviewStatus === "REVIEWED" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{area.reviewStatus === "REVIEWED" ? "Reviewed" : "Needs review"}</span>
                                  <span className="rounded-full bg-[#f1f4f8] px-2 py-1 text-[10px] font-medium text-[#52647d]">{area.optionality === "UNKNOWN" ? "Optionality unknown" : area.optionality}</span>
                                </div>
                                {detail.status === "IN_REVIEW" ? (
                                  <div className="mt-3 grid gap-2 rounded-lg bg-[#f8fafc] p-3 sm:grid-cols-[130px_minmax(0,1fr)_auto] sm:items-end">
                                    <label className="text-[10px] font-semibold text-[#64748b]">Optionality
                                      <select value={(mappingReviews[area.id]?.optionality ?? (area.optionality === "OPTIONAL" ? "OPTIONAL" : "CORE"))} onChange={(event) => setMappingReviews((current) => ({ ...current, [area.id]: { optionality: event.target.value as "CORE" | "OPTIONAL", reason: current[area.id]?.reason ?? "" } }))} className="mt-1 w-full rounded-lg border border-[#dbe3ee] bg-white px-2 py-2 text-xs">
                                        <option value="CORE">Core</option><option value="OPTIONAL">Optional</option>
                                      </select>
                                    </label>
                                    <label className="text-[10px] font-semibold text-[#64748b]">Review note
                                      <input value={mappingReviews[area.id]?.reason ?? area.reviewNote ?? ""} onChange={(event) => setMappingReviews((current) => ({ ...current, [area.id]: { optionality: current[area.id]?.optionality ?? (area.optionality === "OPTIONAL" ? "OPTIONAL" : "CORE"), reason: event.target.value } }))} placeholder="Evidence supporting this classification" className="mt-1 w-full rounded-lg border border-[#dbe3ee] bg-white px-2 py-2 text-xs outline-none focus:border-[#6d94e8]" />
                                    </label>
                                    <button disabled={busy} onClick={() => void saveMappingReview(area)} className="rounded-lg border border-[#dbe3ee] bg-white px-3 py-2 text-[11px] font-semibold text-[#2457c5] hover:bg-[#eef4ff] disabled:opacity-50">Save review</button>
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <aside className="space-y-4">
                    <div className="rounded-xl border border-[#e8edf4] p-4">
                      <h3 className="text-xs font-semibold text-[#172b4d]">Source provenance</h3>
                      <p className="mt-3 text-xs font-medium text-[#52647d]">{detail.sourceTitle}</p>
                      <a href={detail.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 block break-all text-[11px] text-[#2457c5] hover:underline">Open source document ↗</a>
                      <dl className="mt-4 space-y-3 text-[11px]">
                        <div><dt className="text-[#94a3b8]">Retrieved</dt><dd className="mt-1 font-medium text-[#52647d]">{dateLabel(detail.sourceRetrievedAt)}</dd></div>
                        <div><dt className="text-[#94a3b8]">SHA-256 fingerprint</dt><dd className="mt-1 break-all font-mono text-[10px] text-[#52647d]">{shortHash(detail.sourceSha256)}</dd></div>
                        <div><dt className="text-[#94a3b8]">Created</dt><dd className="mt-1 font-medium text-[#52647d]">{dateLabel(detail.createdAt)}</dd></div>
                        <div><dt className="text-[#94a3b8]">Published</dt><dd className="mt-1 font-medium text-[#52647d]">{dateLabel(detail.publishedAt)}</dd></div>
                      </dl>
                    </div>

                    {detail.status === "DRAFT" ? (
                      <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
                        <h3 className="text-xs font-semibold text-[#1e3a70]">Ready for independent review?</h3>
                        <p className="mt-2 text-[11px] leading-5 text-[#52647d]">Submitting locks the editing workflow for this version until the reviewer returns it or publishes it.</p>
                        <button disabled={busy} onClick={() => void performAction("submit-review")} className="mt-4 w-full rounded-lg bg-[#2457c5] px-3 py-2.5 text-xs font-semibold text-white hover:bg-[#1d49a7] disabled:opacity-50">{busy ? "Working…" : "Submit for review"}</button>
                      </div>
                    ) : null}

                    {detail.status === "IN_REVIEW" ? (
                      <div className="rounded-xl border border-[#e8edf4] p-4">
                        <h3 className="text-xs font-semibold text-[#172b4d]">Reviewer actions</h3>
                        <p className="mt-2 text-[11px] leading-5 text-[#64748b]">Publication requires a reviewer other than the original author and fully reviewed mappings.</p>
                        <button disabled={busy} onClick={() => void performAction("publish")} className="mt-4 w-full rounded-lg bg-[#16734b] px-3 py-2.5 text-xs font-semibold text-white hover:bg-[#115d3d] disabled:opacity-50">{busy ? "Working…" : "Publish version"}</button>
                        <div className="mt-4 border-t border-[#edf0f5] pt-4">
                          <label htmlFor="return-reason" className="text-[11px] font-semibold text-[#52647d]">Return with review notes</label>
                          <textarea id="return-reason" value={returnReason} onChange={(event) => setReturnReason(event.target.value)} rows={3} placeholder="Explain what needs correction…" className="mt-2 w-full resize-y rounded-lg border border-[#dbe3ee] px-3 py-2 text-xs outline-none focus:border-[#6d94e8] focus:ring-4 focus:ring-[#eaf1ff]" />
                          <button disabled={busy || returnReason.trim().length < 10} onClick={() => void performAction("return")} className="mt-2 w-full rounded-lg border border-[#dbe3ee] px-3 py-2.5 text-xs font-semibold text-[#52647d] hover:bg-[#f6f8fb] disabled:opacity-50">Return to draft</button>
                        </div>
                      </div>
                    ) : null}

                    {detail.status === "PUBLISHED" || detail.status === "RETIRED" ? (
                      <div className="rounded-xl border border-[#e8edf4] bg-[#f8fafc] p-4">
                        <h3 className="text-xs font-semibold text-[#172b4d]">Immutable version</h3>
                        <p className="mt-2 text-[11px] leading-5 text-[#64748b]">This version is locked. Corrections must be prepared as a new version so historical assessments retain their original curriculum.</p>
                      </div>
                    ) : null}
                  </aside>
                </div>
              </>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}
