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

interface CurriculumDraftImportRow {
  grade: string;
  learningAreaCode: string;
  canonicalName: string;
  sourceLabel: string;
  sourceUrl: string;
  optionality: "UNKNOWN" | "CORE" | "OPTIONAL";
  sortOrder: number;
}

interface CurriculumDraftImportPayload {
  curriculumCode: string;
  curriculumName: string;
  track: string;
  versionLabel: string;
  sourceTitle: string;
  sourceUrl: string;
  sourceRetrievedAt: string;
  sourceSha256: string;
  rows: CurriculumDraftImportRow[];
}

interface CurriculumDraftImportPreview {
  valid: boolean;
  curriculumCode: string;
  versionLabel: string;
  rowsReceived: number;
  uniqueLearningAreas: number;
  gradesCovered: string[];
  unresolvedOptionality: number;
  errors: Array<{ row: number; message: string }>;
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
  auditEvents: Array<{ action: string; reason?: string | null; createdAt: string; resourceId?: string }>;
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

function parseCsv(source: string): string[][] {
  const text = source.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  let afterQuote = false;

  const finishRow = () => {
    row.push(value);
    if (row.some((cell) => cell.trim().length > 0)) rows.push(row);
    row = [];
    value = "";
    afterQuote = false;
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
        afterQuote = true;
      } else {
        value += character;
      }
      continue;
    }

    if (afterQuote) {
      if (character === ",") {
        row.push(value);
        value = "";
        afterQuote = false;
      } else if (character === "\n" || character === "\r") {
        if (character === "\r" && text[index + 1] === "\n") index += 1;
        finishRow();
      } else if (character === " " || character === "\t") {
        // Ignore optional whitespace between a quoted cell and its delimiter.
      } else {
        throw new Error("The CSV contains characters after a closing quote.");
      }
      continue;
    }

    if (character === '"') {
      if (value.length > 0) throw new Error("The CSV contains a quote inside an unquoted field.");
      quoted = true;
    } else if (character === ",") {
      row.push(value);
      value = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      finishRow();
    } else {
      value += character;
    }
  }

  if (quoted) throw new Error("The CSV file contains an unclosed quoted field.");
  row.push(value);
  if (row.some((cell) => cell.trim().length > 0)) rows.push(row);
  return rows;
}


function sha256Hex(buffer: ArrayBuffer) {
  return crypto.subtle.digest("SHA-256", buffer).then((digest) =>
    Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(""),
  );
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
  const [mappingReviews, setMappingReviews] = useState<Record<string, { optionality: "CORE" | "OPTIONAL" | ""; reason: string }>>({});
  const [mappingEdits, setMappingEdits] = useState<Record<string, { sourceLabel: string; sourceUrl: string; sortOrder: number; reason: string }>>({});
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [draftSourceTitle, setDraftSourceTitle] = useState("");
  const [draftSourceUrl, setDraftSourceUrl] = useState("");
  const [draftRetrievedAt, setDraftRetrievedAt] = useState("");
  const [draftCurriculumName, setDraftCurriculumName] = useState("Kenya Regular CBE");
  const [draftVersionLabel, setDraftVersionLabel] = useState("");
  const [draftPayload, setDraftPayload] = useState<CurriculumDraftImportPayload | null>(null);
  const [draftPreview, setDraftPreview] = useState<CurriculumDraftImportPreview | null>(null);
  const [draftImportBusy, setDraftImportBusy] = useState(false);
  const [draftImportError, setDraftImportError] = useState("");
  const [draftFileName, setDraftFileName] = useState("");

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

  async function previewDraftImport() {
    setDraftImportError("");
    setDraftPreview(null);
    setDraftPayload(null);
    if (!draftFile) {
      setDraftImportError("Choose a CSV file first.");
      return;
    }
    if (draftFile.size > 1024 * 1024) {
      setDraftImportError("CSV files must be 1 MB or smaller.");
      return;
    }
    setDraftImportBusy(true);
    try {
      const matrix = parseCsv(await draftFile.text());
      if (matrix.length < 2) throw new Error("The CSV must contain a header and at least one data row.");
      const headers = (matrix[0] ?? []).map((value) => value.trim().toLowerCase());
      const required = ["curriculum_code", "grade", "learning_area_code", "source_label", "is_optional", "assessment_eligible", "source_url", "review_status"];
      if (headers.length !== required.length || new Set(headers).size !== headers.length || required.some((header) => !headers.includes(header))) {
        throw new Error("Use the eight source-review columns: curriculum_code, grade, learning_area_code, source_label, is_optional, assessment_eligible, source_url, review_status.");
      }
      const rows = matrix.slice(1).map((cells, index) => {
        if (cells.length !== headers.length) throw new Error(`CSV row ${index + 2} has an unexpected number of columns.`);
        const values = Object.fromEntries(headers.map((header, column) => [header, (cells[column] ?? "").trim()]));
        const grade = values.grade ?? "";
        const learningAreaCode = values.learning_area_code ?? "";
        const sourceLabel = values.source_label ?? "";
        const sourceUrl = values.source_url ?? "";
        if (!/^GRADE_[1-9]$/.test(grade)) throw new Error(`CSV row ${index + 2} has an unsupported grade.`);
        if (!/^[A-Z0-9]+(?:_[A-Z0-9]+)*$/.test(learningAreaCode)) throw new Error(`CSV row ${index + 2} has an invalid learning-area code.`);
        if (sourceLabel.length < 2) throw new Error(`CSV row ${index + 2} is missing its exact source label.`);
        try { const parsed = new URL(sourceUrl); if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error(); } catch { throw new Error(`CSV row ${index + 2} has an invalid source URL.`); }
        const optionality = values.is_optional === "CORE" || values.is_optional === "OPTIONAL" ? values.is_optional : "UNKNOWN";
        return {
          grade,
          learningAreaCode,
          canonicalName: sourceLabel,
          sourceLabel,
          sourceUrl,
          optionality,
          sortOrder: index,
        } satisfies CurriculumDraftImportRow;
      });
      if (rows.length > 500) throw new Error("A single curriculum import can contain at most 500 mappings.");
      const curriculumCode = (matrix[1]?.[headers.indexOf("curriculum_code")] ?? "").trim();
      if (!curriculumCode || !/^[A-Z0-9]+(?:_[A-Z0-9]+)*$/.test(curriculumCode)) throw new Error("The CSV must contain a valid curriculum_code.");
      if (matrix.slice(1).some((cells) => (cells[headers.indexOf("curriculum_code")] ?? "").trim() !== curriculumCode)) {
        throw new Error("All rows in one import must use the same curriculum_code.");
      }
      if (draftCurriculumName.trim().length < 2 || draftVersionLabel.trim().length < 1 || draftSourceTitle.trim().length < 3) {
        throw new Error("Enter the curriculum name, version label and source title.");
      }
      try { const parsed = new URL(draftSourceUrl); if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error(); } catch { throw new Error("Enter a valid HTTP or HTTPS source document URL."); }
      if (!draftRetrievedAt) throw new Error("Enter the date the source was retrieved.");
      const payload: CurriculumDraftImportPayload = {
        curriculumCode,
        curriculumName: draftCurriculumName.trim(),
        track: "REGULAR",
        versionLabel: draftVersionLabel.trim(),
        sourceTitle: draftSourceTitle.trim(),
        sourceUrl: draftSourceUrl.trim(),
        sourceRetrievedAt: new Date(`${draftRetrievedAt}T00:00:00.000Z`).toISOString(),
        sourceSha256: await sha256Hex(await draftFile.arrayBuffer()),
        rows,
      };
      const response = await apiRequest("/platform/curricula/import-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => null) as CurriculumDraftImportPreview & { message?: string | string[] } | null;
      if (!response.ok || !result) {
        const message = Array.isArray(result?.message) ? result.message.join(" ") : result?.message;
        throw new Error(message ?? "The curriculum import preview failed validation.");
      }
      setDraftPayload(payload);
      setDraftPreview(result);
      setDraftFileName(draftFile.name);
    } catch (cause) {
      setDraftImportError(cause instanceof Error ? cause.message : "The CSV could not be validated.");
    } finally {
      setDraftImportBusy(false);
    }
  }

  async function commitDraftImport() {
    if (!draftPayload || !draftPreview?.valid) return;
    setDraftImportBusy(true);
    setDraftImportError("");
    setError("");
    setNotice("");
    try {
      const response = await apiRequest("/platform/curricula/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftPayload),
      });
      const result = await response.json().catch(() => null) as { version?: { id?: string }; message?: string | string[] } | null;
      if (!response.ok || !result?.version?.id) {
        const message = Array.isArray(result?.message) ? result.message.join(" ") : result?.message;
        throw new Error(message ?? "The draft curriculum could not be imported.");
      }
      const versionId = result.version.id;
      await loadCatalogue();
      setSelectedId(versionId);
      await loadDetail(versionId);
      setDraftPayload(null);
      setDraftPreview(null);
      setDraftFile(null);
      setDraftFileName("");
      setNotice("Source data imported as a draft. No optionality or assessment eligibility was approved by the import.");
    } catch (cause) {
      setDraftImportError(cause instanceof Error ? cause.message : "The curriculum draft import failed.");
    } finally {
      setDraftImportBusy(false);
    }
  }

  async function saveMappingEdit(area: GradeLearningArea) {
    if (!detail) return;
    const edit = mappingEdits[area.id] ?? { sourceLabel: area.sourceLabel, sourceUrl: area.sourceUrl, sortOrder: area.sortOrder, reason: "" };
    if (edit.reason.trim().length < 10) {
      setError("Add a change reason of at least 10 characters.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await apiRequest(`/platform/curricula/${detail.id}/grade-areas/${area.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(edit),
      });
      const payload = await response.json().catch(() => null) as { message?: string | string[] } | null;
      if (!response.ok) throw new Error(Array.isArray(payload?.message) ? payload.message.join(" ") : payload?.message ?? "The mapping changes could not be saved.");
      await loadDetail(detail.id);
      setNotice(`${area.grade.replace("_", " ")} mapping updated and audited.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The mapping update failed.");
    } finally {
      setBusy(false);
    }
  }

  async function saveMappingReview(area: GradeLearningArea) {
    if (!detail) return;
    const review = mappingReviews[area.id] ?? { optionality: area.optionality === "UNKNOWN" ? "" as const : area.optionality, reason: "" };
    if (!review.optionality) {
      setError("Choose whether this learning area is core or optional. The system will not infer this classification.");
      return;
    }
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
        ...(action === "return" ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: returnReason }),
        } : {}),
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
      <header className="border-b border-[var(--line)] bg-white">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-[var(--brand)] text-xs font-bold text-white">CBE</span>
            <span className="text-sm font-semibold text-[var(--ink-strong)]">Platform operations</span>
          </Link>
          <nav className="flex items-center gap-4 text-xs font-semibold">
            <Link href="/platform/councils" className="hidden text-[#52647d] hover:text-[var(--brand)] sm:inline">Councils</Link>
            <Link href="/platform/school-registrations" className="hidden text-[#52647d] hover:text-[var(--brand)] sm:inline">School approvals</Link>
            <span className="hidden text-[var(--subtle)] md:inline">Curriculum governance</span>
            <button onClick={signOut} className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[#52647d] hover:bg-[var(--surface-subtle)]">Sign out</button>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand)]">Platform administration / academic standards</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[var(--ink-strong)]">Curriculum catalogue</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">Review source-backed curriculum versions, inspect grade mappings and publish only after independent review.</p>
          </div>
          <button onClick={() => { setLoading(true); void loadCatalogue().catch((cause) => setError(cause instanceof Error ? cause.message : "Refresh failed.")).finally(() => setLoading(false)); }} className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-[#52647d] hover:bg-[var(--surface-subtle)]">Refresh catalogue</button>
        </div>

        {error ? <p role="alert" className="mt-5 rounded-xl border border-[#fecaca] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">{error}</p> : null}
        {notice ? <p role="status" className="mt-5 rounded-xl border border-[#cfe9dd] bg-[#f2fbf6] px-4 py-3 text-sm text-[#287653]">{notice}</p> : null}

        <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Total versions", value: totals.all, hint: "Across all curriculum tracks" },
            { label: "Published", value: totals.published, hint: "Immutable and available to Councils" },
            { label: "Awaiting review", value: totals.review, hint: "Requires independent decision" },
            { label: "Drafts", value: totals.draft, hint: "Still being prepared" },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-[var(--line)] bg-white p-4">
              <p className="text-xs font-medium text-[var(--muted)]">{item.label}</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-[var(--ink-strong)]">{loading ? "—" : item.value}</p>
              <p className="mt-1 text-xs text-[var(--subtle)]">{item.hint}</p>
            </div>
          ))}
        </section>

        <details className="mt-6 overflow-hidden rounded-2xl border border-[#dce6f5] bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
            <span><span className="block text-sm font-semibold text-[var(--ink-strong)]">Import source-review CSV</span><span className="mt-1 block text-xs text-[var(--muted)]">Create a draft catalogue version with source fingerprints and unresolved review flags.</span></span>
            <span className="rounded-lg bg-[#eef4ff] px-3 py-2 text-xs font-semibold text-[var(--brand)]">New draft</span>
          </summary>
          <div className="border-t border-[var(--line)] p-5">
            <p className="max-w-3xl text-xs leading-5 text-[var(--muted)]">This import accepts the KICD source-review CSV. Rows are always created as <strong>REVIEW_REQUIRED</strong>. Values such as REVIEW_REQUIRED or SOURCE_DIRECTORY_REVIEWED_NOT_PUBLISHED are not interpreted as evidence that a learning area is core, optional or assessment-eligible.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <label className="text-[11px] font-semibold text-[#52647d]">Curriculum name
                <input value={draftCurriculumName} onChange={(event) => setDraftCurriculumName(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2.5 text-xs font-normal" />
              </label>
              <label className="text-[11px] font-semibold text-[#52647d]">Version label
                <input value={draftVersionLabel} onChange={(event) => setDraftVersionLabel(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2.5 text-xs font-normal" />
              </label>
              <label className="text-[11px] font-semibold text-[#52647d]">Track
                <input value="REGULAR" readOnly className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[#f8fafc] px-3 py-2.5 text-xs font-normal text-[var(--muted)]" />
              </label>
              <label className="text-[11px] font-semibold text-[#52647d] sm:col-span-2 xl:col-span-3">Source title
                <input value={draftSourceTitle} onChange={(event) => setDraftSourceTitle(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2.5 text-xs font-normal" />
              </label>
              <label className="text-[11px] font-semibold text-[#52647d] sm:col-span-2 xl:col-span-2">Primary source URL
                <input type="url" value={draftSourceUrl} onChange={(event) => setDraftSourceUrl(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2.5 text-xs font-normal" />
              </label>
              <label className="text-[11px] font-semibold text-[#52647d]">Retrieved on
                <input type="date" value={draftRetrievedAt} onChange={(event) => setDraftRetrievedAt(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2.5 text-xs font-normal" />
              </label>
              <label className="text-[11px] font-semibold text-[#52647d] sm:col-span-2 xl:col-span-3">Source-review CSV
                <input type="file" accept=".csv,text/csv" onChange={(event) => { setDraftFile(event.target.files?.[0] ?? null); setDraftPreview(null); setDraftPayload(null); setDraftFileName(""); setDraftImportError(""); }} className="mt-1 block w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs font-normal file:mr-3 file:rounded-md file:border-0 file:bg-[#eef4ff] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[var(--brand)]" />
              </label>
            </div>
            {draftFile ? <p className="mt-2 text-[11px] text-[var(--muted)]">Selected: {draftFile.name} · {(draftFile.size / 1024).toFixed(1)} KB</p> : null}
            {draftImportError ? <p role="alert" className="mt-4 rounded-lg border border-[#fecaca] bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">{draftImportError}</p> : null}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button disabled={draftImportBusy || !draftFile} onClick={() => void previewDraftImport()} className="rounded-lg bg-[var(--brand)] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#1d49a7] disabled:opacity-50">{draftImportBusy ? "Validating…" : "Validate import"}</button>
              {draftFileName ? <span className="text-[11px] text-[var(--muted)]">Preview for {draftFileName}</span> : null}
            </div>
            {draftPreview ? (
              <div className="mt-5 rounded-xl border border-[var(--line)] bg-[#f8fafc] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><p className="text-xs font-semibold text-[var(--ink-strong)]">Import preview · {draftPreview.curriculumCode}</p><p className="mt-1 text-[11px] text-[var(--muted)]">Version {draftPreview.versionLabel}</p></div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${draftPreview.valid ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{draftPreview.valid ? "Ready to create draft" : "Resolve import errors"}</span>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div><p className="text-[10px] text-[var(--subtle)]">Rows</p><p className="mt-1 text-lg font-semibold text-[var(--ink-strong)]">{draftPreview.rowsReceived}</p></div>
                  <div><p className="text-[10px] text-[var(--subtle)]">Unique learning areas</p><p className="mt-1 text-lg font-semibold text-[var(--ink-strong)]">{draftPreview.uniqueLearningAreas}</p></div>
                  <div><p className="text-[10px] text-[var(--subtle)]">Grades covered</p><p className="mt-1 text-lg font-semibold text-[var(--ink-strong)]">{draftPreview.gradesCovered.length} / 9</p></div>
                  <div><p className="text-[10px] text-[var(--subtle)]">Optionality unresolved</p><p className="mt-1 text-lg font-semibold text-[var(--ink-strong)]">{draftPreview.unresolvedOptionality}</p></div>
                </div>
                {draftPreview.errors.length > 0 ? <ul className="mt-3 space-y-1 text-[11px] text-[var(--danger)]">{draftPreview.errors.map((item) => <li key={`${item.row}-${item.message}`}>Row {item.row}: {item.message}</li>)}</ul> : null}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4">
                  <p className="max-w-xl text-[11px] leading-5 text-[var(--muted)]">The imported version remains a draft. Independent review is still required before publication; the source file fingerprint is retained, while assessment eligibility remains unconfigured and cannot be activated by import.</p>
                  <button disabled={!draftPreview.valid || draftImportBusy} onClick={() => void commitDraftImport()} className="rounded-lg bg-[#16734b] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#115d3d] disabled:opacity-50">{draftImportBusy ? "Importing…" : "Create draft version"}</button>
                </div>
              </div>
            ) : null}
          </div>
        </details>

        <div className="mt-6 grid min-h-[680px] gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
          <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white">
            <div className="border-b border-[var(--line)] p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[var(--ink-strong)]">Version directory</h2>
                <span className="text-xs text-[var(--subtle)]">{visibleVersions.length} shown</span>
              </div>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search curriculum or version" className="mt-3 w-full rounded-xl border border-[var(--line)] px-3 py-2.5 text-xs outline-none focus:border-[var(--brand)] focus:ring-4 focus:ring-[var(--brand-soft)]" />
            </div>
            <div className="max-h-[760px] overflow-y-auto">
              {loading ? <p className="p-5 text-sm text-[var(--muted)]">Loading curriculum versions…</p> : null}
              {!loading && visibleVersions.length === 0 ? (
                <div className="p-6">
                  <div className="grid size-10 place-items-center rounded-xl bg-[#eef4ff] text-[var(--brand)]"><span className="text-lg">◎</span></div>
                  <h3 className="mt-4 text-sm font-semibold text-[var(--ink-strong)]">No curriculum versions yet</h3>
                  <p className="mt-2 text-xs leading-5 text-[var(--muted)]">The catalogue is intentionally not pre-populated with unverified learning-area data. Add a source-backed draft when the import workflow is available.</p>
                </div>
              ) : null}
              {visibleVersions.map(({ curriculum, version }) => (
                <button key={version.id} onClick={() => { setSelectedId(version.id); setError(""); setNotice(""); }} className={`block w-full border-b border-[var(--line)] p-4 text-left transition hover:bg-[#f8faff] ${selectedId === version.id ? "bg-[#f1f5ff] shadow-[inset_3px_0_0_var(--brand)]" : ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--ink-strong)]">{curriculum.name}</p>
                      <p className="mt-1 text-xs text-[var(--muted)]">{curriculum.code} · {version.versionLabel}</p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold ${statusClass(version.status)}`}>{statusLabels[version.status]}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[11px] text-[var(--subtle)]">
                    <span>{version._count.gradeLearningAreas} grade mappings</span>
                    <span>{dateLabel(version.createdAt)}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white">
            {detailLoading ? <div className="p-8 text-sm text-[var(--muted)]">Loading version details…</div> : null}
            {!detailLoading && !detail ? (
              <div className="grid min-h-[500px] place-items-center p-8 text-center">
                <div className="max-w-sm">
                  <p className="text-sm font-semibold text-[var(--ink-strong)]">Select a curriculum version</p>
                  <p className="mt-2 text-xs leading-5 text-[var(--muted)]">Its source evidence, grade coverage and review state will appear here.</p>
                </div>
              </div>
            ) : null}
            {!detailLoading && detail ? (
              <>
                <div className="border-b border-[var(--line)] p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--brand)]">{detail.curriculum.track} curriculum</p>
                      <h2 className="mt-2 text-xl font-semibold tracking-tight text-[var(--ink-strong)]">{detail.curriculum.name}</h2>
                      <p className="mt-1 text-xs text-[var(--muted)]">{detail.curriculum.code} · Version {detail.versionLabel}</p>
                    </div>
                    <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${statusClass(detail.status)}`}>{statusLabels[detail.status]}</span>
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl bg-[#f7f9fc] p-3"><p className="text-[11px] text-[var(--muted)]">Grade mappings</p><p className="mt-1 text-lg font-semibold text-[var(--ink-strong)]">{detail.gradeLearningAreas.length}</p></div>
                    <div className="rounded-xl bg-[#f7f9fc] p-3"><p className="text-[11px] text-[var(--muted)]">Reviewed mappings</p><p className="mt-1 text-lg font-semibold text-[var(--ink-strong)]">{detail.gradeLearningAreas.filter((area) => area.reviewStatus === "REVIEWED" && area.optionality !== "UNKNOWN").length}</p></div>
                    <div className="rounded-xl bg-[#f7f9fc] p-3"><p className="text-[11px] text-[var(--muted)]">Council selections</p><p className="mt-1 text-lg font-semibold text-[var(--ink-strong)]">{detail._count.councilCurricula}</p></div>
                  </div>
                </div>

                <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_300px]">
                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-[var(--ink-strong)]">Grade-level learning areas</h3>
                      <span className="text-[11px] text-[var(--subtle)]">Grades 1–9</span>
                    </div>
                    {groupedAreas.length === 0 ? <p className="mt-4 rounded-xl border border-dashed border-[var(--line)] p-5 text-xs text-[var(--muted)]">No grade mappings have been added to this version.</p> : null}
                    <div className="mt-4 space-y-4">
                      {groupedAreas.map(([grade, areas]) => (
                        <div key={grade} className="overflow-hidden rounded-xl border border-[#e8edf4]">
                          <div className="flex items-center justify-between bg-[#f8faff] px-4 py-3">
                            <h4 className="text-xs font-semibold text-[var(--ink-strong)]">{grade.replace("_", " ")}</h4>
                            <span className="text-[11px] text-[var(--muted)]">{areas.length} learning areas</span>
                          </div>
                          <div className="divide-y divide-[var(--line)]">
                            {areas.map((area) => (
                              <div key={area.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-[var(--ink-strong)]">{area.sourceLabel}</p>
                                  <p className="mt-1 text-[11px] text-[var(--subtle)]">{area.learningArea.canonicalName} · {area.learningArea.code}</p>
                                </div>
                                <div className="flex shrink-0 flex-wrap items-center gap-2">
                                  <span className={`rounded-full px-2 py-1 text-[10px] font-medium ${area.reviewStatus === "REVIEWED" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{area.reviewStatus === "REVIEWED" ? "Reviewed" : "Needs review"}</span>
                                  <span className="rounded-full bg-[#f1f4f8] px-2 py-1 text-[10px] font-medium text-[#52647d]">{area.optionality === "UNKNOWN" ? "Optionality unknown" : area.optionality}</span>
                                </div>
                                {detail.status === "DRAFT" ? (
                                  <div className="mt-3 grid gap-2 rounded-lg bg-[#f8fafc] p-3">
                                    <div className="grid gap-2 sm:grid-cols-2">
                                      <label className="text-[10px] font-semibold text-[var(--muted)]">Source label
                                        <input value={mappingEdits[area.id]?.sourceLabel ?? area.sourceLabel} onChange={(event) => setMappingEdits((current) => ({ ...current, [area.id]: { sourceLabel: event.target.value, sourceUrl: current[area.id]?.sourceUrl ?? area.sourceUrl, sortOrder: current[area.id]?.sortOrder ?? area.sortOrder, reason: current[area.id]?.reason ?? "" } }))} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-2 py-2 text-xs font-normal" />
                                      </label>
                                      <label className="text-[10px] font-semibold text-[var(--muted)]">Source URL
                                        <input value={mappingEdits[area.id]?.sourceUrl ?? area.sourceUrl} onChange={(event) => setMappingEdits((current) => ({ ...current, [area.id]: { sourceLabel: current[area.id]?.sourceLabel ?? area.sourceLabel, sourceUrl: event.target.value, sortOrder: current[area.id]?.sortOrder ?? area.sortOrder, reason: current[area.id]?.reason ?? "" } }))} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-2 py-2 text-xs font-normal" />
                                      </label>
                                    </div>
                                    <div className="flex flex-col gap-2 sm:flex-row">
                                      <label className="text-[10px] font-semibold text-[var(--muted)] sm:w-28">Sort order
                                        <input type="number" min="0" max="10000" value={mappingEdits[area.id]?.sortOrder ?? area.sortOrder} onChange={(event) => setMappingEdits((current) => ({ ...current, [area.id]: { sourceLabel: current[area.id]?.sourceLabel ?? area.sourceLabel, sourceUrl: current[area.id]?.sourceUrl ?? area.sourceUrl, sortOrder: Number(event.target.value), reason: current[area.id]?.reason ?? "" } }))} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-2 py-2 text-xs font-normal" />
                                      </label>
                                      <label className="min-w-0 flex-1 text-[10px] font-semibold text-[var(--muted)]">Reason for change
                                        <input value={mappingEdits[area.id]?.reason ?? ""} onChange={(event) => setMappingEdits((current) => ({ ...current, [area.id]: { sourceLabel: current[area.id]?.sourceLabel ?? area.sourceLabel, sourceUrl: current[area.id]?.sourceUrl ?? area.sourceUrl, sortOrder: current[area.id]?.sortOrder ?? area.sortOrder, reason: event.target.value } }))} placeholder="Required for the audit trail" className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-2 py-2 text-xs font-normal" />
                                      </label>
                                      <button disabled={busy} onClick={() => void saveMappingEdit(area)} className="self-end rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-[11px] font-semibold text-[var(--brand)] hover:bg-[#eef4ff] disabled:opacity-50">Save changes</button>
                                    </div>
                                  </div>
                                ) : null}
                                {detail.status === "IN_REVIEW" ? (
                                  <div className="mt-3 grid gap-2 rounded-lg bg-[#f8fafc] p-3 sm:grid-cols-[130px_minmax(0,1fr)_auto] sm:items-end">
                                    <label className="text-[10px] font-semibold text-[var(--muted)]">Optionality
                                      <select value={(mappingReviews[area.id]?.optionality ?? (area.optionality === "UNKNOWN" ? "" : area.optionality))} onChange={(event) => setMappingReviews((current) => ({ ...current, [area.id]: { optionality: event.target.value as "CORE" | "OPTIONAL" | "", reason: current[area.id]?.reason ?? "" } }))} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-2 py-2 text-xs">
                                        <option value="">Select classification</option><option value="CORE">Core</option><option value="OPTIONAL">Optional</option>
                                      </select>
                                    </label>
                                    <label className="text-[10px] font-semibold text-[var(--muted)]">Review note
                                      <input value={mappingReviews[area.id]?.reason ?? area.reviewNote ?? ""} onChange={(event) => setMappingReviews((current) => ({ ...current, [area.id]: { optionality: current[area.id]?.optionality ?? (area.optionality === "UNKNOWN" ? "" : area.optionality), reason: event.target.value } }))} placeholder="Evidence supporting this classification" className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-2 py-2 text-xs outline-none focus:border-[var(--brand)]" />
                                    </label>
                                    <button disabled={busy} onClick={() => void saveMappingReview(area)} className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-[11px] font-semibold text-[var(--brand)] hover:bg-[#eef4ff] disabled:opacity-50">Save review</button>
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
                      <h3 className="text-xs font-semibold text-[var(--ink-strong)]">Source provenance</h3>
                      <p className="mt-3 text-xs font-medium text-[#52647d]">{detail.sourceTitle}</p>
                      <a href={detail.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 block break-all text-[11px] text-[var(--brand)] hover:underline">Open source document ↗</a>
                      <dl className="mt-4 space-y-3 text-[11px]">
                        <div><dt className="text-[var(--subtle)]">Retrieved</dt><dd className="mt-1 font-medium text-[#52647d]">{dateLabel(detail.sourceRetrievedAt)}</dd></div>
                        <div><dt className="text-[var(--subtle)]">SHA-256 fingerprint</dt><dd className="mt-1 break-all font-mono text-[10px] text-[#52647d]">{shortHash(detail.sourceSha256)}</dd></div>
                        <div><dt className="text-[var(--subtle)]">Created</dt><dd className="mt-1 font-medium text-[#52647d]">{dateLabel(detail.createdAt)}</dd></div>
                        <div><dt className="text-[var(--subtle)]">Published</dt><dd className="mt-1 font-medium text-[#52647d]">{dateLabel(detail.publishedAt)}</dd></div>
                      </dl>
                    </div>

                    <div className="rounded-xl border border-[#e8edf4] p-4">
                      <h3 className="text-xs font-semibold text-[var(--ink-strong)]">Review activity</h3>
                      {detail.auditEvents.length === 0 ? <p className="mt-2 text-[11px] text-[var(--subtle)]">No review activity recorded yet.</p> : (
                        <ol className="mt-3 space-y-3">
                          {detail.auditEvents.map((event, index) => (
                            <li key={`${event.action}-${event.createdAt}-${index}`} className="border-l-2 border-[var(--line)] pl-3">
                              <p className="text-[10px] font-semibold text-[#52647d]">{event.action.replaceAll("_", " ").toLowerCase()}</p>
                              <p className="mt-1 text-[10px] text-[var(--subtle)]">{dateLabel(event.createdAt)}</p>
                              {event.reason ? <p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">{event.reason}</p> : null}
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>

                    {detail.status === "DRAFT" ? (
                      <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
                        <h3 className="text-xs font-semibold text-[#1e3a70]">Ready for independent review?</h3>
                        <p className="mt-2 text-[11px] leading-5 text-[#52647d]">Submitting locks the editing workflow for this version until the reviewer returns it or publishes it.</p>
                        <button disabled={busy} onClick={() => void performAction("submit-review")} className="mt-4 w-full rounded-lg bg-[var(--brand)] px-3 py-2.5 text-xs font-semibold text-white hover:bg-[#1d49a7] disabled:opacity-50">{busy ? "Working…" : "Submit for review"}</button>
                      </div>
                    ) : null}

                    {detail.status === "IN_REVIEW" ? (
                      <div className="rounded-xl border border-[#e8edf4] p-4">
                        <h3 className="text-xs font-semibold text-[var(--ink-strong)]">Reviewer actions</h3>
                        <p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">Publication requires a reviewer other than the original author and fully reviewed mappings.</p>
                        <button disabled={busy} onClick={() => void performAction("publish")} className="mt-4 w-full rounded-lg bg-[#16734b] px-3 py-2.5 text-xs font-semibold text-white hover:bg-[#115d3d] disabled:opacity-50">{busy ? "Working…" : "Publish version"}</button>
                        <div className="mt-4 border-t border-[var(--line)] pt-4">
                          <label htmlFor="return-reason" className="text-[11px] font-semibold text-[#52647d]">Return with review notes</label>
                          <textarea id="return-reason" value={returnReason} onChange={(event) => setReturnReason(event.target.value)} rows={3} placeholder="Explain what needs correction…" className="mt-2 w-full resize-y rounded-lg border border-[var(--line)] px-3 py-2 text-xs outline-none focus:border-[var(--brand)] focus:ring-4 focus:ring-[var(--brand-soft)]" />
                          <button disabled={busy || returnReason.trim().length < 10} onClick={() => void performAction("return")} className="mt-2 w-full rounded-lg border border-[var(--line)] px-3 py-2.5 text-xs font-semibold text-[#52647d] hover:bg-[var(--surface-subtle)] disabled:opacity-50">Return to draft</button>
                        </div>
                      </div>
                    ) : null}

                    {detail.status === "PUBLISHED" || detail.status === "RETIRED" ? (
                      <div className="rounded-xl border border-[#e8edf4] bg-[#f8fafc] p-4">
                        <h3 className="text-xs font-semibold text-[var(--ink-strong)]">Immutable version</h3>
                        <p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">This version is locked. Corrections must be prepared as a new version so historical assessments retain their original curriculum.</p>
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
